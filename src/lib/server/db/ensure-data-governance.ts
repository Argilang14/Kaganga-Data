import { ensureSchema } from './ensure-helper';
import db, { databaseUrl } from '$lib/server/db';
import path from 'node:path';
import { migrateMuridIdentity } from './murid-identity-migration';

const migrations = new WeakMap<object, Promise<unknown>>();

export async function ensureDataGovernanceSchema() {
	await ensureSchema('data-governance-v1', [
		`CREATE TABLE IF NOT EXISTS audit_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER REFERENCES sekolah(id) ON DELETE SET NULL,
			user_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			username_snapshot TEXT NOT NULL,
			role_snapshot TEXT NOT NULL,
			action TEXT NOT NULL,
			entity_type TEXT NOT NULL,
			entity_id TEXT,
			summary TEXT NOT NULL,
			before_data TEXT,
			after_data TEXT,
			ip_address TEXT,
			user_agent TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS audit_log_sekolah_created_idx ON audit_log(sekolah_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS audit_log_user_created_idx ON audit_log(user_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(entity_type, entity_id)`,
		`CREATE TABLE IF NOT EXISTS murid_lifecycle (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			identity_key TEXT NOT NULL,
			nis TEXT NOT NULL,
			nisn TEXT,
			nama_snapshot TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif','pindah','keluar','alumni')),
			tanggal_status TEXT,
			alasan TEXT,
			last_murid_id INTEGER REFERENCES murid(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT,
			UNIQUE(sekolah_id, identity_key)
		)`,
		`CREATE INDEX IF NOT EXISTS murid_lifecycle_sekolah_status_idx ON murid_lifecycle(sekolah_id, status)`,
		`CREATE INDEX IF NOT EXISTS murid_lifecycle_last_murid_idx ON murid_lifecycle(last_murid_id)`,
		`CREATE TABLE IF NOT EXISTS murid_riwayat_kelas (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			identity_key TEXT NOT NULL,
			murid_id INTEGER REFERENCES murid(id) ON DELETE SET NULL,
			tahun_ajaran_id INTEGER REFERENCES tahun_ajaran(id) ON DELETE SET NULL,
			semester_id INTEGER REFERENCES semester(id) ON DELETE SET NULL,
			kelas_id INTEGER REFERENCES kelas(id) ON DELETE SET NULL,
			nama_snapshot TEXT NOT NULL,
			nis_snapshot TEXT NOT NULL,
			nisn_snapshot TEXT,
			tahun_ajaran_snapshot TEXT NOT NULL,
			semester_snapshot TEXT NOT NULL,
			kelas_snapshot TEXT NOT NULL,
			fase_snapshot TEXT,
			status_snapshot TEXT NOT NULL DEFAULT 'aktif',
			recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(murid_id)
		)`,
		`CREATE INDEX IF NOT EXISTS murid_riwayat_kelas_identity_idx ON murid_riwayat_kelas(sekolah_id, identity_key)`,
		`CREATE INDEX IF NOT EXISTS murid_riwayat_kelas_context_idx ON murid_riwayat_kelas(tahun_ajaran_id, semester_id, kelas_id)`
	]);
	const client = db.$client;
	if (!migrations.has(client)) {
		const url = databaseUrl;
		const migration = migrateMuridIdentity(client, {
			databasePath: url.startsWith('file:') ? path.resolve(url.slice(5)) : undefined
		}).catch((error) => {
			migrations.delete(client);
			throw error;
		});
		migrations.set(client, migration);
	}
	await migrations.get(client);
}
