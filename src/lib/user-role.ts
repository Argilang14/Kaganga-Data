import { parseAccessPosition, type AccessPosition } from './access-position.ts';

export const creatableUserRoles = [
	'user',
	'wali_asuh',
	'wali_asrama',
	'tim_dapur',
	'operator'
] as const;
export type CreatableUserRole = (typeof creatableUserRoles)[number];
export const userRoleLabels: Record<CreatableUserRole, string> = {
	user: 'Guru Mapel',
	wali_asuh: 'Wali Asuh',
	wali_asrama: 'Wali Asrama',
	tim_dapur: 'Tim Dapur',
	operator: 'Operator'
};

export function parseCreatableUserRole(value: unknown): CreatableUserRole | null {
	return creatableUserRoles.includes(value as CreatableUserRole)
		? (value as CreatableUserRole)
		: null;
}

// Operator reuses the existing access position so installed accounts need no migration.
export function resolveUserRole(
	role: unknown,
	position?: unknown
): {
	type: Exclude<CreatableUserRole, 'operator'>;
	jabatanAkses: AccessPosition | null;
} | null {
	const parsedRole = parseCreatableUserRole(role);
	const jabatanAkses = parseAccessPosition(position);
	if (!parsedRole || (position && !jabatanAkses)) return null;
	if (parsedRole === 'operator') {
		if (jabatanAkses && jabatanAkses !== 'operator') return null;
		return { type: 'user', jabatanAkses: 'operator' };
	}
	return { type: parsedRole, jabatanAkses };
}

export function displayedUserRole(user: { type?: string | null; jabatanAkses?: string | null }) {
	return user.type === 'user' && user.jabatanAkses === 'operator' ? 'operator' : user.type;
}

export function userRoleLabel(user: { type?: string | null; jabatanAkses?: string | null }) {
	const role = displayedUserRole(user);
	const parsed = parseCreatableUserRole(role);
	if (parsed) return userRoleLabels[parsed];
	if (role === 'wali_kelas') return 'Wali Kelas';
	if (role === 'wali_murid') return 'Wali Murid';
	if (role === 'admin') return 'Admin';
	return (role ?? '').replaceAll('_', ' ');
}
