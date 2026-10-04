import {
	collapseActivityAttendanceByDay,
	effectiveIzinPulangStatus,
	findLongestStatusRun,
	listSchoolDays,
	type IzinPulangStatus
} from '$lib/server/absence-monitoring';
import db from '$lib/server/db';
import { studentAccessCondition } from './student-access';
import { ensureAbsenceMonitoringSchema } from '$lib/server/db/ensure-absence-monitoring';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import {
	tableAbsensiKegiatan,
	tableIzinPulangMurid,
	tableKalenderPendidikan,
	tableKelas,
	tableMurid,
	tablePresensiSettings,
	tableTindakLanjutAbsensi
} from '$lib/server/db/schema';
import { and, asc, eq, gte, inArray, lte, or } from 'drizzle-orm';

export const ATTENDANCE_ALERT_TYPES = [
	'sakit_beruntun',
	'sakit_berulang',
	'alfa_berulang',
	'izin_pulang_terlambat'
] as const;

export type AttendanceAlertType = (typeof ATTENDANCE_ALERT_TYPES)[number];
export type AttendanceFollowUpStatus = 'baru' | 'diproses' | 'selesai';

export type AttendanceAlert = {
	key: string;
	type: AttendanceAlertType;
	title: string;
	description: string;
	severity: 'warning' | 'error';
	muridId: number;
	nama: string;
	nis: string;
	kelasId: number;
	kelasNama: string;
	periodeMulai: string;
	periodeSelesai: string;
	duration: number;
	followUp: null | {
		id: number;
		status: AttendanceFollowUpStatus;
		catatan: string | null;
		ditanganiPada: string | null;
	};
};

export type IzinPulangMonitoringRow = {
	id: number;
	muridId: number | null;
	nama: string;
	kelasNama: string;
	tanggalKeluar: string;
	rencanaKembali: string;
	tanggalKembali: string | null;
	alasan: string;
	penjemputNama: string | null;
	status: IzinPulangStatus;
	duration: number;
};

function shiftDate(value: string, days: number) {
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	date.setDate(date.getDate() + days);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;
}

function addRange(target: Set<string>, start: string, end: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return;
	for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) target.add(cursor);
}

function parseConfiguredHolidays(value: string | null | undefined, target: Set<string>) {
	try {
		const parsed = JSON.parse(value || '[]') as unknown;
		if (!Array.isArray(parsed)) return;
		for (const item of parsed) {
			if (typeof item === 'string') target.add(item);
			else if (item && typeof item === 'object') {
				const record = item as Record<string, unknown>;
				const start = String(record.start ?? record.tanggalMulai ?? '');
				const end = String(record.end ?? record.tanggalSelesai ?? start);
				addRange(target, start, end);
			}
		}
	} catch {
		// Pengaturan lama yang tidak valid diabaikan; kalender pendidikan tetap digunakan.
	}
}

function alertKey(
	type: AttendanceAlertType,
	muridId: number,
	periodeMulai: string
) {
	return `${type}:${muridId}:${periodeMulai}`;
}

export async function loadAttendanceMonitoring(params: {
	sekolahId: number;
	tahunAjaranId: number;
	semesterId: number;
	kelasIds: number[];
	today: string;
	lookbackDays?: number;
	user?: App.Locals['user'];
}) {
	await Promise.all([ensureAbsensiDigitalSchema(), ensureAbsenceMonitoringSchema()]);
	if (!params.kelasIds.length) {
		return { alerts: [] as AttendanceAlert[], izinPulang: [] as IzinPulangMonitoringRow[] };
	}

	const rangeStart = shiftDate(params.today, -(params.lookbackDays ?? 45));
	const [students, attendanceRows, calendarRows, settings, izinRows, followUps] =
		await Promise.all([
			db
				.select({
					id: tableMurid.id,
					nama: tableMurid.nama,
					nis: tableMurid.nis,
					kelasId: tableMurid.kelasId,
					kelasNama: tableKelas.nama
				})
				.from(tableMurid)
				.innerJoin(tableKelas, eq(tableKelas.id, tableMurid.kelasId))
				.where(
					and(
						eq(tableMurid.sekolahId, params.sekolahId),
						eq(tableMurid.semesterId, params.semesterId),
						inArray(tableMurid.kelasId, params.kelasIds),
						params.user ? await studentAccessCondition(params.user, params.sekolahId) : undefined
					)
				)
				.orderBy(asc(tableMurid.nama)),
			db.query.tableAbsensiKegiatan.findMany({
				columns: { muridId: true, tanggal: true, status: true },
				where: and(
					eq(tableAbsensiKegiatan.sekolahId, params.sekolahId),
					eq(tableAbsensiKegiatan.semesterId, params.semesterId),
					inArray(tableAbsensiKegiatan.kelasId, params.kelasIds),
					gte(tableAbsensiKegiatan.tanggal, rangeStart),
					lte(tableAbsensiKegiatan.tanggal, params.today),
					inArray(tableAbsensiKegiatan.status, ['sakit', 'alfa', 'izin', 'pulang'])
				)
			}),
			db.query.tableKalenderPendidikan.findMany({
				columns: { tanggalMulai: true, tanggalSelesai: true },
				where: and(
					eq(tableKalenderPendidikan.sekolahId, params.sekolahId),
					eq(tableKalenderPendidikan.tahunAjaranId, params.tahunAjaranId),
					inArray(tableKalenderPendidikan.jenis, ['libur_nasional', 'libur_sekolah']),
					lte(tableKalenderPendidikan.tanggalMulai, params.today),
					gte(tableKalenderPendidikan.tanggalSelesai, rangeStart)
				)
			}),
			db.query.tablePresensiSettings.findFirst({
				where: and(
					eq(tablePresensiSettings.sekolahId, params.sekolahId),
					eq(tablePresensiSettings.tahunAjaranId, params.tahunAjaranId)
				)
			}),
			db.query.tableIzinPulangMurid.findMany({
				where: and(
					eq(tableIzinPulangMurid.sekolahId, params.sekolahId),
					inArray(tableIzinPulangMurid.kelasId, params.kelasIds),
					or(
						inArray(tableIzinPulangMurid.status, ['sedang_izin', 'terlambat_kembali']),
						gte(tableIzinPulangMurid.tanggalKeluar, rangeStart)
					)
				),
				orderBy: (table, { desc }) => [desc(table.tanggalKeluar), desc(table.id)]
			}),
			db.query.tableTindakLanjutAbsensi.findMany({
				where: eq(tableTindakLanjutAbsensi.sekolahId, params.sekolahId)
			})
		]);

	const holidayDates = new Set<string>();
	for (const row of calendarRows) addRange(holidayDates, row.tanggalMulai, row.tanggalSelesai);
	parseConfiguredHolidays(settings?.liburNasional, holidayDates);
	parseConfiguredHolidays(settings?.liburSemester, holidayDates);
	const schoolDays = listSchoolDays({
		start: rangeStart,
		end: params.today,
		hariSekolah: settings?.hariSekolah ?? 6,
		holidayDates
	});
	const schoolDayIndex = new Map(schoolDays.map((date, index) => [date, index]));
	const dailyRows = collapseActivityAttendanceByDay(attendanceRows);
	const dailyByStudent = new Map<number, Map<string, (typeof dailyRows)[number]['status']>>();
	for (const row of dailyRows) {
		const entries = dailyByStudent.get(row.muridId) ?? new Map();
		entries.set(row.tanggal, row.status);
		dailyByStudent.set(row.muridId, entries);
	}
	const followUpByKey = new Map(
		followUps.map((item) => [
			alertKey(item.jenis, item.muridId ?? 0, item.periodeMulai),
			item
		])
	);
	const alerts: AttendanceAlert[] = [];

	function pushAlert(options: Omit<AttendanceAlert, 'key' | 'followUp'>) {
		const key = alertKey(options.type, options.muridId, options.periodeMulai);
		const followUp = followUpByKey.get(key);
		alerts.push({
			...options,
			key,
			followUp: followUp
				? {
						id: followUp.id,
						status: followUp.status,
						catatan: followUp.catatan,
						ditanganiPada: followUp.ditanganiPada
					}
				: null
		});
	}

	for (const student of students) {
		const daily = dailyByStudent.get(student.id) ?? new Map();
		const best = findLongestStatusRun(schoolDays, daily, 'sakit');
		if (best.length >= 3) {
			pushAlert({
				type: 'sakit_beruntun',
				title: best.length > 3 ? 'Sakit lebih dari 3 hari' : 'Sakit mencapai 3 hari',
				description: `${student.nama} tercatat sakit ${best.length} hari sekolah berturut-turut.`,
				severity: best.length > 3 ? 'error' : 'warning',
				muridId: student.id,
				nama: student.nama,
				nis: student.nis,
				kelasId: student.kelasId,
				kelasNama: student.kelasNama,
				periodeMulai: best.start,
				periodeSelesai: best.end,
				duration: best.length
			});
		}

		const recurringStart = shiftDate(params.today, -29);
		const sickDates = Array.from(daily.entries())
			.filter(([date, status]) => date >= recurringStart && status === 'sakit')
			.map(([date]) => date)
			.sort();
		if (sickDates.length >= 3 && best.length < 3) {
			pushAlert({
				type: 'sakit_berulang',
				title: 'Sakit berulang',
				description: `${student.nama} tercatat sakit ${sickDates.length} hari dalam 30 hari terakhir.`,
				severity: sickDates.length > 3 ? 'error' : 'warning',
				muridId: student.id,
				nama: student.nama,
				nis: student.nis,
				kelasId: student.kelasId,
				kelasNama: student.kelasNama,
				periodeMulai: sickDates[0],
				periodeSelesai: sickDates.at(-1)!,
				duration: sickDates.length
			});
		}
		const alfaDates = Array.from(daily.entries())
			.filter(([date, status]) => date >= recurringStart && status === 'alfa')
			.map(([date]) => date)
			.sort();
		if (alfaDates.length >= 3) {
			pushAlert({
				type: 'alfa_berulang',
				title: 'Alfa berulang',
				description: `${student.nama} tercatat alfa ${alfaDates.length} hari dalam 30 hari terakhir.`,
				severity: alfaDates.length > 3 ? 'error' : 'warning',
				muridId: student.id,
				nama: student.nama,
				nis: student.nis,
				kelasId: student.kelasId,
				kelasNama: student.kelasNama,
				periodeMulai: alfaDates[0],
				periodeSelesai: alfaDates.at(-1)!,
				duration: alfaDates.length
			});
		}
	}

	const visibleStudentIds = new Set(students.map(student => student.id));
	const izinPulang = izinRows.filter(row => !params.user || (row.muridId != null && visibleStudentIds.has(row.muridId))).map((row) => {
		const status = effectiveIzinPulangStatus(row, params.today);
		const startIndex = schoolDayIndex.get(row.tanggalKeluar);
		const endDate = row.tanggalKembali ?? params.today;
		const endIndex = schoolDayIndex.get(endDate);
		const duration =
			startIndex != null && endIndex != null
				? Math.max(1, endIndex - startIndex + 1)
				: listSchoolDays({
						start: row.tanggalKeluar,
						end: endDate,
						hariSekolah: settings?.hariSekolah ?? 6,
						holidayDates
					}).length;
		return {
			id: row.id,
			muridId: row.muridId,
			nama: row.namaSnapshot,
			kelasNama: row.kelasSnapshot,
			tanggalKeluar: row.tanggalKeluar,
			rencanaKembali: row.rencanaKembali,
			tanggalKembali: row.tanggalKembali,
			alasan: row.alasan,
			penjemputNama: row.penjemputNama,
			status,
			duration
		};
	});

	for (const permit of izinPulang) {
		if (!permit.muridId || permit.tanggalKembali || permit.status !== 'terlambat_kembali') continue;
		const student = students.find((item) => item.id === permit.muridId);
		if (!student) continue;
		pushAlert({
			type: 'izin_pulang_terlambat',
			title: permit.duration > 3 ? 'Izin pulang lebih dari 3 hari' : 'Belum kembali dari izin',
			description: `${permit.nama} belum kembali sesuai rencana ${permit.rencanaKembali}.`,
			severity: permit.duration > 3 ? 'error' : 'warning',
			muridId: student.id,
			nama: student.nama,
			nis: student.nis,
			kelasId: student.kelasId,
			kelasNama: student.kelasNama,
			periodeMulai: permit.tanggalKeluar,
			periodeSelesai: permit.rencanaKembali,
			duration: permit.duration
		});
	}

	alerts.sort(
		(a, b) =>
			Number(a.followUp?.status === 'selesai') - Number(b.followUp?.status === 'selesai') ||
			Number(b.severity === 'error') - Number(a.severity === 'error') ||
			a.nama.localeCompare(b.nama)
	);
	return { alerts, izinPulang };
}
