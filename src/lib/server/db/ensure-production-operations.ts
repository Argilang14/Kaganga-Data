import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

async function addColumnIfMissing(table: string, column: string, definition: string) {
	const info = await db.$client.execute(`PRAGMA table_info(${table})`);
	if (!info.rows.some((row) => String(row.name) === column)) {
		await db.$client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	}
}

export async function ensureProductionOperationsSchema() {
	await ensureSchema('production-operations-v1', [
		`CREATE TABLE IF NOT EXISTS server_identity (
			id INTEGER PRIMARY KEY CHECK(id = 1),
			instance_id TEXT NOT NULL,
			machine_name TEXT NOT NULL,
			process_id INTEGER NOT NULL DEFAULT 0,
			role TEXT NOT NULL DEFAULT 'primary' CHECK(role IN ('primary','standby')),
			database_path_hash TEXT NOT NULL,
			started_at TEXT NOT NULL,
			heartbeat_at TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS maintenance_run (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL CHECK(type IN ('backup','cleanup','health','restore_test','update_test')),
			status TEXT NOT NULL CHECK(status IN ('running','success','failed','warning')),
			summary TEXT,
			details_json TEXT,
			started_at TEXT NOT NULL,
			finished_at TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS maintenance_run_type_created_idx ON maintenance_run(type, created_at)`,
		`CREATE TABLE IF NOT EXISTS communication_template (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			channel TEXT NOT NULL DEFAULT 'internal' CHECK(channel IN ('internal','email','whatsapp')),
			audience TEXT NOT NULL DEFAULT 'semua',
			subject TEXT,
			body TEXT NOT NULL,
			active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS communication_template_school_name_unique ON communication_template(sekolah_id, name)`,
		`CREATE INDEX IF NOT EXISTS communication_template_school_idx ON communication_template(sekolah_id)`,
		`CREATE TABLE IF NOT EXISTS communication_queue (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			template_id INTEGER REFERENCES communication_template(id) ON DELETE SET NULL,
			channel TEXT NOT NULL CHECK(channel IN ('internal','email','whatsapp')),
			audience TEXT NOT NULL,
			recipient TEXT,
			subject TEXT,
			body TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','sent','failed','cancelled')),
			contains_sensitive_data INTEGER NOT NULL DEFAULT 0,
			created_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			approved_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			approved_at TEXT,
			sent_at TEXT,
			attempts INTEGER NOT NULL DEFAULT 0,
			last_error TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS communication_queue_school_status_idx ON communication_queue(sekolah_id, status)`,
		`CREATE INDEX IF NOT EXISTS communication_queue_created_idx ON communication_queue(created_at)`,
		`CREATE INDEX IF NOT EXISTS absensi_harian_sekolah_status_tanggal_idx ON absensi_harian(sekolah_id, status, tanggal)`,
		`CREATE INDEX IF NOT EXISTS asesmen_sumatif_murid_nilai_idx ON asesmen_sumatif(murid_id, nilai_akhir)`,
		`CREATE INDEX IF NOT EXISTS asesmen_keasramaan_murid_dinilai_idx ON asesmen_keasramaan(murid_id, dinilai_pada)`
	]);
	await addColumnIfMissing('server_identity', 'process_id', 'INTEGER NOT NULL DEFAULT 0');
	await addColumnIfMissing('document_attachment', 'expires_at', 'TEXT');
	await db.$client.execute(
		`CREATE INDEX IF NOT EXISTS document_attachment_school_expires_idx ON document_attachment(sekolah_id, expires_at)`
	);
}
