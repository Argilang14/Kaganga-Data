import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';
import { compile } from 'svelte/compiler';
import { format } from 'prettier';

const component = 'src/routes/(informasi-umum)/rapor/jadwal-pelajaran/+page.svelte';
const source = await readFile(component, 'utf8');
assert.deepEqual(compile(source, { filename: component, generate: 'client' }).warnings, []);
const before = execFileSync('git', ['show', `HEAD:${component}`], { encoding: 'utf8' });
const script = (value) =>
	value.slice(value.indexOf('<script lang="ts">') + 18, value.indexOf('</script>'));
assert.equal(
	await format(
		script(source)
			.replace(/\s*let mobilePanelOpen = \$state\(false\);/, '')
			.replace(
				'return `--slot-color:${color};`;',
				'return `background:${color};border-color:${color};`;'
			),
		{ parser: 'typescript' }
	),
	await format(script(before), { parser: 'typescript' }),
	'Only panel visibility and cell color presentation may change in the script'
);

const local = process.env.JADWAL_UI_LOCAL === '1';
const port = local ? 5152 : 5159;
const base = `http://localhost:${port}`,
	route = '/rapor/jadwal-pelajaran';
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp', local ? 'jadwal-ui-local-' : 'jadwal-ui-copy-'));
const errors = [],
	blocked = [],
	measurements = [],
	actions = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser,
	child,
	db,
	session,
	output = '';
try {
	if (!local) {
		let occupied = false;
		try {
			occupied = (await fetch(`${base}/login`)).status > 0;
		} catch {
			/* Unused QA port. */
		}
		assert.equal(occupied, false, 'QA port is occupied');
		const file = path.join(folder, 'database.sqlite3');
		const original = createClient({ url: 'file:./data/database.sqlite3' });
		try {
			await original.execute({ sql: 'VACUUM INTO ?', args: [file] });
		} finally {
			original.close();
		}
		db = createClient({ url: `file:${file}` });
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
		const now = new Date().toISOString(),
			token = randomBytes(32).toString('base64url');
		await db.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
			args: [
				admin.id,
				createHash('sha256').update(token).digest('hex'),
				'Jadwal UI QA',
				'127.0.0.1',
				new Date(Date.now() + 1800000).toISOString(),
				now,
				now
			]
		});
		await db.execute({
			sql: 'INSERT INTO jadwal_mata_pelajaran(sekolah_id,kode,nama,jenjang,kategori,jp_per_minggu,aktif,warna,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
			args: [
				school,
				'QA-UI',
				'Mata Pelajaran Pengujian UI',
				'semua',
				'masa_persiapan',
				0,
				1,
				'#111111',
				now,
				now
			]
		});
		session = { school, kelas, token };
		child = spawn(process.execPath, ['build/index.js'], {
			cwd: process.cwd(),
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
		child.stdout.on('data', (chunk) => {
			output += chunk;
		});
		child.stderr.on('data', (chunk) => {
			output += chunk;
		});
		let ready = false;
		for (let i = 0; i < 120; i++) {
			try {
				if ((await fetch(`${base}/login`)).status === 200) {
					ready = true;
					break;
				}
			} catch {
				/* Startup. */
			}
			if (child.exitCode !== null) break;
			await delay(500);
		}
		assert.ok(ready, output.slice(-3000));
	}
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage();
	await page.setCacheEnabled(false);
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setRequestInterception(true);
	page.on('request', (request) => {
		const url = new URL(request.url());
		const mutation = request.method() === 'POST' && !['/login'].includes(url.pathname);
		if (
			mutation &&
			(local || ![route, '/api/jadwal/pelajaran/import-preview'].includes(url.pathname))
		) {
			blocked.push(url.pathname);
			void request.abort();
		} else {
			if (mutation) actions.push(url.pathname + url.search);
			if (!local && mutation && url.search.includes('/saveJadwal')) {
				setTimeout(() => void request.continue(), 800);
			} else void request.continue();
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
		await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
		await page.type('#username', process.env.KAGANGA_AUDIT_USERNAME || 'Admin');
		await page.type('#password', process.env.KAGANGA_AUDIT_PASSWORD || 'Admin123');
		await Promise.all([
			page.waitForNavigation({ waitUntil: 'networkidle0' }),
			page.click('button[type="submit"]')
		]);
	}
	async function go() {
		const response = await page.goto(base + route, { waitUntil: 'networkidle0' });
		assert.equal(response.status(), 200);
		assert.equal(new URL(page.url()).pathname, route);
		await page.addStyleTag({
			content: '*,*::before,*::after{animation:none!important;transition:none!important}'
		});
	}
	async function clickText(text, root = 'button') {
		const handles = await page.$$(root);
		for (const handle of handles) {
			if (
				(await handle.evaluate((el) => el.textContent.trim())) === text &&
				(await handle.isVisible())
			) {
				await handle.click();
				return;
			}
		}
		throw new Error(`Visible control not found: ${text}`);
	}
	async function capture(label) {
		const value = await page.evaluate(() => {
			const rect = (el) => {
				if (!el) return null;
				const r = el.getBoundingClientRect(),
					s = getComputedStyle(el);
				return {
					x: r.x,
					y: r.y,
					width: r.width,
					height: r.height,
					font: s.fontSize,
					scrollWidth: el.scrollWidth,
					clientWidth: el.clientWidth
				};
			};
			const modal = document.querySelector('dialog[open] .modal-box');
			return {
				viewport: innerWidth,
				height: innerHeight,
				pageWidth: document.documentElement.scrollWidth,
				title: rect(document.querySelector('#schedule-title')),
				header: rect(document.querySelector('.schedule-header')),
				filter: rect(document.querySelector('.schedule-context .select')),
				check: rect(document.querySelector('.schedule-checks')),
				wrapper: rect(document.querySelector('.schedule-table-scroll')),
				table: rect(document.querySelector('.schedule-table')),
				panel: rect(document.querySelector('.schedule-panel')),
				modal: rect(modal),
				footer: rect(modal?.querySelector('.app-modal-actions')),
				actionControls: [
					...document.querySelectorAll('.schedule-actions > button, .schedule-actions summary')
				]
					.filter((el) => el.getClientRects().length)
					.map(rect)
			};
		});
		measurements.push({ label, ...value });
		assert.ok(value.pageWidth <= value.viewport + 1, `${label}: page overflows`);
		assert.equal(value.title.font, '20px');
		assert.equal(value.filter.height, 40);
		assert.ok(value.check.height < 160, `${label}: summary too tall`);
		if (value.viewport <= 390) {
			for (const control of value.actionControls) {
				const peers = value.actionControls.filter((other) => Math.abs(other.y - control.y) < 1);
				assert.ok(
					peers.every((other) => Math.abs(other.height - control.height) < 1),
					`${label}: uneven action buttons`
				);
			}
		}
		if (value.modal) {
			assert.ok(
				value.modal.x >= 0 && value.modal.x + value.modal.width <= value.viewport + 1,
				`${label}: modal width`
			);
			assert.ok(
				value.footer.y + value.footer.height <= value.height,
				`${label}: footer not visible`
			);
		}
		await page.screenshot({ path: path.join(folder, `${label}.png`) });
		return value;
	}
	for (const width of [1440, 1280, 1024, 768, 390, 320]) {
		await page.setViewport({ width, height: width <= 390 ? 844 : 1000 });
		await go();
		await capture(`${width}-default`);
		if (width < 1280) {
			assert.equal(
				await page.$eval('.schedule-panel', (el) => getComputedStyle(el).display),
				'none'
			);
			await clickText('Item Jadwal', '.schedule-mobile-trigger');
			const value = await capture(`${width}-items`);
			assert.ok(value.panel.y < value.wrapper.y, 'Mobile palette must precede the table');
			await page.type('input[aria-label="Cari item jadwal"]', 'NOT-AN-ITEM');
			assert.ok(
				await page.$eval('.schedule-panel', (el) =>
					el.textContent.includes('Tidak ada item yang cocok.')
				)
			);
			await page.click('button[aria-label="Tutup panel item"]');
		}
		await clickText('Target JP');
		await page.waitForSelector('dialog[open]');
		const jp = await capture(`${width}-jp`);
		if (width === 1440) assert.equal(jp.modal.width, 1280);
		await page.keyboard.press('Escape');
		assert.equal(await page.$('dialog[open]'), null);
		assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Target JP');
		await page.click('.schedule-actions summary');
		assert.ok(
			await page.$eval('.schedule-actions .dropdown-content', (el) => {
				const r = el.getBoundingClientRect();
				return r.x >= 0 && r.right <= innerWidth;
			})
		);
		await clickText('Import dan Pratinjau');
		await capture(`${width}-import`);
		await page.keyboard.press('Escape');
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await go();
	await page.click('.schedule-check-summary');
	assert.ok(await page.$eval('.schedule-checks', (el) => el.open));
	await page.screenshot({ path: path.join(folder, 'checks-expanded.png') });
	await page.click('.schedule-check-summary');
	await clickText('Normal');
	assert.equal(await page.$('.compact-schedule'), null);
	await capture('normal');
	await clickText('Padat');
	await page.$eval('.schedule-table-scroll', (el) => {
		el.scrollTop = 500;
		el.scrollLeft = 300;
	});
	assert.ok(
		await page.evaluate(() => {
			const wrapper = document.querySelector('.schedule-table-scroll').getBoundingClientRect();
			const head = document.querySelector('.schedule-table thead').getBoundingClientRect();
			const day = document.querySelector('thead .sticky-col-day').getBoundingClientRect();
			const topCell = document.elementFromPoint(
				day.left + day.width / 2,
				head.top + head.height / 2
			);
			return (
				Math.abs(head.top - wrapper.top) < 3 &&
				Math.abs(day.left - wrapper.left) < 3 &&
				topCell?.textContent.trim() === 'Hari'
			);
		}),
		'Sticky table header/day'
	);
	for (const jenjang of ['srd', 'srmp', 'srma', 'semua']) {
		await page.select('.schedule-jenjang select', jenjang);
		assert.ok(await page.$('.schedule-table'));
	}
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await capture('dark');
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	await page.click('button[aria-label="Ciutkan panel"]');
	assert.equal(
		await page.$eval('.schedule-panel-body', (el) => getComputedStyle(el).display),
		'none'
	);
	await capture('panel-collapsed');
	await page.setViewport({ width: 390, height: 844 });
	await clickText('Item Jadwal', '.schedule-mobile-trigger');
	assert.notEqual(
		await page.$eval('.schedule-panel-body', (el) => getComputedStyle(el).display),
		'none'
	);
	await capture('mobile-with-collapsed-preference');
	await page.click('button[aria-label="Tutup panel item"]');
	await page.setViewport({ width: 1440, height: 1000 });
	await page.click('button[aria-label="Buka panel"]');
	await page.click('button[aria-label="Pindahkan panel"]');
	assert.ok(await page.$eval('.schedule-workspace', (el) => el.classList.contains('panel-left')));
	await capture('panel-left');
	await page.click('button[aria-label="Pindahkan panel"]');
	if (!local) {
		await go();
		const getCount = async () =>
			Number((await db.execute('SELECT count(*) AS n FROM jadwal_pelajaran')).rows[0].n);
		const initialCount = await getCount();
		await page.evaluate(() => {
			const candidates = [...document.querySelectorAll('.schedule-table tbody tr')];
			const row = candidates.find(
				(el) =>
					el.querySelector('.group-jam-cell')?.textContent.includes('JP') &&
					el.querySelector('.slot-button:not(:disabled)')
			);
			row.querySelector('.slot-button:not(:disabled)').click();
		});
		await page.waitForSelector('dialog[open][aria-labelledby="schedule-cell-title"]');
		await capture('edit-cell');
		await page.setViewport({ width: 320, height: 600 });
		await capture('short-mobile-edit-cell');
		await page.setViewport({ width: 1440, height: 1000 });
		await page.select('dialog[open] select', 'QA-UI');
		await clickText('Simpan Sel');
		assert.equal(await getCount(), initialCount, 'Editing only changes the draft');
		const drag = await page.evaluate(() => {
			const item = [...document.querySelectorAll('.palette-item')].find((el) =>
				el.textContent.includes('QA-UI')
			);
			const target = [...document.querySelectorAll('.schedule-table tbody tr')]
				.filter((el) => el.querySelector('.group-jam-cell')?.textContent.includes('JP'))
				.map((el) => el.querySelector('.slot-button:not(:disabled):not(.has-value)'))
				.find(Boolean);
			if (!target || !item) return false;
			const dataTransfer = new DataTransfer();
			item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
			target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
			return true;
		});
		assert.ok(drag);
		await page.waitForSelector('dialog[open][aria-labelledby="schedule-drop-title"]');
		await capture('drop');
		await clickText('Sel ini saja');
		await clickText('Simpan Jadwal');
		await page.waitForFunction(() =>
			[...document.querySelectorAll('.schedule-actions button')].some(
				(el) => el.disabled && el.textContent.includes('Menyimpan')
			)
		);
		await capture('saving');
		await page.waitForFunction(
			() =>
				![...document.querySelectorAll('button')].some((el) => el.textContent.includes('Menyimpan'))
		);
		await delay(1000);
		assert.ok(
			Number(
				(await db.execute("SELECT count(*) AS n FROM jadwal_pelajaran WHERE kode_kegiatan='QA-UI'"))
					.rows[0].n
			) >= 2,
			'Draft cells persisted'
		);
		await go();
		assert.ok(await page.$eval('.schedule-table', (el) => el.textContent.includes('QA-UI')));
		await clickText('Target JP');
		await page.$eval('dialog[open] input[type="number"]', (el) => {
			el.value = '1';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await clickText('Simpan Target JP');
		await page.waitForFunction(() => !document.querySelector('dialog[open]'));
		assert.ok(
			Number(
				(await db.execute('SELECT count(*) AS n FROM jadwal_target_jp WHERE jp_per_minggu=1'))
					.rows[0].n
			) > 0
		);
		await go();
		const workbook = new ExcelJS.Workbook(),
			sheet = workbook.addWorksheet('Jadwal Pelajaran');
		sheet.addRow(['Hari', 'Jam Ke', 'Kelas', 'Kode']);
		sheet.addRow(['Senin', 2, 'IV', 'QA-UI']);
		sheet.addRow(['Hari tidak valid', 999, 'Tidak Ada', 'NOPE']);
		const excelFile = path.join(folder, 'qa-jadwal.xlsx');
		await workbook.xlsx.writeFile(excelFile);
		const invalidWorkbook = new ExcelJS.Workbook();
		invalidWorkbook.addWorksheet('Tidak Valid').addRow(['Header tidak sesuai']);
		const invalidFile = path.join(folder, 'qa-invalid.xlsx');
		await invalidWorkbook.xlsx.writeFile(invalidFile);
		await page.click('.schedule-actions summary');
		await clickText('Import dan Pratinjau');
		const input = await page.$('dialog[open] input[type="file"]');
		await input.uploadFile(invalidFile);
		const rejected = page.waitForResponse((response) =>
			response.url().includes('/api/jadwal/pelajaran/import-preview')
		);
		await clickText('Periksa File');
		assert.equal((await rejected).status(), 400);
		await page.waitForFunction(() =>
			document.body.textContent.includes('Header Hari, Jam Ke, Kelas, dan Kode tidak ditemukan.')
		);
		await capture('import-error');
		await input.uploadFile(excelFile);
		await clickText('Periksa File');
		await page.waitForFunction(() =>
			document.querySelector('dialog[open]')?.textContent.includes('Baris yang perlu diperbaiki')
		);
		await capture('import-preview');
		await clickText('Terapkan ke Tabel');
		assert.equal(await page.$('dialog[open]'), null);
		await clickText('Kosongkan', '.schedule-clear');
		assert.equal(await page.$$eval('.schedule-table .has-value', (list) => list.length), 0);
		await go();
		assert.ok(
			await page.$eval('.schedule-table', (el) => el.textContent.includes('QA-UI')),
			'Clearing draft does not persist until save'
		);
		assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
		assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	}
	assert.deepEqual(errors, []);
	assert.deepEqual(blocked, []);
	console.log(
		JSON.stringify({ result: 'PASS', folder, local, screenshots: measurements.length, actions })
	);
} catch (error) {
	console.error(error);
	console.error(output.slice(-3000));
	process.exitCode = 1;
} finally {
	await writeFile(
		path.join(folder, 'measurements.json'),
		JSON.stringify({ measurements, errors, blocked, actions }, null, 2)
	);
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const stopped = once(child, 'exit');
		child.kill();
		await stopped;
	}
	if (db) db.close();
	await writeFile(path.join(folder, 'server.log'), output);
}
