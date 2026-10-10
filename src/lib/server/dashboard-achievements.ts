import db from './db';
import { and, eq, inArray, gte, lte, or, isNull, ne, desc } from 'drizzle-orm';
import {
	tableMurid as m,
	tableKegiatanAbsensi as a,
	tableAbsensiKegiatan as attendance,
	tableAbsensiHarian as daily,
	tableKalenderPendidikan as calendar,
	tablePresensiSettings as settings,
	tableIzinPulangMurid as permit
} from './db/schema';
import type { AcademicContext } from './db/academic';
import type { loadDashboardDaily } from './dashboard-daily';
import { studentAccessCondition } from './student-access';
import { activeMuridFilter } from './murid-query';
import { computeNilaiAkhirRekap } from './nilai-akhir';
import {
	semesterLeaders,
	semesterHighlights,
	consistentAttendance,
	configuredHolidays
} from '$lib/dashboard-achievements';
import { canAccessMenu } from '$lib/role-menu-access';
import {
	buildMonitoringRows,
	type MonitoringColumn,
	type MonitoringRecord
} from '$lib/attendance-monitoring';
import { listSchoolDays } from './absence-monitoring';
import { isSummaryDate } from '$lib/attendance-summary';

export async function loadDashboardAchievements(
	locals: App.Locals,
	academic: AcademicContext,
	scope: Awaited<ReturnType<typeof loadDashboardDaily>>,
	params: URLSearchParams
) {
	const { user, sekolah } = locals;
	if (!user || !sekolah || !academic.activeSemesterId || !academic.activeTahunAjaranId) return null;
	const canAcademic = canAccessMenu(user, '/asesmen-sumatif');
	if (!canAcademic && !scope.students) return null;
	const classes = scope.selectedClasses;
	const ids = classes.map((row) => row.id);
	const students = ids.length
		? await db.query.tableMurid.findMany({
				columns: { id: true, nama: true, kelasId: true, tanggalMasuk: true },
				where: and(
					await studentAccessCondition(user, sekolah.id, academic.activeSemesterId),
					activeMuridFilter(),
					inArray(m.kelasId, ids)
				)
			})
		: [];
	const visibleIds = new Set(students.map((row) => row.id));
	const pageCount = Math.max(1, Math.ceil(classes.length / 12));
	const pageValue = Number(params.get('prestasi_page') ?? 1);
	const page = Math.min(pageCount, Number.isSafeInteger(pageValue) ? Math.max(1, pageValue) : 1);
	const pageHref = (key: string, number: number) => {
		const query = new URLSearchParams(params);
		query.set(key, String(number));
		if (key === 'kehadiran_page') query.set('prestasi_tab', 'kehadiran');
		return `/?${query}#prestasi-murid` as const;
	};
	const academicClasses = [];
	if (canAcademic)
		for (const kelas of classes) {
			const rekap = await computeNilaiAkhirRekap({
				sekolahId: sekolah.id,
				kelasId: kelas.id,
				activeOnly: true
			});
			const leaders = semesterLeaders(rekap.rows);
			academicClasses.push({
				...kelas,
				complete: leaders.complete,
				rows: leaders.rows
					.filter((row) => visibleIds.has(row.id))
					.map(({ id, nama, nilaiRataRata, peringkat }) => ({ id, nama, nilaiRataRata, peringkat }))
			});
		}
	const year = academic.tahunAjaranList.find((row) => row.id === academic.activeTahunAjaranId)!;
	const semester = year.semester.find((row) => row.id === academic.activeSemesterId)!;
	const start = scope.date.slice(0, 8) + '01';
	const yearMatch = /^(\d{4})\D+(\d{4})$/.exec(year.nama);
	const semesterStart =
		semester.tanggalMulai ||
		semester.tanggalMasuk ||
		(yearMatch
			? semester.tipe === 'ganjil'
				? `${yearMatch[1]}-07-01`
				: `${yearMatch[2]}-01-01`
			: '');
	const semesterEnd =
		semester.tanggalSelesai ||
		(yearMatch
			? semester.tipe === 'ganjil'
				? `${yearMatch[1]}-12-31`
				: `${yearMatch[2]}-06-30`
			: '');
	const inSemester =
		isSummaryDate(semesterStart) &&
		isSummaryDate(semesterEnd) &&
		scope.date >= semesterStart &&
		scope.date <= semesterEnd;
	const monthly = scope.students
		? {
				start,
				end: scope.date,
				source: scope.studentSource?.label ?? '-',
				available: inSemester && Boolean(scope.studentSource?.source),
				consistent: 0,
				incomplete: 0,
				partial: 0,
				absent: 0,
				rows: [] as Array<{ id: number; nama: string; kelas: string; days: number }>,
				page: 1,
				pageCount: 1,
				previous: null as `/?${string}#prestasi-murid` | null,
				next: null as `/?${string}#prestasi-murid` | null
			}
		: null;
	if (monthly?.available && students.length) {
		const source = scope.studentSource!.source;
		const sourceActivity =
			source !== 'harian'
				? await db.query.tableKegiatanAbsensi.findFirst({
						where: and(
							eq(a.id, Number(source)),
							eq(a.sekolahId, sekolah.id),
							eq(a.aktif, true),
							eq(a.kategori, 'sekolah')
						)
					})
				: null;
		if (source !== 'harian' && !sourceActivity) monthly.available = false;
		const column: MonitoringColumn = {
			key: 'masuk',
			label: 'Masuk Sekolah',
			source,
			sourceLabel: monthly.source,
			activityId: sourceActivity?.id ?? null,
			time: sourceActivity?.jamMulai ?? null
		};
		const studentIds = students.map((row) => row.id);
		const allDays = listSchoolDays({ start, end: scope.date, hariSekolah: 7 });
		const config = await db.query.tablePresensiSettings.findFirst({
			where: and(
				eq(settings.sekolahId, sekolah.id),
				eq(settings.tahunAjaranId, academic.activeTahunAjaranId)
			),
			orderBy: [desc(settings.id)]
		});
		const holidays = configuredHolidays([config?.liburNasional, config?.liburSemester], allDays);
		const calendarRows = await db.query.tableKalenderPendidikan.findMany({
			where: and(
				eq(calendar.sekolahId, sekolah.id),
				eq(calendar.tahunAjaranId, academic.activeTahunAjaranId),
				or(isNull(calendar.semesterId), eq(calendar.semesterId, academic.activeSemesterId)),
				inArray(calendar.jenis, ['libur_nasional', 'libur_sekolah']),
				lte(calendar.tanggalMulai, scope.date),
				gte(calendar.tanggalSelesai, start)
			)
		});
		const records: Array<MonitoringRecord & { tanggal: string }> =
			source === 'harian'
				? (
						await db.query.tableAbsensiHarian.findMany({
							where: and(
								eq(daily.sekolahId, sekolah.id),
								eq(daily.semesterId, academic.activeSemesterId),
								inArray(daily.kelasId, ids),
								inArray(daily.muridId, studentIds),
								gte(daily.tanggal, start),
								lte(daily.tanggal, scope.date)
							)
						})
					).map((row) => ({ ...row, kegiatanId: null }))
				: await db.query.tableAbsensiKegiatan.findMany({
						where: and(
							eq(attendance.sekolahId, sekolah.id),
							eq(attendance.semesterId, academic.activeSemesterId),
							inArray(attendance.kelasId, ids),
							inArray(attendance.muridId, studentIds),
							eq(attendance.kegiatanId, sourceActivity?.id ?? -1),
							gte(attendance.tanggal, start),
							lte(attendance.tanggal, scope.date)
						)
					});
		const permits = await db.query.tableIzinPulangMurid.findMany({
			columns: {
				muridId: true,
				tanggalKeluar: true,
				waktuKeluar: true,
				tanggalKembali: true,
				waktuKembali: true
			},
			where: and(
				eq(permit.sekolahId, sekolah.id),
				eq(permit.tahunAjaranId, academic.activeTahunAjaranId),
				eq(permit.semesterId, academic.activeSemesterId),
				inArray(permit.muridId, studentIds),
				ne(permit.status, 'dibatalkan'),
				lte(permit.tanggalKeluar, scope.date),
				or(isNull(permit.tanggalKembali), gte(permit.tanggalKembali, start))
			)
		});
		const classById = new Map(classes.map((row) => [row.id, row]));
		const calendarLevels: Record<string, string> = { srd: 'sd', srmp: 'smp', srma: 'sma' };
		const statuses = new Map<number, Map<string, string>>();
		const recordsByDate = new Map<string, typeof records>();
		for (const record of records) {
			const entries = recordsByDate.get(record.tanggal) ?? [];
			entries.push(record);
			recordsByDate.set(record.tanggal, entries);
		}
		for (const date of allDays)
			for (const row of buildMonitoringRows({
				date,
				columns: [column],
				records: recordsByDate.get(date) ?? [],
				permits,
				students: students.map((student) => ({
					...student,
					kelas: classById.get(student.kelasId)!.nama
				}))
			})) {
				const days = statuses.get(row.id) ?? new Map<string, string>();
				days.set(date, row.cells[0].status);
				statuses.set(row.id, days);
			}
		for (const student of students) {
			const kelas = classById.get(student.kelasId)!;
			const classHolidays = new Set(holidays);
			for (const row of calendarRows)
				if (
					(row.kelasId === null || row.kelasId === kelas.id) &&
					(row.jenjang === 'semua' ||
						(calendarLevels[row.jenjang] ?? row.jenjang) === kelas.jenjang)
				)
					for (const date of allDays)
						if (date >= row.tanggalMulai && date <= row.tanggalSelesai) classHolidays.add(date);
			const days = listSchoolDays({
				start,
				end: scope.date,
				hariSekolah: config?.hariSekolah ?? 6,
				holidayDates: classHolidays
			});
			const result = monthly.available
				? consistentAttendance(
						days,
						statuses.get(student.id) ?? new Map(),
						isSummaryDate(student.tanggalMasuk)
							? student.tanggalMasuk > semesterStart
								? student.tanggalMasuk
								: semesterStart
							: ''
					)
				: 'incomplete';
			if (result === 'consistent')
				monthly.rows.push({
					id: student.id,
					nama: student.nama,
					kelas: kelas.nama,
					days: days.length
				});
			else if (result === 'absent') monthly.absent++;
			else if (result === 'partial_month') monthly.partial++;
			else monthly.incomplete++;
		}
		monthly.rows.sort(
			(a, b) =>
				a.kelas.localeCompare(b.kelas, 'id', { numeric: true }) ||
				a.nama.localeCompare(b.nama, 'id')
		);
		monthly.consistent = monthly.rows.length;
		monthly.pageCount = Math.max(1, Math.ceil(monthly.rows.length / 20));
		const requested = Number(params.get('kehadiran_page') ?? 1);
		monthly.page = Math.min(
			monthly.pageCount,
			Number.isSafeInteger(requested) ? Math.max(1, requested) : 1
		);
		monthly.rows = monthly.rows.slice((monthly.page - 1) * 20, monthly.page * 20);
		monthly.previous = monthly.page > 1 ? pageHref('kehadiran_page', monthly.page - 1) : null;
		monthly.next =
			monthly.page < monthly.pageCount ? pageHref('kehadiran_page', monthly.page + 1) : null;
	}
	return {
		semester: `${semester.nama} (${year.nama})`,
		academic: canAcademic
			? {
					classes: academicClasses.slice((page - 1) * 12, page * 12),
					highlights: semesterHighlights(academicClasses),
					page,
					pageCount,
					previous: page > 1 ? pageHref('prestasi_page', page - 1) : null,
					next: page < pageCount ? pageHref('prestasi_page', page + 1) : null
				}
			: null,
		monthly
	};
}
