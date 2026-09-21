import db from '$lib/server/db';
import { tableKelas } from '$lib/server/db/schema';
import { canLegacyWaliKelasAccess } from '$lib/server/legacy-wali-kelas';
import { and, eq } from 'drizzle-orm';

type ClassManager = {
	id?: number;
	type?: string;
	sekolahId?: number | null;
	pegawaiId?: number | null;
	kelasId?: number | null;
	permissions?: string[] | null;
} | null | undefined;

export async function canManageKelas(user: ClassManager, sekolahId: number, kelasId: number) {
	if (!user || !Number.isInteger(kelasId) || !Number.isInteger(sekolahId)) return false;
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, waliKelasId: true },
		where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!kelas || (user.sekolahId && user.sekolahId !== sekolahId)) return false;
	if (user.type === 'admin') return true;
	return user.type === 'wali_kelas' && canLegacyWaliKelasAccess(user, sekolahId, kelasId);
}
