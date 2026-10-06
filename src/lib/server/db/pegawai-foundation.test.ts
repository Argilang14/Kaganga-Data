import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@libsql/client';

const { ensurePegawaiFoundation } = (await import(
	'./pegawai-foundation' + '.ts'
)) as typeof import('./pegawai-foundation');

test('migrasi pegawai memperluas database lama tanpa mengubah akun dan dapat diulang', async () => {
	const client = createClient({ url: 'file::memory:' });

	try {
		await client.execute('PRAGMA foreign_keys=ON');
		await client.execute(`CREATE TABLE pegawai (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT NOT NULL,
			nip TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT
		)`);
		await client.execute(`CREATE TABLE sekolah (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT NOT NULL,
			kepala_sekolah_id INTEGER
		)`);
		await client.execute(`CREATE TABLE auth_user (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL,
			pegawai_id INTEGER,
			sekolah_id INTEGER
		)`);
		await client.execute(`CREATE TABLE tahun_ajaran (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL,
			nama TEXT NOT NULL
		)`);
		await client.execute(`CREATE TABLE kelas (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER,
			wali_kelas_id INTEGER
		)`);
		await client.execute(`CREATE TABLE mata_pelajaran (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT NOT NULL
		)`);
		await client.execute(
			`INSERT INTO pegawai (nama, nip, created_at) VALUES ('Guru Lama', '19800101', '2026-01-01')`
		);
		await client.execute(`INSERT INTO sekolah (nama, kepala_sekolah_id) VALUES ('SRT', 1)`);
		await client.execute(
			`INSERT INTO auth_user (username, pegawai_id, sekolah_id) VALUES ('guru.lama', 1, 1)`
		);

		await ensurePegawaiFoundation(client);
		await ensurePegawaiFoundation(client);

		const pegawai = await client.execute(
			'SELECT nama, nip, sekolah_id, kode_pegawai FROM pegawai WHERE id = 1'
		);
		assert.equal(pegawai.rows[0]?.nama, 'Guru Lama');
		assert.equal(pegawai.rows[0]?.nip, '19800101');
		assert.equal(Number(pegawai.rows[0]?.sekolah_id), 1);
		assert.equal(pegawai.rows[0]?.kode_pegawai, 'AUTO-PGW-00000001');

		const accountCount = await client.execute('SELECT COUNT(*) AS total FROM auth_user');
		assert.equal(Number(accountCount.rows[0]?.total), 1);

		const columns = await client.execute('PRAGMA table_info("pegawai")');
		const columnNames = new Set(columns.rows.map((row) => String(row.name)));
		for (const expected of ['kode_pegawai', 'nik', 'foto', 'status_kepegawaian']) {
			assert.ok(columnNames.has(expected), `kolom ${expected} harus tersedia`);
		}

		const tables = await client.execute(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'pegawai_%'`
		);
		const tableNames = new Set(tables.rows.map((row) => String(row.name)));
		for (const expected of [
			'pegawai_penugasan',
			'pegawai_pendidikan',
			'pegawai_sertifikasi',
			'pegawai_dokumen',
			'pegawai_riwayat'
		]) {
			assert.ok(tableNames.has(expected), `tabel ${expected} harus tersedia`);
		}

		await client.execute(`INSERT INTO pegawai_pendidikan (
			sekolah_id, pegawai_id, jenjang, institusi, created_at
		) VALUES (1, 1, 'S1', 'Universitas Contoh', '2026-01-01')`);
		const educationCount = await client.execute(
			'SELECT COUNT(*) AS total FROM pegawai_pendidikan WHERE pegawai_id = 1'
		);
		assert.equal(Number(educationCount.rows[0]?.total), 1);

		await client.execute(`INSERT INTO pegawai (
			sekolah_id, kode_pegawai, nama, nip, jenis, status, email, created_at
		) VALUES (1, 'PGW-TEST-001', 'Guru Baru', '-', 'guru', 'aktif',
			'guru.baru@example.test', '2026-01-02')`);
		const created = await client.execute(
			`SELECT id, nama, status, email FROM pegawai WHERE kode_pegawai = 'PGW-TEST-001'`
		);
		const createdId = Number(created.rows[0]?.id);
		assert.equal(created.rows[0]?.nama, 'Guru Baru');

		await client.execute(
			`UPDATE pegawai SET email = 'guru.edit@example.test', status = 'nonaktif'
			 WHERE id = ${createdId} AND sekolah_id = 1`
		);
		const updated = await client.execute(
			`SELECT status, email FROM pegawai WHERE id = ${createdId} AND sekolah_id = 1`
		);
		assert.equal(updated.rows[0]?.status, 'nonaktif');
		assert.equal(updated.rows[0]?.email, 'guru.edit@example.test');

		await assert.rejects(() =>
			client.execute(`INSERT INTO pegawai (
				sekolah_id, kode_pegawai, nama, nip, jenis, status, created_at
			) VALUES (1, 'PGW-TEST-001', 'Duplikat', '-', 'guru', 'aktif', '2026-01-02')`)
		);

		await client.execute(`DELETE FROM pegawai WHERE id = ${createdId} AND sekolah_id = 1`);
		const deleted = await client.execute(
			`SELECT COUNT(*) AS total FROM pegawai WHERE id = ${createdId}`
		);
		assert.equal(Number(deleted.rows[0]?.total), 0);
	} finally {
		await client.close();
	}
});
