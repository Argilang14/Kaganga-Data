import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createClient } from '@libsql/client';

const { restoreDatabaseContents } = await import('./database-restore' + '.ts');

async function cleanup(directory: string) {
	await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(
		(cause: NodeJS.ErrnoException) => {
			if (!['EBUSY', 'EPERM'].includes(cause.code ?? '')) throw cause;
			console.warn('Windows masih menahan direktori uji:', directory);
		}
	);
}

test('restore preserves relations, blobs, generated columns, indexes, views, triggers and sequences', async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-restore-'));
	const sourcePath = path.join(directory, 'source.sqlite3');
	const source = createClient({ url: `file:${sourcePath}` });
	const target = createClient({ url: 'file::memory:' });
	try {
		await source.executeMultiple(`
			CREATE TABLE sekolah(id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT UNIQUE, foto BLOB);
			CREATE TABLE murid(id INTEGER PRIMARY KEY, sekolah_id INTEGER REFERENCES sekolah(id), nama TEXT, upper_nama TEXT GENERATED ALWAYS AS (upper(nama)) STORED);
			CREATE TABLE audit(id INTEGER PRIMARY KEY, nama TEXT);
			INSERT INTO sekolah VALUES(1, 'Uji', X'123456');
			INSERT INTO sekolah VALUES(100, 'Dihapus', NULL);
			DELETE FROM sekolah WHERE id=100;
			INSERT INTO murid(id,sekolah_id,nama) VALUES(1,1,'Putra');
			CREATE INDEX murid_nama ON murid(nama);
			CREATE VIEW daftar AS SELECT nama FROM murid;
			CREATE TRIGGER audit_sekolah AFTER INSERT ON sekolah BEGIN INSERT INTO audit(nama) VALUES(new.nama); END;
			PRAGMA user_version=77;
			PRAGMA application_id=42;
		`);
		await target.executeMultiple(
			'PRAGMA foreign_keys=ON; CREATE TABLE lama(id INTEGER); INSERT INTO lama VALUES(9);'
		);
		await restoreDatabaseContents(target, sourcePath);
		assert.equal((await target.execute('PRAGMA quick_check')).rows[0]?.quick_check, 'ok');
		assert.equal((await target.execute('PRAGMA foreign_key_check')).rows.length, 0);
		assert.equal((await target.execute('PRAGMA foreign_keys')).rows[0]?.foreign_keys, 1);
		assert.equal((await target.execute('PRAGMA user_version')).rows[0]?.user_version, 77);
		assert.equal((await target.execute('PRAGMA application_id')).rows[0]?.application_id, 42);
		assert.equal(
			(await target.execute('SELECT upper_nama FROM murid')).rows[0]?.upper_nama,
			'PUTRA'
		);
		assert.equal(
			(await target.execute('SELECT hex(foto) foto FROM sekolah')).rows[0]?.foto,
			'123456'
		);
		assert.equal((await target.execute('SELECT nama FROM daftar')).rows[0]?.nama, 'Putra');
		assert.equal(
			(await target.execute("SELECT name FROM sqlite_master WHERE name='murid_nama'")).rows.length,
			1
		);
		assert.equal((await target.execute('SELECT COUNT(*) n FROM audit')).rows[0]?.n, 0);
		await target.execute("INSERT INTO sekolah(nama) VALUES('Baru')");
		assert.equal(
			(await target.execute("SELECT id FROM sekolah WHERE nama='Baru'")).rows[0]?.id,
			101
		);
		assert.equal((await target.execute('SELECT nama FROM audit')).rows[0]?.nama, 'Baru');
		await restoreDatabaseContents(target, sourcePath);
		assert.equal((await target.execute('SELECT COUNT(*) n FROM sekolah')).rows[0]?.n, 1);
	} finally {
		source.close();
		target.close();
		await cleanup(directory);
	}
});

test('a copy constraint failure rolls back both schema and data and detaches the source', async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-restore-rollback-'));
	const sourcePath = path.join(directory, 'source.sqlite3');
	const source = createClient({ url: `file:${sourcePath}` });
	const target = createClient({ url: 'file::memory:' });
	try {
		await source.executeMultiple(
			'CREATE TABLE nilai(value INTEGER CHECK(value>0)); PRAGMA ignore_check_constraints=ON; INSERT INTO nilai VALUES(-1);'
		);
		await target.executeMultiple(
			"PRAGMA foreign_keys=ON; CREATE TABLE lama(nama TEXT); INSERT INTO lama VALUES('Tetap aman');"
		);
		await assert.rejects(restoreDatabaseContents(target, sourcePath), /CHECK constraint failed/);
		assert.equal((await target.execute('SELECT nama FROM lama')).rows[0]?.nama, 'Tetap aman');
		assert.equal(
			(await target.execute("SELECT name FROM sqlite_master WHERE name='nilai'")).rows.length,
			0
		);
		assert.equal((await target.execute('PRAGMA foreign_keys')).rows[0]?.foreign_keys, 1);
		assert.equal((await target.execute('PRAGMA database_list')).rows.length, 1);
		await source.execute('DELETE FROM nilai');
		await source.execute('INSERT INTO nilai VALUES(1)');
		await restoreDatabaseContents(target, sourcePath);
		assert.equal((await target.execute('SELECT value FROM nilai')).rows[0]?.value, 1);
	} finally {
		source.close();
		target.close();
		await cleanup(directory);
	}
});
