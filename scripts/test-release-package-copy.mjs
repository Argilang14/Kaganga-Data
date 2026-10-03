import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const root = process.cwd();
const stage = path.resolve(process.env.RELEASE_STAGE || 'dist/windows/stage/Kaganga');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
assert.equal(JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8')).version, version);
await mkdir(path.join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(path.join(root, 'tmp', 'release-package-'));
const upgradeSource = process.env.RELEASE_UPGRADE_SOURCE || 'file:./data/database.sqlite3';

async function available(port) {
	return new Promise((resolve) => {
		const socket = net.connect(port, '127.0.0.1');
		socket.once('connect', () => {
			socket.destroy();
			resolve(false);
		});
		socket.once('error', () => {
			socket.destroy();
			resolve(true);
		});
	});
}

async function counts(client) {
	const result = {};
	for (const table of ['sekolah', 'kelas', 'murid', 'pegawai', 'ujian_session', 'ujian_peserta']) {
		const exists = await client.execute({
			sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
			args: [table]
		});
		result[table] = 0;
		if (exists.rows.length)
			result[table] = Number(
				(await client.execute(`SELECT COUNT(*) AS total FROM ${table}`)).rows[0].total
			);
	}
	return result;
}

for (const [index, scenario] of ['fresh', 'upgrade'].entries()) {
	const port = 5160 + index;
	assert.ok(await available(port), `Port QA ${port} sedang digunakan`);
	const base = `http://127.0.0.1:${port}`;
	const state = path.join(directory, scenario);
	await mkdir(state, { recursive: true });
	const databasePath = path.join(state, 'database.sqlite3');
	if (scenario === 'fresh') {
		await copyFile(path.join(stage, 'data', 'database.sqlite3'), databasePath);
	} else {
		const source = createClient({ url: upgradeSource });
		try {
			await source.execute({ sql: 'VACUUM INTO ?', args: [databasePath] });
		} finally {
			source.close();
		}
	}
	const client = createClient({ url: `file:${databasePath}` });
	await client.execute('PRAGMA journal_mode=WAL');
	await client.execute('PRAGMA busy_timeout=10000');
	const before = await counts(client);
	if (scenario === 'fresh') assert.equal(before.murid, 0, 'Paket tidak boleh berisi data murid');
	const env = {
		...process.env,
		PORT: String(port),
		HOST: '127.0.0.1',
		ORIGIN: base,
		DB_URL: `file:${databasePath}`,
		DATABASE_URL: `file:${databasePath}`,
		KAGANGA_DATA_DIR: state,
		LOCALAPPDATA: state,
		photo: `file:${path.join(state, 'uploads')}`,
		sounds: `file:${path.join(state, 'sounds')}`,
		KAGANGA_SKIP_DRIZZLE: '1',
		NODE_ENV: 'production'
	};
	let server;
	let log = '';
	try {
		const migration = spawnSync(process.execPath, ['scripts/migrate-installed-db.mjs'], {
			cwd: stage,
			env,
			windowsHide: true,
			encoding: 'utf8',
			timeout: 120000
		});
		assert.equal(
			migration.status,
			0,
			`Migrasi ${scenario}: ${migration.error || migration.stderr || migration.stdout}`
		);
		server = spawn(process.execPath, ['start-build.mjs'], {
			cwd: stage,
			env,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		server.stdout.on('data', (chunk) => {
			log += chunk;
		});
		server.stderr.on('data', (chunk) => {
			log += chunk;
		});
		let ready = false;
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				ready = (await fetch(`${base}/login`)).status === 200;
			} catch {}
			if (ready) break;
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
		assert.ok(ready, `Paket ${scenario} tidak siap: ${log.slice(-2000)}`);
		const columns = (await client.execute('PRAGMA table_info(auth_user)')).rows;
		assert.ok(columns.some((row) => row.name === 'jabatan_akses'));
		assert.deepEqual(
			await counts(client),
			before,
			'Migrasi harus mempertahankan jumlah data sekolah'
		);
		assert.equal((await client.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
		assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
		const admin = (
			await client.execute(
				"SELECT id,must_change_password FROM auth_user WHERE type='admin' ORDER BY id LIMIT 1"
			)
		).rows[0];
		assert.ok(admin);
		const school = (await client.execute('SELECT id FROM sekolah ORDER BY id LIMIT 1')).rows[0];
		const token = randomBytes(32).toString('base64url');
		const now = new Date().toISOString();
		await client.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)',
			args: [
				admin.id,
				createHash('sha256').update(token).digest('hex'),
				new Date(Date.now() + 600000).toISOString(),
				now,
				now
			]
		});
		const headers = {
			cookie: `rapkumer-session=${token}${school ? `; active-sekolah-id=${school.id}` : ''}`
		};
		if (scenario === 'fresh') {
			assert.equal(Number(admin.must_change_password), 1);
			assert.equal(
				(await fetch(base, { headers, redirect: 'manual' })).headers.get('location'),
				'/pengaturan?ganti_password=1'
			);
			const settings = await fetch(`${base}/pengaturan?ganti_password=1`, {
				headers,
				redirect: 'manual'
			});
			assert.equal(settings.status, 200);
			assert.match(await settings.text(), /Ganti Kata Sandi Pertama/);
			const form = new FormData();
			form.set('currentPassword', 'Admin123');
			form.set('newPassword', 'ReleaseCopy123');
			form.set('confirmPassword', 'ReleaseCopy123');
			const changed = await fetch(`${base}/pengaturan?/change-password`, {
				method: 'POST',
				redirect: 'manual',
				headers: { ...headers, origin: base },
				body: form
			});
			assert.equal((await changed.json()).type, 'success');
			const cookie = changed.headers
				.getSetCookie()
				.find((value) => value.startsWith('rapkumer-session='));
			assert.ok(cookie);
			const renewed = { cookie: cookie.split(';')[0] };
			assert.equal(
				(await fetch(base, { headers: renewed, redirect: 'manual' })).headers.get('location'),
				'/sekolah/form?init'
			);
			assert.equal(
				(await fetch(`${base}/sekolah/form?init`, { headers: renewed, redirect: 'manual' })).status,
				200
			);
		} else {
			await client.execute({
				sql: 'UPDATE auth_user SET must_change_password=0 WHERE id=?',
				args: [admin.id]
			});
			for (const route of [
				'/',
				'/pegawai',
				'/pengguna',
				'/pengaturan',
				'/ujian',
				'/cetak?dokumen=kartu-ujian',
				'/asesmen-martikulasi',
				'/jurnal-mengajar',
				'/berkas',
				'/persetujuan',
				'/inventaris',
				'/notifikasi'
			]) {
				const response = await fetch(base + route, { headers, redirect: 'manual' });
				assert.equal(response.status, 200, `Paket upgrade ${route}`);
			}
		}
		console.log(
			`PASS package ${scenario}: v${version}, startup, migrasi, integrity, foreign keys, dan alur autentikasi`
		);
	} finally {
		if (server && server.exitCode === null) {
			const closed = once(server, 'exit');
			server.kill();
			await closed;
		}
		client.close();
	}
}
console.log(`Salinan QA: ${directory}`);
