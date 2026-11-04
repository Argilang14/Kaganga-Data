import { hasRole } from '$lib/user-role';
import {
	accessibleClassIds as assignedClasses,
	studentAccessCondition as assignedStudents,
	assertStudentAccess as assignedStudent
} from './student-access';
type User = App.Locals['user'] | null;
function scope(user: User, category?: string) {
	return category === 'makan' ||
		(category === undefined &&
			hasRole(user, 'tim_dapur') &&
			!hasRole(user, 'user', 'wali_asuh', 'wali_asrama'))
		? ('meal' as const)
		: ('attendance' as const);
}
export function accessibleClassIds(user: User, sekolahId: number, semesterId?: number | null) {
	return assignedClasses(user, sekolahId, semesterId, 'attendance');
}
export function studentAccessCondition(
	user: User,
	sekolahId: number,
	semesterId?: number | null,
	category?: string
) {
	return assignedStudents(user, sekolahId, semesterId, scope(user, category));
}
export function assertStudentAccess(
	user: User,
	sekolahId: number,
	muridId: number,
	active = false,
	category?: string
) {
	return assignedStudent(user, sekolahId, muridId, active, scope(user, category));
}
