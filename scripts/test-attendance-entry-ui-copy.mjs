import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';

const project = process.cwd();
const port = Number(process.env.ATTENDANCE_ENTRY_QA_PORT || 5159);
assert.ok(Number.isInteger(port) && ![1206, 5152].includes(port));
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'attendance-entry-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
let child,
	browser,
	output = '';
try {
	const original = (
		await db.execute('SELECT * FROM murid WHERE kelas_id IS NOT NULL ORDER BY id LIMIT 1')
	).rows[0];
	assert.ok(original);
	const school = Number(original.sekolah_id),
		kelas = Number(original.kelas_id);
	const classRow = (await db.execute({ sql: 'SELECT * FROM kelas WHERE id=?', args: [kelas] }))
		.rows[0];
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [classRow.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [original.semester_id, classRow.tahun_ajaran_id]
	});
	await db.execute({
		sql: 'UPDATE kegiatan_absensi SET auto_alfa=0 WHERE sekolah_id=?',
		args: [school]
	});
	const activity = (
		await db.execute({
			sql: 'SELECT * FROM kegiatan_absensi WHERE sekolah_id=? AND aktif=1 ORDER BY id LIMIT 1',
			args: [school]
		})
	).rows[0];
	assert.ok(activity);
	const tanggal = '2026-10-03';
	const ids = [];
	for (let index = 0; index < 7; index++) {
		const values = { ...original };
		delete values.id;
		Object.assign(values, {
			nama:
				index === 0
					? 'Murid QA Muhammad Abdurrahman Pratama Wijaya Kusuma'
					: `Murid QA ${index + 1}`,
			nis: `QA-ENTRY-${index}`,
			nisn: `001234${String(index).padStart(4, '0')}`,
			foto: null,
			qr_token: null,
			dapodik_peserta_didik_id: null,
			dapodik_anggota_rombel_id: null
		});
		const columns = Object.keys(values);
		const inserted = await db.execute({
			sql: `INSERT INTO murid(${columns.map((column) => `"${column}"`).join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
			args: Object.values(values)
		});
		ids.push(Number(inserted.lastInsertRowid));
	}
	const statuses = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang'];
	for (let index = 0; index < statuses.length; index++) {
		await db.execute({
			sql: "INSERT INTO absensi_kegiatan(sekolah_id,semester_id,kelas_id,murid_id,kegiatan_id,tanggal,status,metode,catatan,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'manual',?,?,?)",
			args: [
				school,
				original.semester_id,
				kelas,
				ids[index],
				activity.id,
				tanggal,
				statuses[index],
				'Catatan uji tampilan',
				new Date().toISOString(),
				new Date().toISOString()
			]
		});
	}
	const admin = (await db.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0];
	assert.ok(admin);
	await db.execute({
		sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
		args: [school, admin.id]
	});
	const session = randomBytes(32).toString('base64url'),
		issuedAt = new Date().toISOString();
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(session).digest('hex'),
			'Attendance entry isolated QA',
			'127.0.0.1',
			new Date(Date.now() + 1800000).toISOString(),
			issuedAt,
			issuedAt
		]
	});
	child = spawn(process.execPath, ['build/index.js'], {
		cwd: project,
		windowsHide: true,
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			NODE_ENV: 'production',
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: folder
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) {
				ready = true;
				break;
			}
		} catch {
			/* Wait for the isolated server. */
		}
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
		{ name: 'rapkumer-session', value: session, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base },
		{ name: 'active-kelas-id', value: String(kelas), url: base }
	);
	const page = await browser.newPage(),
		errors = [];
	await page.setCacheEnabled(false);
	page.on('pageerror', (error) => errors.push(error.message));
	const url = `${base}/administrasi/absensi/kegiatan?tanggal=${tanggal}&kelas_id=${kelas}&kegiatan_id=${activity.id}`;
	for (const width of [1440, 1024, 768, 390, 320]) {
		await page.setViewport({ width, height: 1000 });
		const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
		assert.equal(response.status(), 200);
		await page.waitForSelector('.attendance-table tbody tr');
		const metrics = await page.evaluate(() => {
			const controls = [
				...document.querySelectorAll('.attendance-field .input,.attendance-field .select')
			].map((element) => element.getBoundingClientRect());
			return {
				bodyFits: document.documentElement.scrollWidth <= innerWidth + 1,
				aligned: controls.every((control) => Math.abs(control.height - 44) < 1),
				mobileRows:
					getComputedStyle(document.querySelector('.attendance-table tbody tr')).display === 'grid',
				mobilePadding: getComputedStyle(document.querySelector('.attendance-student')).paddingTop,
				uniqueIds: [...document.querySelectorAll('[id]')].every(
					(element, index, all) => all.findIndex((other) => other.id === element.id) === index
				),
				validForms: [
					...document.querySelectorAll('.attendance-row-actions button[type=submit][form]')
				].every(
					(button) =>
						button.form?.querySelector('select[name=status]') &&
						button.form.elements.namedItem('catatan')
				)
			};
		});
		assert.ok(
			metrics.bodyFits && metrics.aligned && metrics.uniqueIds && metrics.validForms,
			JSON.stringify({ width, metrics })
		);
		assert.equal(metrics.mobileRows, width < 768);
		if (width < 768) assert.equal(metrics.mobilePadding, '0px');
		await page.screenshot({ path: path.join(folder, `ui-${width}.png`), fullPage: false });
		await page.$eval('section[aria-label="Ringkasan status absensi"]', (section) =>
			section.scrollIntoView({ block: 'start' })
		);
		await page.screenshot({ path: path.join(folder, `summary-${width}.png`), fullPage: false });
		await page.$eval('.attendance-table', (table) => table.scrollIntoView({ block: 'start' }));
		await page.screenshot({ path: path.join(folder, `table-${width}.png`), fullPage: false });
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(url, { waitUntil: 'networkidle0' });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.screenshot({ path: path.join(folder, 'ui-dark.png'), fullPage: false });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	const target = ids[6];
	await page.select(`#status-${target}`, 'sakit');
	await page.$eval(`#catatan-${target}`, (input) => {
		input.value = 'Catatan dari input di luar form';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	const submitted = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/updateManual')
	);
	await page.click(`button[form="manual-kegiatan-${target}"]`);
	assert.equal((await submitted).status(), 200);
	await page.waitForFunction(
		(id) =>
			document
				.querySelector(`#status-${id}`)
				?.closest('tr')
				?.querySelector('.attendance-status')
				?.textContent.includes('Sakit'),
		{},
		target
	);
	assert.equal(new URL(page.url()).searchParams.get('tanggal'), tanggal);
	assert.equal(new URL(page.url()).searchParams.get('kelas_id'), String(kelas));
	assert.equal(new URL(page.url()).searchParams.get('kegiatan_id'), String(activity.id));
	const saved = (
		await db.execute({
			sql: 'SELECT status,catatan FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=? AND tanggal=?',
			args: [target, activity.id, tanggal]
		})
	).rows[0];
	assert.equal(saved.status, 'sakit');
	assert.equal(saved.catatan, 'Catatan dari input di luar form');
	await page.setViewport({ width: 390, height: 900 });
	await page.click(`button[aria-label="Hapus status absensi Murid QA 7"]`);
	await page.waitForSelector('dialog[open]');
	await page.screenshot({ path: path.join(folder, 'ui-correction-mobile.png'), fullPage: false });
	await page.evaluate(() => document.querySelector('dialog[open]').close());
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT status FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=? AND tanggal=?',
				args: [target, activity.id, tanggal]
			})
		).rows[0].status,
		'sakit'
	);
	await page.select('.attendance-bulk-form select[name=status]', 'hadir');
	const bulk = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().includes('/bulkUpdateManual')
	);
	await page.click('.attendance-bulk-form button[type=submit]');
	assert.equal((await bulk).status(), 200);
	await page.waitForFunction(() => document.querySelector('progress')?.value === 100);
	assert.equal(new URL(page.url()).searchParams.get('tanggal'), tanggal);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT status FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=? AND tanggal=?',
				args: [target, activity.id, tanggal]
			})
		).rows[0].status,
		'sakit'
	);
	if (process.env.ATTENDANCE_RECAP_QA === '1') {
		const recapUrl = `${base}/administrasi/absensi/kegiatan/rekap?tanggal_awal=${tanggal}&tanggal_akhir=${tanggal}&kelas_id=${kelas}&kegiatan_id=${activity.id}`;
		const counts = (
			await db.execute({
				sql: 'SELECT status,COUNT(*) AS total FROM absensi_kegiatan WHERE kelas_id=? AND kegiatan_id=? AND tanggal=? GROUP BY status',
				args: [kelas, activity.id, tanggal]
			})
		).rows;
		for (const width of [1440, 1024, 768, 390, 320]) {
			await page.setViewport({ width, height: 1000 });
			const response = await page.goto(recapUrl, { waitUntil: 'networkidle0' });
			assert.equal(response.status(), 200);
			const metrics = await page.evaluate(() => ({
				bodyFits: document.documentElement.scrollWidth <= innerWidth + 1,
				aligned: [...document.querySelectorAll('.recap-field .input,.recap-field .select')].every(
					(input) => Math.abs(input.getBoundingClientRect().height - 44) < 1
				),
				studentGrid:
					getComputedStyle(document.querySelector('.recap-students-table tbody tr')).display ===
					'grid',
				dailyGrid:
					getComputedStyle(document.querySelector('.recap-daily-table tbody tr')).display ===
					'grid',
				summary: Object.fromEntries(
					[...document.querySelectorAll('.recap-stat')].map((stat) => [
						stat.dataset.status,
						Number(stat.querySelector('.stat-value').textContent)
					])
				)
			}));
			assert.ok(metrics.bodyFits && metrics.aligned, JSON.stringify({ width, metrics }));
			assert.equal(metrics.studentGrid, width < 768);
			assert.equal(metrics.dailyGrid, width < 768);
			for (const { status, total } of counts) assert.equal(metrics.summary[status], Number(total));
			await page.screenshot({ path: path.join(folder, `recap-${width}.png`), fullPage: false });
			for (const [label, selector] of [
				['students', '.recap-students-table'],
				['daily', '.recap-daily-table']
			]) {
				await page.$eval(selector, (table) => table.scrollIntoView({ block: 'start' }));
				await page.screenshot({
					path: path.join(folder, `recap-${label}-${width}.png`),
					fullPage: false
				});
			}
		}
		await page.setViewport({ width: 390, height: 900 });
		await page.goto(recapUrl, { waitUntil: 'networkidle0' });
		await page.click('button[aria-label="Buka menu rekap absensi kegiatan"]');
		await page.waitForFunction(() => {
			const menu = document.querySelector('.recap-actions .dropdown-content');
			return (
				menu &&
				getComputedStyle(menu).display !== 'none' &&
				Number(getComputedStyle(menu).opacity) === 1 &&
				menu.getAnimations().every((animation) => animation.playState !== 'running')
			);
		});
		const menuBox = await page.$eval('.recap-actions .dropdown-content', (menu) => {
			const box = menu.getBoundingClientRect();
			const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 24);
			return {
				left: box.left,
				right: box.right,
				top: box.top,
				bottom: box.bottom,
				boxWidth: box.width,
				boxHeight: box.height,
				hittable: menu.contains(hit),
				hit: hit?.outerHTML.slice(0, 220),
				width: innerWidth,
				height: innerHeight,
				visibility: getComputedStyle(menu).visibility
			};
		});
		assert.ok(
			menuBox.boxWidth > 100 &&
				menuBox.boxHeight > 100 &&
				menuBox.hittable &&
				menuBox.left >= 0 &&
				menuBox.right <= menuBox.width &&
				menuBox.top >= 0 &&
				menuBox.bottom <= menuBox.height &&
				menuBox.visibility === 'visible',
			JSON.stringify(menuBox)
		);
		await page.screenshot({
			path: path.join(folder, 'recap-dropdown-mobile.png'),
			fullPage: false
		});
		await page.click('.recap-actions .dropdown-content button');
		await page.waitForSelector('.recap-import input[type=file]');
		await page.waitForFunction(() => {
			const dialog = document.querySelector('.recap-import')?.closest('dialog');
			return (
				dialog?.open &&
				dialog
					.getAnimations({ subtree: true })
					.every((animation) => animation.playState !== 'running')
			);
		});
		assert.ok(
			await page.$eval(
				'.recap-import input[type=file]',
				(input) => input.required && !input.disabled
			)
		);
		await page.screenshot({ path: path.join(folder, 'recap-import-mobile.png'), fullPage: false });
		await page.evaluate(() => document.querySelector('.recap-import').closest('dialog').close());
		const downloads = await page.evaluate(async () => {
			const links = [...document.querySelectorAll('.recap-actions a')].filter((link) =>
				/Ekspor Rekap|Template Import/.test(link.textContent)
			);
			const results = [];
			for (const link of links) {
				const response = await fetch(link.href);
				const bytes = new Uint8Array(await response.arrayBuffer());
				let binary = '';
				for (const byte of bytes) binary += String.fromCharCode(byte);
				results.push({ href: link.href, status: response.status, bytes: btoa(binary) });
			}
			return results;
		});
		assert.equal(downloads.length, 2);
		for (const result of downloads) {
			assert.equal(result.status, 200);
			assert.equal(new URL(result.href).searchParams.get('kelas_id'), String(kelas));
			assert.equal(new URL(result.href).searchParams.get('tanggal_awal'), tanggal);
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(Buffer.from(result.bytes, 'base64'));
			assert.ok(workbook.worksheets.length > 0);
		}
		await page.select('select[aria-label="Kelas rekap"]', 'all');
		await page.waitForFunction(
			() =>
				new URL(location.href).searchParams.get('kelas_id') === 'all' &&
				document.querySelector('select[aria-label="Kelas rekap"]').value === 'all'
		);
		await page.waitForNetworkIdle();
		assert.equal(new URL(page.url()).searchParams.get('tanggal_awal'), tanggal);
		assert.equal(new URL(page.url()).searchParams.get('kegiatan_id'), String(activity.id));
		assert.ok(await page.$eval('form[action="?/syncRapor"] button', (button) => button.disabled));
		assert.ok(
			await page.$eval(
				'.recap-actions button',
				() =>
					[...document.querySelectorAll('.recap-actions button')].find(
						(button) => button.textContent.trim() === 'Import Excel'
					).disabled
			)
		);
		await page.setViewport({ width: 1440, height: 1000 });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		await page.screenshot({ path: path.join(folder, 'recap-dark.png'), fullPage: false });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
		await page.goto(
			`${base}/administrasi/absensi/kegiatan/rekap?tanggal_awal=2000-01-01&tanggal_akhir=2000-01-01&kelas_id=${kelas}&kegiatan_id=${activity.id}`,
			{ waitUntil: 'networkidle0' }
		);
		assert.equal(
			await page.$$eval('.recap-stat .stat-value', (values) =>
				values.reduce((sum, value) => sum + Number(value.textContent), 0)
			),
			0
		);
		assert.equal(await page.$('.recap-daily-table'), null);
		console.log(
			'PASS recap desktop/tablet/mobile/dark UI, accurate totals, daily/student tables, export/template workbooks, import dialog, all-class restrictions, preserved date/activity filters and empty period.'
		);
	}
	assert.deepEqual(errors, []);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	console.log(
		'PASS desktop/tablet/mobile/dark UI, aligned fields, bounded table, associated form fields, individual save and persistent filters, correction modal, bulk only-empty preservation.'
	);
	console.log(`QA artifacts: ${folder}`);
} catch (error) {
	if (browser) {
		const page = (await browser.pages()).at(-1);
		await page
			.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true })
			.catch(() => {});
	}
	console.error(output.slice(-4000));
	throw error;
} finally {
	await browser?.close();
	if (child && child.exitCode === null) {
		const exited = once(child, 'exit');
		if (process.platform === 'win32')
			execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
		else child.kill();
		await exited;
	}
	await writeFile(path.join(folder, 'server.log'), output);
	db.close();
}
