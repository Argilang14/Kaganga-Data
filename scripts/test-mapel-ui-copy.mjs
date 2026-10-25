import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer-core';
import { compile } from 'svelte/compiler';

const component = 'src/routes/(informasi-umum)/data-mata-pelajaran/+page.svelte';
const before = execFileSync('git', ['show', `HEAD:${component}`], { encoding: 'utf8' }).replaceAll(
	'\r\n',
	'\n'
);
const after = (await readFile(component, 'utf8')).replaceAll('\r\n', '\n');
assert.equal(
	after.slice(0, after.indexOf('</script>')),
	before.slice(0, before.indexOf('</script>'))
);
assert.deepEqual(compile(after, { filename: component, generate: 'client' }).warnings, []);

const local = process.env.MAPEL_UI_LOCAL === '1';
const port = local ? 5152 : Number(process.env.MAPEL_UI_QA_PORT || 5158);
assert.ok(local || ![1206, 5152].includes(port));
const base = `http://127.0.0.1:${port}`;
const route = '/data-mata-pelajaran';
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp', local ? 'mapel-ui-local-' : 'mapel-ui-copy-'));
const measurements = [],
	errors = [],
	blocked = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child, db, browser, session;
let output = '';
try {
	if (!local) {
		let occupied = false;
		try {
			await fetch(`${base}/login`);
			occupied = true;
		} catch {
			/* Expected unused QA port. */
		}
		assert.ok(!occupied, 'QA port is occupied');
		const database = path.join(folder, 'database.sqlite3');
		const source = createClient({ url: 'file:./data/database.sqlite3' });
		try {
			await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
		} finally {
			source.close();
		}
		db = createClient({ url: `file:${database}` });
		const admin = (
			await db.execute("SELECT id,sekolah_id FROM auth_user WHERE type='admin' LIMIT 1")
		).rows[0];
		const school = Number(
			admin.sekolah_id || (await db.execute('SELECT id FROM sekolah LIMIT 1')).rows[0].id
		);
		const kelas = Number(
			(await db.execute({ sql: 'SELECT id FROM kelas WHERE sekolah_id=? LIMIT 1', args: [school] }))
				.rows[0].id
		);
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
				'Mapel UI QA',
				'127.0.0.1',
				new Date(Date.now() + 1200000).toISOString(),
				now,
				now
			]
		});
		session = { token, school, kelas };
		await db.execute({
			sql: 'INSERT INTO jadwal_mata_pelajaran(sekolah_id,kode,nama,jenjang,kategori,jp_per_minggu,aktif,warna,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
			args: [
				school,
				'QA-UI-LONG',
				'NamaMapelTanpaSpasi'.repeat(12),
				'srma',
				'masa_persiapan',
				12,
				0,
				'#000000',
				now,
				now
			]
		});
		child = spawn(process.execPath, ['build/index.js'], {
			cwd: process.cwd(),
			windowsHide: true,
			env: {
				...process.env,
				PORT: String(port),
				HOST: '127.0.0.1',
				ORIGIN: base,
				DB_URL: `file:${database}`,
				KAGANGA_DATA_DIR: path.join(folder, 'data'),
				NODE_ENV: 'production'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		child.stdout.on('data', (value) => {
			output += value;
		});
		child.stderr.on('data', (value) => {
			output += value;
		});
		let ready = false;
		for (let i = 0; i < 120; i++) {
			try {
				if ((await fetch(`${base}/login`)).status === 200) {
					ready = true;
					break;
				}
			} catch {
				/* Wait for owned server. */
			}
			if (child.exitCode !== null) break;
			await delay(500);
		}
		assert.ok(ready, output.slice(-3000));
	}
	browser = await puppeteer.launch({
		executablePath:
			process.env.PUPPETEER_EXECUTABLE_PATH ||
			'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox']
	});
	const page = await browser.newPage();
	await page.setCacheEnabled(false);
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setRequestInterception(true);
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (
			['GET', 'HEAD'].includes(request.method()) ||
			(request.method() === 'POST' &&
				(url.pathname === '/login' || (!local && url.origin === base && url.pathname === route)))
		)
			void request.continue();
		else {
			blocked.push(url.pathname);
			void request.abort();
		}
	});
	if (session)
		await browser.setCookie(
			...Object.entries({
				'rapkumer-session': session.token,
				'active-sekolah-id': String(session.school),
				'active-kelas-id': String(session.kelas)
			}).map(([name, value]) => ({ name, value, url: base }))
		);
	else {
		await page.goto(base + '/login', { waitUntil: 'networkidle0' });
		await page.type('#username', process.env.KAGANGA_AUDIT_USERNAME || 'Admin');
		await page.type('#password', process.env.KAGANGA_AUDIT_PASSWORD || 'Admin123');
		const navigation = page.waitForNavigation({ waitUntil: 'networkidle0' });
		await page.click('button[type="submit"]');
		await navigation;
	}
	async function go(query = '') {
		const response = await page.goto(base + route + query, { waitUntil: 'networkidle0' });
		assert.equal(response.status(), 200);
		assert.equal(new URL(page.url()).pathname, route);
		await page.addStyleTag({
			content: '*,*::before,*::after{transition:none!important;animation:none!important}'
		});
	}
	async function capture(state) {
		const data = await page.evaluate(() => {
			const rect = (el) => {
				if (!el) return null;
				const r = el.getBoundingClientRect(),
					s = getComputedStyle(el);
				return {
					x: r.x,
					y: r.y,
					width: r.width,
					height: r.height,
					padding: s.padding,
					font: s.fontSize,
					scrollWidth: el.scrollWidth,
					clientWidth: el.clientWidth,
					scrollHeight: el.scrollHeight,
					clientHeight: el.clientHeight
				};
			};
			const modal = document.querySelector('dialog[open] .modal-box'),
				table = document.querySelector('.mapel-page table');
			return {
				viewport: innerWidth,
				pageWidth: document.documentElement.scrollWidth,
				heading: rect(document.querySelector('.mapel-page h1')),
				table: rect(table),
				wrapper: rect(table.parentElement),
				checkbox: rect(table.querySelector('input')),
				action: rect(table.querySelector('tbody button')),
				dropdown: rect(document.querySelector('details[open] .dropdown-content')),
				modal: rect(modal),
				footer: rect(modal?.querySelector('.modal-action')),
				buttons: [...(modal?.querySelectorAll('.modal-action .btn') ?? [])].map(rect),
				labelled: Boolean(document.querySelector('dialog[open][aria-labelledby]')),
				fields: [
					...(modal?.querySelectorAll('input:not([type="hidden"]),select,textarea') ?? [])
				].map((el) => ({ name: el.name, labels: el.labels?.length, ...rect(el) }))
			};
		});
		measurements.push({ state, ...data });
		assert.ok(data.pageWidth <= data.viewport, `${state}: page overflow`);
		if (data.dropdown) {
			assert.ok(data.dropdown.x >= 0);
			assert.ok(data.dropdown.x + data.dropdown.width <= data.viewport);
		}
		if (data.modal) {
			assert.ok(data.labelled);
			assert.ok(data.modal.scrollWidth <= data.modal.clientWidth + 1);
			for (const button of data.buttons) {
				assert.ok(button.x >= data.modal.x - 1);
				assert.ok(button.x + button.width <= data.modal.x + data.modal.width + 1);
			}
		}
		const style = await page.addStyleTag({
			content:
				'tbody td:not(:first-child){filter:blur(5px)} select[name="guruPegawaiId"]{color:transparent} dialog input[name="kode"],dialog textarea{color:transparent}'
		});
		await page.screenshot({ path: path.join(folder, `${state}-${data.viewport}.png`) });
		await style.evaluate((el) => el.remove());
		return data;
	}
	async function openAdd() {
		await page.click('.mapel-page header > div:last-child > button');
		await page.waitForSelector('dialog[open] input[name="kode"]');
	}
	async function cancel() {
		await page.evaluate(() =>
			[...document.querySelectorAll('dialog[open] button')]
				.find((el) => el.textContent.trim() === 'Batal')
				.click()
		);
	}
	async function importModal() {
		await page.click('.mapel-page summary');
		await page.click('.mapel-page details button');
		await page.waitForSelector('dialog[open] input[type="file"]');
	}
	for (const width of [1440, 1280, 768, 390, 320]) {
		await page.setViewport({ width, height: width < 500 ? 844 : 1000 });
		await go();
		const data = await capture('page');
		assert.equal(data.heading.font, '20px');
		assert.equal(data.checkbox.width, 24);
		assert.equal(data.checkbox.height, 24);
		if (data.action) assert.equal(data.action.height, 32);
		await page.click('.mapel-page summary');
		await capture('dropdown');
		await page.click('.mapel-page summary');
		await openAdd();
		const add = await capture('add');
		if (width >= 768) assert.equal(add.modal.width, 672);
		assert.ok(add.fields.every((field) => field.labels > 0));
		if (width < 500) {
			await page.$eval('dialog[open] .modal-box', (el) => {
				el.scrollTop = el.scrollHeight;
			});
			const end = await capture('add-end');
			const note = end.fields.find((field) => field.name === 'catatan');
			assert.ok(note.y >= end.modal.y);
			assert.ok(note.y + note.height <= end.footer.y);
		}
		await page.keyboard.press('Escape');
		await page.waitForSelector('dialog[open]', { hidden: true });
		await importModal();
		await capture('import');
		await cancel();
		await go('?q=__QA_NO_MATCHING_MAPEL__');
		const empty = await page.$eval('.mapel-page section > p', (el) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, width: r.width, text: el.textContent };
		});
		assert.ok(empty.x >= 0 && empty.x + empty.width <= width);
		assert.ok(empty.text.includes('sesuai dengan filter'));
		await capture('empty');
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await go();
	await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
	await capture('dark');
	await openAdd();
	await capture('dark-add');
	await cancel();
	await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
	for (const endpoint of ['/api/jadwal/mapel/template', '/api/jadwal/mapel/export']) {
		const status = await page.evaluate(
			async (endpoint) => (await fetch(endpoint)).status,
			endpoint
		);
		assert.equal(status, 200);
	}
	if (!local) {
		const submit = async (selector) => {
			const navigation = page.waitForNavigation({ waitUntil: 'networkidle0' });
			await page.click(selector);
			await navigation;
		};
		await openAdd();
		await page.type('dialog[open] input[name="kode"]', 'QA-UI-ONE');
		await page.type('dialog[open] input[name="nama"]', 'Mapel QA Tambah');
		await submit('dialog[open] .modal-box button[type="submit"]');
		assert.ok(await page.$('.alert-success'));
		await go('?q=QA-UI-ONE');
		assert.equal(await page.$$eval('tbody tr', (els) => els.length), 1);
		await page.click('tbody button[title="Edit"]');
		await page.$eval('dialog[open] input[name="nama"]', (el) => {
			el.value = '';
		});
		await page.type('dialog[open] input[name="nama"]', 'Mapel QA Diperbarui');
		await submit('dialog[open] .modal-box button[type="submit"]');
		const row = (
			await db.execute({
				sql: 'SELECT nama FROM jadwal_mata_pelajaran WHERE sekolah_id=? AND kode=?',
				args: [session.school, 'QA-UI-ONE']
			})
		).rows[0];
		assert.equal(row.nama, 'Mapel QA Diperbarui');
		await openAdd();
		await page.type('dialog[open] input[name="kode"]', 'QA-UI-ONE');
		await page.type('dialog[open] input[name="nama"]', 'Duplikat');
		await submit('dialog[open] .modal-box button[type="submit"]');
		assert.ok(await page.$('.alert-error'));
		await capture('save-error');
		await go('?q=QA-UI-ONE');
		await importModal();
		const invalid = path.join(folder, 'invalid.xlsx');
		await writeFile(invalid, 'invalid workbook');
		await (await page.$('dialog[open] input[type="file"]')).uploadFile(invalid);
		await submit('dialog[open] .modal-box button[type="submit"]');
		assert.ok(await page.$('.alert-error'));
		await capture('import-error');
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Mapel');
		sheet.addRow([
			'Kode',
			'Nama Mata Pelajaran',
			'Jenjang',
			'Fase',
			'Kategori',
			'ID Guru',
			'JP per Minggu',
			'Warna',
			'Aktif',
			'Catatan'
		]);
		sheet.addRow([
			'QA-UI-EXCEL',
			'Mapel QA Excel',
			'srma',
			'Fase E',
			'akademik',
			'',
			4,
			'#ffffff',
			'aktif',
			'QA'
		]);
		const valid = path.join(folder, 'valid.xlsx');
		await workbook.xlsx.writeFile(valid);
		await importModal();
		await (await page.$('dialog[open] input[type="file"]')).uploadFile(valid);
		await submit('dialog[open] .modal-box button[type="submit"]');
		assert.ok(await page.$('.alert-success'));
		assert.equal(
			(
				await db.execute({
					sql: 'SELECT jp_per_minggu FROM jadwal_mata_pelajaran WHERE sekolah_id=? AND kode=?',
					args: [session.school, 'QA-UI-EXCEL']
				})
			).rows[0].jp_per_minggu,
			4
		);
		await go('?q=QA-UI-ONE');
		page.once('dialog', async (dialog) => {
			assert.equal(dialog.type(), 'confirm');
			await dialog.dismiss();
		});
		await page.click('tbody button[title="Hapus"]');
		assert.equal(await page.$$eval('tbody tr', (els) => els.length), 1);
		page.once('dialog', async (dialog) => {
			await dialog.accept();
		});
		await submit('tbody form[action="?/delete"] button');
		assert.equal(
			(
				await db.execute({
					sql: 'SELECT id FROM jadwal_mata_pelajaran WHERE sekolah_id=? AND kode=?',
					args: [session.school, 'QA-UI-ONE']
				})
			).rows.length,
			0
		);
		await go('?q=QA-UI-');
		await page.click('thead input');
		assert.equal(
			await page.$eval('form[action="?/deleteBulk"] button', (el) => el.disabled),
			false
		);
		page.once('dialog', async (dialog) => {
			await dialog.accept();
		});
		await submit('form[action="?/deleteBulk"] button');
		assert.equal(
			(
				await db.execute({
					sql: "SELECT id FROM jadwal_mata_pelajaran WHERE sekolah_id=? AND kode LIKE 'QA-UI-%'",
					args: [session.school]
				})
			).rows.length,
			0
		);
		assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
		assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	}
	assert.deepEqual(errors, []);
	assert.deepEqual(blocked, []);
	console.log(
		`PASS ${local ? 'read-only local' : 'isolated-copy'} mapel UI: five viewports, table controls, dropdown bounds, labelled native dialogs, Escape, empty results, dark mode, Excel endpoints${local ? '' : ', create/edit, duplicate validation, invalid/valid import, single/bulk delete and database integrity'}.`
	);
	console.log('QA artifacts:', folder);
} catch (error) {
	if (browser) {
		const page = (await browser.pages()).at(-1);
		if (page) await page.screenshot({ path: path.join(folder, 'failure.png') });
	}
	console.error('QA artifacts:', folder);
	throw error;
} finally {
	await writeFile(
		path.join(folder, 'measurements.json'),
		JSON.stringify({ measurements, errors, blocked }, null, 2)
	);
	await writeFile(path.join(folder, 'server.log'), output);
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const ended = once(child, 'exit');
		child.kill();
		await ended;
	}
	if (db) db.close();
}
