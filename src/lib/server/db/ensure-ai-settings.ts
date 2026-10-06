import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

const TABLE = 'ai_settings';

async function hasColumn(column: string) {
	const result = await db.$client.execute(`PRAGMA table_info("${TABLE}")`);
	return result.rows.some((row) => row.name === column);
}

export async function ensureAiSettingsSchema() {
	await ensureSchema(TABLE, [
		`CREATE TABLE IF NOT EXISTS "${TABLE}" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL REFERENCES "sekolah"("id") ON DELETE CASCADE,
			"provider" text NOT NULL DEFAULT 'gemini',
			"api_key" text NOT NULL,
			"model" text NOT NULL,
			"base_url" text NOT NULL,
			"created_at" text NOT NULL,
			"updated_at" text
		)`
	]);

	// Database upstream lama pernah memakai satu konfigurasi global.
	if (!(await hasColumn('sekolah_id'))) {
		await db.$client.execute(`ALTER TABLE "${TABLE}" ADD COLUMN "sekolah_id" integer`);
		const sekolah = await db.$client.execute('SELECT id FROM sekolah ORDER BY id LIMIT 1');
		const sekolahId = sekolah.rows[0]?.id;
		if (sekolahId != null) {
			await db.$client.execute({
				sql: `UPDATE "${TABLE}" SET "sekolah_id" = ? WHERE "sekolah_id" IS NULL`,
				args: [sekolahId]
			});
		}
	}
	if (!(await hasColumn('base_url'))) {
		await db.$client.execute(`ALTER TABLE "${TABLE}" ADD COLUMN "base_url" text`);
	}
	await db.$client.execute(
		`CREATE UNIQUE INDEX IF NOT EXISTS "ai_settings_sekolah_unique" ON "${TABLE}" ("sekolah_id")`
	);
}
