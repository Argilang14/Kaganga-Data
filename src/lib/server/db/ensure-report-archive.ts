import { ensureSchema } from './ensure-helper';
export async function ensureReportArchiveSchema() {
	await ensureSchema('report-archive-v2', [
		`CREATE TABLE IF NOT EXISTS rapor_arsip (
			id TEXT PRIMARY KEY NOT NULL, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			history_id INTEGER NOT NULL REFERENCES murid_riwayat_kelas(id) ON DELETE RESTRICT,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE RESTRICT,
			identity_uid TEXT NOT NULL, jenis TEXT NOT NULL CHECK(jenis IN ('sekolah','asrama')),
			periode TEXT NOT NULL CHECK(periode IN ('rts','ras')), snapshot_json TEXT NOT NULL,
			source_hash TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL,
			size_bytes INTEGER NOT NULL, finalized_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(history_id,jenis,periode), CHECK(jenis!='asrama' OR periode='ras')
		)`,
		'CREATE INDEX IF NOT EXISTS rapor_arsip_school_identity_idx ON rapor_arsip(sekolah_id,identity_uid)',
		`CREATE TRIGGER IF NOT EXISTS rapor_arsip_immutable BEFORE UPDATE OF id,created_at,snapshot_json,source_hash,storage_key,sha256,size_bytes,history_id,murid_id,identity_uid,jenis,periode,sekolah_id ON rapor_arsip BEGIN SELECT RAISE(ABORT,'Arsip rapor final tidak dapat ditimpa'); END`,
		`CREATE TABLE IF NOT EXISTS rapor_arsip_revisi (
			id TEXT PRIMARY KEY NOT NULL, arsip_id TEXT NOT NULL REFERENCES rapor_arsip(id) ON DELETE RESTRICT,
			nomor INTEGER NOT NULL CHECK(nomor>=2), sebelumnya_id TEXT NOT NULL, alasan TEXT NOT NULL,
			snapshot_json TEXT NOT NULL, source_hash TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
			sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
			finalized_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(arsip_id,nomor)
		)`,
		`CREATE TRIGGER IF NOT EXISTS rapor_arsip_revisi_immutable BEFORE UPDATE OF id,arsip_id,nomor,sebelumnya_id,alasan,snapshot_json,source_hash,storage_key,sha256,size_bytes,created_at ON rapor_arsip_revisi BEGIN SELECT RAISE(ABORT,'Revisi rapor final tidak dapat ditimpa'); END`
	]);
	await ensureSchema('report-archive-martikulasi-v1', [
		`CREATE TABLE IF NOT EXISTS rapor_martikulasi_arsip (
			id TEXT PRIMARY KEY NOT NULL, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			history_id INTEGER NOT NULL REFERENCES murid_riwayat_kelas(id) ON DELETE RESTRICT,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE RESTRICT,
			identity_uid TEXT NOT NULL, jenis TEXT NOT NULL CHECK(jenis='martikulasi'),
			periode TEXT NOT NULL CHECK(periode='ras'), snapshot_json TEXT NOT NULL,
			source_hash TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL,
			size_bytes INTEGER NOT NULL, finalized_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(history_id,jenis,periode)
		)`,
		'CREATE INDEX IF NOT EXISTS rapor_martikulasi_identity_idx ON rapor_martikulasi_arsip(sekolah_id,identity_uid)',
		`CREATE TRIGGER IF NOT EXISTS rapor_martikulasi_immutable BEFORE UPDATE OF id,created_at,snapshot_json,source_hash,storage_key,sha256,size_bytes,history_id,murid_id,identity_uid,jenis,periode,sekolah_id ON rapor_martikulasi_arsip BEGIN SELECT RAISE(ABORT,'Arsip rapor final tidak dapat ditimpa'); END`,
		`CREATE TABLE IF NOT EXISTS rapor_martikulasi_revisi (
			id TEXT PRIMARY KEY NOT NULL, arsip_id TEXT NOT NULL REFERENCES rapor_martikulasi_arsip(id) ON DELETE RESTRICT,
			nomor INTEGER NOT NULL CHECK(nomor>=2), sebelumnya_id TEXT NOT NULL, alasan TEXT NOT NULL,
			snapshot_json TEXT NOT NULL, source_hash TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
			sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
			finalized_by INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(arsip_id,nomor)
		)`,
		`CREATE TRIGGER IF NOT EXISTS rapor_martikulasi_revisi_immutable BEFORE UPDATE OF id,arsip_id,nomor,sebelumnya_id,alasan,snapshot_json,source_hash,storage_key,sha256,size_bytes,created_at ON rapor_martikulasi_revisi BEGIN SELECT RAISE(ABORT,'Revisi rapor final tidak dapat ditimpa'); END`
	]);
}
