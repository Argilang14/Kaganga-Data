export const JADWAL_TARGET_JP_SCHEMA = [
	`CREATE TABLE IF NOT EXISTS "jadwal_target_jp" (
		"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
		"sekolah_id" integer NOT NULL,
		"tahun_ajaran_id" integer NOT NULL,
		"jenis" text NOT NULL,
		"kelas_id" integer NOT NULL,
		"jadwal_mapel_id" integer NOT NULL,
		"jp_per_minggu" integer DEFAULT 0 NOT NULL,
		"created_at" text NOT NULL,
		"updated_at" text,
		FOREIGN KEY ("sekolah_id") REFERENCES "sekolah"("id") ON UPDATE no action ON DELETE cascade,
		FOREIGN KEY ("tahun_ajaran_id") REFERENCES "tahun_ajaran"("id") ON UPDATE no action ON DELETE cascade,
		FOREIGN KEY ("kelas_id") REFERENCES "kelas"("id") ON UPDATE no action ON DELETE cascade,
		FOREIGN KEY ("jadwal_mapel_id") REFERENCES "jadwal_mata_pelajaran"("id") ON UPDATE no action ON DELETE cascade
	)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "jadwal_target_jp_context_unique" ON "jadwal_target_jp" ("sekolah_id", "tahun_ajaran_id", "jenis", "kelas_id", "jadwal_mapel_id")`,
	`CREATE INDEX IF NOT EXISTS "jadwal_target_jp_context_idx" ON "jadwal_target_jp" ("sekolah_id", "tahun_ajaran_id", "jenis")`,
	`CREATE INDEX IF NOT EXISTS "jadwal_target_jp_kelas_idx" ON "jadwal_target_jp" ("kelas_id")`,
	`CREATE INDEX IF NOT EXISTS "jadwal_target_jp_mapel_idx" ON "jadwal_target_jp" ("jadwal_mapel_id")`
] as const;
