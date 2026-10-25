import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const port = 5185;
await new Promise((resolve, reject) => {
	const probe = net.createServer();
	probe.once('error', reject);
	probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp', 'status-akhir-menu-copy-'));
const file = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [file] });
} finally {
	source.close();
}
const db = createClient({ url: `file:${file}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const base = `http://127.0.0.1:${port}`;
let child,
	browser,
	output = '';
const results = [];
try {
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const year = await row('SELECT * FROM tahun_ajaran ORDER BY is_aktif DESC,id DESC LIMIT 1');
	assert.ok(year, 'Requires a school with an academic year');
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=(id=?) WHERE sekolah_id=?',
		args: [year.id, year.sekolah_id]
	});
	for (const tipe of ['ganjil', 'genap']) {
		await db.execute({
			sql: 'INSERT OR IGNORE INTO semester(tahun_ajaran_id,tipe,nama,is_aktif) VALUES(?,?,?,0)',
			args: [year.id, tipe, `Semester ${tipe}`]
		});
	}
	await db.execute({
		sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
		args: [year.sekolah_id, admin.id]
	});
	const token = randomBytes(32).toString('base64url');
	const now = new Date().toISOString();
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 1800000).toISOString(),
			now,
			now
		]
	});
	child = spawn(process.execPath, ['build/index.js'], {
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			DB_URL: `file:${file}`,
			KAGANGA_DATA_DIR: folder,
			NODE_ENV: 'production'
		}
	});
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			ready = (await fetch(`${base}/login`)).status === 200;
		} catch {
			/* Starting. */
		}
		if (ready || child.exitCode !== null) break;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, output);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	await browser.setCookie(
		...[
			['rapkumer-session', token],
			['active-sekolah-id', String(year.sekolah_id)]
		].map(([name, value]) => ({ name, value, url: base }))
	);
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setRequestInterception(true);
	page.on('request', (request) =>
		request.method() === 'GET' ? request.continue() : request.abort()
	);
	for (const tipe of ['ganjil', 'genap', 'ganjil']) {
		await db.execute({
			sql: 'UPDATE semester SET is_aktif=(tipe=?) WHERE tahun_ajaran_id=?',
			args: [tipe, year.id]
		});
		const response = await page.goto(`${base}/akademik`, { waitUntil: 'networkidle0' });
		assert.equal(response.status(), 200);
		await page.waitForSelector('input[aria-label="Cari menu"]');
		const expected = tipe === 'genap' ? 1 : 0;
		for (const search of ['', 'status akhir', 'Administrasi', 'kelulusan']) {
			await page.$eval(
				'input[aria-label="Cari menu"]',
				(input, value) => {
					input.value = value;
					input.dispatchEvent(new Event('input', { bubbles: true }));
				},
				search
			);
			await page.waitForFunction(
				(count) =>
					document.querySelectorAll('.app-sidebar-menu a[href="/status-akhir"]').length === count,
				{},
				expected
			);
			results.push({ semester: tipe, search, visible: expected === 1 });
		}
	}
	await page.screenshot({ path: path.join(folder, 'ganjil-menu.png') });
	assert.deepEqual(errors, []);
	await writeFile(path.join(folder, 'results.json'), JSON.stringify(results, null, 2));
	console.log(`PASS ${results.length} semester/search checks. Evidence: ${folder}`);
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const exited = once(child, 'exit');
		child.kill();
		await exited;
	}
	db.close();
	await writeFile(path.join(folder, 'server.log'), output);
}
