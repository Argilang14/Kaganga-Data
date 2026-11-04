import { error } from '@sveltejs/kit';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import db from './db';
import { loadAttendancePermits } from './attendance-permits';
import { projectDailyIllness } from './attendance-illness';
import { listSchoolDays } from './absence-monitoring';
import { isSummaryDate, inferSummaryLevel } from '$lib/attendance-summary';
import { canonicalAttendanceActivityCode } from '$lib/attendance-activity';
import { travelLocalTime, travelReturnDeadline } from '$lib/attendance-travel';
import type { SchoolPermitRecap } from '$lib/attendance-permit-recap';
import { attendanceStaffName } from './attendance-staff';
import {
	tableAbsensiHarian,
	tableAbsensiKegiatan,
	tableKalenderPendidikan,
	tablePresensiSettings,
	tableSemester,
	tableMurid,
	tableSekolah
} from './db/schema';

type Permit = Awaited<ReturnType<typeof loadAttendancePermits>>[number];
const timeWithSeconds = (value: string) => (value.length === 5 ? `${value}:00` : value);

export async function loadPermitRecapDetails(
	schoolId: number,
	studentIds: number[],
	start: string,
	end: string
) {
	const today = travelLocalTime().date;
	if (start > (end < today ? end : today)) return [];
	const permits = await loadAttendancePermits(
		schoolId,
		studentIds,
		start,
		end < today ? end : today
	);
	const ids = [
		...new Set(
			permits
				.flatMap((p) => [
					p.petugasKeluarUserId,
					p.petugasKembaliUserId,
					p.perjalanan?.keluarOleh,
					p.perjalanan?.kembaliOleh
				])
				.filter((id): id is number => id != null)
		)
	];
	const names = new Map(
		await Promise.all(ids.map(async (id) => [id, await attendanceStaffName(id, schoolId)] as const))
	);
	return permits.map((p) => ({
		...p,
		pencatat: names.get(p.petugasKeluarUserId ?? 0) ?? 'Admin/petugas',
		pencatatKembali: p.tanggalKembali
			? (names.get(p.petugasKembaliUserId ?? 0) ?? 'Admin/petugas')
			: '',
		petugasKeluarSecurity: names.get(p.perjalanan?.keluarOleh ?? 0) ?? '',
		petugasKembaliSecurity: names.get(p.perjalanan?.kembaliOleh ?? 0) ?? '',
		perluDiperiksa: permitReviewReasons(p, today)
	}));
}

export function permitReviewReasons(permit: Permit, today = travelLocalTime().date) {
	const reasons: string[] = [];
	const departure = permit.perjalanan?.keluarPada
		? travelLocalTime(new Date(permit.perjalanan.keluarPada))
		: null;
	const returned = permit.perjalanan?.kembaliPada
		? travelLocalTime(new Date(permit.perjalanan.kembaliPada))
		: null;
	if (
		departure &&
		(departure.date !== permit.tanggalKeluar ||
			(permit.waktuKeluar && departure.time.slice(0, 5) !== permit.waktuKeluar.slice(0, 5)))
	)
		reasons.push('Waktu keluar security berbeda dari catatan izin.');
	if (
		returned &&
		permit.tanggalKembali &&
		(returned.date !== permit.tanggalKembali ||
			(permit.waktuKembali && returned.time.slice(0, 5) !== permit.waktuKembali.slice(0, 5)))
	)
		reasons.push('Waktu kembali security berbeda dari catatan guru.');
	const localNow = travelLocalTime();
	if (
		!permit.tanggalKembali &&
		`${today}T${today === localNow.date ? localNow.time : '23:59:59'}` >
			travelReturnDeadline(permit)
	)
		reasons.push('Rencana kembali terlewati; kepulangan belum terkonfirmasi.');
	if (!permit.waktuKeluar)
		reasons.push(
			'Waktu keluar izin belum dilengkapi; izin pada hari keberangkatan perlu diperiksa.'
		);
	if (
		permit.tanggalKembali &&
		`${permit.tanggalKembali}T${timeWithSeconds(permit.waktuKembali ?? '00:00')}` >
			travelReturnDeadline(permit)
	)
		reasons.push('Kembali melewati batas izin; periksa ketidakhadiran setelah batas izin.');
	return reasons;
}

function configuredHolidays(
	raw: string | null | undefined,
	dates: Set<string>,
	rangeStart: string,
	rangeEnd: string
) {
	try {
		const items: unknown = JSON.parse(raw || '[]');
		if (!Array.isArray(items)) return;
		for (const item of items) {
			if (typeof item === 'string' && isSummaryDate(item)) dates.add(item);
			else if (item && typeof item === 'object') {
				const record = item as Record<string, unknown>;
				const start = String(record.start ?? record.tanggalMulai ?? '');
				const end = String(record.end ?? record.tanggalSelesai ?? start);
				if (isSummaryDate(start) && isSummaryDate(end))
					for (const day of listSchoolDays({
						start: start < rangeStart ? rangeStart : start,
						end: end > rangeEnd ? rangeEnd : end,
						hariSekolah: 7
					}))
						dates.add(day);
			}
		}
	} catch {
		/* Invalid legacy settings do not override the school calendar. */
	}
}

/** Read-only administrative totals. Teacher authorization and security observations stay separate. */
export async function loadSchoolPermitRecap(options: {
	schoolId: number;
	semesterId: number;
	studentIds: number[];
	start: string;
	end: string;
	today?: string;
	excludeCurrentUnrecorded?: boolean;
}) {
	const { schoolId, semesterId, studentIds, start } = options;
	if (
		!isSummaryDate(start) ||
		!isSummaryDate(options.end) ||
		start > options.end ||
		Date.parse(options.end) - Date.parse(start) > 366 * 86400000
	)
		error(400, 'Pilih rentang tanggal valid, maksimal satu tahun.');
	const today = options.today ?? travelLocalTime().date;
	const end = options.end < today ? options.end : today;
	const totals = new Map<number, SchoolPermitRecap>(
		studentIds.map((id) => [
			id,
			{
				counts: { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alfa: 0 },
				izinPulang: 0,
				durasiPulang: 0,
				belumTercatat: 0,
				belumDiverifikasi: 0,
				perluDiperiksa: 0
			}
		])
	);
	if (!studentIds.length || start > end) return totals;
	const semester = await db.query.tableSemester.findFirst({
		where: eq(tableSemester.id, semesterId),
		with: { tahunAjaran: { columns: { sekolahId: true } } }
	});
	if (!semester || semester.tahunAjaran.sekolahId !== schoolId)
		error(404, 'Semester rekap tidak ditemukan.');
	const [permits, daily, activities, settings, calendar, students, school] = await Promise.all([
		loadAttendancePermits(schoolId, studentIds, start, end),
		db.query.tableAbsensiHarian.findMany({
			where: and(
				eq(tableAbsensiHarian.sekolahId, schoolId),
				eq(tableAbsensiHarian.semesterId, semesterId),
				inArray(tableAbsensiHarian.muridId, studentIds),
				gte(tableAbsensiHarian.tanggal, start),
				lte(tableAbsensiHarian.tanggal, end)
			)
		}),
		db.query.tableAbsensiKegiatan.findMany({
			with: { kegiatan: true },
			where: and(
				eq(tableAbsensiKegiatan.sekolahId, schoolId),
				eq(tableAbsensiKegiatan.semesterId, semesterId),
				inArray(tableAbsensiKegiatan.muridId, studentIds),
				gte(tableAbsensiKegiatan.tanggal, start),
				lte(tableAbsensiKegiatan.tanggal, end)
			)
		}),
		db.query.tablePresensiSettings.findFirst({
			where: and(
				eq(tablePresensiSettings.sekolahId, schoolId),
				eq(tablePresensiSettings.tahunAjaranId, semester.tahunAjaranId)
			)
		}),
		db.query.tableKalenderPendidikan.findMany({
			where: and(
				eq(tableKalenderPendidikan.sekolahId, schoolId),
				eq(tableKalenderPendidikan.tahunAjaranId, semester.tahunAjaranId),
				inArray(tableKalenderPendidikan.jenis, ['libur_nasional', 'libur_sekolah']),
				lte(tableKalenderPendidikan.tanggalMulai, end),
				gte(tableKalenderPendidikan.tanggalSelesai, start)
			)
		}),
		db.query.tableMurid.findMany({
			columns: { id: true, kelasId: true, tanggalMasuk: true },
			with: { kelas: { columns: { nama: true, fase: true } } },
			where: and(
				eq(tableMurid.sekolahId, schoolId),
				eq(tableMurid.semesterId, semesterId),
				inArray(tableMurid.id, studentIds)
			)
		}),
		db.query.tableSekolah.findFirst({
			columns: { jenjangPendidikan: true },
			where: eq(tableSekolah.id, schoolId)
		})
	]);
	const holidays = new Set<string>();
	configuredHolidays(settings?.liburNasional, holidays, start, end);
	configuredHolidays(settings?.liburSemester, holidays, start, end);
	const semesterStart = semester.tanggalMulai ?? semester.tanggalMasuk;
	const schoolDates = listSchoolDays({
		start: semesterStart && semesterStart > start ? semesterStart : start,
		end: semester.tanggalSelesai && semester.tanggalSelesai < end ? semester.tanggalSelesai : end,
		hariSekolah: settings?.hariSekolah ?? 6,
		holidayDates: holidays
	});
	const schoolActivities = await db.query.tableKegiatanAbsensi.findMany({
		where: (a, { and, eq }) => and(eq(a.sekolahId, schoolId), eq(a.kategori, 'sekolah'))
	});
	const entry = schoolActivities.find(
		(a) => canonicalAttendanceActivityCode(a.kode) === 'apel_berangkat'
	);
	// ponytail: daily attendance wins; add per-session rules only if school recap needs more than one entry per day.
	const recorded = new Map(daily.map((r) => [`${r.muridId}:${r.tanggal}`, r]));
	for (const row of activities
		.filter(
			(r) =>
				!r.autoAlfa &&
				r.metode !== 'auto' &&
				r.kegiatan?.kategori === 'sekolah' &&
				canonicalAttendanceActivityCode(r.kegiatan.kode) !== 'apel_pulang'
		)
		.sort(
			(a, b) =>
				Number(b.kegiatanId === entry?.id) - Number(a.kegiatanId === entry?.id) ||
				(a.kegiatan?.jamMulai ?? '23:59').localeCompare(b.kegiatan?.jamMulai ?? '23:59') ||
				a.id - b.id
		)) {
		const key = `${row.muridId}:${row.tanggal}`;
		if (row.metode === 'auto') continue;
		if (!recorded.has(key))
			recorded.set(key, {
				...row,
				metode: row.metode,
				status: row.status === 'pulang' ? 'izin' : row.status
			});
	}
	const projected = await projectDailyIllness({
		schoolId,
		semesterId,
		studentIds,
		dates: schoolDates,
		rows: [...recorded.values()]
	});
	const byDay = new Map(projected.map((r) => [`${r.muridId}:${r.tanggal}`, r]));
	for (const id of studentIds) {
		const result = totals.get(id)!;
		const student = students.find((s) => s.id === id);
		if (!student) continue;
		const level = student.kelas
			? inferSummaryLevel(student.kelas, school?.jenjangPendidikan)
			: 'unknown';
		const studentSchoolDates = schoolDates.filter(
			(date) =>
				(!isSummaryDate(student.tanggalMasuk) || date >= student.tanggalMasuk) &&
				!calendar.some(
					(item) =>
						(!item.semesterId || item.semesterId === semesterId) &&
						(!item.kelasId || item.kelasId === student.kelasId) &&
						(item.jenjang === 'semua' ||
							(({ srd: 'sd', srmp: 'smp', srma: 'sma' } as Record<string, string>)[item.jenjang] ??
								item.jenjang) === level) &&
						item.tanggalMulai <= date &&
						item.tanggalSelesai >= date
				)
		);
		const ownPermits = permits.filter((p) => p.muridId === id && p.tanggalKeluar <= end);
		const duration = new Set<string>();
		for (const permit of ownPermits) {
			if (permit.tanggalKeluar >= start) result.izinPulang++;
			const until = permit.tanggalKembali ?? permit.rencanaKembali;
			for (const day of listSchoolDays({
				start: permit.tanggalKeluar < start ? start : permit.tanggalKeluar,
				end: until > end ? end : until,
				hariSekolah: 7
			}))
				duration.add(day);
			if (
				!permit.perjalanan?.keluarPada ||
				(permit.tanggalKembali && !permit.perjalanan?.kembaliPada)
			)
				result.belumDiverifikasi++;
			if (permitReviewReasons(permit, today).length) result.perluDiperiksa++;
		}
		result.durasiPulang = duration.size;
		for (const date of studentSchoolDates) {
			const row = byDay.get(`${id}:${date}`);
			if (row) {
				result.counts[row.status]++;
				continue;
			}
			const covered = ownPermits.some((p) => {
				const point = `${date}T${timeWithSeconds(entry?.jamMulai ?? settings?.jamMasuk ?? '07:30')}`;
				const deadline = travelReturnDeadline(p);
				const returned = p.tanggalKembali
					? `${p.tanggalKembali}T${timeWithSeconds(p.waktuKembali ?? '00:00:00')}`
					: deadline;
				const until = returned < deadline ? returned : deadline;
				return (
					`${p.tanggalKeluar}T${timeWithSeconds(p.waktuKeluar ?? '23:59:59')}` <= point &&
					until > point
				);
			});
			if (covered) result.counts.izin++;
			else if (!options.excludeCurrentUnrecorded || date < today) result.belumTercatat++;
		}
	}
	return totals;
}
