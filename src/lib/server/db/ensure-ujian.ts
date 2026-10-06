import { ensureSchema } from './ensure-helper';

export async function ensureUjianSchema() {
	await ensureSchema('ujian', [
		`CREATE TABLE IF NOT EXISTS ujian_session (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			tahun_ajaran_id INTEGER NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
			semester_id INTEGER REFERENCES semester(id) ON DELETE SET NULL,
			nama TEXT NOT NULL,
			singkatan TEXT,
			tanggal_ujian TEXT,
			tanggal_cetak TEXT,
			status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'aktif', 'selesai')),
			created_at TEXT NOT NULL,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS ujian_session_sekolah_tahun_idx
			ON ujian_session(sekolah_id, tahun_ajaran_id)`,
		`CREATE TABLE IF NOT EXISTS ujian_peserta (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL REFERENCES ujian_session(id) ON DELETE CASCADE,
			murid_id INTEGER REFERENCES murid(id) ON DELETE SET NULL,
			nomor_peserta TEXT,
			ruang TEXT,
			username_lms TEXT,
			password_lms TEXT,
			murid_nama_snapshot TEXT NOT NULL,
			nis_snapshot TEXT,
			nisn_snapshot TEXT,
			kelas_nama_snapshot TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(session_id, murid_id)
		)`,
		`CREATE INDEX IF NOT EXISTS ujian_peserta_session_idx ON ujian_peserta(session_id)`,
		`CREATE INDEX IF NOT EXISTS ujian_peserta_ruang_idx ON ujian_peserta(session_id, ruang)`
	]);
}
