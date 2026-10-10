import type { Handle } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import {
	canAttendance,
	canAttendActivity,
	attendanceDateAllowed,
	hasSchoolWideAttendanceStudentAccess,
	type AttendanceAction
} from '$lib/attendance-access';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';
import db from './db';
import { tableIzinPulangMurid, tableKegiatanAbsensi } from './db/schema';
import { accessibleClassIds, assertStudentAccess } from './student-access';
import {
	accessibleClassIds as attendanceClasses,
	assertStudentAccess as attendanceStudent
} from './attendance-student-access';
import { resolveSekolahAcademicContext } from './db/academic';
import { todayLocalDate } from './absensi-digital';

const actionPermissions: Record<string, AttendanceAction> = {
	updateManual: 'input',
	bulkUpdateManual: 'input',
	clearStatus: 'koreksi',
	importExcel: 'impor',
	syncRapor: 'sinkron_rapor',
	generateOne: 'qr_manage',
	generateClass: 'qr_manage',
	previewOne: 'lihat',
	previewClass: 'lihat',
	saveIzinPulang: 'izin_pulang',
	markIzinReturned: 'izin_pulang',
	cancelIzinPulang: 'izin_pulang',
	saveFollowUp: 'koreksi'
};

export const attendanceGuard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isAttendance =
		path.startsWith('/administrasi/absensi') ||
		path.startsWith('/api/administrasi/absensi/') ||
		path === '/api/absensi/kartu-qr' ||
		path === '/api/pdf/absensi-kegiatan';
	const isStudent = /^\/murid(?:\/|$)/.test(path) || /^\/api\/murid-photo\//.test(path);
	if (!isAttendance && !isStudent) return resolve(event);
	const { user, sekolah } = event.locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	if (user.type !== 'admin' && user.sekolahId !== sekolah.id)
		throw error(403, 'Sekolah di luar penugasan akun.');
	const mutating = !['GET', 'HEAD'].includes(event.request.method);
	const form =
		mutating &&
		/multipart\/form-data|application\/x-www-form-urlencoded/.test(
			event.request.headers.get('content-type') ?? ''
		)
			? await event.request.clone().formData()
			: null;
	const params = event.url.searchParams;
	if (isAttendance && user.type === 'tim_dapur') {
		const id = Number(
			form?.get('kegiatanId') ?? params.get('kegiatan_id') ?? params.get('kegiatanId')
		);
		if (id) {
			const activity = await db.query.tableKegiatanAbsensi.findFirst({
				where: and(eq(tableKegiatanAbsensi.id, id), eq(tableKegiatanAbsensi.sekolahId, sekolah.id))
			});
			if (!activity || activity.kategori !== 'makan')
				throw error(403, 'Tim Dapur hanya dapat mengakses kegiatan makan.');
		}
	}
	const action = [...params.keys()].find((key) => key.startsWith('/'))?.slice(1) ?? '';
	if (user.type === 'tim_dapur' && action === 'saveFollowUp')
		throw error(403, 'Tindak lanjut izin pulang bukan tugas Tim Dapur.');
	if (isAttendance) {
		const permission: AttendanceAction = path.endsWith('/pengaturan')
			? 'pengaturan'
			: path.endsWith('/scan')
				? 'scan'
				: path.endsWith('/export') || path === '/api/pdf/absensi-kegiatan'
					? 'export'
					: path.endsWith('/download-template')
						? 'impor'
						: form
							? (actionPermissions[action] ?? 'pengaturan')
							: 'lihat';
		if (!canAttendance(user, permission))
			throw error(403, 'Izin tindakan absensi belum diberikan oleh admin.');
	}
	const classId = Number(
		form?.get('kelasId') ?? form?.get('kelas_id') ?? params.get('kelasId') ?? params.get('kelas_id')
	);
	const photoRead = !mutating && /^\/api\/murid-photo\//.test(path);
	const expandedPhotoRead = photoRead && hasSchoolWideAttendanceStudentAccess(user, sekolah.id);
	const allowedClasses = isAttendance ? attendanceClasses : accessibleClassIds;
	const allowedStudent =
		isAttendance || expandedPhotoRead ? attendanceStudent : assertStudentAccess;
	if (classId && !(await allowedClasses(user, sekolah.id)).includes(classId))
		throw error(403, 'Kelas di luar penugasan akun.');
	const studentId = Number(
		form?.get('muridId') ??
			form?.get('murid_id') ??
			params.get('muridId') ??
			params.get('murid_id') ??
			/^\/murid\/(?:form\/)?(\d+)(?:\/|$)/.exec(path)?.[1] ??
			/^\/api\/murid-photo\/(\d+)$/.exec(path)?.[1]
	);
	if (studentId) {
		const student = await allowedStudent(user, sekolah.id, studentId, expandedPhotoRead);
		if (!student) throw error(403, 'Murid di luar penugasan akun.');
		if (expandedPhotoRead) {
			const academic = await resolveSekolahAcademicContext(sekolah.id);
			if (student.semesterId !== academic.activeSemesterId)
				throw error(403, 'Foto murid di luar semester aktif.');
		}
	}
	if (form && isAttendance) {
		const semesterId = Number(form.get('semesterId'));
		const academic = await resolveSekolahAcademicContext(sekolah.id);
		if (semesterId && semesterId !== academic.activeSemesterId)
			throw error(403, 'Input hanya untuk semester aktif.');
		const tanggal = form.get('tanggal')?.toString();
		if (tanggal && !attendanceDateAllowed(user, tanggal, todayLocalDate()))
			throw error(403, 'Koreksi tanggal lama memerlukan izin khusus.');
		const kegiatanId = Number(form.get('kegiatanId'));
		if (kegiatanId && ['updateManual', 'clearStatus', 'bulkUpdateManual'].includes(action)) {
			const kegiatan = await db.query.tableKegiatanAbsensi.findFirst({
				where: and(
					eq(tableKegiatanAbsensi.id, kegiatanId),
					eq(tableKegiatanAbsensi.sekolahId, sekolah.id)
				)
			});
			if (
				!kegiatan ||
				!canAttendActivity(user, kegiatan.aksesEdit, kegiatan.kategori, {
					kode: kegiatan.kode,
					tanggal
				})
			)
				throw error(403, 'Kegiatan di luar tanggung jawab akun.');
		} else if (
			path === '/administrasi/absensi' &&
			['updateManual', 'clearStatus'].includes(action) &&
			!canAttendActivity(user, 'sekolah')
		) {
			throw error(403, 'Absensi harian sekolah hanya untuk petugas sekolah.');
		}
		if (['markIzinReturned', 'cancelIzinPulang'].includes(action)) {
			const permit = await db.query.tableIzinPulangMurid.findFirst({
				where: and(
					eq(tableIzinPulangMurid.id, Number(form.get('id'))),
					eq(tableIzinPulangMurid.sekolahId, sekolah.id)
				)
			});
			if (!permit?.muridId || !(await attendanceStudent(user, sekolah.id, permit.muridId)))
				throw error(403, 'Izin pulang di luar penugasan akun.');
		}
	}
	if (isStudent && form && !hasSchoolWideOperationalAccess(user)) {
		const postedClass = Number(form.get('kelasId'));
		if (postedClass && !(await accessibleClassIds(user, sekolah.id)).includes(postedClass))
			throw error(403, 'Kelas tujuan di luar penugasan akun.');
	}
	return resolve(event);
};
