import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { tableMuridProfilTambahan } from './schema.ts';
import { muridProfileSchemaStatements } from './murid-profile-schema.ts';

test('profil parsial melalui ORM memakai daftar bantuan kosong, bukan string JSON', async () => {
	const client = createClient({ url: ':memory:' });
	try {
		for (const table of ['sekolah', 'pegawai', 'auth_user'])
			await client.execute(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY)`);
		await client.execute('INSERT INTO sekolah(id) VALUES(1)');
		for (const statement of muridProfileSchemaStatements) await client.execute(statement);
		const db = drizzle(client, { casing: 'snake_case' });
		for (const values of [{ jumlahTanggungan: 0 }, {}]) {
			const [saved] = await db
				.insert(tableMuridProfilTambahan)
				.values({
					sekolahId: 1,
					identityUid: `partial-${Object.keys(values).length}`,
					...values
				})
				.returning();
			assert.deepEqual(saved.jenisBansos, []);
			assert.equal(saved.statusBansos, null);
		}
	} finally {
		client.close();
	}
});

test('migrasi aditif, idempoten, terpisah per sekolah, dan metadata foto memiliki pemilik', async () => {
	const client = createClient({ url: ':memory:' });
	try {
		await client.execute('PRAGMA foreign_keys=ON');
		for (const table of ['sekolah', 'pegawai', 'auth_user'])
			await client.execute(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY)`);
		await client.execute('INSERT INTO sekolah(id) VALUES(1),(2)');
		await client.execute('CREATE TABLE murid(id INTEGER PRIMARY KEY,nama TEXT)');
		await client.execute("INSERT INTO murid VALUES(1,'Murid tetap')");
		for (let i = 0; i < 2; i++)
			for (const statement of muridProfileSchemaStatements) await client.execute(statement);
		assert.equal((await client.execute('SELECT nama FROM murid')).rows[0].nama, 'Murid tetap');
		const addProfile = (school: number, uid: string) =>
			client.execute({
				sql: 'INSERT INTO murid_profil_tambahan(sekolah_id,identity_uid,created_at) VALUES(?,?,?)',
				args: [school, uid, '2026-10-26T00:00:00Z']
			});
		await addProfile(1, 'identity-a');
		await addProfile(2, 'identity-a');
		await assert.rejects(addProfile(1, 'identity-a'));
		const first = (await client.execute('SELECT * FROM murid_profil_tambahan WHERE sekolah_id=1'))
			.rows[0];
		assert.equal(first.bersedia_asrama, null);
		assert.equal(first.surat_pernyataan_ditandatangani, null);
		assert.equal(first.jenis_bansos, '[]');
		for (const statement of [
			"UPDATE murid_profil_tambahan SET nomor_kk='123' WHERE sekolah_id=1",
			'UPDATE murid_profil_tambahan SET desil_dtsen=11 WHERE sekolah_id=1',
			'UPDATE murid_profil_tambahan SET jumlah_tanggungan=-1 WHERE sekolah_id=1',
			'UPDATE murid_profil_tambahan SET bersedia_asrama=2 WHERE sekolah_id=1',
			"UPDATE murid_profil_tambahan SET tanggal_surat_pernyataan='2026-10-01' WHERE sekolah_id=1",
			`UPDATE murid_profil_tambahan SET jenis_bansos='["pkh"]' WHERE sekolah_id=1`
		])
			await assert.rejects(client.execute(statement), statement);
		await client.execute(
			"UPDATE murid_profil_tambahan SET nomor_kk='0012345678901234',bersedia_asrama=0 WHERE sekolah_id=1"
		);
		assert.equal(
			(
				await client.execute(
					'SELECT nomor_kk,bersedia_asrama FROM murid_profil_tambahan WHERE sekolah_id=1'
				)
			).rows[0].nomor_kk,
			'0012345678901234'
		);
		const addPhoto = (school: number, kind: string, key: string) =>
			client.execute({
				sql: 'INSERT INTO murid_profil_foto(profil_id,sekolah_id,jenis,storage_key,mime_type,ukuran_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?,?)',
				args: [first.id, school, kind, key, 'image/png', 100, 'a'.repeat(64), '2026-10-26']
			});
		await assert.rejects(addPhoto(2, 'rumah', 'wrong-owner.png'));
		await addPhoto(1, 'rumah', 'photo-a.png');
		await assert.rejects(addPhoto(1, 'rumah', 'photo-b.png'));
		await assert.rejects(addPhoto(1, 'foto_utama', 'photo-c.png'));
		await client.execute('DELETE FROM murid_profil_tambahan WHERE sekolah_id=1');
		assert.equal(
			(await client.execute('SELECT count(*) AS n FROM murid_profil_foto')).rows[0].n,
			0
		);
		assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	} finally {
		client.close();
	}
});
