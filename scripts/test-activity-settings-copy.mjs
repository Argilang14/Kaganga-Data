import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const port = 5159;
const dev = process.argv.includes('--dev');
const probe = createServer();
probe.listen(port, '127.0.0.1');
await once(probe, 'listening');
await new Promise((resolve) => probe.close(resolve));
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/activity-settings-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
const route = '/administrasi/absensi/kegiatan/pengaturan';
let child,
	browser,
	output = '';
const checks = [];
const check = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
async function insert(table, values) {
	const keys = Object.keys(values);
	return Number(
		(
			await db.execute({
				sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
				args: Object.values(values)
			})
		).lastInsertRowid
	);
}
try {
	const school = Number((await row('SELECT id FROM sekolah ORDER BY id LIMIT 1')).id);
	const template = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const accounts = {};
	for (const type of ['admin', 'user']) {
		const token = randomBytes(32).toString('base64url');
		const account = {
			...template,
			username: `qa-settings-${type}`,
			username_normalized: `qa-settings-${type}`,
			type,
			sekolah_id: school,
			jabatan_akses: null,
			permissions: '[]',
			kelas_id: null,
			pegawai_id: null,
			must_change_password: 0
		};
		delete account.id;
		const id = await insert('auth_user', account);
		const now = new Date().toISOString();
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			user_agent: 'QA activity settings',
			ip_address: '127.0.0.1',
			expires_at: new Date(Date.now() + 1200000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts[type] = token;
	}
	const now = new Date().toISOString();
	const activityId = await insert('kegiatan_absensi', {
		sekolah_id: school,
		kode: 'qa_settings_school',
		nama: 'QA Kegiatan Sekolah',
		kategori: 'sekolah',
		akses_edit: 'sekolah',
		jam_mulai: '07:00',
		batas_terlambat: '07:15',
		jam_selesai: '16:00',
		aktif: 1,
		auto_alfa: 0,
		masuk_rapor: 1,
		urutan: -10,
		created_at: now,
		updated_at: now
	});
	await insert('kegiatan_absensi', {
		sekolah_id: school,
		kode: 'qa_settings_dorm',
		nama: 'QA Kegiatan Asrama dengan nama panjang untuk pemeriksaan susunan kolom',
		kategori: 'asrama',
		akses_edit: 'asrama',
		aktif: 0,
		auto_alfa: 1,
		masuk_rapor: 0,
		urutan: -9,
		created_at: now,
		updated_at: now
	});
	child = spawn(
		process.execPath,
		dev
			? [
					'node_modules/vite/bin/vite.js',
					'--host',
					'127.0.0.1',
					'--port',
					String(port),
					'--strictPort'
				]
			: ['build/index.js'],
		{
			windowsHide: true,
			env: {
				...process.env,
				HOST: '127.0.0.1',
				PORT: String(port),
				ORIGIN: base,
				DB_URL: `file:${database}`,
				KAGANGA_DATA_DIR: path.join(folder, 'data'),
				NODE_ENV: dev ? 'development' : 'production'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	child.stdout.on('data', (value) => (output += value));
	child.stderr.on('data', (value) => (output += value));
	let ready = false;
	for (let i = 0; i < 100; i++) {
		if (child.exitCode != null) throw new Error(output);
		try {
			if ((await fetch(`${base}/login`)).status === 200) {
				ready = true;
				break;
			}
		} catch {
			/* Server startup. */
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	assert.ok(ready, output);
	const cookie = (type) => `rapkumer-session=${accounts[type]}; active-sekolah-id=${school}`;
	assert.equal(
		(await fetch(base + route, { headers: { cookie: cookie('user') }, redirect: 'manual' })).status,
		403
	);
	assert.equal(
		(
			await fetch(`${base}${route}?/updateKegiatan`, {
				method: 'POST',
				headers: { cookie: cookie('user'), origin: base },
				body: new URLSearchParams({ kegiatanId: String(activityId), nama: 'Forbidden' }),
				redirect: 'manual'
			})
		).status,
		403
	);
	check('Guru tetap tidak dapat membuka atau mengubah pengaturan kegiatan');
	browser = await puppeteer.launch({
		executablePath:
			process.env.PUPPETEER_EXECUTABLE_PATH ||
			'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		userDataDir: path.join(folder, 'browser')
	});
	const page = await browser.newPage();
	page.setDefaultNavigationTimeout(180000);
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	async function settle() {
		await page.evaluate(async () => {
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			await Promise.all(
				document
					.getAnimations()
					.filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
					.map((animation) => animation.finished.catch(() => {}))
			);
		});
	}
	await page.setCookie(
		{ name: 'rapkumer-session', value: accounts.admin, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base }
	);
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(base + route, { waitUntil: 'networkidle0' });
	assert.match(await page.title(), /Pengaturan Kegiatan/);
	assert.equal(
		await page.$eval('.activity-settings', (el) => el.dataset.uiRevision),
		'kaganga-ui-activity-settings-2'
	);
	assert.match(await page.$eval('meta[name="robots"]', (el) => el.content), /noindex/);
	async function search(value) {
		await page.$eval(
			'input[aria-label="Cari kegiatan"]',
			(el, text) => {
				el.value = text;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			},
			value
		);
		await page.waitForFunction(
			(text) => document.querySelector('input[aria-label="Cari kegiatan"]').value === text,
			{},
			value
		);
	}
	await search('qa_settings_school');
	await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
	await page.click('button[aria-label="Reset filter"]');
	await page.select('select[aria-label="Status kegiatan"]', 'nonaktif');
	await page.waitForFunction(() =>
		[...document.querySelectorAll('tbody tr')].every((el) => el.innerText.includes('Nonaktif'))
	);
	await page.click('button[aria-label="Reset filter"]');
	await page.evaluate(() =>
		[...document.querySelectorAll('[aria-label="Kategori kegiatan"] button')]
			.find((el) => el.textContent.includes('Asrama'))
			.click()
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll('tbody tr')].every((el) => el.innerText.includes('Asrama'))
	);
	await page.click('button[aria-label="Reset filter"]');
	await search('QA tidak ada kegiatan ini');
	await page.waitForFunction(() =>
		document.body.innerText.includes('Tidak ada kegiatan yang sesuai')
	);
	await page.click('button[aria-label="Reset filter"]');
	check('Pencarian kode/nama, kategori, status dan reset serta kondisi kosong bekerja');
	async function open() {
		await page.evaluate(() =>
			[...document.querySelectorAll('button[aria-label="Atur QA Kegiatan Sekolah"]')]
				.find((el) => el.getClientRects().length)
				.click()
		);
		await page.waitForSelector('dialog[open] input[name="nama"]');
		await settle();
		assert.equal(
			await page.$eval('dialog[open]', (el) => el.contains(document.activeElement)),
			true
		);
	}
	await search('qa_settings_school');
	await open();
	assert.equal(await page.$eval('dialog[open] input[name="jamMulai"]', (el) => el.value), '07:00');
	assert.equal(await page.$eval('dialog[open] input[name="autoAlfa"]', (el) => el.checked), false);
	await page.$eval('dialog[open] input[name="nama"]', (el) => {
		el.value = '';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.waitForFunction(
		() => document.querySelector('dialog[open] button[type="submit"]').disabled
	);
	await page.click('button[aria-label="Tutup pengaturan kegiatan"]');
	await open();
	assert.equal(
		await page.$eval('dialog[open] input[name="nama"]', (el) => el.value),
		'QA Kegiatan Sekolah'
	);
	await page.$eval('dialog[open] input[name="jamMulai"]', (el) => {
		el.value = '07:05';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.click('dialog[open] input[name="autoAlfa"]');
	await page.click('dialog[open] button[type="submit"]');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.equal(
		await page.$eval('input[aria-label="Cari kegiatan"]', (el) => el.value),
		'qa_settings_school'
	);
	const saved = await row('SELECT * FROM kegiatan_absensi WHERE id=?', [activityId]);
	assert.equal(saved.jam_mulai, '07:05');
	assert.equal(saved.auto_alfa, 1);
	assert.equal(saved.aktif, 1);
	assert.equal(saved.masuk_rapor, 1);
	assert.equal(saved.akses_edit, 'sekolah');
	assert.equal(saved.kode, 'qa_settings_school');
	assert.equal(saved.batas_terlambat, '07:15');
	assert.equal(saved.jam_selesai, '16:00');
	assert.match(await page.$eval('tbody tr', (el) => el.innerText), /07:05/);
	check('Popup menyimpan jam/toggle tanpa reload penuh; kategori, akses dan rapor tetap utuh');
	await page.waitForSelector('.toast [role="alert"]', { hidden: true });
	await page.click('button[aria-label="Reset filter"]');
	for (const [name, width, height] of [
		['desktop', 1440, 1000],
		['laptop', 1280, 800],
		['tablet', 768, 1024],
		['mobile', 390, 844],
		['small-mobile', 320, 740]
	]) {
		await page.setViewport({ width, height });
		await page.$eval('#my-drawer-2', (el) => {
			el.checked = false;
			el.dispatchEvent(new Event('change', { bubbles: true }));
		});
		if (width < 1024)
			await page.waitForFunction(
				() => getComputedStyle(document.querySelector('.drawer-side')).visibility === 'hidden'
			);
		await settle();
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false,
			name
		);
		assert.equal(
			await page.$eval('.activity-settings', (el) => el.scrollWidth > el.clientWidth),
			false,
			name
		);
		await page.screenshot({ path: path.join(folder, `${name}.png`) });
		await open();
		assert.equal(
			await page.$eval('dialog[open] .modal-box', (el) => el.scrollWidth > el.clientWidth),
			false,
			name
		);
		const bounds = await page.$eval('dialog[open] .modal-box', (el) => ({
			width: el.getBoundingClientRect().width,
			height: el.getBoundingClientRect().height
		}));
		assert.ok(bounds.width <= width && bounds.height <= height, name);
		const footer = await page.$eval('dialog[open] button[type="submit"]', (el) => ({
			top: el.getBoundingClientRect().top,
			bottom: el.getBoundingClientRect().bottom
		}));
		assert.ok(footer.top >= 0 && footer.bottom <= height, `${name}: save remains reachable`);
		await page.screenshot({ path: path.join(folder, `${name}-edit.png`) });
		await page.$eval('dialog[open] input[name="aktif"]', (el) =>
			el.scrollIntoView({ block: 'nearest' })
		);
		assert.equal(
			await page.$eval('dialog[open] input[name="aktif"]', (el) => {
				const bounds = el.getBoundingClientRect();
				const body = el.closest('fieldset').parentElement.getBoundingClientRect();
				return bounds.top >= body.top && bounds.bottom <= body.bottom;
			}),
			true,
			`${name}: activity toggle can be reached by scrolling`
		);
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await settle();
	await page.screenshot({ path: path.join(folder, 'desktop-dark.png') });
	await open();
	await page.screenshot({ path: path.join(folder, 'desktop-dark-edit.png') });
	check('Desktop/laptop/tablet/HP 320px dan dark mode: tabel, daftar dan popup tidak melebar');
	assert.deepEqual(errors, []);
	assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	await writeFile(
		path.join(folder, 'result.json'),
		JSON.stringify({ checks, database, errors, mode: dev ? 'development' : 'production' }, null, 2)
	);
	console.log('QA_RESULT', folder);
} catch (error) {
	await writeFile(path.join(folder, 'server.log'), output);
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode == null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
	db.close();
}
