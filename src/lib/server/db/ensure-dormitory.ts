import { ensureSchema } from './ensure-helper';
import { ensureDataGovernanceSchema } from './ensure-data-governance';

export async function ensureDormitorySchema() {
	await ensureDataGovernanceSchema();
	await ensureSchema('dormitory-v1', [
		`CREATE TABLE IF NOT EXISTS asrama (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
		 nama TEXT NOT NULL, nama_key TEXT NOT NULL, kategori TEXT NOT NULL CHECK(kategori IN ('putra','putri')),
		 aktif INTEGER NOT NULL DEFAULT 1 CHECK(aktif IN (0,1)), versi INTEGER NOT NULL DEFAULT 1,
		 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT,
		 UNIQUE(sekolah_id,nama_key))`,
		`CREATE TABLE IF NOT EXISTS asrama_kamar (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
		 asrama_id INTEGER NOT NULL REFERENCES asrama(id), nama TEXT NOT NULL, nama_key TEXT NOT NULL,
		 kapasitas INTEGER NOT NULL CHECK(kapasitas BETWEEN 1 AND 1000), aktif INTEGER NOT NULL DEFAULT 1 CHECK(aktif IN (0,1)),
		 versi INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT,
		 UNIQUE(asrama_id,nama_key))`,
		`CREATE TABLE IF NOT EXISTS asrama_penugasan (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
		 kamar_id INTEGER NOT NULL REFERENCES asrama_kamar(id), pegawai_id INTEGER NOT NULL REFERENCES pegawai(id),
		 peran TEXT NOT NULL CHECK(peran IN ('utama','pendamping')), mulai TEXT NOT NULL, selesai TEXT,
		 nama_snapshot TEXT NOT NULL, alasan TEXT NOT NULL, petugas_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
		 selesai_alasan TEXT, selesai_oleh INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
		 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(selesai IS NULL OR selesai>=mulai))`,
		`CREATE UNIQUE INDEX IF NOT EXISTS asrama_wali_utama ON asrama_penugasan(kamar_id) WHERE selesai IS NULL AND peran='utama'`,
		`CREATE UNIQUE INDEX IF NOT EXISTS asrama_wali_unik ON asrama_penugasan(kamar_id,pegawai_id) WHERE selesai IS NULL`,
		`CREATE INDEX IF NOT EXISTS asrama_wali_scope ON asrama_penugasan(sekolah_id,pegawai_id,selesai,kamar_id)`,
		`CREATE TABLE IF NOT EXISTS asrama_penempatan (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
		 kamar_id INTEGER NOT NULL REFERENCES asrama_kamar(id), identity_uid TEXT NOT NULL,
		 murid_id INTEGER NOT NULL REFERENCES murid(id), sebelumnya_id INTEGER REFERENCES asrama_penempatan(id),
		 mulai TEXT NOT NULL, selesai TEXT, alasan TEXT NOT NULL, nama_snapshot TEXT NOT NULL, kelas_snapshot TEXT NOT NULL,
		 selesai_alasan TEXT, selesai_oleh INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
		 petugas_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
		 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(selesai IS NULL OR selesai>=mulai))`,
		`CREATE UNIQUE INDEX IF NOT EXISTS asrama_penghuni_aktif ON asrama_penempatan(sekolah_id,identity_uid) WHERE selesai IS NULL`,
		`CREATE INDEX IF NOT EXISTS asrama_penghuni_kamar ON asrama_penempatan(sekolah_id,kamar_id,mulai,selesai)`,
		`CREATE INDEX IF NOT EXISTS asrama_penghuni_uid ON asrama_penempatan(sekolah_id,identity_uid,mulai,selesai)`,
		`CREATE TRIGGER IF NOT EXISTS asrama_kamar_tenant BEFORE INSERT ON asrama_kamar BEGIN
		 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asrama WHERE id=NEW.asrama_id AND sekolah_id=NEW.sekolah_id AND aktif=1)
		 THEN RAISE(ABORT,'asrama_scope') END; END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_kamar_edit BEFORE UPDATE ON asrama_kamar BEGIN
		 SELECT CASE WHEN NEW.sekolah_id<>OLD.sekolah_id OR NEW.asrama_id<>OLD.asrama_id THEN RAISE(ABORT,'asrama_scope') END;
		 SELECT CASE WHEN (NEW.aktif=0 OR NEW.kapasitas<(SELECT COUNT(*) FROM asrama_penempatan WHERE kamar_id=OLD.id AND selesai IS NULL))
		 AND EXISTS(SELECT 1 FROM asrama_penempatan WHERE kamar_id=OLD.id AND selesai IS NULL)
		 THEN RAISE(ABORT,'asrama_occupied') END; END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_gedung_edit BEFORE UPDATE ON asrama BEGIN
		 SELECT CASE WHEN NEW.sekolah_id<>OLD.sekolah_id THEN RAISE(ABORT,'asrama_scope') END;
		 SELECT CASE WHEN (NEW.aktif=0 OR NEW.kategori<>OLD.kategori) AND EXISTS(SELECT 1 FROM asrama_penempatan p
		 JOIN asrama_kamar k ON k.id=p.kamar_id WHERE k.asrama_id=OLD.id AND p.selesai IS NULL)
		 THEN RAISE(ABORT,'asrama_occupied') END; END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_wali_valid BEFORE INSERT ON asrama_penugasan BEGIN
		 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asrama_kamar k JOIN asrama g ON g.id=k.asrama_id
		 JOIN pegawai e ON e.id=NEW.pegawai_id WHERE k.id=NEW.kamar_id AND k.sekolah_id=NEW.sekolah_id
		 AND g.aktif=1 AND k.aktif=1 AND e.sekolah_id=NEW.sekolah_id AND e.status='aktif')
		 THEN RAISE(ABORT,'asrama_scope') END;
		 SELECT CASE WHEN EXISTS(SELECT 1 FROM asrama_penugasan w WHERE w.kamar_id=NEW.kamar_id
		 AND (w.pegawai_id=NEW.pegawai_id OR (w.peran='utama' AND NEW.peran='utama'))
		 AND w.mulai<COALESCE(NEW.selesai,'9999-12-31') AND NEW.mulai<COALESCE(w.selesai,'9999-12-31'))
		 THEN RAISE(ABORT,'asrama_overlap') END; END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_penghuni_valid BEFORE INSERT ON asrama_penempatan BEGIN
		 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM murid_identity_link mi JOIN murid m ON m.id=mi.murid_id
		 JOIN asrama_kamar k ON k.id=NEW.kamar_id JOIN asrama g ON g.id=k.asrama_id
		 WHERE mi.murid_id=NEW.murid_id AND mi.identity_uid=NEW.identity_uid AND mi.sekolah_id=NEW.sekolah_id
		 AND m.sekolah_id=NEW.sekolah_id AND k.sekolah_id=NEW.sekolah_id AND k.aktif=1 AND g.aktif=1
		 AND ((g.kategori='putra' AND m.jenis_kelamin='L') OR (g.kategori='putri' AND m.jenis_kelamin='P')))
		 THEN RAISE(ABORT,'asrama_identity_gender') END;
		 SELECT CASE WHEN EXISTS(SELECT 1 FROM asrama_penempatan p WHERE p.sekolah_id=NEW.sekolah_id
		 AND p.identity_uid=NEW.identity_uid AND p.mulai<COALESCE(p.selesai,'9999-12-31')
		 AND p.mulai<COALESCE(NEW.selesai,'9999-12-31') AND NEW.mulai<COALESCE(p.selesai,'9999-12-31'))
		 THEN RAISE(ABORT,'asrama_overlap') END;
		 SELECT CASE WHEN EXISTS(SELECT 1 FROM (SELECT NEW.mulai AS tanggal UNION SELECT mulai FROM asrama_penempatan
		 WHERE kamar_id=NEW.kamar_id AND mulai>=NEW.mulai AND mulai<COALESCE(NEW.selesai,'9999-12-31')) t
		 WHERE (SELECT COUNT(*) FROM asrama_penempatan p WHERE p.kamar_id=NEW.kamar_id AND p.mulai<=t.tanggal
		 AND (p.selesai IS NULL OR p.selesai>t.tanggal)) >= (SELECT kapasitas FROM asrama_kamar WHERE id=NEW.kamar_id))
		 THEN RAISE(ABORT,'asrama_capacity') END; END`,
		...['asrama_penempatan', 'asrama_penugasan'].flatMap((table) => [
			`CREATE TRIGGER IF NOT EXISTS ${table}_immutable BEFORE UPDATE OF selesai,sekolah_id,kamar_id,mulai,nama_snapshot,alasan,
			 selesai_alasan,${table === 'asrama_penempatan' ? 'identity_uid,murid_id,sebelumnya_id,kelas_snapshot' : 'pegawai_id,peran'} ON ${table}
			 WHEN OLD.selesai IS NOT NULL OR NEW.selesai IS NULL OR NEW.selesai<OLD.mulai
			 OR NEW.sekolah_id<>OLD.sekolah_id OR NEW.kamar_id<>OLD.kamar_id OR NEW.mulai<>OLD.mulai
			 ${table === 'asrama_penempatan' ? 'OR NEW.identity_uid<>OLD.identity_uid OR NEW.murid_id<>OLD.murid_id OR NEW.sebelumnya_id IS NOT OLD.sebelumnya_id OR NEW.kelas_snapshot<>OLD.kelas_snapshot' : 'OR NEW.pegawai_id<>OLD.pegawai_id OR NEW.peran<>OLD.peran'}
			 OR NEW.nama_snapshot<>OLD.nama_snapshot OR NEW.alasan<>OLD.alasan
			 BEGIN SELECT RAISE(ABORT,'asrama_history_locked'); END`,
			`CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
			 BEGIN SELECT RAISE(ABORT,'asrama_history_locked'); END`
		])
	]);
}
