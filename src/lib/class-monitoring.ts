import { hasSchoolWideOperationalAccess } from './access-position.ts';

export type ClassMonitoringJenis = 'persiapan' | 'ganjil' | 'genap';
export type ClassMonitoringState = 'forthcoming' | 'running' | 'ended' | 'present' | 'excused';
export type ClassMonitoringAbsenceReason = 'sakit' | 'izin';

export type ClassMonitoringUser =
	| {
			type?: string | null;
			jabatanAkses?: string | null;
			permissions?: readonly string[] | null;
			pegawaiId?: number | null;
	  }
	| null
	| undefined;

export type ScheduleMeetingEntry = {
	id: number;
	jamKe: number;
	templateId: number;
	kelasId: number;
	guruPegawaiId: number | null;
	mapelKey: string;
	pukulMulai: string;
	pukulSelesai: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export function isStrictLocalDate(value: unknown): value is string {
	if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	return (
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
	);
}

export function isClockTime(value: unknown): value is string {
	return typeof value === 'string' && TIME_RE.test(value);
}

export function jakartaNowParts(now = new Date()) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);
	const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return {
		date: `${value.year}-${value.month}-${value.day}`,
		time: `${value.hour}:${value.minute}:${value.second}`
	};
}

export function classMonitoringCapabilities(user: ClassMonitoringUser) {
	const permissions = user?.permissions ?? [];
	const canManage =
		!!user &&
		(hasSchoolWideOperationalAccess(user) || permissions.includes('class_monitoring_manage'));
	const teacherDefault = user?.type === 'user' || user?.type === 'wali_kelas';
	return {
		canView:
			canManage ||
			teacherDefault ||
			permissions.includes('class_monitoring_lihat') ||
			permissions.includes('class_monitoring_scan'),
		canScan: canManage || teacherDefault || permissions.includes('class_monitoring_scan'),
		canManage
	};
}

export function monitoringState(params: {
	date: string;
	start: string;
	end: string;
	nowDate: string;
	nowTime: string;
	scannedAt?: string | null;
	absenceReason?: ClassMonitoringAbsenceReason | null;
}): ClassMonitoringState {
	if (params.scannedAt) return 'present';
	if (params.absenceReason) return 'excused';
	if (
		params.date > params.nowDate ||
		(params.date === params.nowDate && params.nowTime < params.start)
	)
		return 'forthcoming';
	if (params.date === params.nowDate && params.nowTime <= params.end) return 'running';
	return 'ended';
}

export function buildMeetingKey(params: {
	templateId: number;
	kelasId: number;
	scheduleIds: number[];
}) {
	return `${params.templateId}:${params.kelasId}:${[...params.scheduleIds].sort((a, b) => a - b).join('.')}`;
}

export function splitClassMonitoringMeetings<T extends ScheduleMeetingEntry>(entries: T[]): T[][] {
	const result: T[][] = [];
	for (const entry of [...entries].sort((a, b) => a.jamKe - b.jamKe || a.id - b.id)) {
		const current = result.at(-1);
		const previous = current?.at(-1);
		if (
			!current ||
			!previous ||
			entry.jamKe !== previous.jamKe + 1 ||
			entry.pukulMulai !== previous.pukulSelesai ||
			entry.templateId !== previous.templateId ||
			entry.kelasId !== previous.kelasId ||
			entry.guruPegawaiId !== previous.guruPegawaiId ||
			entry.mapelKey !== previous.mapelKey
		) {
			result.push([entry]);
		} else {
			current.push(entry);
		}
	}
	return result;
}
