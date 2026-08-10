#!/usr/bin/env node
import { createClient } from '@libsql/client';

const databaseUrl = process.env.DB_URL || 'file:./data/database.sqlite3';
const client = createClient({ url: databaseUrl });

try {
	const columns = await client.execute('PRAGMA table_info("pegawai")');
	const tables = await client.execute(
		`SELECT name FROM sqlite_master
		 WHERE type = 'table' AND name LIKE 'pegawai_%'`
	);
	const missingCodes = await client.execute(
		`SELECT COUNT(*) AS total FROM pegawai
		 WHERE kode_pegawai IS NULL OR trim(kode_pegawai) = ''`
	);
	const quickCheck = await client.execute('PRAGMA quick_check');
	const foreignKeyIssues = await client.execute('PRAGMA foreign_key_check');

	const result = {
		profileColumns: columns.rows.length,
		supportTables: tables.rows.map((row) => String(row.name)).sort(),
		missingCodes: Number(missingCodes.rows[0]?.total ?? 0),
		quickCheck: String(quickCheck.rows[0]?.quick_check ?? ''),
		foreignKeyIssues: foreignKeyIssues.rows.length
	};
	console.log(JSON.stringify(result, null, 2));

	if (result.missingCodes || result.quickCheck !== 'ok' || result.foreignKeyIssues) {
		process.exitCode = 1;
	}
} finally {
	await client.close();
}
