import db from '$lib/server/db';

let ensured = false;

async function hasColumn(table: string, column: string) {
	const result = await db.$client.execute(`PRAGMA table_info("${table}")`);
	return result.rows.some((row) => String(row.name) === column);
}

export async function ensureKehadiranHadirSchema() {
	if (ensured) return;

	const tableResult = await db.$client.execute(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='kehadiran_murid'`
	);
	if (!tableResult.rows.length) {
		ensured = true;
		return;
	}

	if (!(await hasColumn('kehadiran_murid', 'hadir'))) {
		await db.$client.execute(
			'ALTER TABLE "kehadiran_murid" ADD COLUMN "hadir" INTEGER NOT NULL DEFAULT 0'
		);
	}

	await db.$client.execute(`
		CREATE TABLE IF NOT EXISTS "kehadiran_murid_detail" (
			"id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" INTEGER NOT NULL,
			"label" TEXT NOT NULL,
			"hadir" INTEGER NOT NULL DEFAULT 0,
			"sakit" INTEGER NOT NULL DEFAULT 0,
			"izin" INTEGER NOT NULL DEFAULT 0,
			"alfa" INTEGER NOT NULL DEFAULT 0,
			"created_at" TEXT NOT NULL DEFAULT (datetime('now')),
			"updated_at" TEXT,
			FOREIGN KEY ("murid_id") REFERENCES "murid"("id") ON UPDATE no action ON DELETE cascade
		)
	`);
	await db.$client.execute(
		'CREATE INDEX IF NOT EXISTS "kehadiran_murid_detail_murid_idx" ON "kehadiran_murid_detail" ("murid_id")'
	);
	await db.$client.execute(
		'CREATE INDEX IF NOT EXISTS "kehadiran_murid_detail_label_idx" ON "kehadiran_murid_detail" ("label")'
	);
	ensured = true;
}
