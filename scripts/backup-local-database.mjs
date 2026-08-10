#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const sourceUrl = process.env.DB_URL || 'file:./data/database.sqlite3';
if (!sourceUrl.startsWith('file:')) {
	throw new Error('Backup lokal hanya mendukung database SQLite file.');
}

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const label = (process.env.BACKUP_LABEL || 'manual').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
const backupDirectory = path.resolve('data');
const backupPath = path.join(backupDirectory, `database-backup-${label}-${timestamp}.sqlite3`);
const quotedBackupPath = backupPath.replaceAll('\\', '/').replaceAll("'", "''");

await mkdir(backupDirectory, { recursive: true });
const client = createClient({ url: sourceUrl });
try {
	await client.execute(`VACUUM INTO '${quotedBackupPath}'`);
	console.log(backupPath);
} finally {
	await client.close();
}
