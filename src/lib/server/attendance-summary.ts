import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, lte, gte, ne, or, isNull } from 'drizzle-orm';
import { permitCoversMonitoring } from '$lib/attendance-monitoring';
import {
	canAttendance,
	attendanceDateAllowed,
	canAttendActivity,
	canViewAttendanceActivity,
	hasSchoolWideAttendanceStudentAccess,
	hasSchoolWideAttendanceSummaryAccess
} from '$lib/attendance-access';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';
import {
	buildAttendanceSummary,
	inferSummaryLevel,
	isSummaryDate,
	selectSummaryClasses,
	type SummaryScope,
	type SummaryStatus,
	type SummaryLevel
} from '$lib/attendance-summary';
import db from './db';
import { projectIllnessAttendance, loadAttendanceIllness } from './attendance-illness';
import {
	tableAbsensiKegiatan,
	tableIzinPulangMurid,
	tableMurid,
	tableKelas,
	tableKegiatanAbsensi
} from './db/schema';
import { buildMonitoringRows, resolveMonitoringColumns } from '$lib/attendance-monitoring';
import { connectSchoolDormRows } from '$lib/attendance-school-dorm';
import { loadAbsensiKelasOptions, todayLocalDate } from './absensi-digital';
import { loadKegiatanAbsensiOptions } from './absensi-kegiatan';
import { activeMuridFilter } from './murid-query';
import { studentAccessCondition } from './attendance-student-access';

export async function loadSummaryOptions(locals: App.Locals, date = todayLocalDate()) {
	const { user, sekolah } = locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	if (user.type !== 'admin' && user.sekolahId !== sekolah.id)
		throw error(403, 'Sekolah di luar penugasan akun.');
	if (!canAttendance(user, 'export'))
		throw error(403, 'Izin membagikan rekap absensi belum diberikan.');
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolah.id, user);
	if (!academic.activeSemesterId) throw error(400, 'Semester aktif belum tersedia.');
	const schoolWideSummary = hasSchoolWideAttendanceSummaryAccess(user, sekolah.id);
	const summaryClasses = schoolWideSummary
		? await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				where: and(
					eq(tableKelas.sekolahId, sekolah.id),
					eq(tableKelas.semesterId, academic.activeSemesterId)
				),
				orderBy: asc(tableKelas.nama)
			})
		: kelasList;
	const kegiatanList = (await loadKegiatanAbsensiOptions(sekolah.id, true, user)).filter((item) =>
		schoolWideSummary
			? canViewAttendanceActivity(user, item.kategori)
			: canAttendActivity(user, item.aksesEdit, item.kategori, { kode: item.kode, tanggal: date })
	);
	const allStudents =
		schoolWideSummary ||
		hasSchoolWideOperationalAccess(user) ||
		hasSchoolWideAttendanceStudentAccess(user, sekolah.id);
	return {
		semesterId: academic.activeSemesterId,
		tahunAjaranId: academic.activeTahunAjaranId,
		classes: summaryClasses.map((item) => ({
			id: item.id,
			nama: item.nama,
			jenjang: inferSummaryLevel(item, sekolah.jenjangPendidikan)
		})),
		activities: kegiatanList.map((item) => ({
			id: item.id,
			nama: item.nama,
			jamMulai: item.jamMulai,
			kode: item.kode,
			kategori: item.kategori,
			aksesEdit: item.aksesEdit
		})),
		canAllScopes: allStudents,
		schoolWideSummary,
		restrictedStudents: !allStudents && ['wali_asuh', 'wali_asrama'].includes(user.type),
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
	if (!['kelas', 'jenjang', 'semua', 'antar_kelas'].includes(scope))
		throw error(400, 'Pilih cakupan ringkasan.');
	if (scope !== 'kelas' && !options.canAllScopes)
		throw error(403, 'Ringkasan lintas kelas hanya untuk akun dengan akses seluruh sekolah.');
	const level = params.get('jenjang') as SummaryLevel;
	if (scope === 'jenjang' && !['sd', 'smp', 'sma'].includes(level))
		throw error(400, 'Pilih jenjang SD, SMP, atau SMA.');
	let classes;
	try {
		classes = selectSummaryClasses(options.classes, params);
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'Pilihan kelas tidak valid.');
	}
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
			options.schoolWideSummary
				? undefined
				: await studentAccessCondition(locals.user, schoolId, options.semesterId)
		),
		orderBy: asc(tableMurid.nama)
	});
	const studentIds = students.map((item) => item.id);
	const recordedAttendance = studentIds.length
		? await db.query.tableAbsensiKegiatan.findMany({
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
	const attendance = await projectIllnessAttendance({ schoolId, semesterId: options.semesterId,
		studentIds, dates: [tanggal], activities: [activity], rows: recordedAttendance });
	// An actual permit is required for (p); a normal departure is not an absence.
	const permits = studentIds.length
		? await db.query.tableIzinPulangMurid.findMany({
				columns: {
					muridId: true,
					tanggalKeluar: true,
					waktuKeluar: true,
					tanggalKembali: true,
					waktuKembali: true
				},
				with: { perjalanan: true },
				where: and(
					eq(tableIzinPulangMurid.sekolahId, schoolId),
					eq(tableIzinPulangMurid.tahunAjaranId, options.tahunAjaranId ?? -1),
					ne(tableIzinPulangMurid.status, 'dibatalkan'),
					inArray(tableIzinPulangMurid.muridId, studentIds),
					lte(tableIzinPulangMurid.tanggalKeluar, tanggal),
					or(
						isNull(tableIzinPulangMurid.tanggalKembali),
						gte(tableIzinPulangMurid.tanggalKembali, tanggal)
					)
				)
			})
		: [];
	const covered = new Set(
		permits.flatMap((item) =>
			item.muridId && permitCoversMonitoring(tanggal, activity.jamMulai, item) ? [item.muridId] : []
		)
	);
	const effectiveAttendance: Array<{ muridId: number; status: SummaryStatus }> = attendance.filter(
		(row) => !covered.has(row.muridId) || (row.id > 0 && row.metode !== 'auto')
	);
	// Reuse monitoring's paired school/dorm projection; never persist a synthetic copy.
	const linked = await db.query.tableKegiatanAbsensi.findMany({
		where: and(
			eq(tableKegiatanAbsensi.sekolahId, schoolId),
			eq(tableKegiatanAbsensi.aktif, true),
			inArray(tableKegiatanAbsensi.kode, [
				'apel_berangkat',
				'apel_pulang',
				'asrama_berangkat',
				'asrama_tiba'
			])
		)
	});
	const columns = [
		...resolveMonitoringColumns('sekolah', linked, new URLSearchParams()),
		...resolveMonitoringColumns('asrama', linked, new URLSearchParams())
	];
	const index = columns.findIndex((column) => column.activityId === activityId);
	if (index >= 0 && studentIds.length) {
		const records = await db.query.tableAbsensiKegiatan.findMany({
			where: and(
				eq(tableAbsensiKegiatan.sekolahId, schoolId),
				eq(tableAbsensiKegiatan.semesterId, options.semesterId),
				eq(tableAbsensiKegiatan.tanggal, tanggal),
				inArray(tableAbsensiKegiatan.muridId, studentIds),
				inArray(
					tableAbsensiKegiatan.kegiatanId,
					linked.map((item) => item.id)
				)
			)
		});
		const rows = connectSchoolDormRows(
			buildMonitoringRows({
				illnesses: await loadAttendanceIllness(schoolId, options.semesterId, studentIds, tanggal),
				date: tanggal,
				columns,
				records,
				permits,
				students: students.map((item) => ({ ...item, kelas: '' }))
			}),
			columns
		);
		for (const row of rows) {
			const cell = row.cells[index];
			if (cell.source === 'terhubung' && (cell.status === 'sakit' || cell.status === 'izin'))
				effectiveAttendance.push({ muridId: row.id, status: cell.status });
		}
	}
	const report = buildAttendanceSummary({
		tanggal,
		kegiatan: activity.nama,
		cakupan: scope,
		jenjang: level,
		classes,
		students,
		attendance: effectiveAttendance,
		permitStudentIds: [...covered],
		restrictedStudents: options.restrictedStudents
	});
	const editable =
		canAttendance(locals.user, 'input') &&
		attendanceDateAllowed(locals.user, tanggal, options.today) &&
		canAttendActivity(locals.user, activity.aksesEdit, activity.kategori, {
			kode: activity.kode,
			tanggal
		});
	const inputStudents =
		editable && studentIds.length
			? await db.query.tableMurid.findMany({
					columns: { id: true },
					where: and(
						await studentAccessCondition(locals.user, schoolId, options.semesterId),
						activeMuridFilter(),
						inArray(tableMurid.id, studentIds)
					)
				})
			: [];
	const allowed = new Set(inputStudents.map((item) => item.id));
	const recorded = new Set(attendance.map((item) => item.muridId));
	for (const student of report.missingStudents) {
		student.canEdit = allowed.has(student.id) && !recorded.has(student.id);
		student.reason = recorded.has(student.id)
			? 'Status pulang sebelumnya perlu diperiksa di Catat Absensi.'
			: student.canEdit
				? ''
				: 'Input di luar penugasan, kegiatan, atau tanggal yang diizinkan.';
	}
	if (scope === 'jenjang') {
		for (const kelas of options.classes.filter((item) => item.jenjang === 'unknown'))
			report.warnings.push(
				`Kelas ${kelas.nama} belum memiliki jenjang yang jelas dan tidak termasuk ringkasan per jenjang.`
			);
	}
	return report;
}
