import db from '$lib/server/db';
import { tableAuthUserKelas, tableKelas, tablePegawai } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export type LegacyWaliKelasUser = {
	type?: string | null;
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
	if (!isLegacyWaliKelas(user) || (user.sekolahId && user.sekolahId !== sekolahId)) return [];
	const pegawaiId = Number(user.pegawaiId);
	if (Number.isInteger(pegawaiId) && pegawaiId > 0) {
		const pegawai = await db.query.tablePegawai.findFirst({ columns: { id: true }, where: and(eq(tablePegawai.id, pegawaiId), eq(tablePegawai.sekolahId, sekolahId)) });
		if (!pegawai) return [];
	}
	let assignedIds: number[] = [];
	if (user.id && user.permissions?.includes('kelas_pindah')) {
		const links = await db.query.tableAuthUserKelas.findMany({
			columns: { kelasId: true }, where: eq(tableAuthUserKelas.authUserId, user.id)
		});
		if (links.length) {
			const allowed = await db.query.tableKelas.findMany({
				columns: { id: true },
				where: and(inArray(tableKelas.id, links.map((link) => link.kelasId)), eq(tableKelas.sekolahId, sekolahId), semesterId ? eq(tableKelas.semesterId, semesterId) : undefined)
			});
			assignedIds = allowed.map((row) => row.id);
		}
	}

	if (Number.isInteger(pegawaiId) && pegawaiId > 0) {
		const rows = await db.query.tableKelas.findMany({
			columns: { id: true },
			where: and(
				eq(tableKelas.sekolahId, sekolahId),
				eq(tableKelas.waliKelasId, pegawaiId),
				semesterId ? eq(tableKelas.semesterId, semesterId) : undefined
			)
		});
		return [...new Set([...rows.map((row) => row.id), ...assignedIds])];
	}

	// Fallback untuk akun sangat lama yang belum terhubung ke Data Pegawai.
	const kelasId = Number(user.kelasId);
	if (!Number.isInteger(kelasId) || kelasId <= 0) return assignedIds;
	const legacyClass = await db.query.tableKelas.findFirst({
		columns: { id: true },
		where: and(
			eq(tableKelas.id, kelasId),
			eq(tableKelas.sekolahId, sekolahId),
			semesterId ? eq(tableKelas.semesterId, semesterId) : undefined
		)
	});
	return [...new Set([...(legacyClass ? [legacyClass.id] : []), ...assignedIds])];
}

export async function canLegacyWaliKelasAccess(
	user: LegacyWaliKelasUser,
	sekolahId: number,
	kelasId: number
) {
	if (!isLegacyWaliKelas(user) || (user.sekolahId && user.sekolahId !== sekolahId)) return false;

	const pegawaiId = Number(user.pegawaiId);
	if (Number.isInteger(pegawaiId) && pegawaiId > 0) {
		const pegawai = await db.query.tablePegawai.findFirst({ columns: { id: true }, where: and(eq(tablePegawai.id, pegawaiId), eq(tablePegawai.sekolahId, sekolahId)) });
		if (!pegawai) return false;
	}
	const fallbackKelasId = Number(user.kelasId);
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, waliKelasId: true },
		where: and(
			eq(tableKelas.id, kelasId),
			eq(tableKelas.sekolahId, sekolahId)
		)
	});
	if (!kelas) return false;
	if (Number.isInteger(pegawaiId) && pegawaiId > 0 ? kelas.waliKelasId === pegawaiId : kelas.id === fallbackKelasId) return true;
	if (!user.id || !user.permissions?.includes('kelas_pindah')) return false;
	const assigned = await db.query.tableAuthUserKelas.findFirst({
		columns: { id: true },
		where: and(eq(tableAuthUserKelas.authUserId, user.id), eq(tableAuthUserKelas.kelasId, kelasId))
	});
	return Boolean(assigned);
}
