import type { AbsensiKegiatanStatus } from './absensi-kegiatan';

export const IZIN_PULANG_STATUSES = [
	'sedang_izin',
	'sudah_kembali',
	'terlambat_kembali',
	'dibatalkan'
] as const;

export type IzinPulangStatus = (typeof IZIN_PULANG_STATUSES)[number];

export const IZIN_PULANG_STATUS_LABELS: Record<IzinPulangStatus, string> = {
	sedang_izin: 'Sedang Izin',
	sudah_kembali: 'Sudah Kembali',
	terlambat_kembali: 'Terlambat Kembali',
	dibatalkan: 'Dibatalkan'
};

const DAILY_STATUS_PRIORITY: Record<AbsensiKegiatanStatus, number> = {
	hadir: 0,
	terlambat: 1,
	alfa: 2,
	izin: 3,
	pulang: 4,
	sakit: 5
};

export type AttendanceActivityEntry = {
	muridId: number;
	tanggal: string;
	status: AbsensiKegiatanStatus;
};

export type DailyAttendanceStatus = AttendanceActivityEntry & {
	sourceCount: number;
};

/** Satu murid hanya menghasilkan satu status utama per tanggal. */
export function collapseActivityAttendanceByDay(
	entries: AttendanceActivityEntry[]
): DailyAttendanceStatus[] {
	const grouped = new Map<string, DailyAttendanceStatus>();
	for (const entry of entries) {
		const key = `${entry.muridId}:${entry.tanggal}`;
		const current = grouped.get(key);
		if (!current) {
			grouped.set(key, { ...entry, sourceCount: 1 });
			continue;
		}
		current.sourceCount += 1;
		if (DAILY_STATUS_PRIORITY[entry.status] > DAILY_STATUS_PRIORITY[current.status]) {
			current.status = entry.status;
		}
	}
	return Array.from(grouped.values()).sort(
		(a, b) => a.tanggal.localeCompare(b.tanggal) || a.muridId - b.muridId
	);
}

function parseLocalDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
}

function localDateKey(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;
}

export function listSchoolDays(params: {
	start: string;
	end: string;
	hariSekolah?: number;
	holidayDates?: Iterable<string>;
}) {
	const start = parseLocalDate(params.start);
	const end = parseLocalDate(params.end);
	if (!start || !end || start > end) return [];
	const hariSekolah = Math.min(7, Math.max(1, params.hariSekolah ?? 6));
	const holidays = new Set(params.holidayDates ?? []);
	const dates: string[] = [];
	for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
		const day = cursor.getDay();
		const weekdayNumber = day === 0 ? 7 : day;
		const key = localDateKey(cursor);
		if (weekdayNumber <= hariSekolah && !holidays.has(key)) dates.push(key);
	}
	return dates;
}

export function findLongestStatusRun<T extends string>(
	schoolDays: string[],
	statusByDate: ReadonlyMap<string, T>,
	targetStatus: T
) {
	let currentStart = '';
	let currentEnd = '';
	let currentLength = 0;
	let best = { start: '', end: '', length: 0 };
	for (const date of schoolDays) {
		if (statusByDate.get(date) === targetStatus) {
			if (!currentLength) currentStart = date;
			currentEnd = date;
			currentLength += 1;
			if (currentLength >= best.length) {
				best = { start: currentStart, end: currentEnd, length: currentLength };
			}
		} else {
			currentStart = '';
			currentEnd = '';
			currentLength = 0;
		}
	}
	return best;
}

export function effectiveIzinPulangStatus(
	record: Pick<
		{
			status: IzinPulangStatus;
			rencanaKembali: string;
			tanggalKembali: string | null;
		},
		'status' | 'rencanaKembali' | 'tanggalKembali'
	>,
	today: string
): IzinPulangStatus {
	if (record.status === 'dibatalkan') return 'dibatalkan';
	if (record.tanggalKembali) {
		return record.tanggalKembali > record.rencanaKembali
			? 'terlambat_kembali'
			: 'sudah_kembali';
	}
	return today > record.rencanaKembali ? 'terlambat_kembali' : 'sedang_izin';
}

export function canTransitionIzinPulangStatus(from: IzinPulangStatus, to: IzinPulangStatus) {
	if (from === to) return true;
	if (from === 'sedang_izin') {
		return ['sudah_kembali', 'terlambat_kembali', 'dibatalkan'].includes(to);
	}
	return false;
}
