import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer-core';

const local = process.env.GROWTH_UI_LOCAL === '1';
const port = local ? 5152 : Number(process.env.GROWTH_UI_QA_PORT || 5158);
assert.ok(local || ![1206, 5152].includes(port));
const base = `http://127.0.0.1:${port}`;
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp', local ? 'growth-ui-local-' : 'growth-ui-copy-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child, db, browser, cookie, fixture;
let output = '';
const measurements = [],
	errors = [],
	blocked = [];
try {
	if (!local) {
		let occupied = false;
		try {
			await fetch(`${base}/login`);
			occupied = true;
		} catch {
			/* Expected unused QA port. */
		}
		assert.ok(!occupied, 'QA port already occupied');
		const database = path.join(folder, 'database.sqlite3');
		const source = createClient({ url: 'file:./data/database.sqlite3' });
		await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
		source.close();
		db = createClient({ url: `file:${database}` });
		const murid = (await db.execute('SELECT * FROM murid ORDER BY id LIMIT 1')).rows[0];
		assert.ok(murid);
		const school = Number(murid.sekolah_id),
			kelas = Number(murid.kelas_id);
		const admin = (await db.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0];
		assert.ok(admin);
		await db.execute({
			sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
			args: [school, admin.id]
		});
		await db.execute({
			sql: 'UPDATE murid SET nis=?,nama=?,tanggal_lahir=? WHERE id=?',
			args: [
				'GROWTH-UI-QA',
				'Murid QA Riwayat Pertumbuhan Dengan Nama Panjang',
				'2009-01-02',
				murid.id
			]
		});
		await db.execute({ sql: 'DELETE FROM kesehatan_murid WHERE sekolah_id=?', args: [school] });
		const statuses = ['normal', 'gizi_buruk', 'gizi_kurang', 'gizi_lebih', 'obesitas', null];
		for (const [index, status] of statuses.entries()) {
			await db.execute({
				sql: 'INSERT INTO kesehatan_murid(sekolah_id,murid_id,semester_id,tanggal_pengukuran,tinggi_badan,berat_badan,z_score,status_gizi,kondisi_fisik,ukuran_baju,ukuran_celana,ukuran_sepatu,catatan) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
				args: [
					school,
					murid.id,
					murid.semester_id,
					`2040-01-0${index + 1}`,
					index === 5 ? null : 158.25,
					index === 5 ? null : 49.75,
					index === 5 ? null : -1.25,
					status,
					'Catatan fisik QA yang cukup panjang untuk menguji pembungkusan teks',
					'XXXL',
					'XL',
					'39',
					'QA' + 'catatanpanjang'.repeat(12)
				]
			});
		}
		const token = randomBytes(32).toString('base64url');
		const now = new Date().toISOString();
		await db.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
			args: [
				admin.id,
				createHash('sha256').update(token).digest('hex'),
				'Growth UI QA',
				'127.0.0.1',
				new Date(Date.now() + 1200000).toISOString(),
				now,
				now
			]
		});
		cookie = { token, school, kelas };
		fixture = { murid, school, kelas };
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
		assert.ok(ready, output.slice(-4000));
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
			(request.method() === 'POST' && url.pathname === '/login')
		)
			void request.continue();
		else if (
			!local &&
			request.method() === 'POST' &&
			url.pathname === '/riwayat-pertumbuhan' &&
			url.search === '?/import'
		)
			void delay(700).then(() => request.continue());
		else {
			blocked.push(url.pathname);
			void request.abort();
		}
	});
	if (cookie) {
		await browser.setCookie(
			...Object.entries({
				'rapkumer-session': cookie.token,
				'active-sekolah-id': String(cookie.school),
				'active-kelas-id': String(cookie.kelas)
			}).map(([name, value]) => ({ name, value, url: base }))
		);
	} else {
		await page.goto(base + '/login', { waitUntil: 'networkidle0' });
		await page.type('#username', process.env.KAGANGA_AUDIT_USERNAME || 'Admin');
		await page.type('#password', process.env.KAGANGA_AUDIT_PASSWORD || 'Admin123');
		const login = page.waitForNavigation({ waitUntil: 'networkidle0' });
		await page.click('button[type="submit"]');
		await login;
	}
	const query = fixture
		? `?kelasId=${fixture.kelas}&q=GROWTH-UI-QA&start=2040-01-01&end=2040-01-06`
		: '';
	const route = '/riwayat-pertumbuhan';
	const go = async (suffix = query) => {
		const response = await page.goto(base + route + suffix, { waitUntil: 'networkidle0' });
		assert.equal(response.status(), 200);
		await page.waitForSelector('h1');
	};
	const capture = async (name) => {
		await delay(400);
		measurements.push({
			name,
			...(await page.evaluate(() => {
				const rect = (el) => {
					if (!el) return null;
					const r = el.getBoundingClientRect(),
						s = getComputedStyle(el);
					return {
						width: r.width,
						height: r.height,
						x: r.x,
						y: r.y,
						padding: s.padding,
						radius: s.borderRadius,
						font: s.fontSize,
						scrollWidth: el.scrollWidth,
						clientWidth: el.clientWidth
					};
				};
				return {
					width: innerWidth,
					pageWidth: document.documentElement.scrollWidth,
					table: rect(document.querySelector('table')),
					header: rect(document.querySelector('thead tr')),
					row: rect(document.querySelector('tbody tr')),
					controls: [
						...document.querySelectorAll(
							'form[method="GET"] input,form[method="GET"] select,form[method="GET"] button'
						)
					].map(rect),
					modal: rect(document.querySelector('dialog[open] .modal-box'))
				};
			}))
		});
		if (local) await page.addStyleTag({ content: 'tbody td {filter:blur(5px)}' });
		await page.screenshot({ path: path.join(folder, name + '.png') });
	};
	for (const width of [1440, 1280, 768, 390, 320]) {
		await page.setViewport({ width, height: 1000 });
		await go();
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		assert.equal(await page.$$eval('thead th', (els) => els.length), 11);
		assert.ok(
			await page.$$eval('form[method="GET"] :is(input,select)', (els) =>
				els.every((el) => el.labels.length > 0 && el.getBoundingClientRect().width >= 150)
			)
		);
		if (fixture) {
			assert.equal(await page.$$eval('tbody tr', (els) => els.length), 6);
			assert.deepEqual(
				await page.$$eval('dl dd', (els) => els.map((el) => el.textContent.trim())),
				['6', '1', '4']
			);
			assert.ok(
				await page.$$eval('tbody td', (els) =>
					els.every((el) => el.scrollWidth <= el.clientWidth + 1)
				)
			);
		}
		await capture(`page-${width}`);
		const trigger = await page.$('.card > div:first-child button');
		await trigger.click();
		await page.waitForSelector('dialog[open]');
		assert.ok(
			await page.$eval(
				'dialog[open]',
				(el) =>
					el.matches(':modal') && !!document.getElementById(el.getAttribute('aria-labelledby'))
			)
		);
		await capture(`import-${width}`);
		assert.ok(
			await page.$eval('dialog[open] .modal-box', (el) => el.scrollWidth <= el.clientWidth + 1)
		);
		await page.keyboard.press('Tab');
		assert.ok(await page.evaluate(() => !!document.activeElement.closest('dialog[open]')));
		await page.keyboard.press('Escape');
		await page.waitForSelector('dialog[open]', { hidden: true });
		assert.ok(await trigger.evaluate((el) => document.activeElement === el));
		if (width === 1440 || width === 390) {
			await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
			await capture(`dark-${width}`);
			await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
		}
		await go('?q=GROWTH_QA_NO_MATCH_987654321');
		assert.ok(
			await page.$eval('.growth-empty', (el) => {
				const r = el.getBoundingClientRect();
				return (
					r.left >= 0 &&
					r.right <= innerWidth &&
					el.textContent.includes('Belum ada data pertumbuhan sesuai filter.')
				);
			})
		);
		await capture(`empty-${width}`);
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await go();
	await page.click('details.dropdown summary');
	assert.equal(await page.$eval('details.dropdown', (el) => el.open), true);
	const exportUrl = await page.$eval('details.dropdown a[href*="/export"]', (el) => el.href);
	if (fixture) {
		const params = new URL(exportUrl).searchParams;
		assert.equal(params.get('q'), 'GROWTH-UI-QA');
		assert.equal(params.get('kelasId'), String(fixture.kelas));
		assert.equal(params.get('start'), '2040-01-01');
		assert.equal(params.get('end'), '2040-01-06');
	}
	await capture('dropdown');
	for (const url of ['/api/riwayat-pertumbuhan/template', exportUrl]) {
		const result = await page.evaluate(async (url) => {
			const response = await fetch(url);
			return {
				status: response.status,
				type: response.headers.get('content-type'),
				length: (await response.arrayBuffer()).byteLength
			};
		}, url);
		assert.equal(result.status, 200);
		assert.ok(result.length > 0);
	}
	await page.click('details.dropdown summary');
	const applied = page.waitForNavigation({ waitUntil: 'networkidle0' });
	await page.click('form[method="GET"] button[type="submit"]');
	await applied;
	if (fixture) {
		assert.equal(new URL(page.url()).searchParams.get('kelasId'), String(fixture.kelas));
		assert.equal(new URL(page.url()).searchParams.get('q'), 'GROWTH-UI-QA');
		assert.equal(new URL(page.url()).searchParams.get('start'), '2040-01-01');
		assert.equal(new URL(page.url()).searchParams.get('end'), '2040-01-06');
	}
	await go('?q=GROWTH_QA_NO_MATCH_987654321');
	assert.ok(
		await page.$eval('.growth-empty', (el) =>
			el.textContent.includes('Belum ada data pertumbuhan sesuai filter.')
		)
	);
	await capture('empty');
	await page.click('button[aria-label="Reset filter pertumbuhan"]');
	await page.waitForFunction(() => location.search === '');
	if (fixture) {
		await go();
		const empty = path.join(folder, 'empty.xlsx');
		await writeFile(empty, '');
		await page.click('.card > div:first-child button');
		await page.waitForSelector('dialog[open] input[type="file"]');
		await (await page.$('dialog[open] input[type="file"]')).uploadFile(empty);
		await page.click('dialog[open] button[type="submit"]');
		await page.waitForSelector('dialog[open] form[aria-busy="true"]');
		assert.ok(await page.$eval('dialog[open] button[type="submit"]', (el) => el.disabled));
		await page.keyboard.press('Escape');
		assert.ok(await page.$('dialog[open]'));
		await page.waitForSelector('dialog[open] [role="alert"]');
		assert.ok(
			await page.$eval('dialog[open] [role="alert"]', (el) =>
				el.textContent.includes('Pilih file Excel.')
			)
		);
		assert.equal(await page.$eval('dialog[open] input[type="file"]', (el) => el.files.length), 1);
		await capture('import-error');
		const workbook = new ExcelJS.Workbook(),
			sheet = workbook.addWorksheet('Pertumbuhan');
		sheet.addRow([
			'NIS',
			'Nama',
			'Tanggal',
			'Tinggi',
			'Berat',
			'Z-Score',
			'Status',
			'Kondisi',
			'Baju',
			'Celana',
			'Sepatu',
			'Catatan'
		]);
		sheet.addRow([
			'GROWTH-UI-QA',
			'QA',
			'2040-01-07',
			'159,5',
			'50,25',
			'0',
			'normal',
			'QA',
			'L',
			'L',
			'39',
			'Import QA'
		]);
		const file = path.join(folder, 'valid.xlsx');
		await workbook.xlsx.writeFile(file);
		await (await page.$('dialog[open] input[type="file"]')).uploadFile(file);
		await page.click('dialog[open] button[type="submit"]');
		await page.waitForSelector('dialog[open]', { hidden: true });
		assert.equal(new URL(page.url()).searchParams.get('start'), '2040-01-01');
		assert.equal(await page.$eval('input[name="q"]', (el) => el.value), 'GROWTH-UI-QA');
		const inserted = (
			await db.execute({
				sql: 'SELECT tinggi_badan,berat_badan FROM kesehatan_murid WHERE murid_id=? AND tanggal_pengukuran=?',
				args: [fixture.murid.id, '2040-01-07']
			})
		).rows[0];
		assert.equal(inserted.tinggi_badan, 159.5);
		assert.equal(inserted.berat_badan, 50.25);
		assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
		await capture('import-success');
	}
	assert.deepEqual(errors, []);
	assert.deepEqual(blocked, []);
	console.log(
		`PASS ${local ? 'read-only local' : 'isolated-copy'} growth UI, five viewport sizes, wrapping, native modal and keyboard, filters, reset, Excel endpoints${local ? '' : ', busy/error/success import with retained filters and SQLite integrity'}.`
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
