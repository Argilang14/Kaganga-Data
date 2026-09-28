import { ensureSchema } from './ensure-helper';

const identitySql = `CASE
	WHEN trim(coalesce(nisn, '')) <> '' THEN 'nisn:' || lower(trim(nisn))
	ELSE 'nis:' || lower(trim(nis))
END`;

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
		`CREATE INDEX IF NOT EXISTS murid_riwayat_kelas_context_idx ON murid_riwayat_kelas(tahun_ajaran_id, semester_id, kelas_id)`,
		`INSERT OR IGNORE INTO murid_lifecycle (
			sekolah_id, identity_key, nis, nisn, nama_snapshot, status, last_murid_id, created_at, updated_at
		)
		SELECT m.sekolah_id, ${identitySql}, m.nis, nullif(trim(m.nisn), ''), m.nama,
			'aktif', m.id, coalesce(m.created_at, CURRENT_TIMESTAMP), coalesce(m.updated_at, CURRENT_TIMESTAMP)
		FROM murid m
		ORDER BY m.id DESC`,
		`UPDATE murid_lifecycle
		SET last_murid_id = (
			SELECT max(m.id) FROM murid m
			WHERE m.sekolah_id = murid_lifecycle.sekolah_id
			AND (${identitySql}) = murid_lifecycle.identity_key
		),
		nama_snapshot = coalesce((
			SELECT m.nama FROM murid m
			WHERE m.sekolah_id = murid_lifecycle.sekolah_id
			AND (${identitySql}) = murid_lifecycle.identity_key
			ORDER BY m.id DESC LIMIT 1
		), nama_snapshot)`,
		`INSERT OR IGNORE INTO murid_riwayat_kelas (
			sekolah_id, identity_key, murid_id, tahun_ajaran_id, semester_id, kelas_id,
			nama_snapshot, nis_snapshot, nisn_snapshot, tahun_ajaran_snapshot,
			semester_snapshot, kelas_snapshot, fase_snapshot, status_snapshot, recorded_at
		)
		SELECT m.sekolah_id, ${identitySql}, m.id, k.tahun_ajaran_id, m.semester_id, m.kelas_id,
			m.nama, m.nis, nullif(trim(m.nisn), ''), coalesce(ta.nama, '-'),
			coalesce(s.nama, '-'), coalesce(k.nama, '-'), k.fase, 'aktif',
			coalesce(m.created_at, CURRENT_TIMESTAMP)
		FROM murid m
		JOIN kelas k ON k.id = m.kelas_id
		JOIN semester s ON s.id = m.semester_id
		JOIN tahun_ajaran ta ON ta.id = k.tahun_ajaran_id`
	]);
}
