import { roleGrants } from './role-policy.ts';
import { hasRole, isFullAccess } from './user-role.ts';
import { hasSchoolWideOperationalAccess } from './access-position.ts';
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
	return (
		hasSchoolWideOperationalAccess(user) &&
		(roleGrants(user, 'murid_arsip') || Boolean(user?.permissions?.includes('murid_arsip')))
	);
}

export function canAccessStudentList(
	user: MuridPermissionUser,
	view: 'semua' | 'kelas' | 'asrama' | 'pasif'
) {
	if (!user) return false;
	if (
		isFullAccess(user) ||
		hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan', 'waka_keasramaan')
	)
		return true;
	if (view === 'kelas') return isHomeroomTeacher(user);
	if (view === 'asrama') return hasRole(user, 'wali_asrama');
	if (view === 'semua' && canManageStudentArchive(user)) return true;
	return (
		isHomeroomTeacher(user) ||
		hasRole(user, 'wali_asrama') ||
		Boolean(user.permissions?.includes('kelas_manage'))
	);
}

export function canRegisterMurid(user: MuridPermissionUser) {
	return canAccessStudentList(user, 'pasif');
}

export function canManageMurid(user: MuridPermissionUser) {
	return (
		isFullAccess(user) ||
		hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan') ||
		isHomeroomTeacher(user) ||
		Boolean(user?.permissions?.includes('kelas_manage'))
	);
}

export function canEditMurid(user: MuridPermissionUser) {
	return canManageMurid(user) || hasRole(user, 'wali_asrama');
}
