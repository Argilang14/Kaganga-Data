import { hasRole, isFullAccess } from './user-role.ts';
import { isHomeroomTeacher } from './homeroom-access.ts';

type MuridPermissionUser =
	| {
			type?: string | null;
			roles?: readonly string[] | null;
			permissions?: readonly string[] | null;
			jabatanAkses?: string | null;
			waliKelasIds?: readonly number[];
	  }
	| null
	| undefined;

export function canManageStudentArchive(user: MuridPermissionUser) {
	return isFullAccess(user) || hasRole(user, 'operator', 'waka_kurikulum');
}

export function canAccessStudentList(
	user: MuridPermissionUser,
	view: 'semua' | 'kelas' | 'asrama' | 'pasif'
) {
	if (!user) return false;
	if (view === 'semua' || view === 'pasif') return true;
	if (view === 'kelas') return canManageStudentArchive(user) || isHomeroomTeacher(user);
	return isFullAccess(user) || hasRole(user, 'operator', 'wali_asrama', 'wali_asuh');
}

export function canManageStudentList(
	user: MuridPermissionUser,
	view: 'semua' | 'kelas' | 'asrama' | 'pasif'
) {
	if (!canAccessStudentList(user, view)) return false;
	if (view === 'semua') return canManageStudentArchive(user);
	if (view === 'asrama') return isFullAccess(user) || hasRole(user, 'operator', 'wali_asrama');
	return (
		canManageStudentArchive(user) ||
		isHomeroomTeacher(user) ||
		(view === 'pasif' && hasRole(user, 'wali_asrama'))
	);
}

export function canRegisterMurid(user: MuridPermissionUser) {
	return canManageStudentList(user, 'pasif');
}

export function canManageMurid(user: MuridPermissionUser) {
	return (
		isFullAccess(user) || hasRole(user, 'operator', 'waka_kurikulum') || isHomeroomTeacher(user)
	);
}

export function canEditMurid(user: MuridPermissionUser) {
	return canManageMurid(user) || hasRole(user, 'wali_asrama');
}
