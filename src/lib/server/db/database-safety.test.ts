import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createClient } from '@libsql/client';

const { createConsistentDatabaseBackup, inspectDatabaseFile } = (await import(
	'./database-safety' + '.ts'
)) as typeof import('./database-safety');

test('backup database konsisten, memuat data terakhir, dan lolos pemeriksaan SQLite', async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-db-safety-'));
	const databasePath = path.join(directory, 'database.sqlite3');
	const client = createClient({ url: `file:${databasePath}` });

	try {
		await client.execute('CREATE TABLE auth_user (id INTEGER PRIMARY KEY, username TEXT NOT NULL)');
		await client.execute('CREATE TABLE sekolah (id INTEGER PRIMARY KEY, nama TEXT NOT NULL)');
		await client.execute("INSERT INTO auth_user VALUES (1, 'admin')");
		await client.execute("INSERT INTO sekolah VALUES (1, 'Sekolah Uji')");

		const backupPath = await createConsistentDatabaseBackup({
			client,
			databasePath,
			label: 'test'
		});
		const inspection = await inspectDatabaseFile(backupPath, { requireKagangaTables: true });
		assert.equal(inspection.quickCheck, 'ok');
		assert.equal(inspection.foreignKeyViolations, 0);

		const backupClient = createClient({ url: `file:${backupPath}` });
		try {
			const row = await backupClient.execute('SELECT nama FROM sekolah WHERE id = 1');
			assert.equal(row.rows[0]?.nama, 'Sekolah Uji');
		} finally {
			await backupClient.close();
		}
	} finally {
		await client.close();
		await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}
});

test('pemeriksaan menolak SQLite yang bukan database Kaganga', async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-db-invalid-'));
	const databasePath = path.join(directory, 'database.sqlite3');
	const client = createClient({ url: `file:${databasePath}` });
	try {
		await client.execute('CREATE TABLE contoh (id INTEGER PRIMARY KEY)');
	} finally {
		await client.close();
	}

	try {
		await assert.rejects(
			inspectDatabaseFile(databasePath, { requireKagangaTables: true }),
			/bukan database Kaganga/
		);
	} finally {
		await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}
});
