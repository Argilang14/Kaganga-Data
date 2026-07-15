import db from '$lib/server/db';
import { ensurePenggunaIdentitySchema } from '$lib/server/db/ensure-pengguna';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import { ensureKesehatanMuridSchema } from '$lib/server/db/ensure-kesehatan-murid';
import { ensureJurnalMengajarSchema } from '$lib/server/db/ensure-jurnal-mengajar';
import {
	tableAuthUser,
	tablePegawai,
	tableKelas,
	tableMataPelajaran,
	tableAuthUserMataPelajaran,
	tableAuthUserKelas,
	tableMurid,
	tableAuthSession,
	tableAbsensiHarian,
	tableAbsensiKegiatan,
	tableKesehatanMurid,
	tableUserFavorites,
	tableJurnalMengajar
} from '$lib/server/db/schema';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { authority } from './utils.server';
import { hashPassword } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';

const u = tableAuthUser;
const CREATABLE_ROLES = ['user', 'wali_asuh', 'wali_asrama'] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

function parseIdList(value: FormDataEntryValue | null) {
	if (!value) return [];
	try {
		const parsed = JSON.parse(String(value));
		if (!Array.isArray(parsed)) return [];
		return [...new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
	} catch {
		return [];
	}
}

export async function load({ url, locals }) {
	authority('user_list');
	await ensurePenggunaIdentitySchema();

	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) return { meta: { title: 'Manajemen Pengguna' }, users: [] };

	// Halaman ini hanya membaca akun. Pembuatan akun dilakukan melalui aksi eksplisit.

	// TODO: implement pagination
	const q = url.searchParams.get('q');

	// Query users with joined pegawai and kelas
	// For multi-kelas wali, we need to aggregate ALL kelas they manage
	const usersRaw = await db
		.select({
			id: u.id,
			username: u.username,
			createdAt: u.createdAt,
			type: u.type,
			pegawaiId: u.pegawaiId,
			pegawaiName: tablePegawai.nama,
			kelasId: u.kelasId,
			kelasName: tableKelas.nama,
			passwordUpdatedAt: u.passwordUpdatedAt
		})
		.from(u)
		.leftJoin(tablePegawai, eq(u.pegawaiId, tablePegawai.id))
		.leftJoin(tableKelas, eq(u.kelasId, tableKelas.id))
		.where(
			and(
				// exclude admin users from the listing
				sql`${u.type} != ${'admin'}`,
				eq(u.sekolahId, sekolahId),
				q ? sql` lower(${u.username}) like ${'%' + q.toLowerCase() + '%'}` : sql` true`
			)
		)
		.limit(100);

	// Debug: log raw results
	console.debug('[pengguna] usersRaw count:', usersRaw.length);
	const nilawatiRows = usersRaw.filter((r) => r.pegawaiName?.includes('Nilawati'));
	if (nilawatiRows.length > 0) {
		console.debug('[pengguna] Nilawati entries:', JSON.stringify(nilawatiRows, null, 2));
	}

	// Deduplicate & aggregate kelas: for wali_kelas with multi-kelas,
	// fetch ALL kelas they manage and aggregate into display
	const users = await (async () => {
		const map = new Map<number, (typeof usersRaw)[0]>();

		// First pass: deduplicate by user ID
		for (const row of usersRaw) {
			const key = row.id;
			if (!map.has(key)) {
				map.set(key, row);
			}
		}

		// Second pass: for wali_kelas and wali_asuh users, fetch ALL kelas they manage
		for (const [, userRow] of map.entries()) {
			if (userRow.type === 'wali_kelas' && userRow.pegawaiId) {
				// Query ALL kelas where waliKelasId = pegawaiId
				const allKelas = await db.query.tableKelas.findMany({
					columns: { id: true, nama: true },
					where: and(
						eq(tableKelas.waliKelasId, userRow.pegawaiId),
						eq(tableKelas.sekolahId, sekolahId)
					)
				});

				// Aggregate kelas names
				if (allKelas.length > 0) {
					const kelasNames = allKelas.map((k) => k.nama).join(', ');
					userRow.kelasName = kelasNames;
				}
			} else if (userRow.type === 'wali_asuh' && userRow.pegawaiId) {
				// Wali_asuh is per-student, not per-class
				// Show count of assigned students instead
				const peg = await db.query.tablePegawai.findFirst({
					columns: { nama: true },
					where: eq(tablePegawai.id, userRow.pegawaiId)
				});
				if (peg?.nama) {
					const [{ count }] = await db
						.select({ count: sql<number>`count(*)` })
						.from(tableMurid)
						.where(
							sql`LOWER(trim(${tableMurid.waliAsuhNama})) = ${peg.nama.toLowerCase()} AND trim(${tableMurid.waliAsuhNama}) != ''`
						);
					userRow.kelasName = `${count} murid`;
				}
			}
		}

		console.debug('[pengguna] after dedup, users count:', map.size);
		const rows = Array.from(map.values());
		const userIds = rows.map((row) => row.id);
		const now = new Date();
		const onlineThresholdMs = 5 * 60 * 1000;
		const activeSessions = userIds.length
			? await db
					.select({
						userId: tableAuthSession.userId,
						updatedAt: tableAuthSession.updatedAt,
						expiresAt: tableAuthSession.expiresAt
					})
					.from(tableAuthSession)
					.where(
						and(
							inArray(tableAuthSession.userId, userIds),
							sql`${tableAuthSession.expiresAt} > ${now.toISOString()}`
						)
					)
			: [];
		const sessionByUser = new Map<
			number,
			{ activeSessionCount: number; lastSeenAt: string | null }
		>();

		for (const session of activeSessions) {
			const current = sessionByUser.get(session.userId) ?? {
				activeSessionCount: 0,
				lastSeenAt: null
			};
			current.activeSessionCount += 1;
			const currentTime = current.lastSeenAt ? new Date(current.lastSeenAt).getTime() : 0;
			const sessionTime = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
			if (Number.isFinite(sessionTime) && sessionTime >= currentTime) {
				current.lastSeenAt = session.updatedAt;
			}
			sessionByUser.set(session.userId, current);
		}

		return rows.map((row) => {
			const session = sessionByUser.get(row.id);
			const lastSeenAt = session?.lastSeenAt ?? null;
			const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
			return {
				...row,
				activeSessionCount: session?.activeSessionCount ?? 0,
				lastSeenAt,
				isOnline: Number.isFinite(lastSeenTime) && now.getTime() - lastSeenTime <= onlineThresholdMs
			};
		});
	})();

	return { meta: { title: 'Manajemen Pengguna' }, users };
}

export const actions = {
	update_credentials: async ({ request, locals }) => {
		authority('user_set_permissions');
		await ensurePenggunaIdentitySchema();

		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = Number(form.get('id'));
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();
		if (!sekolahId || !Number.isInteger(id) || id <= 0) {
			return fail(400, { message: 'Pengguna tidak valid' });
		}

		const updateData: Record<string, unknown> = {};
		if (username) {
			updateData.username = username;
			updateData.usernameNormalized = username.toLowerCase();
		}
		if (password) {
			const { hash, salt } = hashPassword(password);
			updateData.passwordHash = hash;
			updateData.passwordSalt = salt;
			updateData.passwordUpdatedAt = new Date().toISOString();
		}
		if (!Object.keys(updateData).length) return fail(400, { message: 'Tidak ada perubahan' });

		try {
			const [updated] = await db
				.update(u)
				.set({ ...updateData, updatedAt: new Date().toISOString() })
				.where(and(eq(u.id, id), eq(u.sekolahId, sekolahId)))
				.returning({
					id: u.id,
					username: u.username,
					usernameNormalized: u.usernameNormalized,
					passwordUpdatedAt: u.passwordUpdatedAt
				});
			if (!updated) return fail(404, { message: 'Pengguna tidak ditemukan' });
			return { success: true, user: updated };
		} catch (err) {
			const message = String(err);
			if (message.includes('auth_user.username_normalized')) {
				return fail(400, { message: 'Username sudah digunakan' });
			}
			console.error('Failed to update user credentials', err);
			return fail(500, { message: 'Gagal memperbarui akun' });
		}
	},

	create_user: async ({ request, locals }) => {
		authority('user_add');
		await ensurePenggunaIdentitySchema();

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { message: 'Sekolah aktif tidak ditemukan' });

		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();
		const requestedRole = String(form.get('type') ?? 'user');
		const roleValue: CreatableRole = CREATABLE_ROLES.includes(requestedRole as CreatableRole)
			? (requestedRole as CreatableRole)
			: 'user';
		const pegawaiId = Number(form.get('pegawaiId'));
		let mataPelajaranIds = parseIdList(form.get('mataPelajaranIds'));
		let kelasIds = parseIdList(form.get('kelasIds'));

		if (!username) return fail(400, { message: 'Username wajib diisi' });
		if (!password) return fail(400, { message: 'Password wajib diisi' });
		if (!Number.isInteger(pegawaiId) || pegawaiId <= 0) {
			return fail(400, { message: 'Pilih pegawai dari Data Pegawai' });
		}

		const allowedJenis: Record<CreatableRole, string[]> = {
			user: ['guru', 'kepala_sekolah'],
			wali_asuh: ['wali_asuh'],
			wali_asrama: ['wali_asrama']
		};
		const pegawai = await db.query.tablePegawai.findFirst({
			columns: { id: true, nama: true, jenis: true, status: true },
			where: and(
				eq(tablePegawai.id, pegawaiId),
				eq(tablePegawai.sekolahId, sekolahId),
				eq(tablePegawai.status, 'aktif')
			)
		});
		if (!pegawai || !allowedJenis[roleValue].includes(pegawai.jenis)) {
			return fail(400, { message: 'Pegawai tidak sesuai dengan role yang dipilih' });
		}

		const existingPegawaiUser = await db.query.tableAuthUser.findFirst({
			columns: { username: true },
			where: eq(tableAuthUser.pegawaiId, pegawaiId)
		});
		if (existingPegawaiUser) {
			return fail(400, {
				message: `Pegawai ini sudah terhubung ke akun ${existingPegawaiUser.username}`
			});
		}

		if (roleValue !== 'user') {
			mataPelajaranIds = [];
			kelasIds = [];
		} else if (!mataPelajaranIds.length) {
			return fail(400, { message: 'Guru Mapel wajib memilih mata pelajaran' });
		}

		if (mataPelajaranIds.length) {
			const validMapel = await db
				.select({ id: tableMataPelajaran.id })
				.from(tableMataPelajaran)
				.innerJoin(tableKelas, eq(tableMataPelajaran.kelasId, tableKelas.id))
				.where(
					and(inArray(tableMataPelajaran.id, mataPelajaranIds), eq(tableKelas.sekolahId, sekolahId))
				);
			if (new Set(validMapel.map((item) => item.id)).size !== mataPelajaranIds.length) {
				return fail(400, { message: 'Mata pelajaran tidak valid untuk sekolah aktif' });
			}
		}

		if (kelasIds.length) {
			const validKelas = await db
				.select({ id: tableKelas.id })
				.from(tableKelas)
				.where(and(inArray(tableKelas.id, kelasIds), eq(tableKelas.sekolahId, sekolahId)));
			if (new Set(validKelas.map((item) => item.id)).size !== kelasIds.length) {
				return fail(400, { message: 'Kelas tidak valid untuk sekolah aktif' });
			}
		}

		try {
			const { hash, salt } = hashPassword(password);
			const timestamp = new Date().toISOString();
			const permissions: UserPermission[] =
				roleValue === 'user' && kelasIds.length > 1 ? ['kelas_pindah'] : [];

			const created = await db.transaction(async (tx) => {
				const [user] = await tx
					.insert(tableAuthUser)
					.values({
						username,
						usernameNormalized: username.toLowerCase(),
						passwordHash: hash,
						passwordSalt: salt,
						passwordUpdatedAt: timestamp,
						permissions,
						type: roleValue,
						mataPelajaranId: mataPelajaranIds[0] ?? null,
						kelasId: kelasIds[0] ?? null,
						sekolahId,
						pegawaiId,
						createdAt: timestamp,
						updatedAt: timestamp
					})
					.returning({
						id: tableAuthUser.id,
						username: tableAuthUser.username,
						createdAt: tableAuthUser.createdAt,
						type: tableAuthUser.type,
						pegawaiId: tableAuthUser.pegawaiId,
						passwordUpdatedAt: tableAuthUser.passwordUpdatedAt
					});
				if (!user) throw new Error('Akun gagal dibuat');

				if (mataPelajaranIds.length) {
					await tx.insert(tableAuthUserMataPelajaran).values(
						mataPelajaranIds.map((mataPelajaranId) => ({
							authUserId: user.id,
							mataPelajaranId,
							createdAt: timestamp,
							updatedAt: timestamp
						}))
					);
				}
				if (kelasIds.length) {
					await tx.insert(tableAuthUserKelas).values(
						kelasIds.map((kelasId) => ({
							authUserId: user.id,
							kelasId,
							createdAt: timestamp,
							updatedAt: timestamp
						}))
					);
				}
				return user;
			});

			return {
				success: true,
				user: created,
				displayName: pegawai.nama,
				mataPelajaranIds,
				kelasIds
			};
		} catch (err) {
			const message = String(err);
			if (message.includes('auth_user.username_normalized')) {
				return fail(400, { message: 'Username sudah digunakan' });
			}
			console.error('Failed to create user', err);
			return fail(500, { message: 'Gagal membuat akun pengguna' });
		}
	},

	delete_users: async ({ request, locals }) => {
		authority('user_delete');
		await ensurePenggunaIdentitySchema();
		await Promise.all([
			ensureAbsensiDigitalSchema(),
			ensureKesehatanMuridSchema(),
			ensureJurnalMengajarSchema()
		]);

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { message: 'Sekolah aktif tidak ditemukan' });

		let ids: number[] = [];
		try {
			const contentType = request.headers.get('content-type') ?? '';
			if (contentType.includes('application/json')) {
				const body = await request.json();
				ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
			} else {
				const form = await request.formData();
				ids = String(form.get('ids') ?? '')
					.split(',')
					.map(Number);
			}
		} catch {
			return fail(400, { message: 'Permintaan tidak valid' });
		}
		ids = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
		if (!ids.length) return fail(400, { message: 'Pilih pengguna yang akan dihapus' });

		try {
			const candidates = await db
				.select({ id: tableAuthUser.id })
				.from(tableAuthUser)
				.where(
					and(
						inArray(tableAuthUser.id, ids),
						eq(tableAuthUser.sekolahId, sekolahId),
						sql`${tableAuthUser.type} != ${'admin'}`
					)
				);
			const scopedIds = candidates.map((candidate) => candidate.id);
			if (!scopedIds.length) return fail(404, { message: 'Pengguna tidak ditemukan' });

			const [journalReference] = await db
				.select({ total: sql<number>`count(*)` })
				.from(tableJurnalMengajar)
				.where(inArray(tableJurnalMengajar.authUserId, scopedIds));
			if ((journalReference?.total ?? 0) > 0) {
				return fail(409, {
					message:
						'Akun masih memiliki Jurnal Mengajar. Pertahankan akun agar riwayat administrasi tidak terhapus.'
				});
			}

			await db.transaction(async (tx) => {
				await tx
					.update(tableAbsensiHarian)
					.set({ petugasUserId: null })
					.where(inArray(tableAbsensiHarian.petugasUserId, scopedIds));
				await tx
					.update(tableAbsensiKegiatan)
					.set({ petugasUserId: null })
					.where(inArray(tableAbsensiKegiatan.petugasUserId, scopedIds));
				await tx
					.update(tableKesehatanMurid)
					.set({ petugasUserId: null })
					.where(inArray(tableKesehatanMurid.petugasUserId, scopedIds));
				await tx.delete(tableUserFavorites).where(inArray(tableUserFavorites.userId, scopedIds));
				await tx
					.delete(tableAuthUserMataPelajaran)
					.where(inArray(tableAuthUserMataPelajaran.authUserId, scopedIds));
				await tx
					.delete(tableAuthUserKelas)
					.where(inArray(tableAuthUserKelas.authUserId, scopedIds));
				await tx.delete(tableAuthSession).where(inArray(tableAuthSession.userId, scopedIds));
				await tx.delete(tableAuthUser).where(inArray(tableAuthUser.id, scopedIds));
			});
			return { success: true, deleted: scopedIds };
		} catch (err) {
			console.error('Failed to delete users', err);
			return fail(500, { message: 'Gagal menghapus akun pengguna' });
		}
	}
};
