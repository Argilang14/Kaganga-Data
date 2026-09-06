import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableKelas,
	tableMurid,
	tablePegawai,
	tableAuthUserKelas,
	tableAuthUserMataPelajaran
} from '$lib/server/db/schema';
import { cookieNames, findTitleByPath } from '$lib/utils.js';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getLegacyWaliKelasIds, isLegacyWaliKelas } from '$lib/server/legacy-wali-kelas';

export const load: LayoutServerLoad = async ({ url, locals, cookies }) => {
	const meta: PageMeta = {
		title: url.pathname === '/' ? 'Kaganga Data' : findTitleByPath(url.pathname),
		description: ''
	};

	const sekolah = locals.sekolah;
	const user = locals.user ?? null;
	const academicContext = sekolah?.id ? await resolveSekolahAcademicContext(sekolah.id) : null;

	// Query daftarKelas: for wali_kelas, get ALL kelas they manage (not just active semester)
	// For user type (guru), get kelas from tableAuthUserKelas join table
	// For other users, get kelas from active semester only
	let daftarKelas: Array<{
		id: number;
		nama: string;
		fase: string | null;
		waliKelas: { id: number; nama: string } | null;
	}> = [];
	if (sekolah?.id) {
		const userWithType = user as { type?: string; id?: number; pegawaiId?: number } | null;
		if (isLegacyWaliKelas(userWithType)) {
			const legacyKelasIds = await getLegacyWaliKelasIds(
				userWithType,
				sekolah.id,
				academicContext?.activeSemesterId
			);
			if (legacyKelasIds.length) {
				daftarKelas = await db.query.tableKelas.findMany({
					columns: { id: true, nama: true, fase: true },
					with: { waliKelas: { columns: { id: true, nama: true } } },
					where: and(inArray(tableKelas.id, legacyKelasIds), eq(tableKelas.sekolahId, sekolah.id)),
					orderBy: asc(tableKelas.nama)
				});
			}
		} else if (
			(userWithType?.type === 'wali_asuh' || userWithType?.type === 'wali_asrama') &&
			userWithType.pegawaiId
		) {
			const pegawai = await db.query.tablePegawai.findFirst({
				columns: { nama: true },
				where: and(
					eq(tablePegawai.id, userWithType.pegawaiId),
					eq(tablePegawai.sekolahId, sekolah.id)
				)
			});
			if (pegawai?.nama) {
				const waliColumn =
					userWithType.type === 'wali_asrama' ? tableMurid.waliAsramaNama : tableMurid.waliAsuhNama;
				const rows = await db
					.selectDistinct({ kelasId: tableMurid.kelasId })
					.from(tableMurid)
					.where(
						and(
							eq(tableMurid.sekolahId, sekolah.id),
							sql`LOWER(trim(${waliColumn})) = ${pegawai.nama.trim().toLowerCase()}`
						)
					);
				const kelasIds = rows.map((row) => row.kelasId);
				if (kelasIds.length) {
					daftarKelas = await db.query.tableKelas.findMany({
						columns: { id: true, nama: true, fase: true },
						with: { waliKelas: { columns: { id: true, nama: true } } },
						where: and(
							inArray(tableKelas.id, kelasIds),
							eq(tableKelas.sekolahId, sekolah.id),
							academicContext?.activeSemesterId
								? eq(tableKelas.semesterId, academicContext.activeSemesterId)
								: undefined
						),
						orderBy: asc(tableKelas.nama)
					});
				}
			}
		} else if (userWithType?.type === 'user' && userWithType.id) {
			const allowedKelasRecords = await db.query.tableAuthUserKelas.findMany({
				columns: { kelasId: true },
				where: eq(tableAuthUserKelas.authUserId, userWithType.id)
			});

			if (allowedKelasRecords.length > 0) {
				const allowedKelasIds = allowedKelasRecords.map((r) => r.kelasId);
				if (academicContext?.activeSemesterId) {
					// Prefer explicit assignments in the active semester
					daftarKelas = await db.query.tableKelas.findMany({
						columns: { id: true, nama: true, fase: true },
						with: { waliKelas: { columns: { id: true, nama: true } } },
						where: and(
							inArray(tableKelas.id, allowedKelasIds),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						),
						orderBy: asc(tableKelas.nama)
					});
					// If no explicit matches, resolve assigned kelas names to active semester
					if (!daftarKelas.length) {
						const assignedKelas = await db.query.tableKelas.findMany({
							columns: { nama: true },
							where: inArray(tableKelas.id, allowedKelasIds)
						});
						const namaSet = new Set(assignedKelas.map((k) => k.nama));
						daftarKelas = await db.query.tableKelas.findMany({
							columns: { id: true, nama: true, fase: true },
							with: { waliKelas: { columns: { id: true, nama: true } } },
							where: and(
								inArray(tableKelas.nama, Array.from(namaSet)),
								eq(tableKelas.semesterId, academicContext.activeSemesterId),
								eq(tableKelas.sekolahId, sekolah.id)
							),
							orderBy: asc(tableKelas.nama)
						});
					}
				} else {
					daftarKelas = await db.query.tableKelas.findMany({
						columns: { id: true, nama: true, fase: true },
						with: { waliKelas: { columns: { id: true, nama: true } } },
						where: inArray(tableKelas.id, allowedKelasIds),
						orderBy: asc(tableKelas.nama)
					});
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
	const kelasCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID);

	let kelasAktif: (typeof daftarKelas)[number] | null = null;

	// 1) If explicit param provided, prefer it
	if (kelasIdParam != null) {
		const kelasIdNumber = Number(kelasIdParam);
		if (Number.isInteger(kelasIdNumber)) {
			// Akun Wali Kelas lama hanya boleh memilih kelas yang masih ditugaskan kepadanya.
			if (user) {
				const userWithType = user as {
					type?: string;
					id?: number;
					kelasId?: number;
					pegawaiId?: number;
				};
				if (
					isLegacyWaliKelas(userWithType) &&
					!daftarKelas.some((kelas) => kelas.id === kelasIdNumber)
				) {
					throw redirect(303, `/forbidden?required=kelas_id`);
				} else if (userWithType.type === 'user' && userWithType.id) {
					// User type (guru): line 183 checks daftarKelas and skips if not found
				}
			}
			kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasIdNumber) ?? null;
		}
	}

	// 2) If no explicit param, and the user is a wali_kelas, prefer their assigned kelas
	if (!kelasAktif && user) {
		const userWithType = user as { type?: string; kelasId?: number };
		if (isLegacyWaliKelas(userWithType) && userWithType.kelasId) {
			const waliKelasId = Number(userWithType.kelasId);
			if (Number.isInteger(waliKelasId)) {
				kelasAktif = daftarKelas.find((kelas) => kelas.id === waliKelasId) ?? null;
			}
		}
	}

	// 3) Next, fall back to cookie candidate
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
		const canManageMapel = userType !== 'wali_asuh' && userType !== 'wali_asrama';
		const canEditUrutan =
			userType === 'admin' || userType === 'kepala_sekolah' || userType === 'wali_kelas';
		const canAddImportMapel = canEditUrutan;

		if (user.pegawaiId) {
			const pegawaiRecord = await db.query.tablePegawai.findFirst({
				columns: { id: true, nama: true },
				where: eq(tablePegawai.id, Number(user.pegawaiId))
			});
			// avoid `any` cast by using Object.assign to create a shallow clone
			userForClient = Object.assign({}, user, {
				pegawaiName: pegawaiRecord?.nama ?? null,
				canManageMapel,
				canEditUrutan,
				canAddImportMapel
			});
		} else {
			userForClient = Object.assign({}, user, { canManageMapel, canEditUrutan, canAddImportMapel });
		}
	}

	// For user type (guru), check if they have any mata pelajaran assigned
	// (either via direct column or many-to-many table)
	let hasMataPelajaran = false;
	if (user?.type === 'user') {
		const u = user as { id?: number; mataPelajaranId?: number | null };
		hasMataPelajaran = !!u.mataPelajaranId;
		if (!hasMataPelajaran && u.id) {
			const records = await db.query.tableAuthUserMataPelajaran.findMany({
				columns: { id: true },
				where: eq(tableAuthUserMataPelajaran.authUserId, u.id),
				limit: 1
			});
			hasMataPelajaran = records.length > 0;
		}
	}

	// Set cookies AFTER all async operations are complete
	const secure = locals.requestIsSecure ?? false;
	if (kelasAktif) {
		cookies.set(cookieNames.ACTIVE_KELAS_ID, String(kelasAktif.id), {
			path: '/',
			secure
		});
	} else {
		cookies.delete(cookieNames.ACTIVE_KELAS_ID, { path: '/', secure });
	}

	return {
		sekolah,
		meta,
		daftarKelas,
		kelasAktif,
		user: userForClient,
		hasMataPelajaran,
		activeSemesterTipe: academicContext?.activeSemesterTipe ?? null,
		academicContext
	};
};
