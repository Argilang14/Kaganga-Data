import db from '$lib/server/db';
import { tableAuthUserMataPelajaran, tableMataPelajaran } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

function normalize(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? '';
}

export async function userCanAccessMapelByName(
	user: {
		id?: number;
		type?: string;
		mataPelajaranId?: number | null;
		permissions?: string[];
	} | null,
	mapel: { id: number; nama: string | null }
) {
	if (!user) return false;
	if (user.type === 'admin' || user.type === 'wali_kelas') return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	if (permissions.includes('rapor_manage')) return true;
	if (user.type !== 'user' || !user.id) return false;

	const assignments = await db.query.tableAuthUserMataPelajaran.findMany({
		columns: { mataPelajaranId: true },
		where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
	});
	const assignedIds = assignments.map((item) => item.mataPelajaranId);
	if (assignedIds.length === 0 && user.mataPelajaranId) {
		assignedIds.push(Number(user.mataPelajaranId));
	}
	if (!assignedIds.length) return false;
	if (assignedIds.includes(mapel.id)) return true;

	const assignedMapels = await db.query.tableMataPelajaran.findMany({
		columns: { nama: true },
		where: inArray(tableMataPelajaran.id, assignedIds)
	});
	const allowedNames = new Set(assignedMapels.map((item) => normalize(item.nama)));
	return allowedNames.has(normalize(mapel.nama));
}
