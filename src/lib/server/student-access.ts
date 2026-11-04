import { hasRole, schoolWideAcademic, isFullAccess } from '$lib/user-role';
import { canRegisterMurid } from '$lib/murid-permissions';
import { dormGuardianCondition } from './dormitory-membership';
import { getLegacyWaliKelasIds } from './legacy-wali-kelas';
import { isHomeroomTeacher } from '$lib/homeroom-access';
import db from './db';
import { tableKelas, tableMurid } from './db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { canAccessExportClass } from './class-export-access';
import { guardianStudentCondition } from './assignment-summary';
import { activeMuridFilter } from './murid-query';
import { hasSchoolWideAttendanceStudentAccess } from '$lib/attendance-access';

export type StudentAccessScope = 'assigned' | 'attendance' | 'academic' | 'meal';
function schoolWide(user: App.Locals['user'] | null, sekolahId: number, scope: StudentAccessScope) {
	return scope === 'attendance' || scope === 'meal'
		? hasSchoolWideAttendanceStudentAccess(user, sekolahId) ||
				(scope === 'meal' && hasRole(user, 'tim_dapur'))
		: scope === 'academic'
			? schoolWideAcademic(user)
			: isFullAccess(user) ||
				hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan', 'waka_keasramaan');
}

const scopes = new WeakMap<object, Map<string, Promise<number[]>>>();
export async function accessibleClassIds(
	user: App.Locals['user'] | null,
	sekolahId: number,
	semesterId?: number | null,
	scope: StudentAccessScope = 'assigned'
) {
	if (!user || (user.type !== 'admin' && user.sekolahId !== sekolahId)) return [];
	let cache = scopes.get(user);
	if (!cache) {
		cache = new Map();
		scopes.set(user, cache);
	}
	const key = `${scope}:${sekolahId}:${semesterId ?? 'all'}`;
	if (!cache.has(key))
		cache.set(
			key,
			(async () => {
				const rows = await db.query.tableKelas.findMany({
					columns: { id: true },
					where: and(
						eq(tableKelas.sekolahId, sekolahId),
						semesterId ? eq(tableKelas.semesterId, semesterId) : undefined
					)
				});
				if (
					schoolWide(user, sekolahId, scope) ||
					(scope === 'attendance' && hasRole(user, 'tim_dapur'))
				)
					return rows.map((row) => row.id);
				const ids: number[] = [];
				for (const row of rows)
					if (
						await canAccessExportClass(user, sekolahId, row.id, {
							schoolWide: false,
							includeGuardians: scope !== 'academic'
						})
					)
						ids.push(row.id);
				return ids;
			})()
		);
	return cache.get(key)!;
}

export async function studentAccessCondition(
	user: App.Locals['user'] | null,
	sekolahId: number,
	semesterId?: number | null,
	scope: StudentAccessScope = 'assigned'
) {
	const ids = await accessibleClassIds(user, sekolahId, semesterId, 'academic');
	const guardian =
		scope !== 'academic' && hasRole(user, 'wali_asuh', 'wali_asrama')
			? await guardianStudentCondition(user, sekolahId)
			: undefined;
	return and(
		eq(tableMurid.sekolahId, sekolahId),
		semesterId ? eq(tableMurid.semesterId, semesterId) : undefined,
		schoolWide(user, sekolahId, scope)
			? undefined
			: or(
					guardian ?? sql`0`,
					hasRole(user, 'user') && ids.length ? inArray(tableMurid.kelasId, ids) : sql`0`
				)
	);
}

export async function assertStudentAccess(
	user: App.Locals['user'] | null,
	sekolahId: number,
	muridId: number,
	active = false,
	scope: StudentAccessScope = 'assigned'
) {
	const row = await db.query.tableMurid.findFirst({
		columns: { id: true, kelasId: true, semesterId: true },
		where: and(
			eq(tableMurid.id, muridId),
			await studentAccessCondition(user, sekolahId, undefined, scope),
			active ? activeMuridFilter() : undefined
		)
	});
	return row ?? null;
}

export async function canEditStudentRecord(
	locals: App.Locals,
	student: Pick<typeof tableMurid.$inferSelect, 'id' | 'sekolahId' | 'kelasId'>
) {
	const user = locals.user;
	if (
		!user ||
		student.sekolahId !== locals.sekolah?.id ||
		(user.type !== 'admin' && user.sekolahId !== student.sekolahId)
	)
		return false;
	if (isFullAccess(user) || hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan'))
		return true;
	if (!student.kelasId && canRegisterMurid(user)) return true;
	if (
		isHomeroomTeacher(user) &&
		student.kelasId &&
		(await getLegacyWaliKelasIds(user, student.sekolahId)).includes(student.kelasId)
	)
		return true;
	if (hasRole(user, 'wali_asrama') && user.pegawaiId) {
		const found = await db.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(
				eq(tableMurid.id, student.id),
				dormGuardianCondition(student.sekolahId, user.pegawaiId)
			)
		});
		return Boolean(found);
	}
	return false;
}
