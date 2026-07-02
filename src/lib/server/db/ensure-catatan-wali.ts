import { ensureSchema } from './ensure-helper';

export async function ensureCatatanWaliSchema() {
	await ensureSchema('catatan_wali_kelas', [
		`CREATE TABLE IF NOT EXISTS "catatan_wali_kelas" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"catatan" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "catatan_wali_kelas_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "catatan_wali_kelas_murid_unique" ON "catatan_wali_kelas" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "catatan_wali_kelas_murid_idx" ON "catatan_wali_kelas" ("murid_id")`
	]);
	await ensureSchema('catatan_wali_asrama', [
		`CREATE TABLE IF NOT EXISTS "catatan_wali_asrama" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"catatan" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "catatan_wali_asrama_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "catatan_wali_asrama_murid_unique" ON "catatan_wali_asrama" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "catatan_wali_asrama_murid_idx" ON "catatan_wali_asrama" ("murid_id")`
	]);
	await ensureSchema('status_akhir_rapor', [
		`CREATE TABLE IF NOT EXISTS "status_akhir_rapor" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"status" text,
			"tanggal_penetapan" text,
			"catatan" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "status_akhir_rapor_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "status_akhir_rapor_murid_unique" ON "status_akhir_rapor" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "status_akhir_rapor_murid_idx" ON "status_akhir_rapor" ("murid_id")`
	]);
}
