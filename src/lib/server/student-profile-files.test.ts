import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createClient } from '@libsql/client';
import {
	backupStudentProfileFiles,
	profileFilePath,
	verifyStudentProfileFiles
} from './student-profile-files.ts';
import { restoreDatabaseContents } from './db/database-restore.ts';

test('foto privat menolak lintas sekolah, traversal dan ekstensi berbahaya', () => {
	const key = 'sekolah-1/11111111-2222-3333-4444-555555555555.jpg';
	assert.ok(profileFilePath(1, key));
	assert.equal(profileFilePath(2, key), null);
	for (const value of [
		'../foto.jpg',
		key.replace('/', '\\'),
		key.replace('.jpg', '.svg'),
		'https://example.com/photo.jpg'
	])
		assert.equal(profileFilePath(1, value), null);
});

test('backup menyalin dan memverifikasi foto snapshot; restore menolak berkas hilang sebelum mengubah data', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'kaganga-profile-files-'));
	const previous = process.env.photo;
	process.env.photo = `file:${path.join(folder, 'uploads')}`;
	const database = path.join(folder, 'snapshot.sqlite3');
	const snapshot = createClient({ url: `file:${database}` });
	const target = createClient({ url: `file:${path.join(folder, 'target.sqlite3')}` });
	try {
		const key = 'sekolah-1/11111111-2222-3333-4444-555555555555.jpg';
		const file = profileFilePath(1, key)!;
		await mkdir(path.dirname(file), { recursive: true });
		await copyFile(new URL(import.meta.url), file);
		const bytes = await readFile(file);
		await snapshot.execute(
			'CREATE TABLE murid_profil_foto (sekolah_id INTEGER, storage_key TEXT, ukuran_bytes INTEGER, sha256 TEXT)'
		);
		await snapshot.execute({
			sql: 'INSERT INTO murid_profil_foto VALUES (1,?,?,?)',
			args: [key, bytes.length, createHash('sha256').update(bytes).digest('hex')]
		});
		await backupStudentProfileFiles(database);
		const copied = profileFilePath(1, key, `${database}.murid-profil`)!;
		assert.deepEqual(await readFile(copied), bytes);
		await verifyStudentProfileFiles(snapshot);
		await target.execute('CREATE TABLE important (value TEXT)');
		await target.execute("INSERT INTO important VALUES ('preserve')");
		await unlink(file);
		await assert.rejects(restoreDatabaseContents(target, database), /belum tersedia/);
		assert.equal((await target.execute('SELECT value FROM important')).rows[0].value, 'preserve');
		await copyFile(copied, file);
		await restoreDatabaseContents(target, database);
		assert.equal(
			(await target.execute('SELECT COUNT(*) AS count FROM murid_profil_foto')).rows[0].count,
			1
		);
	} finally {
		snapshot.close();
		target.close();
		if (previous === undefined) delete process.env.photo;
		else process.env.photo = previous;
	}
});
