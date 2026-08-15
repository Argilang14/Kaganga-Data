import { createClient, type Client } from '@libsql/client';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type DatabaseInspection = {
	quickCheck: string;
	foreignKeyViolations: number;
	tables: string[];
};

function quoteSqlitePath(filePath: string) {
	return filePath.replaceAll('\\', '/').replaceAll("'", "''");
}

export async function inspectDatabaseFile(
	filePath: string,
	options: { requireKagangaTables?: boolean } = {}
): Promise<DatabaseInspection> {
	const fileStat = await stat(filePath);
	if (!fileStat.isFile() || fileStat.size < 100) throw new Error('Berkas database tidak valid.');

	const client = createClient({ url: `file:${filePath}` });
	try {
		const quick = await client.execute('PRAGMA quick_check');
		const quickCheck = String(
			quick.rows[0]?.quick_check ?? Object.values(quick.rows[0] ?? {})[0] ?? ''
		);
		if (quickCheck.toLowerCase() !== 'ok') {
			throw new Error(`Pemeriksaan SQLite gagal: ${quickCheck || 'hasil tidak tersedia'}.`);
		}
		const foreignKeys = await client.execute('PRAGMA foreign_key_check');
		const tableRows = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
		);
		const tables = tableRows.rows.map((row) => String(row.name ?? ''));
		if (
			options.requireKagangaTables &&
			(!tables.includes('auth_user') || !tables.includes('sekolah'))
		) {
			throw new Error('Berkas bukan database Kaganga/Rapkumer yang didukung.');
		}
		return { quickCheck, foreignKeyViolations: foreignKeys.rows.length, tables };
	} finally {
		await client.close();
	}
}

export async function createConsistentDatabaseBackup(options: {
	client: Client;
	databasePath: string;
	label: string;
}) {
	const directory = path.dirname(options.databasePath);
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const safeLabel = options.label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
	const backupPath = path.join(directory, `database-backup-${safeLabel}-${timestamp}.sqlite3`);
	await mkdir(directory, { recursive: true });
	try {
		await options.client.execute('PRAGMA wal_checkpoint(FULL)');
	} catch {
		// VACUUM INTO tetap menghasilkan snapshot konsisten walau checkpoint tidak diperlukan.
	}
	await options.client.execute(`VACUUM INTO '${quoteSqlitePath(backupPath)}'`);
	await inspectDatabaseFile(backupPath);
	return backupPath;
}
