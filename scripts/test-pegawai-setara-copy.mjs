import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { createClient } from '@libsql/client';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const port = 5190;
const base = `http://127.0.0.1:${port}`;
const free = await new Promise((resolve) => {
	const probe = net.createServer();
	probe.once('error', () => resolve(false));
	probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});
assert.ok(free, 'Port QA sedang digunakan; proses lain tidak dihentikan.');
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.join(root, 'tmp/setara-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
const db = createClient({ url: `file:${database}` });
let server,
	browser,
	output = '';
const tokens = {};
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const count = async () => Number((await rows('SELECT COUNT(*) n FROM pegawai'))[0].n);
const files = [];
for (const file of process.argv.slice(2))
	files.push(new File([await readFile(file)], path.basename(file)));
const makeCsv = (name, nik) =>
	new File([`Nama Tendik;NIP;NIK;Jenis SDM;No. HP\n${name};0;${nik};Satpam;0`], 'qa.csv');
const action = async (name, file, { skip = false, role = 'admin' } = {}) => {
	const form = new FormData();
	form.set('file', file);
	if (skip) form.set('skipInvalid', 'on');
	const res = await fetch(`${base}/pegawai?/${name}`, {
		method: 'POST',
		redirect: 'manual',
		body: form,
		headers: {
			origin: base,
			accept: 'application/json',
			'x-sveltekit-action': 'true',
			cookie: `rapkumer-session=${tokens[role]}; active-sekolah-id=1`
		}
	});
	const payload = await res.json();
	return { status: payload.status ?? res.status, payload };
};
try {
	const template = (await rows('SELECT * FROM auth_user ORDER BY id LIMIT 1'))[0];
	for (const role of ['admin', 'user']) {
		const copy = {
			...template,
			username: `qa-setara-${role}`,
			username_normalized: `qa-setara-${role}`,
			type: role,
			jabatan_akses: null,
			sekolah_id: 1,
			kelas_id: null,
			pegawai_id: null,
			permissions: '[]',
			must_change_password: 0
		};
		delete copy.id;
		const keys = Object.keys(copy);
		const user = await db.execute({
			sql: `INSERT INTO auth_user (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
			args: Object.values(copy)
		});
		tokens[role] = randomBytes(32).toString('base64url');
		const now = new Date().toISOString();
		await db.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)',
			args: [
				Number(user.lastInsertRowid),
				createHash('sha256').update(tokens[role]).digest('hex'),
				new Date(Date.now() + 1800000).toISOString(),
				now,
				now
			]
		});
	}
	server = spawn(process.execPath, ['build/index.js'], {
		cwd: root,
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: folder,
			photo: `file:${path.join(folder, 'uploads')}`,
			BODY_SIZE_LIMIT: '512M',
			NODE_ENV: 'production'
		}
	});
	server.stdout.on('data', (v) => (output += v));
	server.stderr.on('data', (v) => (output += v));
	let ready = false;
	for (let i = 0; i < 80; i++) {
		try {
			ready = (await fetch(base + '/login')).status === 200;
		} catch { /* The QA server is still starting. */ }
		if (ready) break;
		await new Promise((r) => setTimeout(r, 300));
	}
	assert.ok(ready, output.slice(-2000));
	const initial = await count();
	const otherBefore = await rows('SELECT * FROM pegawai WHERE sekolah_id=2 ORDER BY id');
	const accountBefore = await rows(
		'SELECT id,type,pegawai_id,permissions,jabatan_akses,kelas_id,mata_pelajaran_id FROM auth_user ORDER BY id'
	);
	assert.notEqual(
		(await action('previewImport', makeCsv('QA Refused', '9999000000000001'), { role: 'user' }))
			.status,
		200
	);
	assert.equal(await count(), initial);
	console.log('PASS non-manager cannot preview/import employee data');
	const fixture = makeCsv('QA Setara Security', '9999000000000002');
	const preview = await action('previewImport', fixture);
	assert.equal(preview.status, 200);
	assert.equal(await count(), initial);
	assert.equal((await action('importExcel', fixture)).status, 200);
	assert.equal(await count(), initial + 1);
	assert.equal((await action('importExcel', fixture)).status, 200);
	assert.equal(await count(), initial + 1);
	console.log(
		'PASS preview is read-only, repeated CSV updates same ID and does not duplicate placeholder NIP'
	);
	const old = (await rows("SELECT * FROM pegawai WHERE nama='QA Setara Security'"))[0];
	await db.execute({
		sql: "UPDATE pegawai SET jenis='kepala_sekolah',jabatan='Kepala Sekolah',status='nonaktif',telepon='081222222222',catatan='Catatan lama' WHERE id=?",
		args: [old.id]
	});
	await action('importExcel', fixture);
	const kept = (await rows('SELECT * FROM pegawai WHERE id=?', [old.id]))[0];
	assert.equal(kept.jenis, 'kepala_sekolah');
	assert.equal(kept.jabatan, 'Kepala Sekolah');
	assert.equal(kept.status, 'nonaktif');
	assert.equal(kept.telepon, '081222222222');
	assert.match(kept.catatan, /Catatan lama/);
	console.log(
		'PASS existing classification, inactive status, blank contacts and notes are preserved'
	);
	const beforeActual = await count();
	for (const file of files) {
		const pre = await action('previewImport', file);
		assert.equal(pre.status, 200);
		const data = JSON.parse(pre.payload.data);
		// SvelteKit action data is devalue, so validate summary through the import result and database instead.
		assert.ok(data);
		const before = await count();
		if (file.name.startsWith('guru_')) {
			assert.equal((await action('importExcel', file)).status, 400);
			assert.equal(await count(), before);
			console.log('PASS unresolved teacher identity conflicts block default import');
		}
		const result = await action('importExcel', file, { skip: true });
		assert.equal(result.status, 200, JSON.stringify(result.payload));
		const after = await count();
		assert.ok(after >= before);
		const repeat = await action('importExcel', file, { skip: true });
		assert.equal(repeat.status, 200);
		assert.equal(await count(), after);
		console.log(
			'PASS actual CSV',
			file.name,
			'added',
			after - before,
			'repeat import is idempotent'
		);
	}
	console.log('PASS actual-source aggregate added', (await count()) - beforeActual);
	const rollbackBefore = await count();
	await db.execute(
		"CREATE TRIGGER qa_setara_fail BEFORE INSERT ON pegawai_riwayat BEGIN SELECT RAISE(ABORT,'QA rollback'); END"
	);
	assert.equal(
		(await action('importExcel', makeCsv('QA Rollback', '9999000000000003'))).status,
		400
	);
	assert.equal(await count(), rollbackBefore);
	await db.execute('DROP TRIGGER qa_setara_fail');
	console.log('PASS injected history failure rolls back entire import');
	assert.equal((await action('importExcel', makeCsv('QA Bad NIK', '1'))).status, 400);
	assert.deepEqual(await rows('SELECT * FROM pegawai WHERE sekolah_id=2 ORDER BY id'), otherBefore);
	assert.deepEqual(
		await rows(
			'SELECT id,type,pegawai_id,permissions,jabatan_akses,kelas_id,mata_pelajaran_id FROM auth_user ORDER BY id'
		),
		accountBefore
	);
	assert.equal((await rows('PRAGMA integrity_check'))[0].integrity_check, 'ok');
	assert.equal((await rows('PRAGMA foreign_key_check')).length, 0);
	console.log(
		'PASS invalid identity rejected, other school untouched, SQLite integrity and foreign keys OK'
	);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox', '--disable-gpu']
	});
	const page = await browser.newPage();
	await page.setCookie(
		{ name: 'rapkumer-session', value: tokens.admin, url: base },
		{ name: 'active-sekolah-id', value: '1', url: base }
	);
	const uiFile = path.join(folder, 'ui.csv');
	await writeFile(uiFile, await fixture.text());
	for (const width of [390, 768, 1440]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(base + '/pegawai', { waitUntil: 'networkidle0' });
		await page.locator('summary[aria-label="Menu data Excel pegawai"]').click();
		await page
			.locator('details button')
			.filter((b) => b.textContent.includes('Import Data Pegawai'))
			.click();
		const input = await page.$('dialog[open] input[type=file]');
		await input.uploadFile(uiFile);
		await page.locator('button[formaction="?/previewImport"]').click();
		await page.waitForFunction(() =>
			document.querySelector('dialog[open]')?.textContent.includes('CSV Tendik Setara')
		);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(folder, `import-${width}.png`), fullPage: true });
		await page.keyboard.press('Escape');
	}
	console.log('PASS import dialog preview at 390,768,1440px and Escape');
	console.log('QA_RESULT', folder);
} finally {
	if (browser) await browser.close();
	if (server && server.exitCode === null) {
		server.kill('SIGTERM');
		await Promise.race([once(server, 'exit'), new Promise((r) => setTimeout(r, 5000))]);
		if (server.exitCode === null) server.kill('SIGKILL');
	}
	await writeFile(path.join(folder, 'server.log'), output);
	db.close();
}
