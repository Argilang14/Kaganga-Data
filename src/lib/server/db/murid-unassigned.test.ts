import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { migrateUnassignedMurid } from './murid-unassigned.ts';

test('murid tanpa kelas mempertahankan data, indeks, trigger, dan relasi lama', async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-student-migration-'));
	const client = createClient({ url: `file:${path.join(directory, 'database.sqlite3')}` });
	try {
		await client.executeMultiple(`CREATE TABLE kelas(id INTEGER PRIMARY KEY);
		CREATE TABLE murid(id INTEGER PRIMARY KEY AUTOINCREMENT,kelas_id INTEGER NOT NULL REFERENCES kelas(id),nama TEXT NOT NULL UNIQUE);
		CREATE TABLE nilai(id INTEGER PRIMARY KEY,murid_id INTEGER REFERENCES murid(id) ON DELETE CASCADE);
		CREATE INDEX murid_kelas ON murid(kelas_id);
		CREATE TRIGGER murid_name BEFORE INSERT ON murid WHEN NEW.nama='' BEGIN SELECT RAISE(ABORT,'empty_name'); END;
		CREATE TRIGGER nilai_student BEFORE INSERT ON nilai WHEN NOT EXISTS(SELECT 1 FROM murid WHERE id=NEW.murid_id) BEGIN SELECT RAISE(ABORT,'missing_student'); END;
		INSERT INTO kelas VALUES(1); INSERT INTO murid VALUES(1,1,'Murid Lama'); INSERT INTO nilai VALUES(1,1);
		INSERT INTO murid VALUES(100,1,'Riwayat Dihapus'); DELETE FROM murid WHERE id=100; PRAGMA foreign_keys=ON;`);
		await migrateUnassignedMurid(client);
		await migrateUnassignedMurid(client);
		await client.execute("INSERT INTO murid(kelas_id,nama) VALUES(NULL,'Murid Baru')");
		assert.equal(
			(await client.execute("SELECT id FROM murid WHERE nama='Murid Baru'")).rows[0].id,
			101
		);
		assert.equal((await client.execute('SELECT COUNT(*) AS total FROM murid')).rows[0].total, 2);
		assert.equal((await client.execute('SELECT COUNT(*) AS total FROM nilai')).rows[0].total, 1);
		assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
		await assert.rejects(client.execute("INSERT INTO murid(kelas_id,nama) VALUES(NULL,'')"));
		await assert.rejects(
			client.execute("INSERT INTO murid(kelas_id,nama) VALUES(NULL,'Murid Lama')")
		);
		await assert.rejects(client.execute('INSERT INTO nilai VALUES(2,999)'));
		assert.equal(
			(await client.execute("SELECT COUNT(*) AS total FROM sqlite_master WHERE name='murid_kelas'"))
				.rows[0].total,
			1
		);
	} finally {
		client.close();
	}
});
