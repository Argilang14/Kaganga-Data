import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKelas, tablePegawai, tableAuthUserKelas } from '$lib/server/db/schema';
import { appMenuItems } from '$lib/components/menu';
import { findTitleByPath } from '$lib/utils.js';
import { getClosedMenuKeyForPath } from '$lib/menu-access';
import { loadMenuAccessSettings } from '$lib/server/menu-access';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

const ACTIVE_KELAS_COOKIE = 'active-kelas-id';

type KelasMenuRow = {
	id: number;
	nama: string;
	fase: string | null;
	waliKelas: { id: number; nama: string } | null;
};

async function findActiveSemesterKelasByLike(
	sekolahId: number,
	activeSemesterId: number | null | undefined,
	sourceRows: Array<{ nama: string; tahunAjaranId?: number | null }>
) {
	if (!activeSemesterId || !sourceRows.length) return [];
	const names = Array.from(new Set(sourceRows.map((row) => row.nama).filter(Boolean)));
	if (!names.length) return [];
	return db.query.tableKelas.findMany({
		columns: { id: true, nama: true, fase: true },
		with: { waliKelas: { columns: { id: true, nama: true } } },
		where: and(
			eq(tableKelas.sekolahId, sekolahId),
			eq(tableKelas.semesterId, activeSemesterId),
			inArray(tableKelas.nama, names)
		),
		orderBy: asc(tableKelas.nama)
	});
}

export async function load({ url, locals, cookies }) {
	const meta: PageMeta = {
		title:
			url.pathname === '/'
				? 'Kaganga Data'
				: (findTitleByPath(`${url.pathname}${url.search}`, appMenuItems) ??
					findTitleByPath(url.pathname, appMenuItems)),
		description: ''
	};

	const sekolah = locals.sekolah;
	const user = locals.user ?? null;
	const [academicContext, menuAccess] = await Promise.all([
		sekolah?.id ? resolveSekolahAcademicContext(sekolah.id) : null,
		loadMenuAccessSettings(sekolah?.id)
	]);

	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	const canBypassMenuLock = user?.type === 'admin' || permissions.includes('rapor_manage');
	const closedMenuKey = getClosedMenuKeyForPath(url.pathname, menuAccess);
	if (closedMenuKey && !canBypassMenuLock) {
		throw redirect(303, '/forbidden?required=menu_' + closedMenuKey);
	}

	// Query daftarKelas: for wali_kelas, get ALL kelas they manage (not just active semester)
	// For user type (guru), get kelas from tableAuthUserKelas join table
	// For other users, get kelas from active semester only
	let daftarKelas: KelasMenuRow[] = [];
	if (sekolah?.id) {
		const userWithType = user as { type?: string; id?: number; pegawaiId?: number } | null;
		const userPermissions = Array.isArray(user?.permissions) ? user.permissions : [];
		const hasFullBypass =
			userPermissions.includes('rapor_manage') && userPermissions.includes('kelas_pindah');

		if (userWithType?.type === 'wali_kelas' && userWithType.pegawaiId) {
			const waliKelasRows = await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true, tahunAjaranId: true },
				where: and(
					eq(tableKelas.sekolahId, sekolah.id),
					eq(tableKelas.waliKelasId, userWithType.pegawaiId)
				),
				orderBy: asc(tableKelas.nama)
			});
			daftarKelas = await findActiveSemesterKelasByLike(
				sekolah.id,
				academicContext?.activeSemesterId,
				waliKelasRows
			);
			if (!daftarKelas.length) {
				const waliKelasIds = waliKelasRows.map((kelas) => kelas.id);
				daftarKelas = waliKelasIds.length
					? await db.query.tableKelas.findMany({
							columns: { id: true, nama: true, fase: true },
							with: { waliKelas: { columns: { id: true, nama: true } } },
							where: inArray(tableKelas.id, waliKelasIds),
							orderBy: asc(tableKelas.nama)
						})
					: [];
			}
		} else if (userWithType?.type === 'wali_asuh' || userWithType?.type === 'wali_asrama') {
			// Wali asuh/asrama tidak lagi ditentukan per kelas. Mereka melihat kelas aktif sekolah,
			// lalu detail binaan diambil dari Data Murid sesuai penugasan masing-masing murid.
			daftarKelas = await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				with: { waliKelas: { columns: { id: true, nama: true } } },
				where: academicContext?.activeSemesterId
					? and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						)
					: eq(tableKelas.sekolahId, sekolah.id),
				orderBy: asc(tableKelas.nama)
			});
		} else if (userWithType?.type === 'user' && userWithType.id) {
			if (hasFullBypass) {
				daftarKelas = await db.query.tableKelas.findMany({
					columns: { id: true, nama: true, fase: true },
					with: { waliKelas: { columns: { id: true, nama: true } } },
					where: academicContext?.activeSemesterId
						? and(
								eq(tableKelas.sekolahId, sekolah.id),
								eq(tableKelas.semesterId, academicContext.activeSemesterId)
							)
						: eq(tableKelas.sekolahId, sekolah.id),
					orderBy: asc(tableKelas.nama)
				});
			} else {
				const allowedKelasRecords = await db.query.tableAuthUserKelas.findMany({
					columns: { kelasId: true },
					where: eq(tableAuthUserKelas.authUserId, userWithType.id)
				});

				if (allowedKelasRecords.length > 0) {
					const allowedKelasIds = allowedKelasRecords.map((r) => r.kelasId);
					const assignedRows = await db.query.tableKelas.findMany({
						columns: { id: true, nama: true, tahunAjaranId: true },
						where: inArray(tableKelas.id, allowedKelasIds)
					});
					daftarKelas = await findActiveSemesterKelasByLike(
						sekolah.id,
						academicContext?.activeSemesterId,
						assignedRows
					);
					if (!daftarKelas.length) {
						daftarKelas = await db.query.tableKelas.findMany({
							columns: { id: true, nama: true, fase: true },
							with: { waliKelas: { columns: { id: true, nama: true } } },
							where: inArray(tableKelas.id, allowedKelasIds),
							orderBy: asc(tableKelas.nama)
						});
					}
				}
			}
		} else {
			// Admin/other: get kelas from active semester only
			daftarKelas = await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				with: { waliKelas: { columns: { id: true, nama: true } } },
				where: academicContext?.activeSemesterId
					? and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						)
					: eq(tableKelas.sekolahId, sekolah.id),
				orderBy: asc(tableKelas.nama)
			});
		}
	}

	const kelasIdParam = url.searchParams.get('kelas_id');
	const kelasCookie = cookies.get(ACTIVE_KELAS_COOKIE);

	let kelasAktif: (typeof daftarKelas)[number] | null = null;

	// 1) If explicit param provided, prefer it
	if (kelasIdParam != null) {
		const kelasIdNumber = Number(kelasIdParam);
		if (Number.isInteger(kelasIdNumber)) {
			// If the current user is a wali_kelas, they may only access their own kelas
			// unless they have explicit permission `kelas_pindah` AND they own that kelas
			if (user) {
				const userWithType = user as {
					type?: string;
					id?: number;
					kelasId?: number;
					pegawaiId?: number;
				};
				if (userWithType.type === 'wali_kelas') {
					const requestedKelas = await db.query.tableKelas.findFirst({
						columns: { id: true, waliKelasId: true },
						where: eq(tableKelas.id, kelasIdNumber)
					});
					if (!requestedKelas || requestedKelas.waliKelasId !== userWithType.pegawaiId) {
						throw redirect(303, `/forbidden?required=kelas_id`);
					}
				} else if (userWithType.type === 'user' && userWithType.id) {
					const authUser = user as AuthUser;
					const userPerms = Array.isArray(authUser.permissions) ? authUser.permissions : [];
					const userHasFullBypass =
						userPerms.includes('rapor_manage') && userPerms.includes('kelas_pindah');
					if (userHasFullBypass) {
						kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasIdNumber) ?? null;
					}
					// User type (guru): verify they have access to the requested kelas via tableAuthUserKelas
					const hasAccess = userHasFullBypass
						? true
						: await db.query.tableAuthUserKelas.findFirst({
								columns: { id: true },
								where: and(
									eq(tableAuthUserKelas.authUserId, userWithType.id),
									eq(tableAuthUserKelas.kelasId, kelasIdNumber)
								)
							});

					if (!hasAccess) {
						const requestedKelas = await db.query.tableKelas.findFirst({
							columns: { nama: true, tahunAjaranId: true },
							where: eq(tableKelas.id, kelasIdNumber)
						});
						const allowedKelasRecords = await db.query.tableAuthUserKelas.findMany({
							columns: { kelasId: true },
							where: eq(tableAuthUserKelas.authUserId, userWithType.id)
						});
						const allowedIds = allowedKelasRecords.map((record) => record.kelasId);
						const assignedRows = allowedIds.length
							? await db.query.tableKelas.findMany({
									columns: { nama: true, tahunAjaranId: true },
									where: inArray(tableKelas.id, allowedIds)
								})
							: [];
						const hasEquivalentAccess =
							!!requestedKelas &&
							assignedRows.some(
								(row) =>
									row.nama === requestedKelas.nama &&
									row.tahunAjaranId === requestedKelas.tahunAjaranId
							);
						if (!hasEquivalentAccess) {
							throw redirect(303, `/forbidden?required=kelas_id`);
						}
					}
				}
			}
			kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasIdNumber) ?? null;
		}
	}

	// 2) Next, fall back to cookie candidate if it belongs to daftarKelas semester aktif.
	if (!kelasAktif && kelasCookie) {
		const kelasCookieNumber = Number(kelasCookie);
		if (Number.isInteger(kelasCookieNumber)) {
			kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasCookieNumber) ?? null;
		}
	}

	if (!kelasAktif && daftarKelas.length) {
		kelasAktif = daftarKelas[0];
	}

	// Enrich user with pegawai name when possible so client can display the
	// human-readable name (e.g. in navbar alerts). Keep original shape
	// otherwise. Also attach a small permission flag so client can easily
	// disable UI for restricted 'user' accounts.
	let userForClient = user;
	if (user) {
		// Permission logic:
		// - 'wali_asuh' should not be allowed to manage mata pelajaran
		// - 'user' (guru mapel) CAN manage mata pelajaran (they are filtered server-side)
		// - Other account types retain full access
		const userType = (user as { type?: string }).type;
		const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
		const canManageMapel =
			userType !== 'wali_asuh' &&
			userType !== 'wali_asrama' &&
			(userType !== 'user' || userPermissions.includes('rapor_manage'));

		if (user.pegawaiId) {
			const pegawaiRecord = await db.query.tablePegawai.findFirst({
				columns: { id: true, nama: true },
				where: eq(tablePegawai.id, Number(user.pegawaiId))
			});
			// avoid `any` cast by using Object.assign to create a shallow clone
			userForClient = Object.assign({}, user, {
				pegawaiName: pegawaiRecord?.nama ?? null,
				canManageMapel
			});
		} else {
			userForClient = Object.assign({}, user, { canManageMapel });
		}
	}

	const secure = locals.requestIsSecure ?? false;
	try {
		if (kelasAktif) {
			cookies.set(ACTIVE_KELAS_COOKIE, String(kelasAktif.id), {
				path: '/',
				secure
			});
		} else {
			cookies.delete(ACTIVE_KELAS_COOKIE, { path: '/', secure });
		}
	} catch {
		// Do not fail the whole layout if SvelteKit has already started the response.
	}

	return { sekolah, meta, daftarKelas, kelasAktif, user: userForClient, menuAccess };
}
