import { ensureSchema } from '$lib/server/db/ensure-helper';

export async function ensureKeasramaanSchema() {
	await ensureSchema('keasramaan', [
		`CREATE TABLE IF NOT EXISTS "keasramaan" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"nama" text NOT NULL,
			"kelas_id" integer NOT NULL,
			"created_at" text NOT NULL DEFAULT (datetime('now')),
			"updated_at" text,
			CONSTRAINT "keasramaan_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "kelas" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "keasramaan_kelas_nama_unique" ON "keasramaan" ("kelas_id", "nama")`,
		`CREATE TABLE IF NOT EXISTS "keasramaan_indikator" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"keasramaan_id" integer NOT NULL,
			"deskripsi" text NOT NULL,
			"created_at" text NOT NULL DEFAULT (datetime('now')),
			"updated_at" text,
			CONSTRAINT "keasramaan_indikator_keasramaan_id_keasramaan_id_fk" FOREIGN KEY ("keasramaan_id") REFERENCES "keasramaan" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS "keasramaan_indikator_keasramaan_idx" ON "keasramaan_indikator" ("keasramaan_id")`,
		`CREATE TABLE IF NOT EXISTS "keasramaan_tujuan" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"indikator_id" integer NOT NULL,
			"deskripsi" text NOT NULL,
			"created_at" text NOT NULL DEFAULT (datetime('now')),
			"updated_at" text,
			CONSTRAINT "keasramaan_tujuan_indikator_id_keasramaan_indikator_id_fk" FOREIGN KEY ("indikator_id") REFERENCES "keasramaan_indikator" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS "keasramaan_tujuan_indikator_idx" ON "keasramaan_tujuan" ("indikator_id")`,
		`CREATE TABLE IF NOT EXISTS "asesmen_keasramaan" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"keasramaan_id" integer NOT NULL,
			"tujuan_id" integer NOT NULL,
			"kategori" text NOT NULL,
			"dinilai_pada" text,
			"created_at" text NOT NULL DEFAULT (datetime('now')),
			"updated_at" text,
			CONSTRAINT "asesmen_keasramaan_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_keasramaan_keasramaan_id_keasramaan_id_fk" FOREIGN KEY ("keasramaan_id") REFERENCES "keasramaan" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_keasramaan_tujuan_id_keasramaan_tujuan_id_fk" FOREIGN KEY ("tujuan_id") REFERENCES "keasramaan_tujuan" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_keasramaan_murid_keasramaan_tujuan_unique" ON "asesmen_keasramaan" ("murid_id", "keasramaan_id", "tujuan_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_keasramaan_murid_idx" ON "asesmen_keasramaan" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_keasramaan_keasramaan_idx" ON "asesmen_keasramaan" ("keasramaan_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_keasramaan_tujuan_idx" ON "asesmen_keasramaan" ("tujuan_id")`
	]);
}
