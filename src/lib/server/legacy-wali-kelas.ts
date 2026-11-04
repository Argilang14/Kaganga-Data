import { hasRole } from '$lib/user-role';
import db from '$lib/server/db';
import { tableKelas, tablePegawai, tableSemester, tableTahunAjaran } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export type LegacyWaliKelasUser = {
	type?: string | null;
	roles?: readonly string[] | null;
	pegawaiId?: number | null;
	kelasId?: number | null;
	sekolahId?: number | null;
	id?: number | null;
	permissions?: string[] | null;
};

export function isLegacyWaliKelas(
	user: LegacyWaliKelasUser | null | undefined
): user is LegacyWaliKelasUser & { type: 'wali_kelas' } {
	return user?.type === 'wali_kelas';
}

export async function getLegacyWaliKelasIds(
	user: LegacyWaliKelasUser,
	sekolahId: number,
	semesterId?: number | null
) {
	if (
		(!hasRole(user, 'user') && user.type !== 'wali_kelas') ||
		(user.sekolahId && user.sekolahId !== sekolahId) ||
		!user.pegawaiId
	)
		return [];
	const employee = await db.query.tablePegawai.findFirst({
		columns: { id: true },
		where: and(
			eq(tablePegawai.id, user.pegawaiId),
			eq(tablePegawai.sekolahId, sekolahId),
			eq(tablePegawai.status, 'aktif')
		)
	});
	if (!employee) return [];
	const rows = await db
		.select({ id: tableKelas.id })
		.from(tableKelas)
		.innerJoin(tableSemester, eq(tableSemester.id, tableKelas.semesterId))
		.innerJoin(tableTahunAjaran, eq(tableTahunAjaran.id, tableSemester.tahunAjaranId))
		.where(
			and(
				eq(tableKelas.sekolahId, sekolahId),
				eq(tableKelas.waliKelasId, user.pegawaiId),
				eq(tableSemester.isAktif, true),
				eq(tableTahunAjaran.isAktif, true),
				semesterId ? eq(tableKelas.semesterId, semesterId) : undefined
			)
		);
	return rows.map((row) => row.id);
}
export async function canLegacyWaliKelasAccess(
	user: LegacyWaliKelasUser,
	sekolahId: number,
	kelasId: number
) {
	return (await getLegacyWaliKelasIds(user, sekolahId)).includes(kelasId);
}
