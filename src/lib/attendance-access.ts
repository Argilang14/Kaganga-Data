import { hasSchoolWideOperationalAccess } from './access-position.ts';

export const attendanceActions = [
	'lihat',
	'scan',
	'input',
	'koreksi',
	'koreksi_lama',
	'export',
	'izin_pulang',
	'impor',
	'pengaturan',
	'qr_manage',
	'sinkron_rapor'
] as const;
export type AttendanceAction = (typeof attendanceActions)[number];
export type AttendanceUser =
	| {
			id?: number;
			type?: string | null;
			jabatanAkses?: string | null;
			sekolahId?: number | null;
			permissions?: readonly string[] | null;
	  }
	| null
	| undefined;
export const basicAttendanceActions = new Set<AttendanceAction>([
	'lihat',
	'scan',
	'input',
	'koreksi',
	'export'
]);

export function canAttendance(user: AttendanceUser, action: AttendanceAction) {
	if (!user) return false;
	if (hasSchoolWideOperationalAccess(user)) return true;
	if (user.permissions?.includes(`absensi_${action}`)) return true;
	return (
		basicAttendanceActions.has(action) &&
		(['user', 'wali_kelas', 'wali_asuh', 'wali_asrama'].includes(user.type ?? '') ||
			user.permissions?.includes('administrasi_absensi') === true)
	);
}

export function canAttendActivity(user: AttendanceUser, scope: string) {
	if (!canAttendance(user, 'input')) return false;
	if (hasSchoolWideOperationalAccess(user)) return true;
	if (scope === 'sekolah') return ['user', 'wali_kelas'].includes(user?.type ?? '');
	if (scope === 'asrama') return ['wali_asuh', 'wali_asrama'].includes(user?.type ?? '');
	return (
		scope === 'semua' &&
		['user', 'wali_kelas', 'wali_asuh', 'wali_asrama'].includes(user?.type ?? '')
	);
}

export function attendanceDateAllowed(user: AttendanceUser, date: string, today: string) {
	const parsed = new Date(`${date}T00:00:00Z`);
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(date) &&
		Number.isFinite(parsed.getTime()) &&
		parsed.toISOString().slice(0, 10) === date &&
		date <= today &&
		(date === today || canAttendance(user, 'koreksi_lama'))
	);
}
