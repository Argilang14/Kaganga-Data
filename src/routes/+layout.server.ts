import { schoolWideAcademic, hasRole } from '$lib/user-role';
import { accessibleClassIds } from '$lib/server/student-access';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKelas, tablePegawai, tableAuthUserMataPelajaran } from '$lib/server/db/schema';
import { cookieNames, findTitleByPath } from '$lib/utils.js';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { asc, eq, inArray } from 'drizzle-orm';
import { isHomeroomPage, isHomeroomTeacher } from '$lib/homeroom-access';
import { getLegacyWaliKelasIds, isLegacyWaliKelas } from '$lib/server/legacy-wali-kelas';
import { getAssignmentSummaries } from '$lib/server/assignment-summary';
import { dormView, dormCookie } from '$lib/server/dormitory-access';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';

export const load: LayoutServerLoad = async ({ url, locals, cookies }) => {
	const meta: PageMeta = {
		title: url.pathname === '/' ? 'Kaganga Data' : findTitleByPath(url.pathname),
		description: ''
	};

	const sekolah = locals.sekolah;
	const user = locals.user ?? null;
	const academicContext = sekolah?.id ? await resolveSekolahAcademicContext(sekolah.id) : null;

	let daftarKelas: Array<{
		id: number;
		nama: string;
		fase: string | null;
		waliKelas: { id: number; nama: string } | null;
	}> = [];
	if (sekolah && user) {
		const ids =
			isHomeroomPage(url.pathname) && isHomeroomTeacher(user) && !schoolWideAcademic(user)
				? await getLegacyWaliKelasIds(user, sekolah.id, academicContext?.activeSemesterId)
				: await accessibleClassIds(
						user,
						sekolah.id,
						academicContext?.activeSemesterId,
						/^\/(intrakurikuler|asesmen-formatif|asesmen-sumatif|jurnal-mengajar|rpm)(\/|$)/.test(
							url.pathname
						)
							? 'academic'
							: /^\/administrasi\/absensi(?:\/|$)/.test(url.pathname)
								? 'attendance'
								: 'assigned'
					);
		if (ids.length)
			daftarKelas = await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				with: { waliKelas: { columns: { id: true, nama: true } } },
				where: inArray(tableKelas.id, ids),
				orderBy: asc(tableKelas.nama)
			});
	}

	const kelasIdParam = url.searchParams.get('kelas_id');
	if (
		user?.type === 'user' &&
		isHomeroomTeacher(user) &&
		isHomeroomPage(url.pathname) &&
		!schoolWideAcademic(user) &&
		kelasIdParam !== null &&
		!daftarKelas.some((row) => row.id === Number(kelasIdParam))
	)
		throw redirect(303, '/forbidden?required=kelas_id');
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
					!hasSchoolWideOperationalAccess(user) &&
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
		const canManageMapel =
			schoolWideAcademic(user) ||
			(hasRole(user, 'user') &&
				userType !== 'wali_asuh' &&
				userType !== 'wali_asrama' &&
				userType !== 'tim_keamanan');
		const canEditUrutan = schoolWideAcademic(user) || isHomeroomTeacher(user);
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
	if (user?.type === 'user' && !hasSchoolWideOperationalAccess(user)) {
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
	const dorm = await dormView(
		locals,
		url.searchParams,
		cookies,
		url.pathname === '/administrasi/absensi/monitoring'
	);
	if (url.searchParams.has('kamar_id')) {
		cookies.set(dormCookie, String(dorm.room?.id ?? 0), {
			path: '/',
			secure: locals.requestIsSecure ?? false,
			httpOnly: true,
			sameSite: 'lax'
		});
	}
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
		daftarAsrama: dorm.rooms,
		asramaAktif: dorm.room,
		assignmentSummary:
			user && sekolah?.id
				? ((
						await getAssignmentSummaries(
							[user],
							sekolah.id,
							academicContext?.activeSemesterId ?? null,
							academicContext?.activeTahunAjaranId ?? null
						)
					).get(user.id) ?? null)
				: null,
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
