import db from '$lib/server/db';

async function authUserHasColumn(name: string) {
	const result = await db.$client.execute('PRAGMA table_info("auth_user")');
	return result.rows.some((row) => row.name === name);
}

export async function ensureAccountSettingsSchema() {
	if (!(await authUserHasColumn('must_change_password'))) {
		await db.$client.execute(
			'ALTER TABLE "auth_user" ADD COLUMN "must_change_password" integer NOT NULL DEFAULT 0'
		);
	}
	await db.$client.execute(`CREATE TABLE IF NOT EXISTS "user_ai_settings" (
		"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
		"auth_user_id" integer NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
		"provider" text NOT NULL DEFAULT 'gemini',
		"api_key" text NOT NULL,
		"model" text NOT NULL,
		"base_url" text NOT NULL,
		"created_at" text NOT NULL,
		"updated_at" text
	)`);
	await db.$client.execute(
		'CREATE UNIQUE INDEX IF NOT EXISTS "user_ai_settings_user_unique" ON "user_ai_settings" ("auth_user_id")'
	);
}
