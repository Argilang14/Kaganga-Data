import type { Client } from '@libsql/client';
import { createConsistentDatabaseBackup } from './database-safety.ts';

export async function migrateStudentPlacement(client: Client, databasePath?: string) {
	const columns = await client.execute('PRAGMA table_info(murid_lifecycle)');
	const missing = !columns.rows.some((column) => column.name === 'placement_status');
	const table = await client.execute(
		"SELECT 1 FROM sqlite_master WHERE type='table' AND name='murid_perpindahan_kelas'"
	);
	if (!missing && table.rows.length) return;
	if (databasePath)
		await createConsistentDatabaseBackup({ client, databasePath, label: 'murid-pasif-penempatan' });
	const tx = await client.transaction('write');
	try {
		if (missing)
			await tx.execute(
				"ALTER TABLE murid_lifecycle ADD COLUMN placement_status TEXT CHECK(placement_status IN ('naik_kelas','pindah_kelas'))"
			);
		// ponytail: record new releases only; backfill requires verified historical events.
		await tx.execute(`CREATE TABLE IF NOT EXISTS murid_perpindahan_kelas (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			identity_key TEXT NOT NULL,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
			kelas_snapshot TEXT NOT NULL,
			semester_snapshot TEXT NOT NULL,
			tahun_ajaran_snapshot TEXT NOT NULL,
			tanggal TEXT NOT NULL,
			alasan TEXT NOT NULL,
			catatan TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`);
		await tx.execute(
			'CREATE INDEX IF NOT EXISTS murid_perpindahan_identity_idx ON murid_perpindahan_kelas(sekolah_id,identity_key,id)'
		);
		await tx.commit();
	} catch (cause) {
		await tx.rollback();
		throw cause;
	} finally {
		tx.close();
	}
}
