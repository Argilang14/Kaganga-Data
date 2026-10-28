import { ensureSchema } from './ensure-helper';

export async function ensureAttendanceIllnessSchema() {
	await ensureSchema('attendance-illness-v1', [
		`CREATE TABLE IF NOT EXISTS absensi_masa_sakit (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			sekolah_id integer NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			semester_id integer NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
			murid_id integer NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
			tanggal_mulai text NOT NULL,
			tanggal_selesai text NOT NULL,
			sumber text NOT NULL,
			catatan text,
			petugas_user_id integer REFERENCES auth_user(id) ON DELETE SET NULL,
			kembali_pada text,
			kembali_oleh integer REFERENCES auth_user(id) ON DELETE SET NULL,
			dibatalkan_pada text,
			created_at text NOT NULL,
			updated_at text,
			CHECK(tanggal_selesai >= tanggal_mulai)
		)`,
		`CREATE INDEX IF NOT EXISTS absensi_masa_sakit_context_idx
			ON absensi_masa_sakit(sekolah_id, semester_id, murid_id, tanggal_mulai)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS absensi_masa_sakit_source_idx
			ON absensi_masa_sakit(sekolah_id, semester_id, murid_id, sumber, created_at)`
	]);
}
