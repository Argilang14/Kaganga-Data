import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensureEducationUnitsSchema() {
	await ensureSchema('education-units-v1', [
		`CREATE TABLE IF NOT EXISTS sekolah_satuan_pendidikan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			jenjang TEXT NOT NULL CHECK(jenjang IN ('sd','smp','sma')),
			nama TEXT NOT NULL,
			npsn TEXT NOT NULL CHECK(length(npsn)=8 AND npsn NOT GLOB '*[^0-9]*'),
			created_at TEXT NOT NULL, updated_at TEXT,
			UNIQUE(sekolah_id,jenjang), UNIQUE(sekolah_id,npsn)
		)`,
		`CREATE TABLE IF NOT EXISTS kelas_satuan_pendidikan (
			kelas_id INTEGER PRIMARY KEY REFERENCES kelas(id) ON DELETE CASCADE,
			satuan_id INTEGER NOT NULL REFERENCES sekolah_satuan_pendidikan(id) ON DELETE RESTRICT,
			nama_snapshot TEXT NOT NULL, npsn_snapshot TEXT NOT NULL,
			created_at TEXT NOT NULL, updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS kelas_satuan_idx ON kelas_satuan_pendidikan(satuan_id)`,
		...['INSERT', 'UPDATE'].map(
			(operation) => `CREATE TRIGGER IF NOT EXISTS kelas_satuan_scope_${operation.toLowerCase()}
		BEFORE ${operation} ON kelas_satuan_pendidikan
		WHEN NOT EXISTS (SELECT 1 FROM kelas k JOIN sekolah_satuan_pendidikan s ON s.sekolah_id=k.sekolah_id WHERE k.id=NEW.kelas_id AND s.id=NEW.satuan_id)
		BEGIN SELECT RAISE(ABORT,'Satuan pendidikan di luar sekolah kelas'); END`
		),
		`CREATE TABLE IF NOT EXISTS dapodik_satuan_settings (
			satuan_id INTEGER PRIMARY KEY REFERENCES sekolah_satuan_pendidikan(id) ON DELETE CASCADE,
			url TEXT NOT NULL, token TEXT NOT NULL, updated_at TEXT NOT NULL
		)`
	]);
	const columns = await db.$client.execute('PRAGMA table_info(dapodik_satuan_settings)');
	for (const name of ['semester_id', 'last_preview_at', 'last_preview_fingerprint']) {
		if (!columns.rows.some((row) => String(row.name) === name))
			await db.$client.execute(`ALTER TABLE dapodik_satuan_settings ADD COLUMN ${name} TEXT`);
	}
}
