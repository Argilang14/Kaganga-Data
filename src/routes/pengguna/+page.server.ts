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
	tableJurnalMengajar,
	tableSekolah
} from '$lib/server/db/schema';
import { sql, eq, and, inArray, or, asc } from 'drizzle-orm';
import { authority } from './utils.server';
import { hashPassword } from '$lib/server/auth';
import { validatePassword } from '$lib/password-policy';
import { defaultPermissionsForType } from './permissions';
import { fail } from '@sveltejs/kit';
import { getAssignmentSummaries } from '$lib/server/assignment-summary';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { parseAccessPosition } from '$lib/access-position';
import { writeAuditLog } from '$lib/server/audit-log';

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
	if (!sekolahId) {
		return {
			meta: { title: 'Manajemen Pengguna' },
			users: [],
			filters: { q: '', role: 'all', jabatan: 'all', status: 'all' },
			pagination: { currentPage: 1, totalPages: 1, totalItems: 0, pageSize: 25 }
		};
	}

	// Halaman ini hanya membaca akun. Pembuatan akun dilakukan melalui aksi eksplisit.
	const q = (url.searchParams.get('q') ?? '').trim();
	const role = url.searchParams.get('role') ?? 'all';
	const jabatan = url.searchParams.get('jabatan') ?? 'all';
	const status = url.searchParams.get('status') ?? 'all';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const pageSize = 25;
	const now = new Date();
	const onlineThresholdMs = 5 * 60 * 1000;
	const onlineCutoff = new Date(now.getTime() - onlineThresholdMs).toISOString();
	const nowIso = now.toISOString();
	const queryLike = `%${q.toLowerCase()}%`;
	const isKnownRole = ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'wali_murid'].includes(
		role
	);
	const isKnownStatus = status === 'online' || status === 'offline';
	const parsedJabatan = parseAccessPosition(jabatan);
	const onlineExpression = sql`exists (
		select 1 from auth_session activity
		where activity.user_id = ${u.id}
			and activity.expires_at > ${nowIso}
			and activity.updated_at >= ${onlineCutoff}
	)`;
	const whereClause = and(
		sql`${u.type} != ${'admin'}`,
		eq(u.sekolahId, sekolahId),
		q
			? or(
					sql`lower(${u.username}) like ${queryLike}`,
					sql`lower(coalesce(${tablePegawai.nama}, '')) like ${queryLike}`
				)
			: undefined,
		isKnownRole
			? eq(u.type, role as 'user' | 'wali_kelas' | 'wali_asuh' | 'wali_asrama' | 'wali_murid')
			: undefined,
		parsedJabatan ? eq(u.jabatanAkses, parsedJabatan) : undefined,
		isKnownStatus
			? status === 'online'
				? onlineExpression
				: sql`not ${onlineExpression}`
			: undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(distinct ${u.id})` })
		.from(u)
		.leftJoin(tablePegawai, eq(u.pegawaiId, tablePegawai.id))
		.where(whereClause);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const currentPage = Math.min(requestedPage, totalPages);

	const usersRaw = await db
		.select({
			id: u.id,
			username: u.username,
			createdAt: u.createdAt,
			type: u.type,
			jabatanAkses: u.jabatanAkses,
			pegawaiId: u.pegawaiId,
			pegawaiName: tablePegawai.nama,
			pegawaiNip: tablePegawai.nip,
			pegawaiJenis: tablePegawai.jenis,
			kelasId: u.kelasId,
			kelasName: tableKelas.nama,
			mataPelajaranId: u.mataPelajaranId,
			passwordUpdatedAt: u.passwordUpdatedAt,
			mustChangePassword: u.mustChangePassword
		})
		.from(u)
		.leftJoin(tablePegawai, eq(u.pegawaiId, tablePegawai.id))
		.leftJoin(tableKelas, eq(u.kelasId, tableKelas.id))
		.where(whereClause)
		.orderBy(asc(tablePegawai.nama), asc(u.username))
		.limit(pageSize)
		.offset((currentPage - 1) * pageSize);

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

		const context = await resolveSekolahAcademicContext(sekolahId);
		const summaries = await getAssignmentSummaries(
			[...map.values()],
			sekolahId,
			context.activeSemesterId,
			context.activeTahunAjaranId
		);
		for (const row of map.values()) row.kelasName = summaries.get(row.id) ?? 'Belum ada penugasan';
		const rows = Array.from(map.values());
		const userIds = rows.map((row) => row.id);
		const [mapelLinks, kelasLinks] = userIds.length
			? await Promise.all([
					db
						.select({
							userId: tableAuthUserMataPelajaran.authUserId,
							id: tableAuthUserMataPelajaran.mataPelajaranId
						})
						.from(tableAuthUserMataPelajaran)
						.where(inArray(tableAuthUserMataPelajaran.authUserId, userIds)),
					db
						.select({
							userId: tableAuthUserKelas.authUserId,
							id: tableAuthUserKelas.kelasId
						})
						.from(tableAuthUserKelas)
						.where(inArray(tableAuthUserKelas.authUserId, userIds))
				])
			: [[], []];
		const mapelIdsByUser = new Map<number, number[]>();
		const kelasIdsByUser = new Map<number, number[]>();
		for (const link of mapelLinks) {
			mapelIdsByUser.set(link.userId, [...(mapelIdsByUser.get(link.userId) ?? []), link.id]);
		}
		for (const link of kelasLinks) {
			kelasIdsByUser.set(link.userId, [...(kelasIdsByUser.get(link.userId) ?? []), link.id]);
		}
		const [waliClasses, schoolHead] = await Promise.all([
			db.query.tableKelas.findMany({
				columns: { id: true, nama: true, waliKelasId: true },
				where: and(
					eq(tableKelas.sekolahId, sekolahId),
					context.activeSemesterId ? eq(tableKelas.semesterId, context.activeSemesterId) : undefined
				)
			}),
			db.query.tableSekolah.findFirst({
				columns: { kepalaSekolahId: true },
				where: eq(tableSekolah.id, sekolahId)
			})
		]);
		const waliByPegawai = new Map<number, typeof waliClasses>();
		for (const kelas of waliClasses) {
			if (!kelas.waliKelasId) continue;
			waliByPegawai.set(kelas.waliKelasId, [
				...(waliByPegawai.get(kelas.waliKelasId) ?? []),
				kelas
			]);
		}
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
			const ownClasses = row.pegawaiId ? (waliByPegawai.get(row.pegawaiId) ?? []) : [];
			const roles: string[] = [];
			if (row.pegawaiId && schoolHead?.kepalaSekolahId === row.pegawaiId)
				roles.push('Kepala Sekolah');
			for (const kelas of ownClasses) roles.push(`Wali ${kelas.nama}`);
			if (row.type === 'wali_kelas' && (mapelIdsByUser.get(row.id)?.length ?? 0) > 0)
				roles.push('Guru Mapel');
			return {
				...row,
				roles,
				mataPelajaranIds:
					mapelIdsByUser.get(row.id) ?? (row.mataPelajaranId ? [row.mataPelajaranId] : []),
				kelasIds: kelasIdsByUser.get(row.id) ?? (row.kelasId ? [row.kelasId] : []),
				activeSessionCount: session?.activeSessionCount ?? 0,
				lastSeenAt,
				isOnline: Number.isFinite(lastSeenTime) && now.getTime() - lastSeenTime <= onlineThresholdMs
			};
		});
	})();

	return {
		meta: { title: 'Manajemen Pengguna' },
		users,
		filters: {
			q,
			role: isKnownRole ? role : 'all',
			jabatan: parsedJabatan ?? 'all',
			status: isKnownStatus ? status : 'all'
		},
		pagination: { currentPage, totalPages, totalItems, pageSize }
	};
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
			const validation = validatePassword(password);
			if (!validation.valid) return fail(400, { message: validation.message });
			const { hash, salt } = hashPassword(password);
			updateData.passwordHash = hash;
			updateData.passwordSalt = salt;
			updateData.passwordUpdatedAt = new Date().toISOString();
			updateData.mustChangePassword = true;
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
			if (password) await db.delete(tableAuthSession).where(eq(tableAuthSession.userId, id));
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
		const jabatanAkses = parseAccessPosition(form.get('jabatanAkses'));
		const pegawaiId = Number(form.get('pegawaiId'));
		let mataPelajaranIds = parseIdList(form.get('mataPelajaranIds'));
		let kelasIds = parseIdList(form.get('kelasIds'));

		if (!username) return fail(400, { message: 'Username wajib diisi' });
		if (!password) return fail(400, { message: 'Kata sandi wajib diisi' });
		const passwordValidation = validatePassword(password);
		if (!passwordValidation.valid) return fail(400, { message: passwordValidation.message });
		if (!Number.isInteger(pegawaiId) || pegawaiId <= 0) {
			return fail(400, { message: 'Pilih pegawai dari Data Pegawai' });
		}

		if (jabatanAkses && roleValue !== 'user') {
			return fail(400, { message: 'Jabatan akses hanya dapat dipakai pada akun pegawai umum' });
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
		if (!pegawai || (!jabatanAkses && !allowedJenis[roleValue].includes(pegawai.jenis))) {
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
		} else if (!jabatanAkses && !mataPelajaranIds.length) {
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
			const permissions = defaultPermissionsForType(roleValue, {
				kelasCount: kelasIds.length
			});

			const created = await db.transaction(async (tx) => {
				const [user] = await tx
					.insert(tableAuthUser)
					.values({
						username,
						usernameNormalized: username.toLowerCase(),
						passwordHash: hash,
						passwordSalt: salt,
						passwordUpdatedAt: timestamp,
						mustChangePassword: true,
						permissions,
						jabatanAkses,
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
						jabatanAkses: tableAuthUser.jabatanAkses,
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

			await writeAuditLog({
				locals,
				request,
				action: 'create',
				entityType: 'pengguna',
				entityId: created.id,
				summary: `Membuat akun ${created.username}`,
				after: { type: created.type, jabatanAkses: created.jabatanAkses, pegawaiId }
			}).catch((auditError) => console.error('Failed to audit user creation', auditError));
			return {
				success: true,
				user: created,
				displayName: pegawai.nama,
				mataPelajaranIds,
				kelasIds,
				jabatanAkses
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

	update_user: async ({ request, locals }) => {
		authority('user_set_permissions');
		await ensurePenggunaIdentitySchema();

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { message: 'Sekolah aktif tidak ditemukan' });

		const form = await request.formData();
		const id = Number(form.get('id'));
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();
		const requestedRole = String(form.get('type') ?? 'user');
		const jabatanAkses = parseAccessPosition(form.get('jabatanAkses'));
		let mataPelajaranIds = parseIdList(form.get('mataPelajaranIds'));
		let kelasIds = parseIdList(form.get('kelasIds'));

		if (!Number.isInteger(id) || id <= 0 || !username) {
			return fail(400, { message: 'Data pengguna tidak valid' });
		}
		const target = await db.query.tableAuthUser.findFirst({
			columns: {
				id: true,
				type: true,
				pegawaiId: true,
				permissions: true,
				jabatanAkses: true
			},
			where: and(eq(tableAuthUser.id, id), eq(tableAuthUser.sekolahId, sekolahId))
		});
		if (!target || target.type === 'admin') {
			return fail(404, { message: 'Pengguna tidak ditemukan' });
		}

		const isLegacyWaliKelas = target.type === 'wali_kelas';
		const roleValue: CreatableRole = CREATABLE_ROLES.includes(requestedRole as CreatableRole)
			? (requestedRole as CreatableRole)
			: 'user';
		if (jabatanAkses && roleValue !== 'user') {
			return fail(400, { message: 'Jabatan akses hanya dapat dipakai pada akun pegawai umum' });
		}
		if (isLegacyWaliKelas && requestedRole !== 'wali_kelas') {
			return fail(400, { message: 'Role wali kelas lama dikelola dari Data Kelas' });
		}
		if (!target.pegawaiId) {
			return fail(400, { message: 'Akun belum terhubung dengan Data Pegawai' });
		}

		const pegawai = await db.query.tablePegawai.findFirst({
			columns: { id: true, nama: true, jenis: true, status: true },
			where: and(
				eq(tablePegawai.id, target.pegawaiId),
				eq(tablePegawai.sekolahId, sekolahId),
				eq(tablePegawai.status, 'aktif')
			)
		});
		if (!pegawai) return fail(400, { message: 'Data Pegawai aktif tidak ditemukan' });

		if (!isLegacyWaliKelas) {
			const allowedJenis: Record<CreatableRole, string[]> = {
				user: ['guru', 'kepala_sekolah'],
				wali_asuh: ['wali_asuh'],
				wali_asrama: ['wali_asrama']
			};
			if (!jabatanAkses && !allowedJenis[roleValue].includes(pegawai.jenis)) {
				return fail(400, { message: 'Role tidak sesuai dengan jenis Data Pegawai' });
			}
			if (roleValue !== 'user') {
				mataPelajaranIds = [];
				kelasIds = [];
			} else if (!jabatanAkses && !mataPelajaranIds.length) {
				return fail(400, { message: 'Guru Mapel wajib memilih mata pelajaran' });
			}
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

		let hashedPassword: ReturnType<typeof hashPassword> | null = null;
		if (password) {
			const validation = validatePassword(password);
			if (!validation.valid) return fail(400, { message: validation.message });
			hashedPassword = hashPassword(password);
		}

		try {
			const timestamp = new Date().toISOString();
			const nextType = isLegacyWaliKelas ? 'wali_kelas' : roleValue;
			const roleChanged = nextType !== target.type;
			const updateData: Record<string, unknown> = {
				username,
				usernameNormalized: username.toLowerCase(),
				type: nextType,
				jabatanAkses: isLegacyWaliKelas ? null : jabatanAkses,
				updatedAt: timestamp
			};
			if (!isLegacyWaliKelas) {
				updateData.mataPelajaranId = mataPelajaranIds[0] ?? null;
				updateData.kelasId = kelasIds[0] ?? null;
				if (roleChanged) {
					updateData.permissions = defaultPermissionsForType(nextType, {
						kelasCount: kelasIds.length
					});
				}
			}
			if (hashedPassword) {
				updateData.passwordHash = hashedPassword.hash;
				updateData.passwordSalt = hashedPassword.salt;
				updateData.passwordUpdatedAt = timestamp;
				updateData.mustChangePassword = true;
			}

			const updated = await db.transaction(async (tx) => {
				const [user] = await tx
					.update(tableAuthUser)
					.set(updateData)
					.where(and(eq(tableAuthUser.id, id), eq(tableAuthUser.sekolahId, sekolahId)))
					.returning({
						id: tableAuthUser.id,
						username: tableAuthUser.username,
						type: tableAuthUser.type,
						jabatanAkses: tableAuthUser.jabatanAkses,
						pegawaiId: tableAuthUser.pegawaiId,
						passwordUpdatedAt: tableAuthUser.passwordUpdatedAt,
						mustChangePassword: tableAuthUser.mustChangePassword
					});
				if (!user) throw new Error('Pengguna tidak ditemukan');

				if (!isLegacyWaliKelas) {
					await tx
						.delete(tableAuthUserMataPelajaran)
						.where(eq(tableAuthUserMataPelajaran.authUserId, id));
					await tx.delete(tableAuthUserKelas).where(eq(tableAuthUserKelas.authUserId, id));
					if (mataPelajaranIds.length) {
						await tx.insert(tableAuthUserMataPelajaran).values(
							mataPelajaranIds.map((mataPelajaranId) => ({
								authUserId: id,
								mataPelajaranId,
								createdAt: timestamp,
								updatedAt: timestamp
							}))
						);
					}
					if (kelasIds.length) {
						await tx.insert(tableAuthUserKelas).values(
							kelasIds.map((kelasId) => ({
								authUserId: id,
								kelasId,
								createdAt: timestamp,
								updatedAt: timestamp
							}))
						);
					}
				}
				if (hashedPassword || target.jabatanAkses !== jabatanAkses) {
					await tx.delete(tableAuthSession).where(eq(tableAuthSession.userId, id));
				}
				return user;
			});

			await writeAuditLog({
				locals,
				request,
				action: 'update',
				entityType: 'pengguna',
				entityId: updated.id,
				summary: `Memperbarui akun ${updated.username}`,
				before: { type: target.type, jabatanAkses: target.jabatanAkses },
				after: { type: updated.type, jabatanAkses: updated.jabatanAkses }
			}).catch((auditError) => console.error('Failed to audit user update', auditError));
			return {
				success: true,
				message: 'Pengguna berhasil diperbarui',
				user: updated,
				displayName: pegawai.nama,
				mataPelajaranIds,
				kelasIds,
				jabatanAkses
			};
		} catch (err) {
			const message = String(err);
			if (message.includes('auth_user.username_normalized')) {
				return fail(400, { message: 'Nama pengguna sudah digunakan' });
			}
			console.error('Failed to update user', err);
			return fail(500, { message: 'Gagal memperbarui pengguna' });
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
