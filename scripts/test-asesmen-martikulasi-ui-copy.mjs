import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { compile } from 'svelte/compiler';

const component = 'src/routes/(input-nilai)/asesmen-martikulasi/+page.svelte';
const source = await readFile(component, 'utf8');
const warnings = compile(source, { filename: component }).warnings.filter(
	(w) => w.code !== 'state_referenced_locally'
);
assert.deepEqual(warnings, []);
const originalSource = execFileSync('git', ['show', `HEAD:${component}`], { encoding: 'utf8' });
const names = (text) => [...text.matchAll(/\bname=("[^"]+"|\{`[^`]+`\})/g)].map((m) => m[1]).sort();
assert.deepEqual(names(source), names(originalSource), 'Form field contract must stay unchanged');
const port = 5184,
	base = `http://127.0.0.1:${port}`,
	route = '/asesmen-martikulasi';
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp', 'asesmen-martikulasi-ui-copy-'));
const file = path.join(folder, 'database.sqlite3');
assert.ok(
	await new Promise((resolve) => {
		const probe = createServer();
		probe.once('error', () => resolve(false));
		probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
	}),
	'QA port must be unused'
);
const original = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await original.execute({ sql: 'VACUUM INTO ?', args: [file] });
} finally {
	original.close();
}
const db = createClient({ url: `file:${file}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let browser,
	child,
	page,
	output = '';
const errors = [],
	checks = [],
	measurements = [],
	actions = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
try {
	const admin = await row("SELECT id,sekolah_id FROM auth_user WHERE type='admin' LIMIT 1");
	const school = Number(admin.sekolah_id || (await row('SELECT id FROM sekolah LIMIT 1')).id);
	const kelas = await row(
		`SELECT * FROM kelas k WHERE sekolah_id=? AND
 (SELECT count(*) FROM murid m WHERE m.kelas_id=k.id)>20 LIMIT 1`,
		[school]
	);
	assert.ok(kelas, 'Need a class with pagination in the isolated copy');
	await db.execute({
		sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
		args: [school, admin.id]
	});
	const token = randomBytes(32).toString('base64url'),
		now = new Date().toISOString();
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(token).digest('hex'),
			'Asesmen UI QA',
			'127.0.0.1',
			new Date(Date.now() + 1800000).toISOString(),
			now,
			now
		]
	});
	child = spawn(process.execPath, ['build/index.js'], {
		windowsHide: true,
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			DB_URL: `file:${file}`,
			KAGANGA_DATA_DIR: path.join(folder, 'data'),
			NODE_ENV: 'production'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(base + '/login')).status === 200) {
				ready = true;
				break;
			}
		} catch {
			/* Waiting for the isolated server. */
		}
		if (child.exitCode !== null) break;
		await delay(500);
	}
	assert.ok(ready, output.slice(-2000));
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	page = await browser.newPage();
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setRequestInterception(true);
	page.on('request', (request) => {
		if (!['GET', 'HEAD'].includes(request.method())) {
			if (new URL(request.url()).pathname !== route) {
				void request.abort();
				return;
			}
			actions.push(new URL(request.url()).search);
		}
		void request.continue();
	});
	await browser.setCookie(
		...Object.entries({
			'rapkumer-session': token,
			'active-sekolah-id': String(school),
			'active-kelas-id': String(kelas.id)
		}).map(([name, value]) => ({ name, value, url: base }))
	);
	const go = async (query = '') => {
		await page.goto(base + route + query, { waitUntil: 'networkidle0' });
		await page.waitForSelector('table');
	};
	const openBulk = async () => {
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find((el) => el.textContent.includes('Isi Massal'))
				.click()
		);
		await page.waitForSelector('dialog[open]');
	};
	const closeBulk = async () => {
		await page.$eval('dialog[open] button[type="button"]', (el) => el.click());
		await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	};
	async function measure(label, width, height = 1000) {
		await page.setViewport({ width, height });
		await delay(100);
		const m = await page.evaluate(() => {
			const box = (el) => {
				if (!el) return null;
				const r = el.getBoundingClientRect(),
					s = getComputedStyle(el);
				return {
					x: r.x,
					y: r.y,
					width: r.width,
					height: r.height,
					bottom: r.bottom,
					right: r.right,
					font: s.fontSize,
					padding: s.padding,
					overflow: el.scrollWidth > el.clientWidth + 1
				};
			};
			const dialog = document.querySelector('dialog[open]');
			return {
				pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
				header: box(document.querySelector('table thead tr')),
				row: box(document.querySelector('table tbody tr')),
				cell: box(document.querySelector('table tbody td')),
				search: box(document.querySelector('input[name="q"]')?.closest('label')),
				dialog: box(dialog?.querySelector('.app-modal-box')),
				body: box(dialog?.querySelector('.app-modal-body')),
				footer: box(dialog?.querySelector('.app-modal-actions')),
				button: box(document.querySelector('table .btn'))
			};
		});
		assert.equal(m.pageOverflow, false, JSON.stringify({ label, width, m }));
		if (m.dialog) {
			assert.ok(
				m.dialog.x >= 0 &&
					m.dialog.right <= width + 1 &&
					m.dialog.y >= 0 &&
					m.dialog.bottom <= height + 1
			);
			assert.equal(m.dialog.overflow, false);
			assert.ok(m.footer.bottom <= m.dialog.bottom + 1);
		} else {
			assert.equal(m.cell.font, width < 640 ? '13px' : '14px');
			assert.equal(m.cell.padding, width < 640 ? '10.4px 12px' : '12px 16px');
			assert.equal(m.button.height, 32);
		}
		measurements.push({ label, width, height, ...m });
		await page.screenshot({
			path: path.join(folder, `${label}-${width}-${height}.png`),
			fullPage: !m.dialog
		});
	}
	await go();
	const firstLink = await page.$eval('table tbody a', (el) => el.getAttribute('href'));
	const studentId = Number(new URL(firstLink, base).searchParams.get('murid_id'));
	const student = await row('SELECT nis,nisn FROM murid WHERE id=?', [studentId]);
	for (const width of [1440, 1024, 768, 390, 320]) await measure('table', width);
	await page.setViewport({ width: 1440, height: 1000 });
	await page.click('input[aria-label="Pilih semua murid pada halaman"]');
	assert.equal(await page.$$eval('table tbody input:checked', (els) => els.length), 20);
	await page.click('table tbody input');
	assert.equal(await page.$eval('thead input', (el) => el.indeterminate), true);
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((el) => el.textContent === 'Batalkan pilihan')
			.click()
	);
	await page.click('table tbody input');
	await openBulk();
	assert.equal(await page.$eval('[name="scope"]', (el) => el.value), 'terpilih');
	for (const width of [1440, 768, 390, 320])
		await measure('bulk', width, width === 320 ? 568 : 900);
	const selectWidths = await page.$$eval('dialog[open] select', (els) =>
		els.map((el) => el.getBoundingClientRect().width)
	);
	assert.ok(Math.max(...selectWidths) - Math.min(...selectWidths) < 1);
	await page.select('dialog[open] [name="field"]', 'catatan');
	await page.waitForSelector('dialog[open] textarea');
	await measure('bulk-text', 390, 650);
	await page.select('dialog[open] [name="field"]', 'levelPenempatan');
	await page.waitForSelector('dialog[open] select[name="value"]');
	assert.ok(await page.$('dialog[open] option[value="mahir"]'));
	await closeBulk();
	pass('Responsive table, square selection, partial selection, and all bulk field variants');
	await go('?page=2');
	assert.equal(
		await page.$eval('table tbody tr td:nth-child(2)', (el) => el.textContent.trim()),
		'21'
	);
	await go('?q=QA_NoSuchStudent');
	assert.match(await page.$eval('tbody', (el) => el.textContent), /Tidak ditemukan/);
	await go('?q=' + encodeURIComponent(String(student.nis)));
	assert.ok(await page.$('table tbody a'));
	await go('?q=' + encodeURIComponent(String(student.nisn)));
	assert.ok(await page.$('table tbody a'));
	await go();
	await page.click('table tbody a');
	await page.waitForSelector('dialog[open]');
	for (const width of [1440, 1024, 768, 390, 320])
		await measure('editor', width, width <= 390 ? 650 : 1000);
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await measure('editor-dark', 390, 650);
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	await page.keyboard.press('Escape');
	assert.ok(await page.$('dialog[open]'));
	await page.setViewport({ width: 1440, height: 1000 });
	await page.evaluate(() => {
		for (const input of document.querySelectorAll('dialog[open] input[name^="nilai_"]'))
			input.value = input.name.endsWith('_catatan') ? 'Catatan QA' : 'Capaian QA';
		for (const select of document.querySelectorAll('dialog[open] select[name$="_ketuntasan"]'))
			select.value = 'tuntas';
		for (const textarea of document.querySelectorAll('dialog[open] textarea'))
			textarea.value = 'Deskripsi QA';
		document.querySelector('dialog[open] [name="levelPenempatan"]').value = 'madya';
	});
	const singleSave = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && new URL(response.url()).pathname === route
	);
	await page.$eval('dialog[open] button[type="submit"]', (el) => el.click());
	assert.equal((await singleSave).status(), 200);
	await page.waitForFunction(
		() => !document.querySelector('dialog[open] button[type="submit"]:disabled')
	);
	const saved = await row(
		'SELECT * FROM martikulasi_hasil WHERE murid_id=? AND tahun_ajaran_id=?',
		[studentId, kelas.tahun_ajaran_id]
	);
	assert.equal(saved.status_kelengkapan, 'lengkap');
	assert.equal(saved.level_penempatan, 'madya');
	const savedRows = (
		await db.execute({ sql: 'SELECT * FROM martikulasi_nilai WHERE hasil_id=?', args: [saved.id] })
	).rows;
	assert.equal(savedRows.length, 8);
	await page.$eval('dialog[open] .app-modal-actions a', (el) => el.click());
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	pass(
		'Pagination, NIS/NISN search, filtered empty state, editor and complete single-student save'
	);
	await go('?q=' + encodeURIComponent(String(student.nis)));
	await page.click('table tbody input');
	await openBulk();
	await page.select('dialog[open] [name="field"]', 'catatanUmum');
	await page.waitForSelector('dialog[open] textarea[name="value"]');
	await page.type('dialog[open] textarea[name="value"]', 'Catatan massal QA');
	await page.$eval('dialog[open] button[type="submit"]', (el) => el.click());
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	const bulkSaved = await row('SELECT * FROM martikulasi_hasil WHERE id=?', [saved.id]);
	assert.equal(bulkSaved.catatan_umum, 'Catatan massal QA');
	assert.equal(bulkSaved.level_penempatan, 'madya');
	const afterRows = (
		await db.execute({
			sql: 'SELECT aspek_kode,capaian_awal,capaian_akhir,ketuntasan,catatan,deskripsi_capaian FROM martikulasi_nilai WHERE hasil_id=? ORDER BY aspek_kode',
			args: [saved.id]
		})
	).rows;
	assert.deepEqual(
		afterRows,
		savedRows
			.map(
				({ aspek_kode, capaian_awal, capaian_akhir, ketuntasan, catatan, deskripsi_capaian }) => ({
					aspek_kode,
					capaian_awal,
					capaian_akhir,
					ketuntasan,
					catatan,
					deskripsi_capaian
				})
			)
			.sort((a, b) => a.aspek_kode.localeCompare(b.aspek_kode))
	);
	pass('Bulk save updates only the chosen field and retains aspect scores and placement');
	// Force a server validation failure using a tampered hidden field, only on the copy.
	await go(firstLink.slice(route.length));
	await page.$eval('dialog[open] input[name="kelasId"]', (el) => (el.value = '-1'));
	const failure = page.waitForResponse(
		(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === route
	);
	await page.$eval('dialog[open] button[type="submit"]', (el) => el.click());
	const rejected = await (await failure).json();
	assert.equal(rejected.type, 'failure', JSON.stringify(rejected));
	assert.equal(rejected.status, 400);
	await page.waitForFunction(
		() => !document.querySelector('dialog[open] button[type="submit"]:disabled')
	);
	assert.ok(await page.$('dialog[open]'));
	pass('Failed save retains editor and reenables controls');
	assert.deepEqual(errors, []);
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify({ status: 'PASS', checks, measurements, errors, actions }, null, 2)
	);
	console.log(JSON.stringify({ status: 'PASS', folder, checks: checks.length, actions }));
} catch (error) {
	console.error(error);
	if (page) await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
	db.close();
	await writeFile(path.join(folder, 'server.log'), output);
}
