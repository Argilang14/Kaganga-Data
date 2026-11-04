import { hasRole, isFullAccess } from './user-role.ts';
import { roleGrants } from './role-policy.ts';
import { canonicalAttendanceActivityCode } from './attendance-activity.ts';

export const attendanceActions = [
	'lihat',
	'scan',
	'input',
	'koreksi',
	'koreksi_lama',
	'export',
	'izin_pulang',
	'perjalanan',
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
			roles?: readonly string[] | null;
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
	if (roleGrants(user, `absensi_${action}`)) return true;
	if (hasRole(user, 'tim_keamanan')) return action === 'scan' || action === 'perjalanan';
	if (user.permissions?.includes(`absensi_${action}`)) return true;
	return (
		basicAttendanceActions.has(action) &&
		(hasRole(user, 'user', 'wali_asuh', 'wali_asrama', 'tim_dapur') ||
			user.permissions?.includes('administrasi_absensi') === true)
	);
}

export function canViewAttendanceActivity(user: AttendanceUser, category?: string) {
	if (
		hasRole(user, 'tim_keamanan') &&
		!hasRole(user, 'user', 'wali_asuh', 'wali_asrama', 'tim_dapur') &&
		!hasSchoolWideAttendanceAccess(user)
	)
		return false;
	return (
		!hasRole(user, 'tim_dapur') ||
		hasRole(user, 'user', 'wali_asuh', 'wali_asrama') ||
		hasSchoolWideAttendanceAccess(user) ||
		category === 'makan'
	);
}

export function hasSchoolWideAttendanceAccess(user: AttendanceUser) {
	return isFullAccess(user) || hasRole(user, 'operator', 'waka_kesiswaan', 'waka_humas');
}
export function hasSchoolWideAttendanceStudentAccess(user: AttendanceUser, sekolahId: number) {
	return (
		!!user &&
		(isFullAccess(user) || user.sekolahId === sekolahId) &&
		hasSchoolWideAttendanceAccess(user)
	);
}
export function hasSchoolWideAttendanceSummaryAccess(user: AttendanceUser, sekolahId: number) {
	return canAttendance(user, 'export') && hasSchoolWideAttendanceStudentAccess(user, sekolahId);
}

export type AttendanceActivityContext = { kode?: string; tanggal?: string };

export function canAttendActivity(
	user: AttendanceUser,
	scope: string,
	category?: string,
	context?: AttendanceActivityContext
) {
	if (!canAttendance(user, 'input')) return false;
	if (hasSchoolWideAttendanceAccess(user)) return true;
	if (category === 'makan') return hasRole(user, 'tim_dapur');
	if (!canViewAttendanceActivity(user, category)) return false;
	if (category === 'sekolah' && !hasRole(user, 'user')) return false;
	if (category === 'asrama' && !hasRole(user, 'wali_asuh', 'wali_asrama')) return false;
	if (category === 'sholat') {
		if (hasRole(user, 'wali_asuh', 'wali_asrama')) return true;
		if (hasRole(user, 'user')) {
			if (
				!['sholat_zuhur', 'sholat_asar'].includes(
					canonicalAttendanceActivityCode(context?.kode ?? '')
				)
			)
				return false;
			const date = context?.tanggal ?? '';
			const parsed = new Date(`${date}T00:00:00Z`);
			return (
				/^\d{4}-\d{2}-\d{2}$/.test(date) &&
				Number.isFinite(parsed.getTime()) &&
				parsed.toISOString().slice(0, 10) === date &&
				parsed.getUTCDay() >= 1 &&
				parsed.getUTCDay() <= 5
			);
		}
		return false;
	}
	if (scope === 'sekolah') return hasRole(user, 'user');
	if (scope === 'asrama') return hasRole(user, 'wali_asuh', 'wali_asrama');
	return scope === 'semua' && hasRole(user, 'user', 'wali_asuh', 'wali_asrama');
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
