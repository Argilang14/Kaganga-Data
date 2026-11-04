import db from '$lib/server/db';
import { tableKelas } from '$lib/server/db/schema';
import { getLegacyWaliKelasIds } from '$lib/server/legacy-wali-kelas';
import { and, eq } from 'drizzle-orm';
import { isFullAccess, hasRole } from '$lib/user-role';

type ClassManager =
	| {
			id?: number;
			type?: string;
			roles?: readonly string[] | null;
			sekolahId?: number | null;
			pegawaiId?: number | null;
			kelasId?: number | null;
			permissions?: string[] | null;
			jabatanAkses?: string | null;
	  }
	| null
	| undefined;

export async function canManageKelas(user: ClassManager, sekolahId: number, kelasId: number) {
	if (!user || !Number.isInteger(kelasId) || !Number.isInteger(sekolahId)) return false;
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, waliKelasId: true },
		where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!kelas || (user.sekolahId && user.sekolahId !== sekolahId)) return false;
	if (isFullAccess(user) || hasRole(user, 'operator', 'waka_kurikulum', 'waka_kesiswaan'))
		return true;
	return (await getLegacyWaliKelasIds(user, sekolahId)).includes(kelasId);
}
