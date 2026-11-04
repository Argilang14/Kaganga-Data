export const creatableUserRoles = [
	'user',
	'wali_asuh',
	'wali_asrama',
	'tim_dapur',
	'tim_keamanan',
	'operator',
	'kepala_sekolah',
	'waka_kurikulum',
	'waka_kesiswaan',
	'waka_sarpras',
	'waka_keasramaan',
	'waka_humas'
] as const;
export type CreatableUserRole = (typeof creatableUserRoles)[number];
export type UserRole = CreatableUserRole | 'admin' | 'wali_murid';
export type RoleUser =
	| { type?: string | null; roles?: readonly string[] | null; jabatanAkses?: string | null }
	| null
	| undefined;
export const userRoleLabels: Record<CreatableUserRole, string> = {
	user: 'Guru Mapel',
	wali_asuh: 'Wali Asuh',
	wali_asrama: 'Wali Asrama',
	tim_dapur: 'Tim Dapur',
	tim_keamanan: 'Tim Keamanan',
	operator: 'Operator',
	kepala_sekolah: 'Kepala Sekolah',
	waka_kurikulum: 'Waka Kurikulum',
	waka_kesiswaan: 'Waka Kesiswaan',
	waka_sarpras: 'Waka Sarpras',
	waka_keasramaan: 'Waka Keasramaan',
	waka_humas: 'Waka Humas'
};
export function parseCreatableUserRole(value: unknown): CreatableUserRole | null {
	return creatableUserRoles.includes(value as CreatableUserRole)
		? (value as CreatableUserRole)
		: null;
}
export function parseUserRoles(value: unknown): CreatableUserRole[] | null {
	if (!Array.isArray(value) || !value.length || value.some((role) => !parseCreatableUserRole(role)))
		return null;
	return [...new Set(value)] as CreatableUserRole[];
}
export function getUserRoles(user: RoleUser): UserRole[] {
	if (!user) return [];
	if (user.roles != null)
		return [
			...new Set(
				user.roles.filter(
					(role) => role === 'admin' || role === 'wali_murid' || parseCreatableUserRole(role)
				)
			)
		] as UserRole[];
	if (user.type === 'admin' || user.type === 'wali_murid') return [user.type];
	const position = parseCreatableUserRole(user.jabatanAkses);
	const role = user.type === 'wali_kelas' ? 'user' : parseCreatableUserRole(user.type);
	return [...new Set([...(role ? [role] : []), ...(position ? [position] : [])])];
}
export function hasRole(user: RoleUser, ...roles: UserRole[]) {
	return getUserRoles(user).some((role) => roles.includes(role));
}
export function isFullAccess(user: RoleUser) {
	return hasRole(user, 'admin', 'kepala_sekolah');
}
export function schoolWideAcademic(user: RoleUser) {
	return isFullAccess(user) || hasRole(user, 'waka_kurikulum', 'operator');
}
export function schoolWideDorm(user: RoleUser) {
	return schoolWideAcademic(user) || hasRole(user, 'waka_keasramaan');
}
// ponytail: legacy type remains for installed modules; roles determines access.
export function legacyUserType(roles: readonly UserRole[]) {
	if (roles.includes('admin')) return 'admin' as const;
	if (roles.includes('wali_murid')) return 'wali_murid' as const;
	if (
		roles.some((role) => !['wali_asuh', 'wali_asrama', 'tim_dapur', 'tim_keamanan'].includes(role))
	)
		return 'user' as const;
	return roles[0] as 'wali_asuh' | 'wali_asrama' | 'tim_dapur' | 'tim_keamanan';
}
export function resolveUserRole(role: unknown, position?: unknown) {
	const parsed = parseCreatableUserRole(role);
	const legacyPosition = position ? parseCreatableUserRole(position) : null;
	if (!parsed || (position && !legacyPosition) || (parsed === 'tim_keamanan' && position))
		return null;
	const roles = [...new Set([parsed, ...(legacyPosition ? [legacyPosition] : [])])];
	return { type: legacyUserType(roles), roles, jabatanAkses: null };
}
export function displayedUserRole(user: RoleUser) {
	const roles = getUserRoles(user);
	return roles.find((role) => role !== 'user') ?? roles[0] ?? user?.type;
}
export function userRoleLabel(user: RoleUser) {
	return (
		getUserRoles(user)
			.map((role) =>
				role === 'admin' ? 'Admin' : role === 'wali_murid' ? 'Wali Murid' : userRoleLabels[role]
			)
			.join(', ') || (user?.type === 'wali_kelas' ? 'Wali Kelas' : '-')
	);
}
export function resolveFormRoles(form: FormData) {
	if (!form.has('roles'))
		return resolveUserRole(
			form.get('type') === 'wali_kelas' ? 'user' : form.get('type'),
			form.get('jabatanAkses')
		);
	try {
		const roles = parseUserRoles(JSON.parse(String(form.get('roles'))));
		return roles ? { type: legacyUserType(roles), roles, jabatanAkses: null } : null;
	} catch {
		return null;
	}
}
export function employeeSupportsRoles(kind: string, roles: readonly UserRole[]) {
	const kinds: Partial<Record<UserRole, string[]>> = {
		user: ['guru', 'kepala_sekolah'],
		wali_asuh: ['wali_asuh'],
		wali_asrama: ['wali_asrama'],
		tim_dapur: ['tim_dapur', 'lainnya'],
		tim_keamanan: ['keamanan']
	};
	return roles.some((role) => !kinds[role] || kinds[role]!.includes(kind));
}
