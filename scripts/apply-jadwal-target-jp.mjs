#!/usr/bin/env node
import { createClient } from '@libsql/client';

const { JADWAL_TARGET_JP_SCHEMA } = await import(
	'../src/lib/server/db/jadwal-target-jp-schema' + '.ts'
);

const databaseUrl = process.env.DB_URL;
if (!databaseUrl?.startsWith('file:')) {
	throw new Error('DB_URL SQLite lokal wajib ditentukan untuk migrasi target JP.');
}

const client = createClient({ url: databaseUrl });
try {
	for (const statement of JADWAL_TARGET_JP_SCHEMA) await client.execute(statement);
	const quickCheck = String(
		(await client.execute('PRAGMA quick_check')).rows[0]?.quick_check ?? ''
	);
	const foreignKeyIssues = (await client.execute('PRAGMA foreign_key_check')).rows.length;
	const tableExists = Boolean(
		(
			await client.execute(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jadwal_target_jp'`
			)
		).rows.length
	);

	if (!tableExists || quickCheck !== 'ok' || foreignKeyIssues) {
		throw new Error(
			`Migrasi target JP gagal: ${JSON.stringify({ tableExists, quickCheck, foreignKeyIssues })}`
		);
	}
	console.log(JSON.stringify({ databaseUrl, tableExists, quickCheck, foreignKeyIssues }));
} finally {
	await client.close();
}
