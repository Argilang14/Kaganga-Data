import { canInputMartikulasi } from '$lib/martikulasi-access';
import { hasRole, isFullAccess } from '$lib/user-role';
import db from './db';
import { tableKelas, tableMurid } from './db/schema';
import { getLegacyWaliKelasIds } from './legacy-wali-kelas';
import { activeMuridFilter } from './murid-query';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

export async function martikulasiStudentCondition(
	user: App.Locals['user'] | null,
	sekolahId: number
) {
	if (!user || !canInputMartikulasi(user) || (!isFullAccess(user) && user.sekolahId !== sekolahId))
		return sql`0`;
	if (isFullAccess(user) || hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan'))
		return eq(tableMurid.sekolahId, sekolahId);
	const ids = await getLegacyWaliKelasIds(user, sekolahId);
	return and(
		eq(tableMurid.sekolahId, sekolahId),
		or(
			ids.length ? inArray(tableMurid.kelasId, ids) : sql`0`,
			hasRole(user, 'wali_asuh') && user.pegawaiId
				? sql`${tableMurid.waliAsuhPegawaiId} = ${user.pegawaiId} AND EXISTS (SELECT 1 FROM pegawai care WHERE care.id=${user.pegawaiId} AND care.sekolah_id=${sekolahId} AND care.status='aktif')`
				: sql`0`
		)
	);
}

export async function martikulasiClassIds(
	user: App.Locals['user'] | null,
	sekolahId: number,
	semesterId: number | null
) {
	if (
		!user ||
		!canInputMartikulasi(user) ||
		!semesterId ||
		(!isFullAccess(user) && user.sekolahId !== sekolahId)
	)
		return [];
	const classes = await db.query.tableKelas.findMany({
		columns: { id: true },
		where: and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, semesterId))
	});
	if (isFullAccess(user) || hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan'))
		return classes.map((row) => row.id);
	const students = await db
		.selectDistinct({ kelasId: tableMurid.kelasId })
		.from(tableMurid)
		.where(
			and(
				await martikulasiStudentCondition(user, sekolahId),
				eq(tableMurid.semesterId, semesterId),
				activeMuridFilter()
			)
		);
	const homeroom = await getLegacyWaliKelasIds(user, sekolahId, semesterId);
	const ids = new Set([...homeroom, ...students.map((row) => row.kelasId)]);
	return classes.filter((row) => ids.has(row.id)).map((row) => row.id);
}
