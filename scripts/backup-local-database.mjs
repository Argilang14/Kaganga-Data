#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceUrl = process.env.DB_URL || 'file:./data/database.sqlite3';
if (!sourceUrl.startsWith('file:')) {
	throw new Error('Backup lokal hanya mendukung database SQLite file.');
}

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const label = (process.env.BACKUP_LABEL || 'manual').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
const backupDirectory = path.resolve(process.env.BACKUP_DIRECTORY || 'data');
const backupPath = path.join(backupDirectory, `database-backup-${label}-${timestamp}.sqlite3`);
const quotedBackupPath = backupPath.replaceAll('\\', '/').replaceAll("'", "''");

await mkdir(backupDirectory, { recursive: true });
const client = createClient({ url: sourceUrl });
try {
	await client.execute(`VACUUM INTO '${quotedBackupPath}'`);
	console.log(backupPath);
	const table = await client.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='document_attachment'");
	if (table.rows.length) {
		const rows = await client.execute('SELECT id, sekolah_id, entity_type, entity_id, category, original_name, stored_path, mime_type, size_bytes, sha256, created_at FROM document_attachment ORDER BY id');
		const configured = process.env.photo || 'file:./data/uploads';
		const uploadBase = configured.startsWith('file:') ? configured.slice(5) : configured;
		const root = path.resolve(uploadBase, 'attachments');
		const attachments = [];
		for (const row of rows.rows) {
			const target = path.resolve(root, ...String(row.stored_path).split('/'));
			let exists = false;
			let physicalSize = null;
			if (target.startsWith(`${root}${path.sep}`)) {
				try { const info = await stat(target); exists = info.isFile(); physicalSize = info.size; } catch { /* tercatat sebagai berkas hilang */ }
			}
			attachments.push({ ...row, exists, physical_size: physicalSize });
		}
		const manifestPath = `${backupPath}.attachments.json`;
		await writeFile(manifestPath, JSON.stringify({ version: 1, created_at: new Date().toISOString(), database_backup: path.basename(backupPath), attachment_root: root, note: 'Salin folder attachment_root bersama file backup SQLite ini.', attachments }, null, 2), 'utf8');
		console.log(manifestPath);
	}
} finally {
	await client.close();
}
