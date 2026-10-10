import db from './db';
import { tableKelas, tableMurid } from './db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';
import { canAccessExportClass } from './class-export-access';
import { guardianStudentCondition } from './assignment-summary';
import { activeMuridFilter } from './murid-query';
import { hasSchoolWideAttendanceStudentAccess } from '$lib/attendance-access';

export type StudentAccessScope = 'assigned' | 'attendance';
function schoolWide(user: App.Locals['user'] | null, sekolahId: number, scope: StudentAccessScope) {
	return (
		hasSchoolWideOperationalAccess(user) ||
		(scope === 'attendance' && hasSchoolWideAttendanceStudentAccess(user, sekolahId))
	);
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
				if (schoolWide(user, sekolahId, scope)) return rows.map((row) => row.id);
				const ids: number[] = [];
				for (const row of rows)
					if (await canAccessExportClass(user, sekolahId, row.id)) ids.push(row.id);
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
	const ids = await accessibleClassIds(user, sekolahId, semesterId, scope);
	return and(
		eq(tableMurid.sekolahId, sekolahId),
		ids.length ? inArray(tableMurid.kelasId, ids) : sql`0`,
		semesterId ? eq(tableMurid.semesterId, semesterId) : undefined,
		schoolWide(user, sekolahId, scope) ? undefined : await guardianStudentCondition(user, sekolahId)
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
