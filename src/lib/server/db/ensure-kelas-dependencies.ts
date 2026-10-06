import { ensureSchema } from './ensure-helper';

export async function ensureKelasDependenciesSchema() {
	await ensureSchema('kelas-dependencies', [
		`CREATE TABLE IF NOT EXISTS ekstrakurikuler (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT NOT NULL,
			kelas_id INTEGER NOT NULL REFERENCES kelas(id),
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(kelas_id, nama)
		)`,
		`CREATE TABLE IF NOT EXISTS murid_ekstrakurikuler (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
			ekstrakurikuler_id INTEGER NOT NULL REFERENCES ekstrakurikuler(id) ON DELETE CASCADE,
			nilai_kosong INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(murid_id, ekstrakurikuler_id)
		)`,
		`CREATE INDEX IF NOT EXISTS murid_ekstrakurikuler_murid_idx ON murid_ekstrakurikuler(murid_id)`,
		`CREATE INDEX IF NOT EXISTS murid_ekstrakurikuler_ekstrak_idx ON murid_ekstrakurikuler(ekstrakurikuler_id)`,
		`CREATE TABLE IF NOT EXISTS ekstrakurikuler_tujuan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ekstrakurikuler_id INTEGER NOT NULL REFERENCES ekstrakurikuler(id) ON DELETE CASCADE,
			deskripsi TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS kokurikuler (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			kelas_id INTEGER NOT NULL REFERENCES kelas(id),
			kode TEXT NOT NULL UNIQUE,
			dimensi TEXT NOT NULL,
			tujuan TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT
		)`
	]);
}
