import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

const DAPODIK = 'dapodik-kaganga-v1';

async function addColumnIfMissing(table: string, column: string, definition: string) {
	const info = await db.$client.execute(`PRAGMA table_info(${table})`);
	if (!info.rows.some((row) => String(row.name) === column)) {
		await db.$client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	}
}

export async function ensureDapodikSchema() {
	await ensureSchema(DAPODIK, [
		`CREATE TABLE IF NOT EXISTS dapodik_settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			url TEXT NOT NULL,
			token TEXT NOT NULL,
			npsn TEXT,
			semester_id_dapodik_terakhir TEXT,
			last_sync_at TEXT,
			last_preview_at TEXT,
			last_preview_fingerprint TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(sekolah_id)
		)`,
		`CREATE TABLE IF NOT EXISTS dapodik_sync_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			semester_dapodik TEXT,
			action TEXT NOT NULL,
			status TEXT NOT NULL,
			summary TEXT,
			message TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS dapodik_mata_pelajaran (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			semester_id INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
			mata_pelajaran_id TEXT NOT NULL,
			nama TEXT NOT NULL,
			jurusan_id TEXT,
			pilihan_sekolah INTEGER DEFAULT 0 NOT NULL,
			pilihan_buku INTEGER DEFAULT 0 NOT NULL,
			pilihan_kepengawasan INTEGER DEFAULT 0 NOT NULL,
			pilihan_evaluasi INTEGER DEFAULT 0 NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(sekolah_id, semester_id, mata_pelajaran_id)
		)`,
		`CREATE TABLE IF NOT EXISTS dapodik_pembelajaran (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			kelas_id INTEGER NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
			pembelajaran_id TEXT NOT NULL,
			mata_pelajaran_id TEXT,
			nama TEXT NOT NULL,
			ptk_id TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(kelas_id, pembelajaran_id)
		)`,
		`CREATE TABLE IF NOT EXISTS dapodik_nilai_kirim (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			semester_id INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
			mata_pelajaran_id INTEGER NOT NULL REFERENCES mata_pelajaran(id) ON DELETE CASCADE,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
			dapodik_nilai_id TEXT NOT NULL,
			dapodik_id_evaluasi TEXT NOT NULL,
			payload_hash TEXT NOT NULL,
			status TEXT NOT NULL,
			message TEXT,
			sent_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(sekolah_id, semester_id, mata_pelajaran_id, murid_id)
		)`,
		`CREATE INDEX IF NOT EXISTS dapodik_sync_log_sekolah_idx ON dapodik_sync_log(sekolah_id)`,
		`CREATE INDEX IF NOT EXISTS dapodik_sync_log_created_idx ON dapodik_sync_log(created_at)`,
		`CREATE INDEX IF NOT EXISTS dapodik_mapel_context_idx ON dapodik_mata_pelajaran(sekolah_id, semester_id)`,
		`CREATE INDEX IF NOT EXISTS dapodik_pembelajaran_kelas_idx ON dapodik_pembelajaran(kelas_id)`,
		`CREATE INDEX IF NOT EXISTS dapodik_nilai_kirim_context_idx ON dapodik_nilai_kirim(sekolah_id, semester_id)`,
		`CREATE INDEX IF NOT EXISTS dapodik_nilai_kirim_status_idx ON dapodik_nilai_kirim(status)`
	]);

	for (const [table, column, definition] of [
		['sekolah', 'dapodik_sekolah_id', 'TEXT'],
		['pegawai', 'dapodik_ptk_id', 'TEXT'],
		['pegawai', 'nuptk', 'TEXT'],
		['tahun_ajaran', 'dapodik_tahun_ajaran_id', 'TEXT'],
		['semester', 'dapodik_semester_id', 'TEXT'],
		['kelas', 'dapodik_rombongan_belajar_id', 'TEXT'],
		['murid', 'dapodik_peserta_didik_id', 'TEXT'],
		['murid', 'dapodik_anggota_rombel_id', 'TEXT'],
		['murid', 'nik', 'TEXT'],
		['murid', 'anak_ke', 'INTEGER'],
		['mata_pelajaran', 'nama_lokal', 'TEXT'],
		['mata_pelajaran', 'urutan', 'INTEGER'],
		['mata_pelajaran', 'pengampu_id', 'INTEGER REFERENCES pegawai(id) ON DELETE SET NULL'],
		['mata_pelajaran', 'dapodik_pembelajaran_id', 'TEXT'],
		['mata_pelajaran', 'dapodik_mata_pelajaran_id', 'TEXT'],
		['mata_pelajaran', 'dapodik_induk_pembelajaran_id', 'TEXT']
	] as const) {
		await addColumnIfMissing(table, column, definition);
	}
	await addColumnIfMissing('dapodik_settings', 'last_preview_at', 'TEXT');
	await addColumnIfMissing('dapodik_settings', 'last_preview_fingerprint', 'TEXT');
	await addColumnIfMissing('dapodik_settings', 'last_nilai_preview_at', 'TEXT');
	await addColumnIfMissing('dapodik_settings', 'last_nilai_preview_fingerprint', 'TEXT');
}
