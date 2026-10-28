import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const baseline = process.env.QA_DASHBOARD_BASELINE === '1';
const dir = path.resolve('tmp', `dashboard-ui-${baseline ? 'before' : 'after'}-${Date.now()}`);
await mkdir(dir, { recursive: true });
const database = path.join(dir, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute(`VACUUM INTO '${database.replaceAll("'", "''")}'`);
source.close();
const db = createClient({ url: `file:${database}` });
const sql = async (query, args = []) => {
	for (let attempt = 0; ; attempt++) {
		try {
			return (await db.execute({ sql: query, args })).rows;
		} catch (error) {
			if (error.code !== 'SQLITE_BUSY' || attempt >= 30) throw error;
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
	}
};
const port = 5188,
	base = `http://127.0.0.1:${port}`;
const probe = net.createServer();
await new Promise((resolve, reject) =>
	probe.once('error', reject).listen(port, '127.0.0.1', resolve)
);
await new Promise((resolve) => probe.close(resolve));
const child = spawn(process.execPath, ['build/index.js'], {
	windowsHide: true,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		DB_URL: `file:${database}`,
		KAGANGA_DATA_DIR: dir,
		HOST: '127.0.0.1',
		PORT: String(port),
		ORIGIN: base,
		NODE_ENV: 'production'
	}
});
let output = '',
	browser;
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));
const results = [],
	metrics = [];
const pass = (message) => {
	results.push(message);
	console.log(`PASS ${message}`);
};
try {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) break;
		} catch {
			/* Wait for isolated server. */
		}
		if (i === 99) throw new Error('QA server did not start');
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	const [school] = await sql('SELECT id FROM sekolah ORDER BY id LIMIT 1');
	const [user] = await sql(
		'INSERT INTO auth_user(username,username_normalized,password_hash,password_salt,type,sekolah_id,permissions,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,0,?) RETURNING id',
		[
			'QA Dashboard',
			`qa-dashboard-${Date.now()}`,
			'unused',
			'unused',
			'admin',
			school.id,
			'[]',
			new Date().toISOString()
		]
	);
	const token = randomBytes(32).toString('base64url');
	await sql(
		'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)',
		[
			user.id,
			createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 3600000).toISOString(),
			new Date().toISOString(),
			new Date().toISOString()
		]
	);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage(),
		errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(school.id), url: base }
	);
	for (const width of [1920, 1440, 1366, 1024, 768, 430, 390, 360, 320]) {
		await page.setViewport({ width, height: width < 768 ? 900 : 1080 });
		await page.goto(base, { waitUntil: 'networkidle0' });
		await page.waitForSelector('.dashboard-shell');
		await page.screenshot({ path: path.join(dir, `dashboard-${width}.png`) });
		const metric = await page.evaluate(() => {
			const measure = (selector) => {
				const el = document.querySelector(selector);
				if (!el) return null;
				const r = el.getBoundingClientRect(),
					s = getComputedStyle(el);
				return { width: r.width, height: r.height, font: s.fontSize, radius: s.borderRadius };
			};
			return {
				overflow: document.documentElement.scrollWidth > innerWidth,
				shell: measure('.dashboard-shell'),
				sidebar: measure('.app-sidebar'),
				navbar: measure('.app-navbar'),
				banner: measure('.dashboard-header'),
				table: measure('#pengawasan-kelas table'),
				dialog: measure('.modal-box'),
				panelHeading: measure('#absensi-hari-ini h2')
			};
		});
		assert.equal(metric.overflow, false, `Page overflow at ${width}`);
		if (!baseline) {
			assert.ok(
				await page.$eval('.dashboard-banner-photo', (img) => img.complete && img.naturalWidth > 0)
			);
			assert.ok(
				await page.$eval('.dashboard-statistics', (el) => el.scrollWidth <= el.clientWidth + 1)
			);
			if (width < 768) {
				const order = await page.evaluate(() => ({
					attendance: document.querySelector('#absensi-hari-ini').getBoundingClientRect().top,
					actions: document.querySelector('.dashboard-actions').getBoundingClientRect().top,
					classes: document.querySelector('#pengawasan-kelas')?.getBoundingClientRect().top
				}));
				assert.ok(order.attendance < order.actions);
				if (order.classes) assert.ok(order.actions < order.classes);
			}
		}
		metrics.push({ width, ...metric });
		await page.$eval('.app-page-viewport', (el) => el.scrollTo(0, el.scrollHeight));
		await page.screenshot({ path: path.join(dir, `dashboard-lower-${width}.png`) });
	}
	pass('nine viewport sizes without page overflow; assets and mobile reading order');
	const cookie = `rapkumer-session=${token}; active-sekolah-id=${school.id}`;
	const snapshot = async (query = '') => {
		const r = await fetch(`${base}/api/dashboard/daily${query}`, { headers: { cookie } });
		assert.equal(r.status, 200);
		return r.json();
	};
	const initial = await snapshot();
	await writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(initial, null, 2));
	if (process.env.QA_DASHBOARD_COMPARE_DIR) {
		const previous = JSON.parse(
			await readFile(path.join(process.env.QA_DASHBOARD_COMPARE_DIR, 'snapshot.json'), 'utf8')
		);
		const stable = (data) => {
			const result = { ...data };
			delete result.generatedAt;
			// Newly enabled agenda fields are outside the existing attendance contract.
			for (const key of [
				'canAgenda',
				'jenisKey',
				'jenis',
				'events',
				'lessons',
				'announcements',
				'canAnnouncements'
			])
				delete result[key];
			return result;
		};
		assert.deepEqual(stable(initial), stable(previous));
		pass('attendance API snapshot matches the pre-redesign baseline');
	}
	if (!baseline) {
		const trendResponse = await fetch(`${base}/api/dashboard/trend`, { headers: { cookie } });
		assert.equal(trendResponse.status, 200);
		assert.equal(trendResponse.headers.get('cache-control'), 'private, no-store');
		const trend = await trendResponse.json();
		assert.equal(
			trend.series.reduce((sum, item) => sum + item.points.at(-1).total, 0),
			initial.students.total
		);
		assert.equal(
			trend.series.reduce((sum, item) => sum + item.points.at(-1).recorded, 0),
			initial.students.recorded
		);
		assert.ok(trend.series.every((item) => item.points.length === 7));
		assert.equal(JSON.stringify(trend).includes('nama'), false);
		for (const [query, status] of [
			['?kelas_id=999999999', 403],
			['?jenjang=invalid', 400],
			['?sumber_masuk=999999999', 400]
		]) {
			assert.equal(
				(await fetch(`${base}/api/dashboard/trend${query}`, { headers: { cookie } })).status,
				status
			);
		}
		const levelTrend = await (
			await fetch(`${base}/api/dashboard/trend?jenjang=sma`, { headers: { cookie } })
		).json();
		assert.ok(levelTrend.series.every((item) => item.level === 'sma'));
		pass(
			'trend matches canonical daily counts, rejects invalid scope/source and never exposes student identities'
		);
		const ids = initial.selectedClasses.map((item) => item.id);
		const sourceId = Number(initial.studentSource.source);
		assert.ok(sourceId > 0);
		for (let day = 0; day < 7; day++) {
			const date = new Date(`${initial.date}T12:00:00Z`);
			date.setUTCDate(date.getUTCDate() - 6 + day);
			await sql(
				`INSERT INTO absensi_kegiatan(sekolah_id,semester_id,kelas_id,murid_id,kegiatan_id,tanggal,status,metode,petugas_user_id,created_at)
				SELECT sekolah_id,semester_id,kelas_id,id,?,?,CASE WHEN (id + ?) % 10 < ? THEN 'hadir' ELSE 'izin' END,'manual',?,strftime('%Y-%m-%dT%H:%M:%fZ','now')
				FROM murid WHERE sekolah_id=? AND kelas_id IN (${ids.map(() => '?').join(',')})
				ON CONFLICT(murid_id,kegiatan_id,tanggal) DO UPDATE SET status=excluded.status`,
				[sourceId, date.toISOString().slice(0, 10), day, 4 + (day % 5), user.id, school.id, ...ids]
			);
		}
		for (const [title, audience, active, start, end] of [
			['QA Pengumuman Guru', 'guru', 1, initial.date, null],
			['QA Pengumuman Admin', 'admin', 1, initial.date, null],
			['QA Pengumuman Nonaktif', 'semua', 0, initial.date, null],
			['QA Pengumuman Mendatang', 'semua', 1, '2099-01-01', null],
			['QA Pengumuman Kedaluwarsa', 'semua', 1, '2000-01-01', '2000-01-02']
		])
			await sql(
				"INSERT INTO pengumuman(sekolah_id,judul,isi,audiens,aktif,tanggal_mulai,tanggal_selesai,prioritas,created_at) VALUES(?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
				[school.id, title, 'QA only', audience, active, start, end, 'penting']
			);
		const seeded = await snapshot();
		assert.ok(seeded.announcements.some((item) => item.title === 'QA Pengumuman Guru'));
		assert.ok(
			seeded.announcements.every((item) => !/Nonaktif|Mendatang|Kedaluwarsa/.test(item.title))
		);
		const [academicClass] = await sql('SELECT tahun_ajaran_id,semester_id FROM kelas WHERE id=?', [
			ids[0]
		]);
		const [teacher] = await sql('SELECT id,nama FROM pegawai WHERE sekolah_id=? LIMIT 1', [
			school.id
		]);
		const [template] = await sql(
			"INSERT INTO jadwal_template(sekolah_id,tahun_ajaran_id,semester_id,jenis,nama,created_at) VALUES(?,?,?,?,?,datetime('now')) RETURNING id",
			[
				school.id,
				academicClass.tahun_ajaran_id,
				academicClass.semester_id,
				initial.jenisKey,
				'QA Jadwal'
			]
		);
		const dayName = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][
			new Date(`${initial.date}T12:00:00Z`).getUTCDay()
		];
		const [slot] = await sql(
			"INSERT INTO jadwal_jam(sekolah_id,template_id,hari,jam_ke,pukul_mulai,pukul_selesai,created_at) VALUES(?,?,?,9999,'09:00','09:40',datetime('now')) RETURNING id",
			[school.id, template.id, dayName]
		);
		const [subject] = await sql(
			"INSERT INTO jadwal_mata_pelajaran(sekolah_id,kode,nama,guru_pegawai_id,created_at) VALUES(?,'QA-MAPEL','Matematika (uji)',?,datetime('now')) RETURNING id",
			[school.id, teacher?.id ?? null]
		);
		await sql(
			"INSERT INTO jadwal_pelajaran(sekolah_id,semester_id,template_id,kelas_id,jam_id,hari,jam_ke,kode_kegiatan,jadwal_mapel_id,created_at) VALUES(?,?,?,?,?,?,9999,'QA-MAPEL',?,datetime('now'))",
			[school.id, academicClass.semester_id, template.id, ids[0], slot.id, dayName, subject.id]
		);
		const withSchedule = await snapshot();
		const lesson = withSchedule.lessons.find((item) => item.title === 'Matematika (uji)');
		if (!withSchedule.holiday) {
			assert.ok(lesson);
			assert.equal(lesson.teacher, teacher?.nama ?? null);
			assert.equal(lesson.start, '09:00');
		}
		pass(
			'today schedule resolves subject name, assigned teacher and time from the existing timetable'
		);
		await page.setViewport({ width: 1440, height: 1080 });
		await page.goto(base, { waitUntil: 'networkidle0' });
		await page.waitForSelector('.dashboard-chart circle');
		await page.screenshot({ path: path.join(dir, 'dashboard-populated-1440.png') });
		const stacks = await page.evaluate(() => {
			const panels = [...document.querySelector('.dashboard-main-stack').children]
				.map((el) => el.getBoundingClientRect())
				.sort((a, b) => a.top - b.top);
			return panels.slice(1).map((el, index) => el.top - panels[index].bottom);
		});
		assert.ok(
			stacks.every((gap) => gap >= 11 && gap <= 13),
			JSON.stringify(stacks)
		);
		const columnDifference = await page.evaluate(() =>
			Math.abs(
				document.querySelector('.dashboard-main-stack').getBoundingClientRect().height -
					document.querySelector('.dashboard-side-panel').getBoundingClientRect().height
			)
		);
		assert.ok(columnDifference < 200, `Unbalanced columns: ${columnDifference}px`);
		await page.setViewport({ width: 390, height: 844 });
		await page.waitForFunction(
			() => document.querySelector('.app-sidebar').getBoundingClientRect().right <= 1
		);
		await page.screenshot({ path: path.join(dir, 'dashboard-populated-390.png') });
		await page.$eval('.dashboard-trend', (el) => el.scrollIntoView({ block: 'center' }));
		await (
			await page.$('.dashboard-trend')
		).screenshot({ path: path.join(dir, 'trend-mobile-390.png') });
		await page.focus('.dashboard-trend summary');
		await page.keyboard.press('Enter');
		assert.equal(await page.$eval('.dashboard-trend details', (el) => el.open), true);
		await page.keyboard.press('Enter');
		pass(
			'real-data chart renders; independent desktop panel stacks have 12px gaps; published announcements only'
		);
		await page.setViewport({ width: 1440, height: 1080 });
		for (const key of ['sekolah', 'sholat', 'makan']) {
			await page.goto(`${base}/?absensi_tab=${key}`, { waitUntil: 'networkidle0' });
			const tab = await page.$(`[role=tablist][aria-label="Jenis absensi hari ini"] [role=tab]`);
			if (tab)
				assert.ok(
					await page.$eval(
						'[role=tablist][aria-label="Jenis absensi hari ini"] [aria-selected=true]',
						(el) => !!el.textContent.trim()
					)
				);
			const value = await snapshot(`?absensi_tab=${key}`);
			assert.equal(
				value.activityTab,
				initial.activityTabs.some((t) => t.key === key) ? key : initial.activityTab
			);
			await page.screenshot({ path: path.join(dir, `tab-${key}.png`) });
		}
		pass('all permitted attendance tabs retain their server-selected activity');
		await page.goto(base, { waitUntil: 'networkidle0' });
		const level = await page.$('select[name=jenjang]');
		if (level) {
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle0' }),
				page.select('select[name=jenjang]', 'sma')
			]);
			assert.equal(new URL(page.url()).searchParams.get('jenjang'), 'sma');
			const filtered = await snapshot('?jenjang=sma');
			assert.ok(filtered.selectedClasses.every((row) => row.jenjang === 'sma'));
		}
		pass('level filter submits and preserves server-side class scope');
		await page.goto(base, { waitUntil: 'networkidle0' });
		const chip = await page.$('.dashboard-status-chip');
		if (chip) {
			await chip.click();
			await page.waitForSelector('dialog[open]');
			await page.screenshot({ path: path.join(dir, 'absence-dialog.png') });
			await page.keyboard.press('Escape');
			await page.waitForFunction(() => !document.querySelector('dialog[open]'));
		}
		pass('absence details dialog opens and closes using Escape');
		const sourceOption = await page.$('select[aria-label="Sumber masuk sekolah"]');
		if (sourceOption) {
			await Promise.all([
				page.waitForFunction(
					() => new URL(location.href).searchParams.get('sumber_masuk') === 'harian'
				),
				page.select('select[aria-label="Sumber masuk sekolah"]', 'harian')
			]);
		}
		pass('attendance source selection remains functional');
		await page.goto(base, { waitUntil: 'networkidle0' });
		await page.$eval('#pengawasan-kelas', (el) => el.scrollIntoView());
		await page.screenshot({ path: path.join(dir, 'dashboard-class-panels.png') });
		const nextClasses = await page.$('#pengawasan-kelas a[aria-label="Kelas berikutnya"]');
		if (nextClasses) {
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle0' }),
				nextClasses.click()
			]);
			assert.equal(new URL(page.url()).searchParams.get('kelas_page'), '2');
		}
		await page.goto(base, { waitUntil: 'networkidle0' });
		const refresh = 'button[aria-label="Muat ulang absensi"]';
		let failRefresh = true;
		await page.setRequestInterception(true);
		const intercept = async (request) => {
			if (failRefresh && new URL(request.url()).pathname === '/api/dashboard/daily') {
				await new Promise((resolve) => setTimeout(resolve, 700));
				await request.respond({
					status: 503,
					contentType: 'application/json',
					body: JSON.stringify({ message: 'Data gagal diperbarui. Coba lagi.' })
				});
			} else await request.continue();
		};
		page.on('request', intercept);
		await page.click(refresh);
		await page.waitForFunction(
			(selector) => document.querySelector(selector).disabled,
			{},
			refresh
		);
		await page.screenshot({ path: path.join(dir, 'attendance-loading.png') });
		await page.waitForSelector('#absensi-hari-ini [role=status]');
		await page.screenshot({ path: path.join(dir, 'attendance-error.png') });
		failRefresh = false;
		await page.click(refresh);
		await page.waitForFunction(() => !document.querySelector('#absensi-hari-ini [role=status]'));
		page.off('request', intercept);
		await page.setRequestInterception(false);
		await page.focus(refresh);
		assert.ok(await page.$eval(refresh, (el) => el === document.activeElement));
		await page.keyboard.press('Tab');
		assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
		pass('class pagination, refresh loading/error/recovery and keyboard focus');
		let failTrend = true;
		await page.setRequestInterception(true);
		const interceptTrend = async (request) => {
			if (failTrend && new URL(request.url()).pathname === '/api/dashboard/trend')
				await request.respond({
					status: 503,
					contentType: 'application/json',
					body: JSON.stringify({ message: 'QA trend failure' })
				});
			else await request.continue();
		};
		page.on('request', interceptTrend);
		await page.waitForFunction(
			() => !document.querySelector('button[aria-label="Muat ulang grafik"]').disabled
		);
		await page.$eval('button[aria-label="Muat ulang grafik"]', (el) =>
			el.scrollIntoView({ block: 'center' })
		);
		await page.click('button[aria-label="Muat ulang grafik"]');
		await page.waitForSelector('.dashboard-trend [role=status]');
		failTrend = false;
		await page.click('button[aria-label="Muat ulang grafik"]');
		await page.waitForFunction(
			() =>
				!document.querySelector('.dashboard-trend [role=status]') &&
				!!document.querySelector('.dashboard-chart circle')
		);
		page.off('request', interceptTrend);
		await page.setRequestInterception(false);
		pass('trend retry recovers after a failed request');
		await page.evaluate(() => document.activeElement?.blur());
		await page.$eval('.app-page-viewport', (el) => el.scrollTo(0, 0));
		await page.evaluate(() => {
			localStorage.setItem('dark-mode', 'true');
			document.documentElement.dataset.theme = 'dark';
		});
		await page.screenshot({ path: path.join(dir, 'dashboard-dark-1440.png') });
		await page.setViewport({ width: 390, height: 844 });
		await page.waitForFunction(
			() => document.querySelector('.app-sidebar').getBoundingClientRect().right <= 1
		);
		await page.screenshot({ path: path.join(dir, 'dashboard-dark-390.png') });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		pass('dark theme remains usable at desktop and mobile sizes');
		await page.evaluate(() => {
			localStorage.removeItem('dark-mode');
			document.documentElement.dataset.theme = 'light';
		});
		await sql("UPDATE auth_user SET type='user', permissions='[]' WHERE id=?", [user.id]);
		await page.goto(base, { waitUntil: 'networkidle0' });
		assert.equal(
			await page.$eval('.dashboard-actions button[aria-label="Backup Data"]', (el) => el.disabled),
			true
		);
		const restricted = await snapshot();
		assert.equal(restricted.admin, false);
		assert.equal(restricted.leadership, null);
		await page.screenshot({ path: path.join(dir, 'dashboard-teacher-390.png') });
		pass('unassigned teacher retains restricted scope and cannot download backups');
		const restrictedTrendResponse = await fetch(`${base}/api/dashboard/trend?kelas_id=${ids[0]}`, {
			headers: { cookie }
		});
		assert.equal(restrictedTrendResponse.status, 200);
		assert.deepEqual((await restrictedTrendResponse.json()).series, []);
		await sql('UPDATE auth_user SET permissions=\'["pengumuman_lihat"]\' WHERE id=?', [user.id]);
		const teacherNews = await snapshot();
		assert.ok(teacherNews.announcements.some((item) => item.title === 'QA Pengumuman Guru'));
		assert.ok(
			teacherNews.announcements.every(
				(item) => !/Admin|Nonaktif|Mendatang|Kedaluwarsa/.test(item.title)
			)
		);
		await sql("UPDATE auth_user SET type='tim_dapur', permissions='[]' WHERE id=?", [user.id]);
		assert.equal((await fetch(`${base}/api/dashboard/trend`, { headers: { cookie } })).status, 403);
		await sql("UPDATE auth_user SET type='user', sekolah_id=NULL WHERE id=?", [user.id]);
		assert.ok(
			[401, 403].includes(
				(await fetch(`${base}/api/dashboard/trend`, { headers: { cookie }, redirect: 'manual' }))
					.status
			)
		);
		pass(
			'trend respects teacher assignment, kitchen restriction and school boundary; news respects audience'
		);
	}
	await page.deleteCookie({ name: 'rapkumer-session', url: base });
	const unauthenticatedTrend = await fetch(`${base}/api/dashboard/trend`, { redirect: 'manual' });
	assert.ok([303, 401].includes(unauthenticatedTrend.status));
	await page.setViewport({ width: 1440, height: 1080 });
	await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
	await page.screenshot({ path: path.join(dir, 'control-login.png') });
	const control = await page.$eval('.login-card', (el) => ({
		width: el.getBoundingClientRect().width,
		font: getComputedStyle(el).fontSize
	}));
	await writeFile(path.join(dir, 'control.json'), JSON.stringify(control));
	assert.deepEqual(errors, []);
	await writeFile(path.join(dir, 'measurements.json'), JSON.stringify(metrics, null, 2));
	await writeFile(path.join(dir, 'results.json'), JSON.stringify({ results, dir }, null, 2));
	console.log(`QA_RESULTS=${dir}`);
} catch (error) {
	if (browser) {
		const pages = await browser.pages();
		await pages.at(-1)?.screenshot({ path: path.join(dir, 'failure.png') });
	}
	await writeFile(path.join(dir, 'error.log'), `${error.stack}\n${output}`);
	throw error;
} finally {
	if (browser) await browser.close();
	db.close();
	if (child.exitCode === null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
}
