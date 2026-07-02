import { ensureSchema } from '$lib/server/db/ensure-helper';

export async function ensureKesehatanMuridSchema() {
	await ensureSchema('kesehatan_murid', [
		`CREATE TABLE IF NOT EXISTS kesehatan_murid (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
			semester_id INTEGER REFERENCES semester(id) ON DELETE SET NULL,
			tanggal_pengukuran TEXT NOT NULL,
			tinggi_badan REAL,
			berat_badan REAL,
			z_score REAL,
			status_gizi TEXT,
			kondisi_fisik TEXT,
			ukuran_baju TEXT,
			ukuran_celana TEXT,
			ukuran_sepatu TEXT,
			catatan TEXT,
			petugas_user_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS kesehatan_murid_murid_tanggal_unique ON kesehatan_murid (murid_id, tanggal_pengukuran)`,
		`CREATE INDEX IF NOT EXISTS kesehatan_murid_sekolah_idx ON kesehatan_murid (sekolah_id)`,
		`CREATE INDEX IF NOT EXISTS kesehatan_murid_murid_tanggal_idx ON kesehatan_murid (murid_id, tanggal_pengukuran)`,
		`CREATE INDEX IF NOT EXISTS kesehatan_murid_semester_idx ON kesehatan_murid (semester_id)`,
		`CREATE INDEX IF NOT EXISTS kesehatan_murid_status_gizi_idx ON kesehatan_murid (status_gizi)`
	]);
}
