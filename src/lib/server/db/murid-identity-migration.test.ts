import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { auditMuridIdentity, migrateMuridIdentity } from './murid-identity-migration.ts';

const temporaryDirectories: string[] = [];
after(async () => {
	for (const directory of temporaryDirectories) {
		if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'kaganga-murid-identity-')))
			throw new Error('Unsafe test cleanup path');
		await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(
			(error: NodeJS.ErrnoException) => {
				if (!['EBUSY', 'EPERM'].includes(error.code ?? '')) throw error;
				console.warn('Windows masih menahan direktori uji:', directory);
			}
		);
	}
});
async function fixture() {
	const directory = await mkdtemp(path.join(tmpdir(), 'kaganga-murid-identity-'));
	temporaryDirectories.push(directory);
	const client = createClient({ url: `file:${path.join(directory, 'fixture.sqlite3')}` });
	await client.executeMultiple(`
		PRAGMA foreign_keys=ON;
		CREATE TABLE sekolah(id INTEGER PRIMARY KEY);
		CREATE TABLE semester(id INTEGER PRIMARY KEY,nama TEXT);
		CREATE TABLE tahun_ajaran(id INTEGER PRIMARY KEY,nama TEXT);
		CREATE TABLE kelas(id INTEGER PRIMARY KEY,tahun_ajaran_id INTEGER,nama TEXT,fase TEXT);
		CREATE TABLE murid(id INTEGER PRIMARY KEY,sekolah_id INTEGER REFERENCES sekolah(id),semester_id INTEGER REFERENCES semester(id),kelas_id INTEGER REFERENCES kelas(id),nis TEXT,nisn TEXT,nama TEXT,tanggal_lahir TEXT);
		CREATE TABLE murid_lifecycle(id INTEGER PRIMARY KEY,sekolah_id INTEGER,identity_key TEXT,nis TEXT,nisn TEXT,nama_snapshot TEXT,status TEXT,last_murid_id INTEGER,tanggal_status TEXT,alasan TEXT,created_at TEXT,updated_at TEXT,UNIQUE(sekolah_id,identity_key));
		CREATE TABLE murid_riwayat_kelas(id INTEGER PRIMARY KEY,sekolah_id INTEGER,identity_key TEXT,murid_id INTEGER UNIQUE,tahun_ajaran_id INTEGER,semester_id INTEGER,kelas_id INTEGER,nama_snapshot TEXT,nis_snapshot TEXT,nisn_snapshot TEXT,tahun_ajaran_snapshot TEXT,semester_snapshot TEXT,kelas_snapshot TEXT,fase_snapshot TEXT,status_snapshot TEXT,recorded_at TEXT);
		CREATE TABLE audit_log(sekolah_id INTEGER,entity_type TEXT,action TEXT,before_data TEXT);
		INSERT INTO sekolah VALUES(1),(2);
		INSERT INTO semester VALUES(1,'Ganjil'),(2,'Genap');
		INSERT INTO tahun_ajaran VALUES(1,'2026/2027');
		INSERT INTO kelas VALUES(1,1,'A','E'),(2,1,'B','E');
	`);
	return client;
}

async function student(
	client: ReturnType<typeof createClient>,
	id: number,
	nisn = '000',
	school = 1,
	semester = 1,
	nis = `N${id}`,
	nama = `Murid ${id}`
) {
	await client.execute({
		sql: 'INSERT INTO murid VALUES(?,?,?,?,?,?,?,?)',
		args: [id, school, semester, 1, nis, nisn, nama, '2009-01-01']
	});
	await client.execute({
		sql: "INSERT INTO murid_riwayat_kelas(sekolah_id,identity_key,murid_id,status_snapshot) VALUES(?,?,?,'aktif')",
		args: [school, nisn ? `nisn:${nisn}` : `nis:${nis.toLowerCase()}`, id]
	});
}

test('189 murid bernomor 000 dipisah, status orang lain tidak ikut diarsipkan', async () => {
	const client = await fixture();
	try {
		for (let id = 1; id <= 189; id++) await student(client, id);
		await client.execute(
			"INSERT INTO murid_lifecycle(sekolah_id,identity_key,nis,nisn,nama_snapshot,status,last_murid_id) VALUES(1,'nisn:000','N999','000','Murid Terhapus','keluar',189)"
		);
		await client.execute({
			sql: "INSERT INTO audit_log VALUES(1,'murid','delete',?)",
			args: [JSON.stringify({ id: 999, nis: 'N999', nisn: '000', nama: 'Murid Terhapus' })]
		});
		const result = await migrateMuridIdentity(client, { backup: false });
		assert.equal(result.recoveredGroups, 189);
		assert.equal(
			(await client.execute('SELECT DISTINCT identity_uid FROM murid_identity_link')).rows.length,
			189
		);
		assert.equal(
			(
				await client.execute(
					"SELECT * FROM murid_lifecycle WHERE identity_key LIKE 'uid:%' AND status='aktif'"
				)
			).rows.length,
			189
		);
		const uid = (
			await client.execute('SELECT identity_uid FROM murid_identity_link WHERE murid_id=1')
		).rows[0].identity_uid;
		await client.execute({
			sql: "UPDATE murid_lifecycle SET status='keluar' WHERE identity_key=?",
			args: [`uid:${uid}`]
		});
		assert.equal(
			(
				await client.execute(
					"SELECT * FROM murid_lifecycle WHERE identity_key LIKE 'uid:%' AND status='aktif'"
				)
			).rows.length,
			188
		);
		assert.equal((await client.execute('SELECT * FROM murid')).rows.length, 189);
		assert.equal((await migrateMuridIdentity(client, { backup: false })).migrated, false);
		assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	} finally {
		client.close();
	}
});

test('bukti tidak lengkap ditandai untuk diperiksa, bukan diaktifkan semua', async () => {
	const client = await fixture();
	try {
		await student(client, 1);
		await student(client, 2);
		await client.execute(
			"INSERT INTO murid_lifecycle(sekolah_id,identity_key,nis,nisn,nama_snapshot,status,last_murid_id) VALUES(1,'nisn:000','N2','000','Murid 2','alumni',2)"
		);
		const plan = await auditMuridIdentity(client);
		assert.equal(plan.reviewGroups, 2);
		await migrateMuridIdentity(client, { backup: false });
		assert.equal(
			(await client.execute('SELECT * FROM murid_identity_review WHERE resolved_at IS NULL')).rows
				.length,
			2
		);
		assert.equal(
			(
				await client.execute(
					"SELECT * FROM murid_lifecycle WHERE identity_key LIKE 'uid:%' AND status='alumni' AND needs_identity_review=1"
				)
			).rows.length,
			2
		);
	} finally {
		client.close();
	}
});

test('identitas antarperiode tetap sama tetapi sekolah dan orang berbeda terpisah', async () => {
	const client = await fixture();
	try {
		await student(client, 1, '0096329793', 1, 1, 'N1', 'Murid A');
		await student(client, 2, '0096329793', 1, 2, 'N1', 'Murid A');
		await student(client, 3, '0096329793', 2, 1, 'N1', 'Murid A');
		await student(client, 4, '0096329793', 1, 1, 'N4', 'Murid B');
		await migrateMuridIdentity(client, { backup: false });
		const links = (
			await client.execute('SELECT identity_uid FROM murid_identity_link ORDER BY murid_id')
		).rows.map((r) => r.identity_uid);
		assert.equal(links[0], links[1]);
		assert.notEqual(links[0], links[2]);
		assert.notEqual(links[0], links[3]);
		await client.execute("UPDATE murid SET nisn='0011223344' WHERE id=1");
		await migrateMuridIdentity(client, { backup: false });
		assert.equal(
			(await client.execute('SELECT identity_uid FROM murid_identity_link WHERE murid_id=1'))
				.rows[0].identity_uid,
			links[0]
		);
	} finally {
		client.close();
	}
});

test('migrasi menolak tanpa backup dan tidak mengubah database saat gagal', async () => {
	const client = await fixture();
	try {
		await student(client, 1);
		await assert.rejects(migrateMuridIdentity(client), /Backup database/);
		assert.equal(
			(await client.execute("SELECT name FROM sqlite_master WHERE name='murid_identity_migration'"))
				.rows.length,
			0
		);
		await client.execute('DROP TABLE tahun_ajaran');
		await assert.rejects(migrateMuridIdentity(client, { backup: false }));
		assert.equal(
			(await client.execute("SELECT name FROM sqlite_master WHERE name='murid_identity_link'")).rows
				.length,
			0
		);
	} finally {
		client.close();
	}
});

test('murid yang memang diarsipkan tidak dipulihkan bersama korban NISN bersama', async () => {
	const client = await fixture();
	try {
		await student(client, 1);
		await student(client, 2);
		await client.execute(
			"INSERT INTO murid_lifecycle(sekolah_id,identity_key,nis,nisn,nama_snapshot,status,last_murid_id) VALUES(1,'nisn:000','N1','000','Murid 1','keluar',1)"
		);
		await client.execute({
			sql: "INSERT INTO audit_log VALUES(1,'murid','delete',?)",
			args: [JSON.stringify({ id: 1, nis: 'N1', nisn: '000', nama: 'Murid 1' })]
		});
		await migrateMuridIdentity(client, { backup: false });
		const rows = (
			await client.execute(
				"SELECT m.id,ml.status FROM murid m JOIN murid_identity_link mi ON mi.murid_id=m.id JOIN murid_lifecycle ml ON ml.sekolah_id=m.sekolah_id AND ml.identity_key='uid:' || mi.identity_uid ORDER BY m.id"
			)
		).rows;
		assert.equal(rows[0].status, 'keluar');
		assert.equal(rows[1].status, 'aktif');
	} finally {
		client.close();
	}
});
