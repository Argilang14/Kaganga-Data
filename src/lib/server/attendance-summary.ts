import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, lte, gt, ne, or, isNull } from 'drizzle-orm';
import { canAttendance, canAttendActivity } from '$lib/attendance-access';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';
import {
	buildAttendanceSummary,
	inferSummaryLevel,
	isSummaryDate,
	type SummaryScope,
	type SummaryLevel
} from '$lib/attendance-summary';
import db from './db';
import { tableAbsensiKegiatan, tableIzinPulangMurid, tableMurid } from './db/schema';
import { loadAbsensiKelasOptions, todayLocalDate } from './absensi-digital';
import { loadKegiatanAbsensiOptions } from './absensi-kegiatan';
import { activeMuridFilter } from './murid-query';
import { studentAccessCondition } from './student-access';

export async function loadSummaryOptions(locals: App.Locals, date = todayLocalDate()) {
	const { user, sekolah } = locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	if (user.type !== 'admin' && user.sekolahId !== sekolah.id)
		throw error(403, 'Sekolah di luar penugasan akun.');
	if (!canAttendance(user, 'export'))
		throw error(403, 'Izin membagikan rekap absensi belum diberikan.');
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolah.id, user);
	if (!academic.activeSemesterId) throw error(400, 'Semester aktif belum tersedia.');
	const kegiatanList = (await loadKegiatanAbsensiOptions(sekolah.id, true, user)).filter((item) =>
		canAttendActivity(user, item.aksesEdit, item.kategori, { kode: item.kode, tanggal: date })
	);
	return {
		semesterId: academic.activeSemesterId,
		tahunAjaranId: academic.activeTahunAjaranId,
		classes: kelasList.map((item) => ({
			id: item.id,
			nama: item.nama,
			jenjang: inferSummaryLevel(item, sekolah.jenjangPendidikan)
		})),
		activities: kegiatanList.map((item) => ({ id: item.id, nama: item.nama })),
		canAllScopes: hasSchoolWideOperationalAccess(user),
		restrictedStudents:
			!hasSchoolWideOperationalAccess(user) && ['wali_asuh', 'wali_asrama'].includes(user.type),
		today: todayLocalDate()
	};
}

export async function loadAttendanceSummary(locals: App.Locals, params: URLSearchParams) {
	const tanggal = params.get('tanggal') ?? '';
	const options = await loadSummaryOptions(locals, tanggal);
	if (!isSummaryDate(tanggal) || tanggal > options.today)
		throw error(400, 'Pilih tanggal absensi yang valid, bukan tanggal mendatang.');
	const activityId = Number(params.get('kegiatan_id'));
	const activity = options.activities.find((item) => item.id === activityId);
	if (!Number.isSafeInteger(activityId) || activityId <= 0)
		throw error(400, 'Pilih kegiatan terlebih dahulu.');
	if (!activity) throw error(403, 'Kegiatan tidak tersedia atau di luar tanggung jawab akun.');
	const scope = params.get('cakupan') as SummaryScope;
	if (!['kelas', 'jenjang', 'semua'].includes(scope)) throw error(400, 'Pilih cakupan ringkasan.');
	if (scope !== 'kelas' && !options.canAllScopes)
		throw error(403, 'Ringkasan lintas kelas hanya untuk akun dengan akses seluruh sekolah.');
	const level = params.get('jenjang') as SummaryLevel;
	if (scope === 'jenjang' && !['sd', 'smp', 'sma'].includes(level))
		throw error(400, 'Pilih jenjang SD, SMP, atau SMA.');
	const classId = Number(params.get('kelas_id'));
	if (scope === 'kelas' && !options.classes.some((item) => item.id === classId))
		throw error(403, 'Kelas di luar penugasan akun atau semester aktif.');
	const classes = options.classes.filter((item) =>
		scope === 'kelas' ? item.id === classId : scope === 'jenjang' ? item.jenjang === level : true
	);
	if (!classes.length) throw error(400, 'Tidak ada kelas pada cakupan yang dipilih.');
	const schoolId = locals.sekolah!.id;
	const students = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, kelasId: true },
		where: and(
			eq(tableMurid.sekolahId, schoolId),
			eq(tableMurid.semesterId, options.semesterId),
			inArray(
				tableMurid.kelasId,
				classes.map((item) => item.id)
			),
			activeMuridFilter(),
			await studentAccessCondition(locals.user, schoolId, options.semesterId)
		),
		orderBy: asc(tableMurid.nama)
	});
	const studentIds = students.map((item) => item.id);
	const attendance = studentIds.length
		? await db.query.tableAbsensiKegiatan.findMany({
				columns: { muridId: true, status: true },
				where: and(
					eq(tableAbsensiKegiatan.sekolahId, schoolId),
					eq(tableAbsensiKegiatan.semesterId, options.semesterId),
					eq(tableAbsensiKegiatan.kegiatanId, activityId),
					eq(tableAbsensiKegiatan.tanggal, tanggal),
					inArray(tableAbsensiKegiatan.muridId, studentIds),
					inArray(
						tableAbsensiKegiatan.kelasId,
						classes.map((item) => item.id)
					)
				)
			})
		: [];
	// An actual permit is required for (p); a normal departure is not an absence.
	const permits = studentIds.length
		? await db.query.tableIzinPulangMurid.findMany({
				columns: { muridId: true },
				where: and(
					eq(tableIzinPulangMurid.sekolahId, schoolId),
					eq(tableIzinPulangMurid.tahunAjaranId, options.tahunAjaranId ?? -1),
					ne(tableIzinPulangMurid.status, 'dibatalkan'),
					inArray(tableIzinPulangMurid.muridId, studentIds),
					lte(tableIzinPulangMurid.tanggalKeluar, tanggal),
					or(
						isNull(tableIzinPulangMurid.tanggalKembali),
						gt(tableIzinPulangMurid.tanggalKembali, tanggal)
					)
				)
			})
		: [];
	const report = buildAttendanceSummary({
		tanggal,
		kegiatan: activity.nama,
		cakupan: scope,
		jenjang: level,
		classes,
		students,
		attendance,
		permitStudentIds: permits.flatMap((item) => (item.muridId ? [item.muridId] : [])),
		restrictedStudents: options.restrictedStudents
	});
	if (scope === 'jenjang') {
		for (const kelas of options.classes.filter((item) => item.jenjang === 'unknown'))
			report.warnings.push(
				`Kelas ${kelas.nama} belum memiliki jenjang yang jelas dan tidak termasuk ringkasan per jenjang.`
			);
	}
	return report;
}
