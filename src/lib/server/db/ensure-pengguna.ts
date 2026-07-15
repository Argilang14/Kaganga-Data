import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';

let ensured = false;

export async function ensurePenggunaIdentitySchema() {
	if (ensured) return;
	await ensurePegawaiSchema();

	await db.$client.execute(`
		UPDATE auth_user
		SET sekolah_id = COALESCE(
			(SELECT p.sekolah_id FROM pegawai p WHERE p.id = auth_user.pegawai_id),
			(SELECT k.sekolah_id FROM kelas k WHERE k.id = auth_user.kelas_id)
		)
		WHERE sekolah_id IS NULL
			AND type != 'admin'
			AND COALESCE(
				(SELECT p.sekolah_id FROM pegawai p WHERE p.id = auth_user.pegawai_id),
				(SELECT k.sekolah_id FROM kelas k WHERE k.id = auth_user.kelas_id)
			) IS NOT NULL
	`);

	ensured = true;
}
