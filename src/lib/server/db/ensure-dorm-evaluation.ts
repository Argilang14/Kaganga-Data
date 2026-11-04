import db from './index';
import { ensureSchema } from './ensure-helper';
import { ensureDormitorySchema } from './ensure-dormitory';

export async function ensureDormEvaluationSchema() {
	await ensureDormitorySchema();
	await ensureSchema('dorm-evaluation-v1', [
		`CREATE TABLE IF NOT EXISTS asrama_evaluasi (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
		 kamar_id INTEGER NOT NULL REFERENCES asrama_kamar(id), semester_id INTEGER NOT NULL REFERENCES semester(id),
		 nama TEXT NOT NULL CHECK(length(trim(nama)) BETWEEN 1 AND 200), sumber_lama_id INTEGER REFERENCES keasramaan(id),
		 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(kamar_id,semester_id,nama))`,
		`CREATE TABLE IF NOT EXISTS asrama_evaluasi_tujuan (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, evaluasi_id INTEGER NOT NULL REFERENCES asrama_evaluasi(id),
		 indikator TEXT NOT NULL CHECK(length(trim(indikator)) BETWEEN 1 AND 500),
		 deskripsi TEXT NOT NULL CHECK(length(trim(deskripsi)) BETWEEN 1 AND 2000),
		 UNIQUE(evaluasi_id,indikator,deskripsi))`,
		`CREATE TABLE IF NOT EXISTS asrama_evaluasi_nilai (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, penempatan_id INTEGER NOT NULL REFERENCES asrama_penempatan(id),
		 tujuan_id INTEGER NOT NULL REFERENCES asrama_evaluasi_tujuan(id), murid_id INTEGER NOT NULL REFERENCES murid(id),
		 kategori TEXT NOT NULL CHECK(kategori IN ('sangat-baik','baik','cukup','perlu-bimbingan')),
		 penilai_id INTEGER NOT NULL REFERENCES auth_user(id), wali_asuh_nama_snapshot TEXT, wali_asuh_nip_snapshot TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		 UNIQUE(penempatan_id,tujuan_id))`,
		`CREATE TABLE IF NOT EXISTS asrama_evaluasi_catatan (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, penempatan_id INTEGER NOT NULL REFERENCES asrama_penempatan(id),
		 semester_id INTEGER NOT NULL REFERENCES semester(id), catatan TEXT NOT NULL CHECK(length(catatan)<=5000),
		 petugas_id INTEGER NOT NULL REFERENCES auth_user(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		 UNIQUE(penempatan_id,semester_id))`,
		`CREATE TRIGGER IF NOT EXISTS asrama_evaluasi_scope BEFORE INSERT ON asrama_evaluasi BEGIN
		 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asrama_kamar k JOIN semester s ON s.id=NEW.semester_id
		 JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id WHERE k.id=NEW.kamar_id
		 AND k.sekolah_id=NEW.sekolah_id AND t.sekolah_id=NEW.sekolah_id) THEN RAISE(ABORT,'asrama_evaluation_scope') END; END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_nilai_scope BEFORE INSERT ON asrama_evaluasi_nilai BEGIN
		 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM asrama_penempatan p
		 JOIN asrama_evaluasi_tujuan t ON t.id=NEW.tujuan_id JOIN asrama_evaluasi e ON e.id=t.evaluasi_id
		 JOIN murid_identity_link mi ON mi.murid_id=NEW.murid_id AND mi.sekolah_id=p.sekolah_id AND mi.identity_uid=p.identity_uid
		 JOIN murid m ON m.id=mi.murid_id WHERE p.id=NEW.penempatan_id AND e.kamar_id=p.kamar_id
		 AND e.sekolah_id=p.sekolah_id AND e.semester_id=m.semester_id) THEN RAISE(ABORT,'asrama_grade_scope') END; END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_eval_scope_locked BEFORE UPDATE OF sekolah_id,kamar_id,semester_id ON asrama_evaluasi
		 BEGIN SELECT RAISE(ABORT,'asrama_evaluation_scope_locked'); END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_eval_name_locked BEFORE UPDATE OF nama ON asrama_evaluasi
		 WHEN EXISTS(SELECT 1 FROM asrama_evaluasi_nilai n JOIN asrama_evaluasi_tujuan t ON t.id=n.tujuan_id WHERE t.evaluasi_id=OLD.id)
		 BEGIN SELECT RAISE(ABORT,'asrama_goal_has_grades'); END`,
		...['UPDATE', 'DELETE'].map(
			(
				operation
			) => `CREATE TRIGGER IF NOT EXISTS asrama_goal_${operation.toLowerCase()}_locked BEFORE ${operation} ON asrama_evaluasi_tujuan
		 WHEN EXISTS(SELECT 1 FROM asrama_evaluasi_nilai WHERE tujuan_id=OLD.id)
		 BEGIN SELECT RAISE(ABORT,'asrama_goal_has_grades'); END`
		),
		`CREATE TRIGGER IF NOT EXISTS asrama_nilai_key_locked BEFORE UPDATE OF penempatan_id,tujuan_id,murid_id ON asrama_evaluasi_nilai
		 WHEN NEW.penempatan_id<>OLD.penempatan_id OR NEW.tujuan_id<>OLD.tujuan_id OR NEW.murid_id<>OLD.murid_id
		 BEGIN SELECT RAISE(ABORT,'asrama_grade_scope_locked'); END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_catatan_scope BEFORE INSERT ON asrama_evaluasi_catatan
		 WHEN NOT EXISTS(SELECT 1 FROM asrama_penempatan p JOIN semester s ON s.id=NEW.semester_id JOIN tahun_ajaran y ON y.id=s.tahun_ajaran_id WHERE p.id=NEW.penempatan_id AND p.sekolah_id=y.sekolah_id)
		 BEGIN SELECT RAISE(ABORT,'asrama_note_scope'); END`,
		`CREATE TRIGGER IF NOT EXISTS asrama_catatan_key_locked BEFORE UPDATE OF penempatan_id,semester_id ON asrama_evaluasi_catatan
		 WHEN NEW.penempatan_id<>OLD.penempatan_id OR NEW.semester_id<>OLD.semester_id
		 BEGIN SELECT RAISE(ABORT,'asrama_note_scope_locked'); END`
	]);
	// Indicators may exist before their first goal, as in the original editor.
	await ensureSchema('dorm-evaluation-indicators-v1', [
		`CREATE TABLE IF NOT EXISTS asrama_evaluasi_indikator (
		 id INTEGER PRIMARY KEY AUTOINCREMENT,
		 evaluasi_id INTEGER NOT NULL REFERENCES asrama_evaluasi(id) ON DELETE CASCADE,
		 deskripsi TEXT NOT NULL CHECK(length(trim(deskripsi)) BETWEEN 1 AND 500),
		 UNIQUE(evaluasi_id,deskripsi))`,
		`INSERT OR IGNORE INTO asrama_evaluasi_indikator(evaluasi_id,deskripsi)
		 SELECT evaluasi_id,indikator FROM asrama_evaluasi_tujuan ORDER BY id`,
		...['INSERT', 'UPDATE'].map(
			(operation) =>
				`CREATE TRIGGER IF NOT EXISTS asrama_goal_indicator_${operation.toLowerCase()}
			 AFTER ${operation} ON asrama_evaluasi_tujuan BEGIN
			 INSERT OR IGNORE INTO asrama_evaluasi_indikator(evaluasi_id,deskripsi) VALUES(NEW.evaluasi_id,NEW.indikator); END`
		)
	]);
	const columns = await db.$client.execute('PRAGMA table_info(murid)');
	if (!columns.rows.some((c) => c.name === 'wali_asuh_pegawai_id'))
		await db.$client.execute(
			'ALTER TABLE murid ADD COLUMN wali_asuh_pegawai_id INTEGER REFERENCES pegawai(id)'
		);
	// Legacy text is linked only when one active caregiver matches within the same school.
	await ensureSchema('dorm-caregiver-link-v1', [
		`UPDATE murid SET wali_asuh_pegawai_id=(SELECT p.id FROM pegawai p
	 WHERE p.sekolah_id=murid.sekolah_id AND p.jenis='wali_asuh' AND p.status='aktif'
	 AND lower(trim(p.nama))=lower(trim(murid.wali_asuh_nama)))
	 WHERE wali_asuh_pegawai_id IS NULL AND trim(coalesce(wali_asuh_nama,''))<>''
	 AND (SELECT COUNT(*) FROM pegawai p WHERE p.sekolah_id=murid.sekolah_id AND p.jenis='wali_asuh'
	 AND p.status='aktif' AND lower(trim(p.nama))=lower(trim(murid.wali_asuh_nama)))=1`
	]);
}
