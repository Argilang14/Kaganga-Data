import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const port = 5154;
const base = `http://127.0.0.1:${port}`;
const occupied = await new Promise((resolve) => {
	const socket = net.connect(port, '127.0.0.1');
	socket.once('connect', () => {
		socket.destroy();
		resolve(true);
	});
	socket.once('error', () => {
		socket.destroy();
		resolve(false);
	});
});
assert.equal(occupied, false, `Port QA ${port} sedang digunakan.`);

const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-access-position-'));
const databasePath = path.join(directory, 'runtime.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try {
	await source.execute(`VACUUM INTO '${databasePath.replaceAll('\\', '/').replaceAll("'", "''")}'`);
} finally {
	source.close();
}

const database = createClient({ url: `file:${databasePath}` });
const sekolah = (await database.execute('SELECT id FROM sekolah ORDER BY id LIMIT 1')).rows[0];
const seed = (await database.execute('SELECT * FROM auth_user ORDER BY id LIMIT 1')).rows[0];
assert.ok(sekolah && seed, 'Database QA memerlukan sekolah dan satu akun dasar.');
const userColumns = (await database.execute('PRAGMA table_info(auth_user)')).rows.map((row) =>
	String(row.name)
);
assert.ok(userColumns.includes('jabatan_akses'), 'Kolom jabatan_akses belum tersedia.');

async function createAccount(jabatanAkses, type = 'user', mustChangePassword = false) {
	const username = `qa-access-${jabatanAkses ?? type}-${randomBytes(4).toString('hex')}`;
	const salt = randomBytes(16).toString('hex');
	const values = {
		...seed,
		id: null,
		username,
		username_normalized: username,
		type,
		permissions: '[]',
		jabatan_akses: jabatanAkses,
		sekolah_id: Number(sekolah.id),
		pegawai_id: null,
		kelas_id: null,
		mata_pelajaran_id: null,
		must_change_password: Number(mustChangePassword),
		password_salt: salt,
		password_hash: scryptSync('CopyOnly123', salt, 64).toString('hex')
	};
	const inserted = await database.execute({
		sql: `INSERT INTO auth_user (${userColumns.map((column) => `"${column}"`).join(',')}) VALUES (${userColumns.map(() => '?').join(',')})`,
		args: userColumns.map((column) => values[column] ?? null)
	});
	const token = randomBytes(32).toString('base64url');
	const now = new Date().toISOString();
	await database.execute({
		sql: 'INSERT INTO auth_session (user_id, token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
		args: [
			Number(inserted.lastInsertRowid),
			createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 3_600_000).toISOString(),
			now,
			now
		]
	});
	return `rapkumer-session=${token}; active-sekolah-id=${sekolah.id}`;
}

const leaderCookie = await createAccount('waka_kurikulum');
const operatorCookie = await createAccount('operator');
const adminCookie = await createAccount(null, 'admin');
const firstLoginCookie = await createAccount(null, 'admin', true);

let log = '';
const server = spawn(process.execPath, ['build/index.js'], {
	windowsHide: true,
	env: {
		...process.env,
		PORT: String(port),
		HOST: '127.0.0.1',
		ORIGIN: base,
		DB_URL: `file:${databasePath}`,
		KAGANGA_DATA_DIR: directory,
		photo: `file:${path.join(directory, 'uploads')}`,
		NODE_ENV: 'production'
	},
	stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', (chunk) => (log += chunk));
server.stderr.on('data', (chunk) => (log += chunk));

async function request(pathname, cookie) {
	return fetch(base + pathname, {
		redirect: 'manual',
		headers: { Cookie: cookie, Origin: base }
	});
}

try {
	let ready = false;
	for (let attempt = 0; attempt < 120; attempt += 1) {
		try {
			ready = (await fetch(`${base}/login`)).status === 200;
		} catch {
			// Server masih memulai.
		}
		if (ready) break;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert.ok(ready, log);
	const userManagement = await request('/pengguna', adminCookie);
	assert.equal(userManagement.status, 200, 'Admin membuka Manajemen Pengguna');
	const userManagementHtml = await userManagement.text();
	assert.match(userManagementHtml, /Jabatan Akses/);
	assert.match(userManagementHtml, /Semua jabatan akses/);

	assert.equal((await request('/kelas', leaderCookie)).status, 200, 'Pimpinan membuka semua kelas');
	assert.equal(
		(await request('/martikulasi/pengaturan', leaderCookie)).status,
		200,
		'Pimpinan membuka pengaturan operasional Martikulasi'
	);
	assert.notEqual(
		(await request('/pengguna', leaderCookie)).status,
		200,
		'Manajemen pengguna tetap khusus admin'
	);
	assert.equal(
		(await request('/api/database/backup', leaderCookie)).status,
		403,
		'Pimpinan tidak dapat mengunduh database'
	);
	assert.equal(
		(await request('/api/database/backup', operatorCookie)).status,
		403,
		'Operator tidak dapat mengunduh database'
	);

	console.log(
		'PASS: jabatan akses lintas kelas aktif; pengaturan sistem dan backup tetap admin-only.'
	);
	const forced = await request('/', firstLoginCookie);
	assert.equal(forced.status, 303);
	assert.equal(forced.headers.get('location'), '/pengaturan?ganti_password=1');
	const passwordPage = await request('/pengaturan?ganti_password=1', firstLoginCookie);
	assert.equal(passwordPage.status, 200);
	assert.match(await passwordPage.text(), /Ganti Kata Sandi Pertama/);
	async function changePassword(currentPassword, newPassword, confirmPassword = newPassword) {
		const form = new FormData();
		for (const [key, value] of Object.entries({ currentPassword, newPassword, confirmPassword })) {
			form.set(key, value);
		}
		const response = await fetch(`${base}/pengaturan?/change-password`, {
			method: 'POST',
			redirect: 'manual',
			headers: { Cookie: firstLoginCookie, Origin: base },
			body: form
		});
		const result = await response.json();
		return { response, result };
	}
	assert.equal((await changePassword('Wrong123', 'Changed123')).result.status, 400);
	assert.equal((await changePassword('CopyOnly123', 'CopyOnly123')).result.status, 400);
	assert.equal(
		(await changePassword('CopyOnly123', 'Changed123', 'Mismatch123')).result.status,
		400
	);
	const changed = await changePassword('CopyOnly123', 'Changed123');
	assert.equal(changed.result.type, 'success');
	const sessionCookie = changed.response.headers
		.getSetCookie()
		.find((value) => value.startsWith('rapkumer-session='));
	assert.ok(sessionCookie, 'Sesi baru diterbitkan setelah kata sandi diganti');
	const newCookie = `${sessionCookie.split(';')[0]}; active-sekolah-id=${sekolah.id}`;
	assert.equal((await request('/', newCookie)).status, 200);
	assert.equal((await request('/', firstLoginCookie)).headers.get('location'), '/login');
	assert.equal(
		Number(
			(
				await database.execute(
					"SELECT COUNT(*) AS total FROM auth_user WHERE must_change_password=1 AND username LIKE 'qa-access-%'"
				)
			).rows[0].total
		),
		0
	);
	console.log(
		'PASS: popup login pertama, penolakan sandi salah/sama/konfirmasi, pergantian sandi, dan pencabutan sesi lama.'
	);
	console.log(`Database copy: ${databasePath}`);
} finally {
	server.kill();
	database.close();
}
