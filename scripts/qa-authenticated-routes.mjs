#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5152';
const databaseUrl = process.env.DB_URL || 'file:./data/database.sqlite3';
const client = createClient({ url: databaseUrl });
const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');

try {
	const admin = (
		await client.execute(
			"SELECT id, sekolah_id FROM auth_user WHERE type='admin' ORDER BY id LIMIT 1"
		)
	).rows[0];
	if (!admin) throw new Error('Akun admin QA tidak ditemukan.');
	const schoolId =
		admin.sekolah_id ??
		(await client.execute('SELECT id FROM sekolah ORDER BY id LIMIT 1')).rows[0]?.id;
	if (!schoolId) throw new Error('Sekolah QA tidak ditemukan.');
	const now = new Date().toISOString();
	await client.execute({
		sql: 'INSERT INTO auth_session(user_id, token_hash, user_agent, ip_address, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		args: [
			admin.id,
			tokenHash,
			'Codex authenticated route QA',
			'127.0.0.1',
			new Date(Date.now() + 10 * 60_000).toISOString(),
			now,
			now
		]
	});
	const headers = { cookie: `rapkumer-session=${token}; active-sekolah-id=${schoolId}` };
	for (const route of [
		'/berkas',
		'/persetujuan',
		'/notifikasi',
		'/dashboard-pimpinan',
		'/dashboard-pimpinan?jenjang=srma',
		'/inventaris',
		'/inventaris/peminjaman',
		'/inventaris/perawatan',
		'/pengumuman',
		'/portal-wali',
		'/portal-wali/pengaturan',
		'/jadwal/rekomendasi',
		'/ruangan',
		'/ujian',
		'/cetak?dokumen=kartu-ujian',
		'/administrasi/absensi/scan',
		'/api/berkas/entities?type=murid&q=a',
		'/api/berkas/entities?type=inventaris&q=a'
	]) {
		const response = await fetch(`${baseUrl}${route}`, { headers, redirect: 'manual' });
		console.log(`${route}=${response.status} bytes=${(await response.arrayBuffer()).byteLength}`);
		if (response.status !== 200) process.exitCode = 1;
	}
} finally {
	await client.execute({ sql: 'DELETE FROM auth_session WHERE token_hash = ?', args: [tokenHash] });
	await client.close();
	console.log('QA_SESSION_REMOVED');
}
