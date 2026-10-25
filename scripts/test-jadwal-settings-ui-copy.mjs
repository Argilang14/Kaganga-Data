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

const component = 'src/routes/(jadwal)/jadwal/pengaturan/+page.svelte';
const source = await readFile(component, 'utf8');
assert.deepEqual(compile(source, { filename: component }).warnings, []);
const baseline = execFileSync('git', ['show', `HEAD:${component}`], { encoding: 'utf8' });
const script = (value) =>
	value.slice(value.indexOf('<script lang="ts">') + 18, value.indexOf('</script>'));
assert.equal(
	await format(
		script(source)
			.replace(/\s*selectedJamIds\?: number\[\];/, '')
			.replace(/\s*selectedJamIds = form.copyRequest\?\.selectedJamIds \?\? \[\];/, ''),
		{ parser: 'typescript' }
	),
	await format(
		script(baseline).replace(
			/\s*(?:activeTahunAjaranId|activeSemesterId|semesterId): number \| null;/g,
			''
		),
		{ parser: 'typescript' }
	),
	'Only unused types and restoration of preview selection may change in the script'
);
const local = process.env.JADWAL_UI_LOCAL === '1';
const base = `http://localhost:${local ? 5152 : 5159}`;
const route = '/jadwal/pengaturan';
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(
	path.resolve('tmp', local ? 'settings-ui-local-' : 'settings-ui-copy-')
);
const measurements = [],
	actions = [],
	errors = [],
	blocked = [];
let browser,
	child,
	db,
	session,
	output = '';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
				'Settings UI QA',
				'127.0.0.1',
				new Date(Date.now() + 1800000).toISOString(),
				now,
				now
			]
		});
		session = { school, kelas, token };
		child = spawn(process.execPath, ['build/index.js'], {
			windowsHide: true,
			env: {
				...process.env,
				PORT: '5159',
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
		if (
			!['GET', 'HEAD'].includes(request.method()) &&
			!(url.pathname === '/login' && request.method() === 'POST') &&
			(local || url.pathname !== route)
		) {
			blocked.push(url.pathname);
			void request.abort();
		} else {
			if (request.method() === 'POST' && url.pathname === route) actions.push(url.search);
			void request.continue();
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
	async function clickText(text, selector = 'button') {
		for (const handle of await page.$$(selector)) {
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
				const r = el.getBoundingClientRect();
				return { x: r.x, y: r.y, width: r.width, height: r.height };
			};
			const modal = document.querySelector('dialog[open] .app-modal-box'),
				scroll = document.querySelector('.settings-table-scroll');
			return {
				viewport: innerWidth,
				pageWidth: document.documentElement.scrollWidth,
				page: rect(document.querySelector('.settings-page')),
				editor: rect(document.querySelector('.settings-editor')),
				wrapper: rect(scroll),
				scrollWidth: scroll.scrollWidth,
				checkbox: rect(document.querySelector('.settings-table .checkbox')),
				time: rect(document.querySelector('.settings-table input[type="time"]')),
				titleFont: getComputedStyle(document.querySelector('.settings-header h2')).fontSize,
				modal: rect(modal),
				footer: rect(modal?.querySelector('.app-modal-actions')),
				modalOverflow: modal ? modal.scrollWidth > modal.clientWidth + 1 : false
			};
		});
		measurements.push({ label, ...value });
		assert.ok(value.pageWidth <= value.viewport + 1, `${label}: page overflow`);
		assert.ok(
			value.editor.x >= -1 && value.editor.x + value.editor.width <= value.viewport + 1,
			`${label}: editor overflow`
		);
		assert.ok(value.wrapper.width <= value.editor.width, `${label}: table wrapper overflow`);
		assert.equal(Math.round(value.checkbox.width), 24);
		assert.equal(Math.round(value.checkbox.height), 24);
		assert.equal(Math.round(value.time.height), 32);
		assert.equal(value.titleFont, '20px');
		if (value.modal) {
			assert.ok(!value.modalOverflow, `${label}: modal width overflow`);
			assert.ok(value.modal.x >= 0 && value.modal.x + value.modal.width <= value.viewport + 1);
			assert.ok(
				value.footer.y >= value.modal.y &&
					value.footer.y + value.footer.height <= value.modal.y + value.modal.height + 1,
				`${label}: footer clipped`
			);
			assert.ok(
				await page.evaluate(() =>
					document.querySelector('dialog[open]').contains(document.activeElement)
				),
				'Modal focus'
			);
		}
		await page.screenshot({ path: path.join(folder, `${label}.png`) });
	}
	for (const width of [1440, 1280, 1024, 768, 390, 320]) {
		await page.setViewport({ width, height: width <= 390 ? 844 : 1000 });
		await go();
		await capture(`${width}-page`);
		await page.click('.settings-activities > summary');
		await capture(`${width}-activities`);
		await page.click('.settings-activities > summary');
		await page.$eval('.settings-table-scroll', (el) => {
			el.scrollLeft = el.scrollWidth;
		});
		assert.ok(
			await page.$eval('.settings-table-scroll', (el) => {
				const a = el.getBoundingClientRect(),
					b = el.querySelector('button[title="Simpan jam"]').getBoundingClientRect();
				return b.x >= a.x && b.right <= a.right + 1;
			}),
			'Save must be reachable by local scrolling'
		);
		await page.$eval('.settings-table-scroll', (el) => el.scrollIntoView({ block: 'start' }));
		await capture(`${width}-table-actions`);
		if ([1440, 390, 320].includes(width)) {
			for (const [text, name] of [
				['Tambah Jam', 'jam'],
				['Tambah Kegiatan', 'kegiatan'],
				['Salin Susunan Jam', 'copy']
			]) {
				await clickText(text);
				await capture(`${width}-${name}`);
				await page.keyboard.press('Tab');
				assert.ok(
					await page.evaluate(() =>
						document.querySelector('dialog[open]').contains(document.activeElement)
					)
				);
				await page.keyboard.press('Escape');
				assert.equal(await page.$('dialog[open]'), null);
			}
			await clickText('Data Excel');
			await clickText('Import Data');
			await capture(`${width}-import`);
			await page.keyboard.press('Escape');
		}
	}
	await page.setViewport({ width: 390, height: 844 });
	await go();
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await capture('390-dark');
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	if (!local) {
		await page.setViewport({ width: 1440, height: 1000 });
		await go();
		async function fill(selector, value) {
			await page.$eval(
				selector,
				(el, value) => {
					el.value = value;
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				},
				String(value)
			);
		}
		async function submit(selector) {
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle0' }),
				page.click(selector)
			]);
		}
		const day = await page.$eval('.settings-days .tab-active', (el) => el.textContent.trim());
		const hari = { Senin: 'senin', Selasa: 'selasa', Rabu: 'rabu', Kamis: 'kamis', Jumat: 'jumat' }[
			day
		];
		const slot = await page.$$eval(
			'.settings-table tbody tr',
			(rows) =>
				Math.max(
					...rows.map((row) =>
						Number(row.querySelector('td:nth-child(2)')?.textContent.match(/Slot (\d+)/)?.[1] || 0)
					)
				) + 1
		);
		await clickText('Tambah Jam');
		const jamDialog = 'dialog[aria-labelledby="jam-title"]';
		await fill(`${jamDialog} [name="jamKe"]`, slot);
		await fill(`${jamDialog} [name="pukulMulai"]`, '20:00');
		await fill(`${jamDialog} [name="pukulSelesai"]`, '20:30');
		await fill(`${jamDialog} [name="label"]`, 'QA Jadwal UI');
		await submit(`${jamDialog} button[type="submit"]`);
		assert.ok(await page.$eval('.alert-success', (el) => el.textContent.includes('berhasil')));
		let record = (
			await db.execute(
				"SELECT * FROM jadwal_jam WHERE label='QA Jadwal UI' ORDER BY id DESC LIMIT 1"
			)
		).rows[0];
		assert.ok(record);
		const rowSelector = `.settings-table tr:has([id="jam-form-${record.id}"])`;
		await fill(`${rowSelector} [name="label"]`, 'QA Jadwal Diperbarui');
		await submit(`${rowSelector} [title="Simpan jam"]`);
		assert.equal(
			(await db.execute({ sql: 'SELECT label FROM jadwal_jam WHERE id=?', args: [record.id] }))
				.rows[0].label,
			'QA Jadwal Diperbarui'
		);
		for (const [action, expected] of [
			['nonaktif', 0],
			['aktif', 1]
		]) {
			await page.click(`${rowSelector} .checkbox`);
			await page.select('[name="bulkAction"]', action);
			await submit('.settings-bulk button[type="submit"]');
			assert.equal(
				Number(
					(await db.execute({ sql: 'SELECT aktif FROM jadwal_jam WHERE id=?', args: [record.id] }))
						.rows[0].aktif
				),
				expected
			);
		}
		await page.click(`${rowSelector} .checkbox`);
		await clickText('Salin Susunan Jam');
		const copy = 'dialog[aria-labelledby="copy-title"]';
		await page.select(`${copy} [name="scope"]`, 'terpilih');
		await page.select(`${copy} [name="targetJenis"]`, 'genap');
		await page.$eval(`${copy} form`, (form) => {
			for (const box of form.querySelectorAll('[name="targetHari"]'))
				box.checked = box.value === 'selasa';
		});
		const beforePreview = (await db.execute('SELECT * FROM jadwal_jam ORDER BY id')).rows;
		await submit(`${copy} [name="intent"][value="preview"]`);
		assert.deepEqual(
			(await db.execute('SELECT * FROM jadwal_jam ORDER BY id')).rows,
			beforePreview,
			'Preview must not change slots'
		);
		await capture('copy-preview');
		assert.equal(await page.$(`${copy} .alert-error`), null, 'Copy fixture must not conflict');
		await submit(`${copy} [name="intent"][value="apply"]`);
		assert.ok(await page.$eval('.alert-success', (el) => el.textContent.includes('disalin')));
		assert.ok(
			(
				await db.execute({
					sql: "SELECT id FROM jadwal_jam WHERE label='QA Jadwal Diperbarui' AND hari='selasa' AND id<>?",
					args: [record.id]
				})
			).rows.length > 0
		);
		for (const policy of ['gabung', 'ganti']) {
			await go();
			await clickText('Salin Susunan Jam');
			await page.select(`${copy} [name="targetJenis"]`, 'genap');
			await page.select(`${copy} [name="targetJenjang"]`, 'srd');
			await page.select(`${copy} [name="policy"]`, policy);
			await page.$eval(`${copy} form`, (form) => {
				for (const box of form.querySelectorAll('[name="targetHari"]'))
					box.checked = ['rabu', 'kamis'].includes(box.value);
			});
			await submit(`${copy} [value="preview"]`);
			assert.equal(await page.$(`${copy} .alert-error`), null);
			await capture(`copy-all-${policy}`);
			await submit(`${copy} [value="apply"]`);
			assert.ok(await page.$eval('.alert-success', (el) => el.textContent.includes('disalin')));
		}
		await go();
		await clickText('Salin Susunan Jam');
		await page.$eval(
			`${copy} form`,
			(form, hari) => {
				for (const box of form.querySelectorAll('[name="targetHari"]'))
					box.checked = box.value === hari;
			},
			hari
		);
		const beforeConflict = (await db.execute('SELECT * FROM jadwal_jam ORDER BY id')).rows;
		await submit(`${copy} [value="preview"]`);
		assert.ok(await page.$(`${copy} .alert-error`));
		assert.equal(await page.$(`${copy} [value="apply"]`), null);
		assert.deepEqual(
			(await db.execute('SELECT * FROM jadwal_jam ORDER BY id')).rows,
			beforeConflict
		);
		await capture('copy-conflict');
		await go();
		await clickText('Tambah Kegiatan');
		const activity = 'dialog[aria-labelledby="kegiatan-title"]';
		await fill(`${activity} [name="kode"]`, 'QA_UI_TEST');
		await fill(`${activity} [name="nama"]`, 'Kegiatan Pengujian UI');
		await submit(`${activity} button[type="submit"]`);
		await page.click('.settings-activities > summary');
		const item = await page.$$('.settings-activity-item');
		for (const el of item)
			if ((await el.evaluate((el) => el.textContent)).includes('Kegiatan Pengujian UI'))
				await el.$eval('button[title="Edit kegiatan"]', (el) => el.click());
		await fill(`${activity} [name="nama"]`, 'Kegiatan UI Diperbarui');
		await submit(`${activity} button[type="submit"]`);
		assert.equal(
			(await db.execute("SELECT nama FROM jadwal_kegiatan WHERE kode='QA_UI_TEST'")).rows[0].nama,
			'Kegiatan UI Diperbarui'
		);
		await go();
		await clickText('Data Excel');
		await clickText('Import Data');
		const workbook = new ExcelJS.Workbook(),
			sheet = workbook.addWorksheet('Jam Jadwal');
		sheet.addRow(['Hari', 'Jam Ke', 'Mulai', 'Selesai', 'Tipe', 'Label', 'Nama Default', 'Aktif']);
		sheet.addRow([hari, slot + 1, '20:30', '21:00', 'pelajaran', 'QA Impor UI', '', 'ya']);
		sheet.addRow(['hari-invalid', 1, '', '', 'invalid', '', '', '']);
		const excel = path.join(folder, 'import.xlsx');
		await workbook.xlsx.writeFile(excel);
		await (await page.$('dialog[open] input[type="file"]')).uploadFile(excel);
		await submit('dialog[open] button[type="submit"]');
		assert.ok(
			(await db.execute("SELECT id FROM jadwal_jam WHERE label='QA Impor UI'")).rows.length
		);
		await capture('import-result');
		await go();
		await clickText('Tambah Jam');
		await fill(`${jamDialog} [name="jamKe"]`, slot + 2);
		await fill(`${jamDialog} [name="pukulMulai"]`, '22:00');
		await fill(`${jamDialog} [name="pukulSelesai"]`, '21:00');
		await submit(`${jamDialog} button[type="submit"]`);
		assert.ok(await page.$eval('.alert-error', (el) => el.textContent.includes('Pukul selesai')));
		await capture('validation-error');
		await go();
		for (const url of await page.$$eval('.settings-excel a', (links) =>
			links.map((link) => link.href)
		)) {
			const result = await page.evaluate(async (url) => {
				const r = await fetch(url);
				return {
					status: r.status,
					type: r.headers.get('content-type'),
					size: (await r.arrayBuffer()).byteLength
				};
			}, url);
			assert.equal(result.status, 200);
			assert.ok(result.size > 1000);
			assert.match(result.type, /spreadsheet/);
		}
		await Promise.all([
			page.waitForNavigation({ waitUntil: 'networkidle0' }),
			page.select('#jenjang-filter', 'srd')
		]);
		assert.equal(new URL(page.url()).searchParams.get('jenjang'), 'srd');
		assert.equal(await page.$eval('#jenjang-filter', (el) => el.value), 'srd');
		await Promise.all([
			page.waitForNavigation({ waitUntil: 'networkidle0' }),
			page.select('#jenis-filter', 'genap')
		]);
		assert.equal(new URL(page.url()).searchParams.get('jenis'), 'genap');
		assert.equal(new URL(page.url()).searchParams.get('jenjang'), 'srd');
		await submit('form[action*="resetDefault"] button');
		assert.ok(await page.$('.alert-success'));
		await capture('filters-and-default');
	}
	assert.deepEqual(errors, []);
	assert.deepEqual(blocked, []);
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify({ status: 'PASS', local, measurements, actions, errors, blocked }, null, 2)
	);
	console.log(
		JSON.stringify({
			status: 'PASS',
			folder,
			screenshots: measurements.length,
			actions: actions.length
		})
	);
} catch (error) {
	if (browser) {
		const pages = await browser.pages();
		const page = pages[pages.length - 1];
		await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
		await writeFile(
			path.join(folder, 'failure.txt'),
			await page.evaluate(() => document.body.innerText).catch(() => String(error))
		);
	}
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const exited = once(child, 'exit');
		child.kill();
		await exited;
	}
	if (db) db.close();
	await writeFile(path.join(folder, 'server.log'), output);
}
