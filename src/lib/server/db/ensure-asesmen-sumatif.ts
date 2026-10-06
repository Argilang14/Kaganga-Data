import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
	const result = (await db.$client.execute(`PRAGMA table_info(${tableName})`)) as unknown as {
		rows?: Array<Record<string, unknown> | unknown[]>;
	};
	const rows = result.rows ?? [];
	const hasColumn = rows.some((row) =>
		Array.isArray(row) ? row[1] === columnName : row.name === columnName
	);
	if (hasColumn) return;

	try {
		await db.$client.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
	} catch (error) {
		if (error instanceof Error && error.message.includes('duplicate column')) return;
		throw error;
	}
}

export async function ensureAsesmenSumatifSchema() {
	await ensureSchema('asesmen_sumatif', [
		`CREATE TABLE IF NOT EXISTS "asesmen_sumatif" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"na_lingkup" real,
			"sas_tes" real,
			"sas_non_tes" real,
			"sts_tes" real,
			"sts_non_tes" real,
			"sts" real,
			"sas" real,
			"nilai_akhir" real,
			"nilai_akhir_rts" real,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "asesmen_sumatif_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_sumatif_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS "asesmen_sumatif_tujuan" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"tujuan_pembelajaran_id" integer NOT NULL,
			"nilai" real,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "asesmen_sumatif_tujuan_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_sumatif_tujuan_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_sumatif_tujuan_tujuan_pembelajaran_id_tujuan_pembelajaran_id_fk" FOREIGN KEY ("tujuan_pembelajaran_id") REFERENCES "tujuan_pembelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_sumatif_unique" ON "asesmen_sumatif" ("murid_id", "mata_pelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_murid_idx" ON "asesmen_sumatif" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_mapel_idx" ON "asesmen_sumatif" ("mata_pelajaran_id")`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_unique" ON "asesmen_sumatif_tujuan" ("murid_id", "tujuan_pembelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_murid_idx" ON "asesmen_sumatif_tujuan" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_mapel_idx" ON "asesmen_sumatif_tujuan" ("mata_pelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_tp_idx" ON "asesmen_sumatif_tujuan" ("tujuan_pembelajaran_id")`
	]);

	await addColumnIfMissing('asesmen_sumatif', 'sts_tes', 'real');
	await addColumnIfMissing('asesmen_sumatif', 'sts_non_tes', 'real');
	await addColumnIfMissing('asesmen_sumatif', 'sts', 'real');
	await addColumnIfMissing('asesmen_sumatif', 'nilai_akhir_rts', 'real');
}
