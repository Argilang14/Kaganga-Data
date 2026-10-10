import {
	accessibleClassIds as assignedClasses,
	studentAccessCondition as assignedStudents,
	assertStudentAccess as assignedStudent
} from './student-access';

type User = App.Locals['user'] | null;

// Attendance scope is intentionally separate from grades and student administration.
export function accessibleClassIds(user: User, sekolahId: number, semesterId?: number | null) {
	return assignedClasses(user, sekolahId, semesterId, 'attendance');
}

export function studentAccessCondition(user: User, sekolahId: number, semesterId?: number | null) {
	return assignedStudents(user, sekolahId, semesterId, 'attendance');
}

export function assertStudentAccess(
	user: User,
	sekolahId: number,
	muridId: number,
	active = false
) {
	return assignedStudent(user, sekolahId, muridId, active, 'attendance');
}
