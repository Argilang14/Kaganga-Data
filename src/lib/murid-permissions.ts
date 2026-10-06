type MuridPermissionUser = {
	type?: string | null;
	permissions?: readonly string[] | null;
} | null | undefined;

export function canManageMurid(user: MuridPermissionUser) {
	return (
		user?.type === 'admin' ||
		user?.type === 'wali_kelas' ||
		Boolean(user?.permissions?.includes('kelas_manage'))
	);
}

export function canEditMurid(user: MuridPermissionUser) {
	return canManageMurid(user) || user?.type === 'wali_asrama';
}
