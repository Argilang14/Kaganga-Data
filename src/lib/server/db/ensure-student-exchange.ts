import { ensureSchema } from './ensure-helper';

export async function ensureStudentExchangeSchema() {
	await ensureSchema('student-exchange-v1', [
		`CREATE TABLE IF NOT EXISTS murid_sumber_setara (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			identity_uid TEXT NOT NULL,
			fields TEXT NOT NULL CHECK(json_valid(fields)),
			temporary_nis TEXT,
			source_filename TEXT NOT NULL, source_hash TEXT NOT NULL, source_row INTEGER NOT NULL,
			imported_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			imported_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
			UNIQUE(sekolah_id,identity_uid)
		)`
	]);
}
