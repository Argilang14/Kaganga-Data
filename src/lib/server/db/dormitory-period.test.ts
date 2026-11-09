import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { ensureDormitoryPeriod } from './dormitory-period.ts';

test('dormitories bind once to a school period; rollover preserves records and permits name reuse', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 'kaganga-dorm-period-'));
	const database = path.join(directory, 'fixture.db');
	const client = createClient({ url: `file:${database}` });
	try {
		await client.executeMultiple(`
CREATE TABLE tahun_ajaran(id INTEGER PRIMARY KEY,sekolah_id INTEGER,is_aktif INTEGER);
CREATE TABLE semester(id INTEGER PRIMARY KEY,tahun_ajaran_id INTEGER,is_aktif INTEGER);
CREATE TABLE asrama(id INTEGER PRIMARY KEY,sekolah_id INTEGER,nama_key TEXT,deleted_at TEXT,UNIQUE(sekolah_id,nama_key));
CREATE TABLE preserved_history(id INTEGER PRIMARY KEY,asrama_id INTEGER,payload TEXT);
INSERT INTO tahun_ajaran VALUES(1,1,1),(2,1,0),(3,2,1);
INSERT INTO semester VALUES(1,1,1),(2,1,0),(3,2,1),(4,3,1);
INSERT INTO asrama VALUES(1,1,'asrama a',NULL);
INSERT INTO preserved_history VALUES(1,1,'nilai dan penempatan lama');`);
		await Promise.all([ensureDormitoryPeriod(client), ensureDormitoryPeriod(client)]);
		assert.equal(
			(await client.execute('SELECT semester_id FROM asrama WHERE id=1')).rows[0].semester_id,
			1
		);
		await client.executeMultiple(
			'UPDATE semester SET is_aktif=0 WHERE id=1; UPDATE semester SET is_aktif=1 WHERE id=2;'
		);
		await ensureDormitoryPeriod(client);
		assert.equal(
			(await client.execute('SELECT count(*) AS n FROM asrama WHERE semester_id=2')).rows[0].n,
			0
		);
		await client.execute("INSERT INTO asrama(id,sekolah_id,nama_key) VALUES(2,1,'asrama a')");
		assert.equal(
			(await client.execute('SELECT semester_id FROM asrama WHERE id=2')).rows[0].semester_id,
			2
		);
		await assert.rejects(
			client.execute("INSERT INTO asrama(id,sekolah_id,nama_key) VALUES(3,1,'asrama a')"),
			/UNIQUE/
		);
		await assert.rejects(
			client.execute('UPDATE asrama SET semester_id=2 WHERE id=1'),
			/asrama_period_locked/
		);
		await assert.rejects(
			client.execute(
				"INSERT INTO asrama(id,sekolah_id,nama_key,semester_id) VALUES(4,1,'foreign',4)"
			),
			/asrama_period_scope/
		);
		await client.executeMultiple(
			'UPDATE tahun_ajaran SET is_aktif=0 WHERE id=1; UPDATE tahun_ajaran SET is_aktif=1 WHERE id=2;'
		);
		await client.execute("INSERT INTO asrama(id,sekolah_id,nama_key) VALUES(5,1,'asrama a')");
		assert.equal(
			(await client.execute('SELECT semester_id FROM asrama WHERE id=5')).rows[0].semester_id,
			3
		);
		const restarted = createClient({ url: `file:${database}` });
		try {
			await ensureDormitoryPeriod(restarted);
			assert.equal(
				(await restarted.execute('SELECT semester_id FROM asrama WHERE id=1')).rows[0].semester_id,
				1
			);
		} finally {
			restarted.close();
		}
		assert.deepEqual(
			(await client.execute('SELECT * FROM preserved_history')).rows.map((row) => ({ ...row })),
			[{ id: 1, asrama_id: 1, payload: 'nilai dan penempatan lama' }]
		);
	} finally {
		client.close();
	}
});
