import { ensureAsesmenEkstrakurikulerSchema } from './ensure-asesmen-ekstrakurikuler';
import { ensureAsesmenKokurikulerSchema } from './ensure-asesmen-kokurikuler';
import { ensureAsesmenSumatifSchema } from './ensure-asesmen-sumatif';
import { ensureSchema } from './ensure-helper';

async function ensureKehadiranMuridSchema() {
	await ensureSchema('kehadiran_murid', [
		`CREATE TABLE IF NOT EXISTS "kehadiran_murid" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"sakit" integer DEFAULT 0 NOT NULL,
			"izin" integer DEFAULT 0 NOT NULL,
			"alfa" integer DEFAULT 0 NOT NULL,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "kehadiran_murid_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "kehadiran_murid_murid_unique" ON "kehadiran_murid" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "kehadiran_murid_murid_idx" ON "kehadiran_murid" ("murid_id")`
	]);
}

export async function ensureDashboardSchema() {
	await ensureKehadiranMuridSchema();
	await ensureAsesmenSumatifSchema();
	await ensureAsesmenEkstrakurikulerSchema();
	await ensureAsesmenKokurikulerSchema();
}
