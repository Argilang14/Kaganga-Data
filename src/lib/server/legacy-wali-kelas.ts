import db from '$lib/server/db';
import { tableKelas } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export type LegacyWaliKelasUser = {
	type?: string | null;
	pegawaiId?: number | null;
	kelasId?: number | null;
	sekolahId?: number | null;
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
	if (!isLegacyWaliKelas(user)) return [];

	const pegawaiId = Number(user.pegawaiId);
	if (Number.isInteger(pegawaiId) && pegawaiId > 0) {
		const rows = await db.query.tableKelas.findMany({
			columns: { id: true },
			where: and(
				eq(tableKelas.sekolahId, sekolahId),
				eq(tableKelas.waliKelasId, pegawaiId),
				semesterId ? eq(tableKelas.semesterId, semesterId) : undefined
			)
		});
		return rows.map((row) => row.id);
	}

	// Fallback untuk akun sangat lama yang belum terhubung ke Data Pegawai.
	const kelasId = Number(user.kelasId);
	if (!Number.isInteger(kelasId) || kelasId <= 0) return [];
	const legacyClass = await db.query.tableKelas.findFirst({
		columns: { id: true },
		where: and(
			eq(tableKelas.id, kelasId),
			eq(tableKelas.sekolahId, sekolahId),
			semesterId ? eq(tableKelas.semesterId, semesterId) : undefined
		)
	});
	return legacyClass ? [legacyClass.id] : [];
}

export async function canLegacyWaliKelasAccess(
	user: LegacyWaliKelasUser,
	sekolahId: number,
	kelasId: number
) {
	if (!isLegacyWaliKelas(user)) return false;

	const pegawaiId = Number(user.pegawaiId);
	const fallbackKelasId = Number(user.kelasId);
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true },
		where: and(
			eq(tableKelas.id, kelasId),
			eq(tableKelas.sekolahId, sekolahId),
			Number.isInteger(pegawaiId) && pegawaiId > 0
				? eq(tableKelas.waliKelasId, pegawaiId)
				: eq(tableKelas.id, fallbackKelasId)
		)
	});
	return Boolean(kelas);
}
