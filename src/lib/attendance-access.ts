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
		(['user', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'tim_dapur'].includes(user.type ?? '') ||
			user.permissions?.includes('administrasi_absensi') === true)
	);
}

export function canViewAttendanceActivity(user: AttendanceUser, category?: string) {
	return user?.type !== 'tim_dapur' || hasSchoolWideOperationalAccess(user) || category === 'makan';
}

export function hasSchoolWideAttendanceStudentAccess(user: AttendanceUser, sekolahId: number) {
	return (
		user?.type === 'wali_asrama' && user.sekolahId === sekolahId && canAttendance(user, 'lihat')
	);
}

export type AttendanceActivityContext = { kode?: string; tanggal?: string };

export function canAttendActivity(
	user: AttendanceUser,
	scope: string,
	category?: string,
	context?: AttendanceActivityContext
) {
	if (!canAttendance(user, 'input')) return false;
	if (hasSchoolWideOperationalAccess(user)) return true;
	if (user?.type === 'tim_dapur') return category === 'makan';
	if (category === 'sholat') {
		if (['wali_asuh', 'wali_asrama'].includes(user?.type ?? '')) return true;
		if (['user', 'wali_kelas'].includes(user?.type ?? '')) {
			if (
				!['sholat_zuhur', 'sholat_dzuhur', 'sholat_asar', 'sholat_ashar'].includes(
					context?.kode ?? ''
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
