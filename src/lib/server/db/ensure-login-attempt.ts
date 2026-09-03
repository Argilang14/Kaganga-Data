import { ensureSchema } from './ensure-helper';

export async function ensureLoginAttemptSchema() {
	await ensureSchema('login_attempt', [
		`CREATE TABLE IF NOT EXISTS "login_attempt" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"key_hash" text NOT NULL,
			"failed_count" integer NOT NULL DEFAULT 0,
			"window_started_at" text NOT NULL,
			"blocked_until" text,
			"created_at" text NOT NULL,
			"updated_at" text
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "login_attempt_key_hash_unique" ON "login_attempt" ("key_hash")`,
		`CREATE INDEX IF NOT EXISTS "login_attempt_blocked_until_idx" ON "login_attempt" ("blocked_until")`
	]);
}
