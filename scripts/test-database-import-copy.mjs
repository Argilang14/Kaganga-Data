import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';

const backup = process.argv[2];
if (!backup) throw new Error('Usage: node scripts/test-database-import-copy.mjs backup.sqlite3');
const port = Number(process.env.QA_PORT ?? 5153);
if ([1206, 5152].includes(port)) throw new Error('Production/development ports are not allowed.');
const base = `http://127.0.0.1:${port}`;
const occupied = await new Promise((resolve) => {
	const socket = net.connect(port, '127.0.0.1');
	socket.once('connect', () => { socket.destroy(); resolve(true); });
	socket.once('error', () => { socket.destroy(); resolve(false); });
});
assert.equal(occupied, false, 'QA port is already in use; no existing process will be stopped.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-import-e2e-'));
const databasePath = path.join(directory, 'runtime.sqlite3');
const sourcePath = path.join(directory, 'source.sqlite3');
const bytes = await readFile(backup);
const hash = (value) => createHash('sha256').update(value).digest('hex');
await writeFile(sourcePath, bytes);
await copyFile('dist/windows/stage/Kaganga/data/database.sqlite3', databasePath);
let log = '';
const server = spawn(process.execPath, ['build/index.js'], {
	cwd: process.cwd(), windowsHide: true,
	env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ORIGIN: base,
		DB_URL: `file:${databasePath}`, BODY_SIZE_LIMIT: '512M', NODE_ENV: 'production' },
	stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', (value) => { log += value.toString(); });
server.stderr.on('data', (value) => { log += value.toString(); });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
try {
	let ready = false;
	for (let attempt = 0; attempt < 40; attempt++) {
		try { ready = (await fetch(`${base}/login`, { signal: AbortSignal.timeout(5000) })).status === 200; } catch { /* startup */ }
		if (ready) break;
		await delay(250);
	}
	assert.ok(ready, 'QA server did not become ready');
	const login = await fetch(`${base}/login?/login`, {
		method: 'POST', redirect: 'manual', headers: { Origin: base, Accept: 'text/html' },
		body: new URLSearchParams({ username: 'Admin', password: 'Admin123' })
	});
	assert.equal(login.status, 303, 'Seed admin login failed');
	const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
	const headers = { Origin: base, Cookie: cookie, 'Content-Type': 'application/vnd.sqlite3' };
	const initial = createClient({ url: `file:${databasePath}` });
	const initialMuridCount = (await initial.execute('SELECT COUNT(*) n FROM murid')).rows[0]?.n;
	initial.close();
	const oversized = await new Promise((resolve, reject) => {
		const request = httpRequest(`${base}/api/database/import`, {
			method: 'POST', headers: { ...headers, 'Content-Length': String(512 * 1024 * 1024 + 1) }
		}, (response) => { response.resume(); resolve(response.statusCode); });
		request.setTimeout(10000, () => request.destroy(new Error('Oversize check timeout')));
		request.on('error', reject);
		request.end();
	});
	assert.equal(oversized, 413, 'Files over 512 MB must be rejected before reading the body');
	const invalid = await fetch(`${base}/api/database/import`, {
		method: 'POST', headers, body: Buffer.alloc(512, 'x')
	});
	assert.equal(invalid.status, 400, await invalid.text());
	assert.equal((await fetch(`${base}/pengaturan`, { headers: { Cookie: cookie } })).status, 200);
	const pending = fetch(`${base}/api/database/import`, { method: 'POST', headers, body: bytes });
	let maintenance = false;
	for (let attempt = 0; attempt < 20; attempt++) {
		await delay(100);
		if ((await fetch(`${base}/login`)).status === 503) { maintenance = true; break; }
	}
	assert.ok(maintenance, 'Maintenance guard did not activate');
	const concurrent = await fetch(`${base}/api/database/import`, { method: 'POST', headers, body: Buffer.alloc(512) });
	assert.equal(concurrent.status, 503, 'Concurrent restore must be rejected');
	const imported = await pending;
	const message = await imported.text();
	assert.equal(imported.status, 200, `${message}\n${log}`);
	assert.equal(JSON.parse(message).logout, true);
	assert.equal((await fetch(`${base}/login`)).status, 200);
	const source = createClient({ url: `file:${sourcePath}` });
	const target = createClient({ url: `file:${databasePath}` });
	try {
		assert.equal((await target.execute('PRAGMA quick_check')).rows[0]?.quick_check, 'ok');
		assert.equal((await target.execute('PRAGMA foreign_key_check')).rows.length, 0);
		const tables = await source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
		for (const { name } of tables.rows) {
			const sql = `SELECT COUNT(*) n FROM ${identifier(String(name))}`;
			assert.equal((await target.execute(sql)).rows[0]?.n, (await source.execute(sql)).rows[0]?.n, `Row count: ${name}`);
		}
		for (const name of ['sekolah', 'murid', 'pegawai']) {
			const sql = `SELECT id,nama FROM ${identifier(name)} ORDER BY id`;
			assert.deepEqual((await target.execute(sql)).rows, (await source.execute(sql)).rows, `Identity: ${name}`);
		}
		const backups = (await readdir(directory)).filter((name) => name.startsWith('database-backup-before-import-') && name.endsWith('.sqlite3'));
		assert.equal(backups.length, 1, 'A pre-import backup must exist');
		const previous = createClient({ url: `file:${path.join(directory, backups[0])}` });
		try {
			assert.equal((await previous.execute('PRAGMA quick_check')).rows[0]?.quick_check, 'ok');
			assert.equal((await previous.execute('SELECT COUNT(*) n FROM murid')).rows[0]?.n, initialMuridCount);
		} finally { previous.close(); }
		console.log(JSON.stringify({ status: 'PASS', bytes: bytes.length, tables: tables.rows.length,
			murid: (await target.execute('SELECT COUNT(*) n FROM murid')).rows[0]?.n,
			databasePath, port, quickCheck: 'ok', foreignKeyViolations: 0 }));
	} finally { source.close(); target.close(); }
	assert.equal(hash(await readFile(backup)), hash(bytes), 'Original backup must remain unchanged');
} finally {
	server.kill();
	await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
	await writeFile(path.join(directory, 'test.log'), log);
	console.log('QA log:', path.join(directory, 'test.log'));
}
