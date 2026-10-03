export const accessPositionValues = [
	'kepala_sekolah',
	'waka_kesiswaan',
	'waka_kurikulum',
	'waka_sarpras',
	'waka_keasramaan',
	'operator'
] as const;

export type AccessPosition = (typeof accessPositionValues)[number];

export const accessPositionLabels: Record<AccessPosition, string> = {
	kepala_sekolah: 'Kepala Sekolah',
	waka_kesiswaan: 'Waka Kesiswaan',
	waka_kurikulum: 'Waka Kurikulum',
	waka_sarpras: 'Waka Sarana Prasarana',
	waka_keasramaan: 'Waka Keasramaan',
	operator: 'Operator'
};

export const leadershipAccessPositions = new Set<AccessPosition>([
	'kepala_sekolah',
	'waka_kesiswaan',
	'waka_kurikulum',
	'waka_sarpras',
	'waka_keasramaan'
]);

export function parseAccessPosition(value: unknown): AccessPosition | null {
	return accessPositionValues.includes(value as AccessPosition) ? (value as AccessPosition) : null;
}

export function isLeadershipAccessPosition(value: unknown): value is AccessPosition {
	return leadershipAccessPositions.has(value as AccessPosition);
}

export function hasSchoolWideOperationalAccess(
	user?: { type?: string | null; jabatanAkses?: string | null } | null
) {
	return user?.type === 'admin' || parseAccessPosition(user?.jabatanAkses) !== null;
}
