import { ensureSchema } from '$lib/server/db/ensure-helper';

export async function ensureMataPelajaranSchema() {
	await ensureSchema('mata-pelajaran', [
		`CREATE TABLE IF NOT EXISTS "tujuan_pembelajaran" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"deskripsi" text NOT NULL,
			"lingkup_materi" text NOT NULL,
			"bobot" real NOT NULL DEFAULT 0,
			"created_at" text NOT NULL DEFAULT (datetime('now')),
			"updated_at" text,
			CONSTRAINT "tujuan_pembelajaran_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
		)`,
		`CREATE INDEX IF NOT EXISTS "tujuan_pembelajaran_mapel_idx" ON "tujuan_pembelajaran" ("mata_pelajaran_id")`
	]);
}
