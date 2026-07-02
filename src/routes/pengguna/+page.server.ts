import db from '$lib/server/db';
import { env } from '$env/dynamic/private';
import {
	tableAuthUser,
	tablePegawai,
	tableKelas,
	tableMataPelajaran,
	tableAuthUserMataPelajaran,
	tableAuthUserKelas,
	tableSemester,
	tableAuthSession
} from '$lib/server/db/schema';
import { tableSekolah } from '$lib/server/db/schema';
import { sql, eq, and, inArray, desc, asc } from 'drizzle-orm';
import { authority } from './utils.server';
import { hashPassword } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';

const u = tableAuthUser;

export async function load({ url, locals }) {
	authority('user_list');

	// TODO: implement pagination
	const q = url.searchParams.get('q');
	const activeSekolahId = locals.sekolah?.id ?? null;

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
				q ? sql` lower(${u.username}) like ${'%' + q.toLowerCase() + '%'}` : sql` true`,
				activeSekolahId ? eq(u.sekolahId, activeSekolahId) : sql` true`
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

		// Second pass: for wali_kelas users, fetch ALL kelas they manage
		for (const [, userRow] of map.entries()) {
			if (userRow.type === 'wali_kelas' && userRow.pegawaiId) {
				// Query ALL kelas where waliKelasId = pegawaiId
				const allKelas = await db.query.tableKelas.findMany({
					columns: { id: true, nama: true },
					where: activeSekolahId
						? and(
								eq(tableKelas.waliKelasId, userRow.pegawaiId),
								eq(tableKelas.sekolahId, activeSekolahId)
							)
						: eq(tableKelas.waliKelasId, userRow.pegawaiId)
				});

				// Aggregate kelas names
				if (allKelas.length > 0) {
					const kelasNames = allKelas.map((k) => k.nama).join(', ');
					userRow.kelasName = kelasNames;
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
						expiresAt: tableAuthSession.expiresAt,
						userAgent: tableAuthSession.userAgent
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
			{
				activeSessionCount: number;
				lastSeenAt: string | null;
				sessionExpiresAt: string | null;
				userAgent: string | null;
			}
		>();

		for (const session of activeSessions) {
			const current = sessionByUser.get(session.userId) ?? {
				activeSessionCount: 0,
				lastSeenAt: null,
				sessionExpiresAt: null,
				userAgent: null
			};
			current.activeSessionCount += 1;
			const currentLastSeen = current.lastSeenAt ? new Date(current.lastSeenAt).getTime() : 0;
			const sessionLastSeen = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
			if (Number.isFinite(sessionLastSeen) && sessionLastSeen >= currentLastSeen) {
				current.lastSeenAt = session.updatedAt;
				current.sessionExpiresAt = session.expiresAt;
				current.userAgent = session.userAgent;
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
				sessionExpiresAt: session?.sessionExpiresAt ?? null,
				lastUserAgent: session?.userAgent ?? null,
				isOnline: Number.isFinite(lastSeenTime) && now.getTime() - lastSeenTime <= onlineThresholdMs
			};
		});
	})();

	// fetch mata pelajaran to populate select in the inline-add row
	const mataPelajaran = await db
		.select({
			id: tableMataPelajaran.id,
			nama: tableMataPelajaran.nama,
			kelasId: tableMataPelajaran.kelasId
		})
		.from(tableMataPelajaran)
		.limit(1000);

	// fetch sekolah list so the Add User modal can offer a sekolah selection
	const sekolahList = await db
		.select({ id: tableSekolah.id, nama: tableSekolah.nama })
		.from(tableSekolah)
		.limit(1000);

	// fetch kelas list so the Add User modal can offer kelas selection for multi-kelas
	// Include semester information to deduplicate kelas across ganjil/genap
	const kelasListRaw = await db
		.select({
			id: tableKelas.id,
			nama: tableKelas.nama,
			fase: tableKelas.fase,
			sekolahId: tableKelas.sekolahId,
			tahunAjaranId: tableKelas.tahunAjaranId,
			semesterId: tableKelas.semesterId,
			semesterTipe: tableSemester.tipe,
			semesterIsAktif: tableSemester.isAktif
		})
		.from(tableKelas)
		.leftJoin(tableSemester, eq(tableKelas.semesterId, tableSemester.id))
		.where(activeSekolahId ? eq(tableKelas.sekolahId, activeSekolahId) : sql`true`)
		.limit(1000);

	// Deduplicate kelas: for each (nama + tahunAjaranId), keep only one entry.
	// Prefer semester aktif supaya akun baru mengikuti pilihan admin (ganjil/genap).
	const kelasList = (() => {
		const seen = new Map<string, (typeof kelasListRaw)[0]>();
		for (const kelas of kelasListRaw) {
			const key = `${kelas.nama ?? ''}_${kelas.tahunAjaranId ?? ''}`;
			const existing = seen.get(key);
			if (!existing) {
				seen.set(key, kelas);
			} else if (kelas.semesterIsAktif && !existing.semesterIsAktif) {
				seen.set(key, kelas);
			}
		}
		return Array.from(seen.values()).map((k) => ({
			id: k.id,
			nama: k.nama,
			fase: k.fase,
			sekolahId: k.sekolahId
		}));
	})();

	const pegawaiList = await db.query.tablePegawai.findMany({
		columns: { id: true, nama: true, nip: true, jenis: true, jabatan: true, status: true },
		where: activeSekolahId
			? and(eq(tablePegawai.status, 'aktif'), eq(tablePegawai.sekolahId, activeSekolahId))
			: eq(tablePegawai.status, 'aktif'),
		orderBy: [asc(tablePegawai.nama)]
	});

	return {
		meta: { title: 'Manajemen Pengguna' },
		users,
		mataPelajaran,
		sekolahList,
		kelasList,
		pegawaiList
	};
}

export const actions = {
	update_credentials: async ({ request }) => {
		authority('user_set_permissions');
		const form = await request.formData();
		const id = Number(form.get('id'));
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();

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

		if (Object.keys(updateData).length === 0) {
			return new Response('No changes provided', { status: 400 });
		}

		try {
			await db.update(u).set(updateData).where(eq(u.id, id));
			const [updated] = await db
				.select({
					id: u.id,
					username: u.username,
					usernameNormalized: u.usernameNormalized,
					passwordUpdatedAt: u.passwordUpdatedAt
				})
				.from(u)
				.where(eq(u.id, id));
			return { success: true, user: updated };
		} catch (err) {
			console.error('Failed to update user credentials', err);
			return new Response(String(err), { status: 500 });
		}
	},
	create_user: async ({ request, locals }) => {
		authority('user_add');
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();
		const nama = String(form.get('nama') ?? '').trim();
		const requestedRole = String(form.get('type') ?? 'user');
		const roleValue = ['user', 'wali_asuh', 'wali_asrama'].includes(requestedRole)
			? requestedRole
			: 'user';
		const pegawaiIdRaw = Number(String(form.get('pegawaiId') ?? ''));
		const selectedPegawaiId =
			Number.isInteger(pegawaiIdRaw) && pegawaiIdRaw > 0 ? pegawaiIdRaw : null;

		// Parse multi-mapel: mataPelajaranIds adalah JSON array string
		let mataPelajaranIds: number[] = [];
		const mataPelajaranIdsRaw = form.get('mataPelajaranIds');
		if (mataPelajaranIdsRaw) {
			try {
				const parsed = JSON.parse(String(mataPelajaranIdsRaw));
				if (Array.isArray(parsed)) {
					mataPelajaranIds = parsed.map((id) => Number(id)).filter((id) => !isNaN(id));
				}
			} catch (err) {
				console.warn('[pengguna] failed to parse mataPelajaranIds', err);
			}
		}

		// Parse multi-kelas: kelasIds adalah JSON array string
		let kelasIds: number[] = [];
		const kelasIdsRaw = form.get('kelasIds');
		if (kelasIdsRaw) {
			try {
				const parsed = JSON.parse(String(kelasIdsRaw));
				if (Array.isArray(parsed)) {
					kelasIds = parsed.map((id) => Number(id)).filter((id) => !isNaN(id));
				}
			} catch (err) {
				console.warn('[pengguna] failed to parse kelasIds', err);
			}
		}

		const sekolahIdRaw = form.get('sekolahId');
		const selectedSekolahId = sekolahIdRaw ? Number(String(sekolahIdRaw)) : null;
		const sekolahId = locals.sekolah?.id ?? selectedSekolahId;

		if (!username) return fail(400, { message: 'username required' });
		if (!password) return fail(400, { message: 'password required' });
		if (!sekolahId) return fail(400, { message: 'Sekolah aktif tidak ditemukan' });

		try {
			const { hash, salt } = hashPassword(password);
			const timestamp = new Date().toISOString();
			let pegawaiId: number | null = null;
			let displayName = nama;

			if (selectedPegawaiId) {
				const pegawai = await db.query.tablePegawai.findFirst({
					columns: { id: true, nama: true, status: true },
					where: and(eq(tablePegawai.id, selectedPegawaiId), eq(tablePegawai.sekolahId, sekolahId))
				});
				if (!pegawai || pegawai.status !== 'aktif') {
					return fail(400, { message: 'Pegawai tidak ditemukan atau sudah nonaktif' });
				}
				const existingPegawaiUser = await db.query.tableAuthUser.findFirst({
					columns: { id: true, username: true },
					where: eq(tableAuthUser.pegawaiId, selectedPegawaiId)
				});
				if (existingPegawaiUser) {
					return fail(400, {
						message: `Pegawai ini sudah terhubung ke akun ${existingPegawaiUser.username}`
					});
				}
				pegawaiId = pegawai.id;
				displayName = pegawai.nama;
			} else if (nama) {
				const [p] = await db
					.insert(tablePegawai)
					.values({ sekolahId, nama, nip: '-' })
					.returning({ id: tablePegawai.id });
				if (p && typeof p.id === 'number') pegawaiId = p.id;
			}

			// If no mataPelajaranIds selected but sekolahId provided, try to
			// resolve any mata_pelajaran owned by that sekolah and use the first
			if (mataPelajaranIds.length === 0 && sekolahId) {
				try {
					const mpList = await db
						.select({ id: tableMataPelajaran.id })
						.from(tableMataPelajaran)
						.leftJoin(tableKelas, eq(tableMataPelajaran.kelasId, tableKelas.id))
						.where(eq(tableKelas.sekolahId, sekolahId))
						.limit(1);
					if (mpList.length > 0 && mpList[0].id) {
						mataPelajaranIds = [mpList[0].id];
					}
				} catch (err) {
					console.warn('[pengguna] failed to resolve mataPelajaran for sekolahId', sekolahId, err);
				}
			}

			if ((roleValue === 'wali_asuh' || roleValue === 'wali_asrama') && kelasIds.length === 0) {
				const kelasScope = sekolahId
					? await db
							.select({ id: tableKelas.id })
							.from(tableKelas)
							.where(eq(tableKelas.sekolahId, sekolahId))
							.limit(1000)
					: await db.select({ id: tableKelas.id }).from(tableKelas).limit(1000);
				kelasIds = kelasScope.map((kelas) => kelas.id);
			}

			if (roleValue !== 'user') {
				mataPelajaranIds = [];
			}

			// Auto-assign permissions based on role.
			const permissions: string[] = [];
			if (roleValue === 'user' && kelasIds.length > 1) {
				permissions.push('kelas_pindah');
			}
			if (roleValue === 'wali_asuh' || roleValue === 'wali_asrama') {
				permissions.push('rapor_manage', 'kelas_pindah');
			}

			// Insert auth_user record
			const insertData = {
				username,
				usernameNormalized: username.toLowerCase(),
				passwordHash: hash,
				passwordSalt: salt,
				passwordUpdatedAt: timestamp,
				permissions: permissions,
				type: roleValue,
				// For backward compatibility: only set mataPelajaranId if single mapel
				// Multi-mapel users should have null so system uses join table instead
				mataPelajaranId:
					roleValue === 'user' && mataPelajaranIds.length === 1 ? mataPelajaranIds[0] : undefined,
				// Set kelasId to first item (for backward compatibility with old code that checks kelasId)
				kelasId: kelasIds.length > 0 ? kelasIds[0] : undefined,
				// persist sekolah selection when provided so login reliably selects it
				sekolahId: sekolahId ?? undefined,
				pegawaiId: pegawaiId ?? undefined,
				createdAt: timestamp,
				updatedAt: timestamp
			};

			// @ts-expect-error: drizzle type inference issue with spread
			await db.insert(tableAuthUser).values(insertData);

			// fetch created user record to return the created user object reliably.
			// select the most-recent row matching usernameNormalized in case multiple exist.
			const [created] = await db
				.select({
					id: u.id,
					username: u.username,
					createdAt: u.createdAt,
					type: u.type,
					passwordUpdatedAt: u.passwordUpdatedAt
				})
				.from(u)
				.where(eq(u.usernameNormalized, username.toLowerCase()))
				.orderBy(desc(u.id))
				.limit(1);

			if (!created) {
				throw new Error('Failed to retrieve created user');
			}

			// Insert many-to-many entries untuk semua mata pelajaran yang dipilih
			for (const mapelId of mataPelajaranIds) {
				try {
					await db.insert(tableAuthUserMataPelajaran).values({
						authUserId: created.id,
						mataPelajaranId: mapelId,
						createdAt: timestamp,
						updatedAt: timestamp
					});
				} catch (err) {
					// Ignore duplicate errors (if somehow same mapel was added twice)
					if (String(err).includes('UNIQUE')) {
						console.warn(`[pengguna] duplicate mapel entry: user ${created.id}, mapel ${mapelId}`);
					} else {
						throw err;
					}
				}
			}

			// Insert many-to-many entries untuk semua kelas yang dipilih
			for (const kelasIdItem of kelasIds) {
				try {
					await db.insert(tableAuthUserKelas).values({
						authUserId: created.id,
						kelasId: kelasIdItem,
						createdAt: timestamp,
						updatedAt: timestamp
					});
				} catch (err) {
					// Ignore duplicate errors (if somehow same kelas was added twice)
					if (String(err).includes('UNIQUE')) {
						console.warn(
							`[pengguna] duplicate kelas entry: user ${created.id}, kelas ${kelasIdItem}`
						);
					} else {
						throw err;
					}
				}
			}

			console.info(
				`[pengguna] Created user via action: ${username} -> id=${created.id}, mapels=${mataPelajaranIds.length}, kelas=${kelasIds.length}`
			);

			// diagnostic logs to help track persistence issues after DB imports
			try {
				console.info(
					`[pengguna] create_user diagnostic: cwd=${process.cwd()} DB_URL=${env.DB_URL ?? 'file:./data/database.sqlite3'}`
				);
				const [{ count }] = await db.select({ count: sql`COUNT(*)` }).from(u);
				console.info('[pengguna] total auth_user rows after insert:', count);
			} catch (diagErr) {
				console.warn('[pengguna] diagnostic failed:', diagErr);
			}
			return {
				success: true,
				user: created,
				displayName,
				mataPelajaranIds: mataPelajaranIds,
				kelasIds: kelasIds
			};
		} catch (err: unknown) {
			console.error('Failed to create user', err);
			// detect sqlite unique constraint on normalized username and return a user-friendly error
			// safely extract message fields from unknown error
			const e = err as Record<string, unknown>;
			const cause = (e.cause as Record<string, unknown> | undefined) ?? undefined;
			const causeMsg = (
				(cause && String(cause.message)) ||
				(e.message && String(e.message)) ||
				String(err)
			).toString();
			if (
				causeMsg.includes('UNIQUE constraint failed') &&
				causeMsg.includes('auth_user.username_normalized')
			) {
				return fail(400, { message: 'Username sudah digunakan' });
			}
			return fail(500, { message: 'Internal Error' });
		}
	},
	delete_users: async ({ request }) => {
		authority('user_delete');
		let ids: number[] = [];
		try {
			// try JSON first
			const contentType = request.headers.get('content-type') || '';
			if (contentType.includes('application/json')) {
				const body = await request.json();
				ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
			} else {
				const form = await request.formData();
				const raw = String(form.get('ids') ?? '');
				// accept comma-separated ids
				ids = raw
					.split(',')
					.map((s) => Number(s))
					.filter(Boolean);
			}
		} catch (err) {
			console.warn('Failed to parse ids for deletion', err);
			return new Response('Invalid request', { status: 400 });
		}

		// only keep valid positive integers
		ids = ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
		if (!ids.length) return new Response('No ids provided', { status: 400 });

		try {
			await db.transaction(async (tx) => {
				await tx.delete(tableAuthSession).where(inArray(tableAuthSession.userId, ids));
				await tx
					.delete(tableAuthUserMataPelajaran)
					.where(inArray(tableAuthUserMataPelajaran.authUserId, ids));
				await tx.delete(tableAuthUserKelas).where(inArray(tableAuthUserKelas.authUserId, ids));
				await tx.delete(tableAuthUser).where(inArray(tableAuthUser.id, ids));
			});
			return { success: true, deleted: ids };
		} catch (err) {
			console.error('Failed to delete users', err);
			return new Response(String(err), { status: 500 });
		}
	}
};
