import { hasRole, isFullAccess, type RoleUser } from './user-role.ts';
import { isHomeroomTeacher } from './homeroom-access.ts';

export function canInputMartikulasi(
	user: (NonNullable<RoleUser> & { waliKelasIds?: readonly number[] }) | null | undefined
) {
	return (
		isFullAccess(user) ||
		hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan', 'wali_asuh') ||
		isHomeroomTeacher(user)
	);
}
