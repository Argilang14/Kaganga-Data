import db from './db';
import { hasRole } from '$lib/user-role';
import { tableAuthUserKelas, tableKelas, tableMurid } from './db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { canLegacyWaliKelasAccess, getLegacyWaliKelasIds } from './legacy-wali-kelas';
import { hasClassExportAccess } from '../export-access';
import { guardianStudentCondition } from './assignment-summary';

export async function canAccessExportClass(
	user: App.Locals['user'],
	sekolahId: number,
	kelasId: number,
	{ includeHomeroom = true, schoolWide = true, includeGuardians = true } = {}
) {
	if (!user || !Number.isSafeInteger(kelasId) || kelasId <= 0) return false;
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, sekolahId: true, nama: true, semesterId: true, tahunAjaranId: true },
		where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!kelas) return false;
	let assigned = false;
	if (user.type === 'wali_kelas') {
		assigned = await canLegacyWaliKelasAccess(user, sekolahId, kelasId);
	} else if (hasRole(user, 'user')) {
		const records = await db.query.tableAuthUserKelas.findMany({
			columns: { kelasId: true },
			where: eq(tableAuthUserKelas.authUserId, user.id)
		});
		const ids = [
			...new Set([...records.map((row) => row.kelasId), ...(user.kelasId ? [user.kelasId] : [])])
		];
		const assignments = ids.length
			? await db.query.tableKelas.findMany({
					columns: { id: true, nama: true, semesterId: true, tahunAjaranId: true },
					where: and(inArray(tableKelas.id, ids), eq(tableKelas.sekolahId, sekolahId))
				})
			: [];
		assigned =
			assignments.some((row) => row.id === kelasId) ||
			(includeHomeroom && (await getLegacyWaliKelasIds(user, sekolahId)).includes(kelasId));
	}
	if (
		!assigned &&
		includeGuardians &&
		hasRole(user, 'wali_asuh', 'wali_asrama') &&
		user.pegawaiId
	) {
		assigned = Boolean(
			await db.query.tableMurid.findFirst({
				columns: { id: true },
				where: and(
					eq(tableMurid.sekolahId, sekolahId),
					eq(tableMurid.kelasId, kelasId),
					await guardianStudentCondition(user, sekolahId)
				)
			})
		);
	}
	return schoolWide
		? hasClassExportAccess({ user, sekolahId, classSchoolId: kelas.sekolahId, assigned })
		: user.sekolahId === sekolahId && assigned;
}
