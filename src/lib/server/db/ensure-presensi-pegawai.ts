import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensurePresensiPegawaiSchema() {
	await ensureSchema('presensi_pegawai', [
		`CREATE TABLE IF NOT EXISTS "presensi_pegawai" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"tahun_ajaran_id" integer,
			"semester_id" integer,
			"pegawai_id" integer,
			"nama_pegawai" text NOT NULL,
			"tanggal" text NOT NULL,
			"status" text NOT NULL,
			"waktu_masuk" text,
			"waktu_pulang" text,
			"tanda_tangan" text,
			"keterangan" text,
			"petugas_user_id" integer,
			"created_at" text NOT NULL,
			"updated_at" text,
			FOREIGN KEY ("sekolah_id") REFERENCES "sekolah" ("id") ON DELETE CASCADE,
			FOREIGN KEY ("tahun_ajaran_id") REFERENCES "tahun_ajaran" ("id") ON DELETE SET NULL,
			FOREIGN KEY ("semester_id") REFERENCES "semester" ("id") ON DELETE SET NULL,
			FOREIGN KEY ("pegawai_id") REFERENCES "pegawai" ("id") ON DELETE SET NULL,
			FOREIGN KEY ("petugas_user_id") REFERENCES "auth_user" ("id") ON DELETE SET NULL
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "presensi_pegawai_sekolah_pegawai_tanggal_unique" ON "presensi_pegawai" ("sekolah_id", "pegawai_id", "tanggal")`,
		`CREATE INDEX IF NOT EXISTS "presensi_pegawai_sekolah_tanggal_idx" ON "presensi_pegawai" ("sekolah_id", "tanggal")`,
		`CREATE INDEX IF NOT EXISTS "presensi_pegawai_pegawai_idx" ON "presensi_pegawai" ("pegawai_id")`
	]);

	try {
		await db.$client.execute(
			`ALTER TABLE "presensi_settings" ADD COLUMN "presensi_pegawai_enabled" integer NOT NULL DEFAULT 1`
		);
	} catch {
		// Column already exists on upgraded databases.
	}
}
