import { getUserRoles, hasRole, schoolWideAcademic } from './user-role.ts';
export const accessPositionValues = [
	'kepala_sekolah',
	'waka_kesiswaan',
	'waka_kurikulum',
	'waka_sarpras',
	'waka_keasramaan',
	'waka_humas',
	'operator'
] as const;

export type AccessPosition = (typeof accessPositionValues)[number];

export const accessPositionLabels: Record<AccessPosition, string> = {
	kepala_sekolah: 'Kepala Sekolah',
	waka_kesiswaan: 'Waka Kesiswaan',
	waka_kurikulum: 'Waka Kurikulum',
	waka_sarpras: 'Waka Sarana Prasarana',
	waka_keasramaan: 'Waka Keasramaan',
	waka_humas: 'Waka Humas',
	operator: 'Operator'
};

export const leadershipAccessPositions = new Set<AccessPosition>([
	'kepala_sekolah',
	'waka_kesiswaan',
	'waka_kurikulum',
	'waka_sarpras',
	'waka_keasramaan',
	'waka_humas'
]);

export function parseAccessPosition(value: unknown): AccessPosition | null {
	return accessPositionValues.includes(value as AccessPosition) ? (value as AccessPosition) : null;
}

export function isLeadershipAccessPosition(value: unknown): value is AccessPosition {
	return leadershipAccessPositions.has(value as AccessPosition);
}

export function hasSchoolWideOperationalAccess(
	user?: {
		type?: string | null;
		roles?: readonly string[] | null;
		jabatanAkses?: string | null;
	} | null
) {
	return getUserRoles(user).some((role) =>
		[
			'admin',
			'kepala_sekolah',
			'operator',
			'waka_kurikulum',
			'waka_kesiswaan',
			'waka_sarpras',
			'waka_keasramaan',
			'waka_humas'
		].includes(role)
	);
}

export function isRestrictedTeacher(
	user?: {
		type?: string | null;
		roles?: readonly string[] | null;
		jabatanAkses?: string | null;
		waliKelasIds?: readonly number[];
	} | null,
	selectedClass?: number | null
) {
	if (selectedClass && user?.waliKelasIds?.includes(selectedClass)) return false;
	return hasRole(user, 'user') && !schoolWideAcademic(user);
}
