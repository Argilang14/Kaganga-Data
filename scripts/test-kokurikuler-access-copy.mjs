import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const port = 5153;
const base = `http://127.0.0.1:${port}`;
const occupied = await new Promise((resolve) => {
	const socket = net.connect(port, '127.0.0.1');
	socket.once('connect', () => { socket.destroy(); resolve(true); });
	socket.once('error', () => { socket.destroy(); resolve(false); });
});
assert.equal(occupied, false, 'Port pengujian sudah dipakai; tidak ada server yang dihentikan.');
const directory = await mkdtemp(path.join(tmpdir(), 'kaganga-kokurikuler-'));
const databasePath = path.join(directory, 'database.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try { await source.execute(`VACUUM INTO '${databasePath.replaceAll('\\', '/').replaceAll("'", "''")}'`); }
finally { source.close(); }
const db = createClient({ url: `file:${databasePath}` });
let server;
let browser;
let output = '';
try {
	const first = (await db.execute('SELECT * FROM kelas ORDER BY id LIMIT 1')).rows[0];
	assert.ok(first, 'Salinan database memerlukan minimal satu kelas.');
	async function clone(table, row, overrides) {
		const columns = (await db.execute(`PRAGMA table_info(${table})`)).rows.map((entry) => String(entry.name));
		const values = { ...row, ...overrides, id: null };
		const inserted = await db.execute({
			sql: `INSERT INTO ${table} (${columns.map((col) => `"${col}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
			args: columns.map((col) => values[col] ?? null)
		});
		return Number(inserted.lastInsertRowid);
	}
	const school = (await db.execute({ sql: 'SELECT * FROM sekolah WHERE id=?', args: [first.sekolah_id] })).rows[0];
	const otherSchoolId = await clone('sekolah', school, { nama: `QA Other ${randomBytes(3).toString('hex')}` });
	const otherSchoolClassId = await clone('kelas', first, { sekolah_id: otherSchoolId });
	const unassignedClassId = await clone('kelas', first, { nama: `QA Unassigned ${randomBytes(3).toString('hex')}` });
	const employee = (await db.execute({ sql: 'SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', args: [first.sekolah_id] })).rows[0];
	assert.ok(employee, 'Salinan database memerlukan pegawai.');
	await db.execute({ sql: 'UPDATE kelas SET wali_kelas_id=? WHERE id=?', args: [employee.id, first.id] });
	const seed = (await db.execute('SELECT * FROM auth_user LIMIT 1')).rows[0];
	const columns = (await db.execute('PRAGMA table_info(auth_user)')).rows.map((entry) => String(entry.name));
	async function account(type, permissions = []) {
		const username = `qa-kok-${randomBytes(6).toString('hex')}`;
		const values = { ...seed, id: null, username, username_normalized: username, type,
			permissions: JSON.stringify(permissions), sekolah_id: first.sekolah_id,
			pegawai_id: employee.id, kelas_id: first.id, must_change_password: 0 };
		const inserted = await db.execute({
			sql: `INSERT INTO auth_user (${columns.map((col) => `"${col}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
			args: columns.map((col) => values[col] ?? null)
		});
		const token = randomBytes(32).toString('base64url');
		await db.execute({ sql: 'INSERT INTO auth_session (user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?)', args: [
			Number(inserted.lastInsertRowid), createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 3600000).toISOString(), new Date().toISOString()
		] });
		return `rapkumer-session=${token}; active-sekolah-id=${first.sekolah_id}; active-kelas-id=${first.id}`;
	}
	const admin = await account('admin');
	const wali = await account('wali_kelas', ['kelas_pindah']);
	const guru = await account('user');
	server = spawn(process.execPath, ['build/index.js'], { windowsHide: true, env: {
		...process.env, PORT: String(port), HOST: '127.0.0.1', ORIGIN: base,
		DB_URL: `file:${databasePath}`, NODE_ENV: 'production'
	}, stdio: ['ignore', 'pipe', 'pipe'] });
	server.stdout.on('data', (chunk) => { output += chunk; });
	server.stderr.on('data', (chunk) => { output += chunk; });
	let ready = false;
	for (let i = 0; i < 80; i++) {
		try { ready = (await fetch(`${base}/login`)).status === 200; } catch { /* waiting */ }
		if (ready) break;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert.ok(ready, output);
	const get = (cookie, suffix = '') => fetch(`${base}/kokurikuler/excel${suffix}`, { headers: { Cookie: cookie }, redirect: 'manual' });
	const classCookie = (cookie, id) => cookie.replace(`active-kelas-id=${first.id}`, `active-kelas-id=${id}`);
	assert.equal((await get(admin, '?template')).status, 200);
	assert.equal((await get(wali)).status, 200);
	assert.equal((await get(wali, '?template')).status, 200);
	assert.equal((await get(guru)).status, 403);
	for (const cookie of [admin, wali]) {
		assert.equal((await get(classCookie(cookie, otherSchoolClassId))).status, 403);
	}
	assert.equal((await get(classCookie(wali, unassignedClassId))).status, 403);
	const waliToken = wali.match(/rapkumer-session=([^;]+)/)?.[1];
	assert.ok(waliToken);
	const waliId = (await db.execute({ sql: 'SELECT user_id FROM auth_session WHERE token_hash=?', args: [createHash('sha256').update(waliToken).digest('hex')] })).rows[0].user_id;
	await db.execute({ sql: 'INSERT INTO auth_user_kelas (auth_user_id,kelas_id,created_at) VALUES (?,?,?)', args: [waliId, unassignedClassId, new Date().toISOString()] });
	assert.equal((await get(classCookie(wali, unassignedClassId))).status, 200);
	assert.equal((await get(classCookie(wali, otherSchoolClassId))).status, 403);
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Data');
	sheet.addRows([['Kode', 'Dimensi', 'Kegiatan'], [`QK${randomBytes(3).toString('hex')}`, 'Kesehatan', 'QA Kegiatan']]);
	const file = Buffer.from(await workbook.xlsx.writeBuffer());
	async function action(cookie, name, body) {
		const response = await fetch(`${base}/kokurikuler?/${name}`, { method: 'POST', redirect: 'manual',
			headers: { Cookie: cookie, Origin: base, Accept: 'application/json' }, body });
		const result = await response.json();
		return { status: result.status, type: result.type, body: JSON.stringify(result) };
	}
	const form = () => { const body = new FormData(); body.set('file', new Blob([file], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'qa.xlsx'); return body; };
	const deniedPreview = await action(guru, 'preview_import', form());
	assert.equal(deniedPreview.status, 403, deniedPreview.body);
	assert.equal((await action(classCookie(wali, otherSchoolClassId), 'import_kokurikuler', form())).status, 403);
	const preview = await action(wali, 'preview_import', form());
	assert.equal(preview.status, 200, preview.body);
	assert.match(preview.body, /preview/);
	const before = Number((await db.execute('SELECT COUNT(*) AS n FROM kokurikuler')).rows[0].n);
	const imported = await action(wali, 'import_kokurikuler', form());
	assert.equal(imported.status, 200, imported.body);
	assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM kokurikuler')).rows[0].n), before + 1);
	const repeated = await action(wali, 'import_kokurikuler', form());
	assert.equal(repeated.status, 400);
	const check = await db.execute('PRAGMA quick_check');
	assert.equal(check.rows[0].quick_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
	const screenshots = path.join(process.cwd(), 'tmp');
	await mkdir(screenshots, { recursive: true });
	for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		await page.setViewport({ width, height });
		const cookie = name === 'desktop' ? admin : await account('admin');
		await page.setCookie(...cookie.split('; ').map((entry) => {
			const [key, value] = entry.split('=');
			return { name: key, value, url: base };
		}));
		await page.goto(`${base}/kokurikuler`, { waitUntil: 'networkidle0' });
		assert.equal(await page.title() !== '', true);
		assert.ok(await page.$('summary[aria-label="Data Excel kokurikuler"]'), `${name}: ${page.url()} ${(await page.content()).slice(0, 650)}`);
		await page.click('summary[aria-label="Data Excel kokurikuler"]');
		await page.click('details.dropdown ul.dropdown-content button');
		assert.equal(await page.$eval('dialog', (element) => element.open), true);
		await new Promise((resolve) => setTimeout(resolve, 350));
		await page.screenshot({ path: path.join(screenshots, `qa-kokurikuler-${name}.png`), fullPage: true });
		assert.deepEqual(errors, []);
		await context.close();
	}
	console.log('Kokurikuler: izin kelas, pratinjau, impor, duplikat, dan SQLite lolos.');
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		const exited = new Promise((resolve) => server.once('exit', resolve));
		server.kill();
		await exited;
	}
	await db.close();
	if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('kaganga-kokurikuler-')) {
		try { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
		catch (error) { console.warn('Salinan QA belum bisa dibersihkan:', error.message); }
	}
}
