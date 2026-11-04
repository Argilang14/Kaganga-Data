import { isFullAccess, hasRole } from './user-role.ts';

export type ExportUser = {
	type?: string;
	roles?: readonly string[] | null;
	jabatanAkses?: string | null;
	sekolahId?: number | null;
	permissions?: readonly string[] | null;
};

export function canDownloadDatabaseBackup(user?: ExportUser | null) {
	return isFullAccess(user);
}

export function canExportClassData(
	user: ExportUser | null | undefined,
	kind: 'absensi' | 'keasramaan'
) {
	if (!user) return false;
	if (canDownloadDatabaseBackup(user) || user.type === 'wali_kelas') return true;
	if (kind === 'keasramaan' && (user.type === 'wali_asuh' || user.type === 'wali_asrama'))
		return true;
	return (
		user.permissions?.includes(
			kind === 'absensi' ? 'administrasi_absensi' : 'mata_pelajaran_keasramaan'
		) === true
	);
}

export function hasClassExportAccess(input: {
	user: ExportUser | null | undefined;
	sekolahId: number;
	classSchoolId: number;
	assigned: boolean;
}) {
	const { user, sekolahId, classSchoolId, assigned } = input;
	if (!user || !Number.isSafeInteger(sekolahId) || sekolahId <= 0 || classSchoolId !== sekolahId)
		return false;
	if (user.type === 'admin') return true;
	if (user.sekolahId !== sekolahId) return false;
	if (
		hasRole(
			user,
			'operator',
			'kepala_sekolah',
			'waka_kurikulum',
			'waka_kesiswaan',
			'waka_keasramaan'
		)
	)
		return true;
	if (user.type === 'tim_dapur') return true;
	return hasRole(user, 'user', 'wali_asuh', 'wali_asrama') && assigned;
}
