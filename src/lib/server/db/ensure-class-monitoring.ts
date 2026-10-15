import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensureClassMonitoringSchema() {
	await ensureSchema('class_monitoring_qr', [
		`CREATE TABLE IF NOT EXISTS class_monitoring_qr (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			sekolah_id integer NOT NULL,
			kelas_id integer NOT NULL,
			token text NOT NULL,
			token_hash text NOT NULL,
			issued_at text NOT NULL,
			issued_by_user_id integer,
			created_at text NOT NULL,
			updated_at text,
			FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE,
			FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
			FOREIGN KEY (issued_by_user_id) REFERENCES auth_user(id) ON DELETE SET NULL
		)`,
		'CREATE UNIQUE INDEX IF NOT EXISTS class_monitoring_qr_school_class_unique ON class_monitoring_qr (sekolah_id, kelas_id)',
		'CREATE UNIQUE INDEX IF NOT EXISTS class_monitoring_qr_token_hash_unique ON class_monitoring_qr (token_hash)',
		'CREATE INDEX IF NOT EXISTS class_monitoring_qr_school_idx ON class_monitoring_qr (sekolah_id)'
	]);

	await ensureSchema('class_monitoring', [
		`CREATE TABLE IF NOT EXISTS class_monitoring (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			sekolah_id integer NOT NULL,
			meeting_key text NOT NULL,
			tanggal text NOT NULL,
			jenis_jadwal text NOT NULL,
			tahun_ajaran_id integer,
			semester_id integer,
			template_id_snapshot integer NOT NULL,
			kelas_id_snapshot integer NOT NULL,
			kelas_nama_snapshot text NOT NULL,
			jenjang_snapshot text,
			jadwal_pelajaran_ids_snapshot text NOT NULL,
			mata_pelajaran_id_snapshot integer,
			jadwal_mapel_id_snapshot integer,
			mapel_nama_snapshot text NOT NULL,
			guru_pegawai_id_snapshot integer,
			guru_nama_snapshot text NOT NULL,
			jam_pelajaran_snapshot text NOT NULL,
			pukul_mulai_snapshot text NOT NULL,
			pukul_selesai_snapshot text NOT NULL,
			scanned_at text,
			scanned_by_user_id integer,
			actual_guru_pegawai_id integer,
			actual_guru_nama_snapshot text,
			absence_reason text,
			absence_note text,
			substitute_pegawai_id integer,
			substitute_nama_snapshot text,
			managed_by_user_id integer,
			created_at text NOT NULL,
			updated_at text,
			FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE,
			FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id) ON DELETE SET NULL,
			FOREIGN KEY (semester_id) REFERENCES semester(id) ON DELETE SET NULL,
			FOREIGN KEY (scanned_by_user_id) REFERENCES auth_user(id) ON DELETE SET NULL,
			FOREIGN KEY (managed_by_user_id) REFERENCES auth_user(id) ON DELETE SET NULL
		)`,
		'CREATE UNIQUE INDEX IF NOT EXISTS class_monitoring_meeting_unique ON class_monitoring (sekolah_id, meeting_key, tanggal, jenis_jadwal)',
		'CREATE INDEX IF NOT EXISTS class_monitoring_school_date_idx ON class_monitoring (sekolah_id, tanggal)',
		'CREATE INDEX IF NOT EXISTS class_monitoring_teacher_date_idx ON class_monitoring (actual_guru_pegawai_id, tanggal)'
	]);

	// Old development copies may have been created before all indexes were listed in ensureSchema.
	await db.$client.execute(
		'CREATE UNIQUE INDEX IF NOT EXISTS class_monitoring_meeting_unique ON class_monitoring (sekolah_id, meeting_key, tanggal, jenis_jadwal)'
	);
}
