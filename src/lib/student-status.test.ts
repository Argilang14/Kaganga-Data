import assert from 'node:assert/strict';
import test from 'node:test';
import { passiveInput, placementPeriodProblem } from './student-status.ts';
import { migrateStudentPlacement } from './server/db/student-placement-migration.ts';
import { createClient } from '@libsql/client';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('alasan dan tanggal pasif divalidasi; aturan semester berbeda untuk naik dan pindah kelas', () => {
	const form = new FormData();
	form.set('reason', 'pindah_kelas');
	form.set('tanggal', '2024-02-29');
	assert.equal(passiveInput(form, '2026-11-02').reason, 'pindah_kelas');
	for (const date of ['2025-02-29', '2026-02-30', '2026-13-01', '2027-01-01', '']) {
		form.set('tanggal', date);
		assert.throws(() => passiveInput(form, '2026-11-02'));
	}
	form.set('tanggal', '2026-11-02');
	form.set('reason', 'aktif');
	assert.throws(() => passiveInput(form, '2026-11-02'));
	form.set('reason', 'keluar');
	form.set('catatan', 'x'.repeat(501));
	assert.throws(() => passiveInput(form, '2026-11-02'));
	assert.equal(placementPeriodProblem('pindah_kelas', 1, 1), null);
	assert(placementPeriodProblem('pindah_kelas', 1, 2));
	assert(placementPeriodProblem('naik_kelas', 1, 1));
	assert.equal(placementPeriodProblem('naik_kelas', 1, 2), null);
});

test('migrasi penempatan berulang mempertahankan data lama dan relasi', async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'kaganga-placement-'));
	const client = createClient({ url: 'file:' + path.join(dir, 'database.sqlite3') });
	try {
		await client.executeMultiple(`PRAGMA foreign_keys=ON;
   CREATE TABLE sekolah(id INTEGER PRIMARY KEY);
   CREATE TABLE murid(id INTEGER PRIMARY KEY,kelas_id INTEGER);
   CREATE TABLE murid_lifecycle(id INTEGER PRIMARY KEY,status TEXT);
   CREATE TABLE nilai(id INTEGER PRIMARY KEY,murid_id INTEGER REFERENCES murid(id),nilai INTEGER);
   INSERT INTO sekolah VALUES(1);INSERT INTO murid VALUES(1,42);
   INSERT INTO murid_lifecycle VALUES(1,'aktif');INSERT INTO nilai VALUES(1,1,88);`);
		await migrateStudentPlacement(client);
		await migrateStudentPlacement(client);
		assert.equal((await client.execute('SELECT kelas_id FROM murid')).rows[0].kelas_id, 42);
		assert.equal((await client.execute('SELECT nilai FROM nilai')).rows[0].nilai, 88);
		assert.equal(
			(await client.execute('SELECT placement_status FROM murid_lifecycle')).rows[0]
				.placement_status,
			null
		);
		await assert.rejects(client.execute("UPDATE murid_lifecycle SET placement_status='keluar'"));
		assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	} finally {
		client.close();
	}
});
