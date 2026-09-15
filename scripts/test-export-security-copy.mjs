import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const port = 5153;
const base = `http://127.0.0.1:${port}`;
const occupied = await new Promise(resolve => {
	const socket = net.connect(port, '127.0.0.1');
	socket.once('connect', () => { socket.destroy(); resolve(true); });
	socket.once('error', () => { socket.destroy(); resolve(false); });
});
assert.equal(occupied, false, 'QA port occupied; no existing process will be stopped.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-export-security-'));
const databasePath = path.join(directory, 'runtime.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try { await source.execute(`VACUUM INTO '${databasePath.replaceAll('\\', '/').replaceAll("'", "''")}'`); }
finally { source.close(); }
await copyFile(databasePath, path.join(directory, 'backup-before-tests.sqlite3'));
console.log('Consistent development database backup:', databasePath);
const db = createClient({ url: `file:${databasePath}` });
const first = (await db.execute('SELECT k.* FROM kelas k JOIN semester s ON s.id=k.semester_id JOIN tahun_ajaran t ON t.id=k.tahun_ajaran_id WHERE s.is_aktif=1 AND t.is_aktif=1 ORDER BY k.id LIMIT 1')).rows[0];
assert.ok(first, 'QA requires an existing class');
async function cloneRow(table, row, overrides) {
	const columns = (await db.execute(`PRAGMA table_info(${table})`)).rows.map(row => String(row.name));
	const values = { ...row, ...overrides, id: null };
	const result = await db.execute({ sql: `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, args: columns.map(c => values[c] ?? null) });
	return Number(result.lastInsertRowid);
}
const school = (await db.execute({ sql: 'SELECT * FROM sekolah WHERE id=?', args: [first.sekolah_id] })).rows[0];
const schoolId = await cloneRow('sekolah', school, { nama: 'QA Other School' });
const foreign = { id: await cloneRow('kelas', first, { sekolah_id: schoolId }) };
const otherClass = await cloneRow('kelas', first, { nama: 'QA Unassigned Class' });
const pegawai = (await db.execute({ sql: 'SELECT id,nama FROM pegawai WHERE sekolah_id = ? LIMIT 1', args: [first.sekolah_id] })).rows[0];
assert.ok(pegawai, 'QA requires a school employee');
const columns = (await db.execute('PRAGMA table_info(auth_user)')).rows.map(row => String(row.name));
const seed = (await db.execute('SELECT * FROM auth_user LIMIT 1')).rows[0];
let sequence = 0;
async function account(type, permissions = [], assigned = true) {
	const name = `qa-export-${++sequence}`;
	const values = { ...seed, id: null, username: name, username_normalized: name, type,
		permissions: JSON.stringify(permissions), sekolah_id: first.sekolah_id,
		pegawai_id: assigned ? pegawai.id : null, kelas_id: assigned ? first.id : null,
		must_change_password: 0 };
	const inserted = await db.execute({ sql: `INSERT INTO auth_user (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, args: columns.map(c => values[c] ?? null) });
	const id = Number(inserted.lastInsertRowid);
	if (type === 'user' && assigned) await db.execute({ sql: 'INSERT INTO auth_user_kelas (auth_user_id,kelas_id,created_at) VALUES (?,?,?)', args: [id, first.id, new Date().toISOString()] });
	const token = randomBytes(32).toString('base64url');
	await db.execute({ sql: 'INSERT INTO auth_session (user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?)', args: [id, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), new Date().toISOString()] });
	return `rapkumer-session=${token}; active-sekolah-id=${first.sekolah_id}; active-kelas-id=${first.id}`;
}
await db.execute({ sql: 'UPDATE kelas SET wali_kelas_id=? WHERE id=?', args: [pegawai.id, first.id] });
await db.execute({ sql: 'UPDATE murid SET wali_asuh_nama=?,wali_asrama_nama=? WHERE kelas_id=?', args: [pegawai.nama, pegawai.nama, first.id] });
const fixtures = [];
for (const type of ['admin', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'user']) {
	fixtures.push({ type, cookie: await account(type, ['administrasi_absensi', 'mata_pelajaran_keasramaan']) });
}
const unassigned = await account('user', ['administrasi_absensi', 'mata_pelajaran_keasramaan'], false);
const denied = await account('user', [], true);
const readOnly = await account('user', ['sekolah_lihat', 'kelas_lihat', 'keasramaan_lihat'], true);
const inputOnly = await account('user', ['keasramaan_input'], true);
const manager = await account('user', ['keasramaan_manage'], true);
let log = '';
const server = spawn(process.execPath, ['build/index.js'], { windowsHide: true, env: { ...process.env,
	PORT: String(port), HOST: '127.0.0.1', ORIGIN: base, DB_URL: `file:${databasePath}`, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', chunk => { log += chunk; });
server.stderr.on('data', chunk => { log += chunk; });
async function request(endpoint, cookie, body) {
	return fetch(base + endpoint, { redirect: 'manual', method: body ? 'POST' : 'GET',
		headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
try {
	let ready = false;
	for (let i = 0; i < 60; i++) {
		try { ready = (await fetch(base + '/login')).status === 200; } catch {}
		if (ready) break;
		await new Promise(resolve => setTimeout(resolve, 250));
	}
	assert.ok(ready, log);
	for (const { type, cookie } of fixtures) {
		const backup = await request('/api/database/backup', cookie);
		assert.equal(backup.status, type === 'admin' ? 200 : 403, `backup ${type}`);
		await backup.arrayBuffer();
		for (const endpoint of ['/api/absen/download-rekap', '/api/keasramaan/export']) {
			const own = await request(endpoint, cookie, { bulan: 9, tahun: 2026 });
			assert.ok([200, 400, 404].includes(own.status), `${type} own ${endpoint}: ${own.status} ${await own.text()}`);
			await own.arrayBuffer().catch(() => {});
			const outside = await request(endpoint, cookie.replace(`active-kelas-id=${first.id}`, `active-kelas-id=${foreign.id}`), { bulan: 9, tahun: 2026 });
			assert.equal(outside.status, 403, `${type} cross school ${endpoint}`);
			if (type !== 'admin') {
				const unassignedClass = await request(endpoint, cookie.replace(`active-kelas-id=${first.id}`, `active-kelas-id=${otherClass}`), { bulan: 9, tahun: 2026 });
				assert.equal(unassignedClass.status, 403, `${type} unassigned class ${endpoint}`);
			}
		}
	}
	for (const cookie of [unassigned, denied]) {
		for (const endpoint of ['/api/absen/download-rekap', '/api/keasramaan/export']) {
			assert.equal((await request(endpoint, cookie, { bulan: 9, tahun: 2026 })).status, 403);
		}
	}
	for (const { type, cookie } of fixtures.filter(row => row.type !== 'admin')) {
		for (const endpoint of ['/sekolah', '/kelas']) assert.equal((await request(endpoint, cookie)).status, 303, `${type} restricted menu ${endpoint}`);
	}
	assert.equal((await request('/keasramaan', denied)).status, 303);
	for (const endpoint of ['/sekolah', '/kelas', '/keasramaan']) assert.equal((await request(endpoint, readOnly)).status, 200, `read-only ${endpoint}`);
	assert.equal((await request('/sekolah/form', readOnly)).status, 303);
	assert.equal((await request('/sekolah', readOnly, { id: first.sekolah_id })).status, 403);
	assert.equal((await request('/keasramaan/mata-evaluasi', readOnly, {})).status, 403);
	assert.equal((await request('/asesmen-keasramaan/form-asesmen', readOnly, {})).status, 403);
	assert.equal((await request('/asesmen-keasramaan', inputOnly)).status, 200);
	assert.equal((await request('/keasramaan/mata-evaluasi', manager)).status, 200);
	assert.equal((await request('/pengaturan', fixtures[0].cookie)).status, 200);
	const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
	try {
		for (const fixture of [fixtures[0], fixtures.find(row => row.type === 'user')]) {
			const page = await browser.newPage();
			await page.setViewport({ width: 1440, height: 1000 });
			await page.setExtraHTTPHeaders({ Cookie: fixture.cookie });
			await page.goto(base + '/', { waitUntil: 'networkidle0' });
			const state = await page.evaluate(() => {
				const button = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Backup Data'));
				return button ? { disabled: button.disabled, title: button.title } : null;
			});
			assert.ok(state, 'Dashboard backup button missing');
			assert.equal(state.disabled, fixture.type !== 'admin');
			await page.screenshot({ path: path.join(directory, `dashboard-${fixture.type}.png`), fullPage: true });
			await page.close();
		}
		const page = await browser.newPage();
		await page.setViewport({ width: 1440, height: 1000 });
		await page.setExtraHTTPHeaders({ Cookie: fixtures.find(row => row.type === 'wali_asrama').cookie });
		await page.goto(base + '/', { waitUntil: 'networkidle0' });
		const count = Number((await db.execute({ sql: 'SELECT count(*) n FROM murid WHERE sekolah_id=? AND kelas_id=? AND semester_id=?', args: [first.sekolah_id, first.id, first.semester_id] })).rows[0].n);
		assert.ok(await page.evaluate(text => document.body.textContent.includes(text), `${count} murid dibina`), 'Guardian count does not match active semester');
		await page.click('[title="Ganti kelas"]');
		await new Promise(resolve => setTimeout(resolve, 400));
		await page.screenshot({ path: path.join(directory, 'dashboard-wali-asrama.png'), fullPage: true });
		await page.setViewport({ width: 390, height: 844 });
		await page.evaluate(() => document.activeElement?.blur());
		await page.click('[title="Ganti kelas"]');
		await new Promise(resolve => setTimeout(resolve, 400));
		await page.screenshot({ path: path.join(directory, 'dashboard-wali-asrama-mobile.png'), fullPage: true });
		await page.close();
	} finally { await browser.close(); }
	const employeeRow = (await db.execute({ sql: 'SELECT * FROM pegawai WHERE id=?', args: [pegawai.id] })).rows[0];
	await cloneRow('pegawai', employeeRow, { kode_pegawai: null });
	const guardianCookie = fixtures.find(row => row.type === 'wali_asrama').cookie;
	assert.equal((await request('/keasramaan', guardianCookie)).status, 403, 'Ambiguous guardian names must not authorize access');
	assert.ok((await (await request('/', guardianCookie)).text()).includes('Nama wali sama; periksa penugasan'), 'Ambiguous name warning missing');
	assert.equal((await request('/api/database/backup', '')).status, 303);
	assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	console.log('PASS: role checks, class tampering, school boundaries, settings, SQLite integrity');
} finally {
	server.kill();
	await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
	db.close();
	await writeFile(path.join(directory, 'test.log'), log);
	console.log('QA log:', path.join(directory, 'test.log'));
}
