import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const baseline = process.argv.includes('--baseline');
const port = Number(process.env.UI_QA_PORT || 5188);
assert.ok(Number.isInteger(port) && ![1206, 5152].includes(port));
await new Promise((resolve, reject) => {
	const probe = net.createServer();
	probe.once('error', reject);
	probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.join(process.cwd(), 'tmp', 'ui-foundation-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
const db = createClient({ url: `file:${database}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
async function insert(table, original, changes) {
	const values = { ...original, ...changes };
	delete values.id;
	const columns = Object.keys(values);
	return Number(
		(
			await db.execute({
				sql: `INSERT INTO "${table}" (${columns.map((key) => `"${key}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
				args: Object.values(values)
			})
		).lastInsertRowid
	);
}
const base = `http://127.0.0.1:${port}`;
let child,
	browser,
	output = '';
const results = [],
	errors = [];
const interactionFailures = [];
let page;
try {
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const student = await row('SELECT * FROM murid WHERE kelas_id IS NOT NULL LIMIT 1');
	assert.ok(admin && student, 'QA requires a local admin and student fixture');
	const user = await insert('auth_user', admin, {
		username: 'qa-ui-foundation',
		username_normalized: 'qa-ui-foundation',
		sekolah_id: student.sekolah_id,
		kelas_id: null,
		pegawai_id: null,
		must_change_password: 0
	});
	const token = randomBytes(32).toString('base64url');
	const now = new Date().toISOString();
	await insert(
		'auth_session',
		{
			user_id: user,
			token_hash: createHash('sha256').update(token).digest('hex'),
			expires_at: new Date(Date.now() + 3600000).toISOString(),
			created_at: now,
			updated_at: now
		},
		{}
	);
	child = spawn(process.execPath, ['build/index.js'], {
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(port),
			ORIGIN: base,
			NODE_ENV: 'production',
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: folder
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
		if (ready) break;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, output.slice(-4000));
	const executablePath = [
		process.env.PUPPETEER_EXECUTABLE_PATH,
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
	]
		.filter(Boolean)
		.find(existsSync);
	browser = await puppeteer.launch({ executablePath, headless: true });
	await browser.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(student.sekolah_id), url: base },
		{ name: 'active-kelas-id', value: String(student.kelas_id), url: base }
	);
	page = await browser.newPage();
	await page.setCacheEnabled(false);
	page.on('pageerror', (error) => errors.push(error.message));
	await page.evaluateOnNewDocument(() => localStorage.setItem('dark-mode', 'light'));
	const settle = () =>
		page.waitForFunction(() =>
			document
				.getAnimations()
				.every(
					(animation) =>
						animation.playState !== 'running' ||
						animation.effect?.getComputedTiming().iterations === Infinity
				)
		);
	const routes = baseline
		? ['/murid', '/administrasi/absensi/kegiatan/pengaturan']
		: [
				'/',
				'/murid',
				'/pegawai',
				'/administrasi/absensi/kegiatan/pengaturan',
				'/administrasi/absensi/monitoring-kelas',
				'/administrasi/absensi/kegiatan/rekap',
				'/pengguna',
				'/cetak-sr'
			];
	for (const width of process.argv.includes('--interactions-only')
		? []
		: [1920, 1440, 1024, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		for (const route of routes) {
			const response = await page.goto(base + route, { waitUntil: 'networkidle0' });
			assert.equal(response.status(), 200, route);
			await settle();
			const dimensions = await page.evaluate(() => {
				const rect = (selector) => {
					const element = document.querySelector(selector);
					if (!element) return null;
					const box = element.getBoundingClientRect(),
						style = getComputedStyle(element);
					return {
						x: box.x,
						y: box.y,
						width: box.width,
						height: box.height,
						padding: style.padding,
						fontSize: style.fontSize
					};
				};
				return {
					viewport: innerWidth,
					documentWidth: document.documentElement.scrollWidth,
					navbar: rect('.app-navbar'),
					content: rect('.app-page-container'),
					scroll: rect('.app-page-viewport'),
					sidebar: rect('.app-sidebar') ?? rect('.drawer-side > ul'),
					header: rect('.table thead tr'),
					tableRow: rect('.table tbody tr'),
					input: rect('.app-page-container .input'),
					button: rect('.app-navbar-actions .btn')
				};
			});
			results.push({ width, route, ...dimensions });
			assert.ok(dimensions.documentWidth <= width + 1, `${route}: document overflow at ${width}`);
			if (!baseline) {
				assert.equal(Math.round(dimensions.navbar.height), width < 640 ? 56 : 64);
				assert.ok(dimensions.content.width <= 1281);
				assert.ok(
					dimensions.scroll.y + dimensions.scroll.height <= 901,
					'Page extends below viewport'
				);
			}
			if (route === '/murid' || route.endsWith('/pengaturan')) {
				await page.screenshot({
					path: path.join(
						folder,
						`${baseline ? 'before' : 'after'}-${route === '/murid' ? 'murid' : 'activities'}-${width}.png`
					)
				});
			}
		}
		await page.goto(base + '/murid', { waitUntil: 'networkidle0' });
		await page.click('button[aria-label="Daftar Tugas"]');
		await page.waitForSelector('.app-navbar-actions .card');
		await settle();
		const task = await page.$eval('.app-navbar-actions .card', (element) => {
			const r = element.getBoundingClientRect();
			return { left: r.left, right: r.right, bottom: r.bottom };
		});
		results.push({ width, task });
		await page.screenshot({
			path: path.join(folder, `${baseline ? 'before' : 'after'}-tasks-${width}.png`)
		});
		if (!baseline) {
			assert.ok(
				task.left >= 0 && task.right <= width + 1 && task.bottom <= 901,
				`Task popup overflow at ${width}`
			);
			await page.keyboard.press('Escape');
			assert.equal(await page.$('.app-task-popup'), null);
			assert.equal(
				await page.$eval('button[aria-label="Daftar Tugas"]', (e) => e === document.activeElement),
				true
			);
			await page.click('.app-class-switcher');
			await page.waitForSelector('.app-class-menu', { visible: true });
			const menu = await page.$eval('.app-class-menu', (e) => {
				const r = e.getBoundingClientRect();
				return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
			});
			assert.ok(
				menu.left >= 0 && menu.right <= width + 1 && menu.bottom <= 901,
				`Class menu overflow at ${width}`
			);
			await page.screenshot({ path: path.join(folder, `after-class-menu-${width}.png`) });
			await page.click('button[aria-label="Daftar Tugas"]');
			await page.keyboard.press('Escape');
		}
	}
	if (!baseline) {
		await page.setViewport({ width: 390, height: 600 });
		await page.goto(base + '/murid', { waitUntil: 'networkidle0' });
		await page.click('button[aria-label="Buka menu"]');
		await page.waitForFunction(() => document.querySelector('#my-drawer-2').checked);
		await page.waitForSelector('input[aria-label="Cari menu"]', { visible: true });
		await settle();
		await page.type('input[aria-label="Cari menu"]', 'zzzz-no-menu');
		await page.waitForSelector('.app-sidebar-menu [role="status"]');
		await settle();
		await page.screenshot({ path: path.join(folder, 'after-sidebar-empty-390.png') });
		await page.$eval('input[aria-label="Cari menu"]', (e) => {
			e.value = '';
			e.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.click('.app-sidebar a[href="/pengaturan"]');
		await page.waitForFunction(
			() => location.pathname === '/pengaturan' && !document.querySelector('#my-drawer-2').checked
		);
		await page.goto(base + '/pengguna', { waitUntil: 'networkidle0' });
		await page.waitForSelector('button[title="Hapus pengguna"]');
		await page.click('button[title="Hapus pengguna"]');
		await page.waitForSelector('.app-modal[open]');
		await settle();
		assert.equal(
			await page.$eval(
				'.app-modal',
				(e) => document.getElementById(e.getAttribute('aria-labelledby'))?.textContent
			),
			'Hapus pengguna'
		);
		assert.equal(await page.$eval('.app-modal', (e) => e.contains(document.activeElement)), true);
		await page.screenshot({ path: path.join(folder, 'after-modal-390.png') });
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => !document.querySelector('.app-modal[open]'));
		const focusRestored = await page.$eval(
			'button[title="Hapus pengguna"]',
			(e) => e === document.activeElement
		);
		results.push({ dialogFocusRestored: focusRestored });
		if (!focusRestored) interactionFailures.push('Dialog should restore focus');
		await page.goto(base + '/murid', { waitUntil: 'networkidle0' });
		await page.click('button[aria-label="Bantuan"]');
		await page.waitForSelector('.app-modal[open]');
		await settle();
		await page.$eval('.app-modal-body', (e) => {
			e.scrollTop = e.scrollHeight;
		});
		assert.ok(
			await page.$eval('.app-modal-box', (e) => e.scrollHeight <= e.clientHeight + 1),
			'Nested modal overflow'
		);
		await page.screenshot({ path: path.join(folder, 'after-help-scroll-390.png') });
		await page.keyboard.press('Escape');
		await page.setRequestInterception(true);
		let pendingTask;
		const taskRequest = (request) => {
			if (new URL(request.url()).pathname === '/api/tasks') pendingTask = request;
			else void request.continue();
		};
		page.on('request', taskRequest);
		await page.click('button[aria-label="Daftar Tugas"]');
		await page.waitForSelector('.app-task-popup .loading');
		await page.screenshot({ path: path.join(folder, 'after-tasks-loading-390.png') });
		assert.ok(pendingTask);
		await pendingTask.respond({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'Tidak dapat memuat tugas. Coba lagi nanti.' })
		});
		await page.waitForSelector('.app-task-popup .alert-error');
		await page.screenshot({ path: path.join(folder, 'after-tasks-error-390.png') });
		page.off('request', taskRequest);
		await page.setRequestInterception(false);
		await page.keyboard.press('Escape');
		await page.setViewport({ width: 768, height: 480 });
		await page.goto(base + '/murid', { waitUntil: 'networkidle0' });
		await page.click('button[aria-label="Bantuan"]');
		await page.waitForSelector('.app-modal[open]');
		await settle();
		const box = await page.$eval('.app-modal-box', (e) => {
			const r = e.getBoundingClientRect();
			return { top: r.top, bottom: r.bottom };
		});
		assert.ok(box.top >= 0 && box.bottom <= 480);
		await page.screenshot({ path: path.join(folder, 'after-modal-landscape.png') });
		await page.keyboard.press('Escape');
		await page.click('.app-navbar label.swap');
		await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
		await settle();
		await page.screenshot({ path: path.join(folder, 'after-dark-768.png') });
	}
	assert.deepEqual(errors, [], 'Browser runtime errors');
	assert.deepEqual(interactionFailures, [], 'Interaction checks');
	console.log(`${baseline ? 'Baseline captured' : 'UI foundation checks passed'}: ${folder}`);
} catch (error) {
	if (page) {
		await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
		await writeFile(path.join(folder, 'failure.html'), await page.content()).catch(() => {});
	}
	throw error;
} finally {
	await writeFile(
		path.join(folder, 'measurements.json'),
		JSON.stringify({ baseline, results, errors }, null, 2)
	);
	await writeFile(path.join(folder, 'server.log'), output);
	await browser?.close();
	if (child && child.exitCode === null) {
		child.kill();
		await once(child, 'exit');
	}
	db.close();
}
