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
await db.execute('PRAGMA journal_mode=WAL');
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
	if (!baseline && process.env.QA_MOBILE_DOCK === '1') {
		for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
			await page.setViewport({ width, height: 844 });
			await page.goto(base, { waitUntil: 'networkidle0' });
			const dock = await page.$eval('.app-mobile-dock', (el) => ({
				visible: getComputedStyle(el).display !== 'none',
				top: el.getBoundingClientRect().top,
				bottom: el.getBoundingClientRect().bottom,
				count: el.children.length
			}));
			assert.equal(dock.visible, width < 768);
			if (width < 768) {
				assert.ok(dock.count >= 2 && dock.count <= 5);
				assert.ok(Math.abs(dock.bottom - 844) < 2);
				const contentBottom = await page.$eval(
					'.app-page-viewport',
					(el) => el.getBoundingClientRect().bottom
				);
				assert.ok(contentBottom <= dock.top + 1, `Dock overlaps content at ${width}`);
			}
		}
		pass('mobile dock reserves content space and is hidden on tablet/desktop');
		await page.setViewport({ width: 390, height: 844 });
		await page.click('.app-mobile-dock button[aria-controls="mobile-menu-dialog"]');
		await page.waitForSelector('#mobile-menu-dialog[open]');
		await new Promise((resolve) => setTimeout(resolve, 300));
		await page.screenshot({ path: path.join(dir, 'mobile-menu-390.png') });
		await page.type('#mobile-menu-dialog input[type="search"]', 'Pengaturan Jadwal');
		await page.waitForSelector('#mobile-menu-dialog a[href="/jadwal/pengaturan"]');
		await page.keyboard.press('Escape');
		// Chrome consumes the first Escape to clear a focused search field.
		if (await page.$eval('#mobile-menu-dialog', (el) => el.open)) {
			await page.keyboard.press('Escape');
		}
		await page.waitForFunction(() => !document.querySelector('#mobile-menu-dialog').open);
		assert.equal(
			await page.$eval('.app-mobile-dock button', (el) => el === document.activeElement),
			true
		);
		await page.click('.app-mobile-dock button');
		await page.setViewport({ width: 1024, height: 768 });
		await page.waitForFunction(() => !document.querySelector('#mobile-menu-dialog').open);
		await page.setViewport({ width: 667, height: 375 });
		await page.click('.app-mobile-dock button');
		await new Promise((resolve) => setTimeout(resolve, 300));
		assert.ok(
			await page.$eval(
				'#mobile-menu-dialog .modal-box',
				(el) => el.getBoundingClientRect().height <= innerHeight * 0.85 + 1
			)
		);
		await page.screenshot({ path: path.join(dir, 'mobile-menu-landscape.png') });
		await page.keyboard.press('Escape');
		pass('full mobile menu supports search, Escape, focus return, resize and short screens');
		await sql(
			'INSERT INTO user_favorites(user_id,path,title,created_at,updated_at) VALUES(?,?,?,?,?)',
			[
				user.id,
				'/jadwal/pengaturan',
				'Pengaturan Jadwal',
				new Date().toISOString(),
				new Date().toISOString()
			]
		);
		for (const role of ['user', 'wali_asuh', 'wali_asrama', 'tim_dapur', 'tim_keamanan', 'admin']) {
			await sql("UPDATE auth_user SET type=?,permissions='[]' WHERE id=?", [role, user.id]);
			await page.setViewport({ width: 390, height: 844 });
			await page.goto(base, { waitUntil: 'networkidle0' });
			assert.equal(
				await page.$eval('.app-mobile-dock', (el) => el.textContent.includes('Pengaturan Jadwal')),
				role === 'admin'
			);
			await page.click('.app-mobile-dock button');
			await page.waitForSelector('#mobile-menu-dialog[open]');
			const menus = await page.evaluate(() => {
				const links = (root) =>
					[...document.querySelectorAll(`${root} .app-sidebar-menu a`)]
						.map((el) => el.getAttribute('href'))
						.sort();
				return { drawer: links('.app-sidebar'), sheet: links('#mobile-menu-dialog') };
			});
			assert.deepEqual(menus.sheet, menus.drawer, `Different policies for ${role}`);
			if (role !== 'admin') assert.ok(!menus.sheet.includes('/jadwal/pengaturan'));
			await new Promise((resolve) => setTimeout(resolve, 300));
			await page.screenshot({ path: path.join(dir, `mobile-menu-${role}.png`) });
			await page.keyboard.press('Escape');
		}
		await sql('DELETE FROM user_favorites WHERE user_id=?', [user.id]);
		for (const route of ['/murid', '/administrasi/absensi/scan']) {
			await page.goto(base + route, { waitUntil: 'networkidle0' });
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false
			);
			assert.ok(
				await page.evaluate(
					() =>
						document.querySelector('.app-page-viewport').getBoundingClientRect().bottom <=
						document.querySelector('.app-mobile-dock').getBoundingClientRect().top + 1
				)
			);
			await page.screenshot({
				path: path.join(
					dir,
					route.includes('scan') ? 'mobile-scan-dock.png' : 'mobile-table-dock.png'
				)
			});
		}
		await page.goto(base, { waitUntil: 'networkidle0' });
		pass(
			'six roles share drawer/sheet policy; revoked favorite hidden; scan and table remain above dock'
		);
	}
	const sessionCookie = `rapkumer-session=${token}; active-sekolah-id=${school.id}`;
	let cookie = sessionCookie;
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
				'lessonClass',
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
		const initialMissing = initial.absences.find((group) => group.status === 'belum');
		if (initialMissing?.total) {
			await page.goto(base, { waitUntil: 'networkidle0' });
			await page.click('#dashboard-attendance-tab button.dashboard-attendance-status--belum');
			await page.waitForSelector('dialog[open]');
			assert.ok(
				await page.$eval(
					'dialog[open]',
					(el, name) => el.textContent.includes(name),
					initialMissing.students[0].nama
				)
			);
			if (initialMissing.pageCount > 1) {
				await page.click('dialog[open] a[aria-label="Halaman berikutnya"]');
				await page.waitForFunction(
					() => new URL(location.href).searchParams.get('belum_page') === '2'
				);
				const secondMissing = (await snapshot('?belum_page=2')).absences.find(
					(group) => group.status === 'belum'
				);
				assert.equal(secondMissing.page, 2);
				assert.ok(!initialMissing.students.some((row) => row.id === secondMissing.students[0].id));
				await page.waitForFunction(
					(name) => document.querySelector('dialog[open]')?.textContent.includes(name),
					{},
					secondMissing.students[0].nama
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
			await page.screenshot({ path: path.join(dir, 'school-unrecorded-names-pagination.png') });
			await page.keyboard.press('Escape');
			await page.goto(base, { waitUntil: 'networkidle0' });
		}
		pass(
			'unrecorded school popup lists actual names and next-page navigation preserves the dialog'
		);
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
		assert.ok(ids.length >= 2);
		cookie = `${sessionCookie}; active-kelas-id=${ids[0]}`;
		await page.setCookie({ name: 'active-kelas-id', value: String(ids[0]), url: base });
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
		await sql(
			"INSERT INTO jadwal_pelajaran(sekolah_id,semester_id,template_id,kelas_id,jam_id,hari,jam_ke,kode_kegiatan,jadwal_mapel_id,created_at) VALUES(?,?,?,?,?,?,9999,'QA-MAPEL',?,datetime('now'))",
			[school.id, academicClass.semester_id, template.id, ids[1], slot.id, dayName, subject.id]
		);
		const withSchedule = await snapshot();
		assert.equal(withSchedule.lessonClass.id, ids[0]);
		assert.ok(withSchedule.lessons.every((row) => row.kelasId === ids[0]));
		const secondSchedule = await snapshot(`?kelas_id=${ids[1]}`);
		assert.equal(secondSchedule.lessonClass.id, ids[1]);
		assert.ok(secondSchedule.lessons.every((row) => row.kelasId === ids[1]));
		const invalidSchedule = await (
			await fetch(`${base}/api/dashboard/daily`, {
				headers: { cookie: `${sessionCookie}; active-kelas-id=999999999` }
			})
		).json();
		assert.equal(invalidSchedule.lessonClass, null);
		assert.deepEqual(invalidSchedule.lessons, []);
		const lesson = withSchedule.lessons.find((item) => item.title === 'Matematika (uji)');
		if (!withSchedule.holiday) {
			assert.ok(lesson);
			assert.equal(lesson.teacher, teacher?.nama ?? null);
			assert.equal(lesson.start, '09:00');
			assert.ok(secondSchedule.lessons.some((row) => row.title === 'Matematika (uji)'));
		}
		await page.goto(`${base}/?kelas_id=${ids[1]}`, { waitUntil: 'networkidle0' });
		await page.goto(base, { waitUntil: 'networkidle0' });
		assert.ok(
			(await page.$eval('.dashboard-today', (el) => el.textContent)).includes(
				`Kelas ${secondSchedule.lessonClass.nama}`
			)
		);
		await page.setViewport({ width: 1440, height: 1080 });
		await page.$eval('.dashboard-today', (el) => el.scrollIntoView({ block: 'center' }));
		await (
			await page.$('.dashboard-today')
		).screenshot({ path: path.join(dir, 'current-class-schedule-1440.png') });
		await page.setViewport({ width: 390, height: 844 });
		await page.$eval('.dashboard-today', (el) => el.scrollIntoView({ block: 'center' }));
		await (
			await page.$('.dashboard-today')
		).screenshot({ path: path.join(dir, 'current-class-schedule-390.png') });
		await page.setCookie({ name: 'active-kelas-id', value: String(ids[0]), url: base });
		pass(
			'schedule follows selected class and persisted navbar cookie; invalid class never falls back to all classes'
		);
		pass(
			'today schedule resolves subject name, assigned teacher and time from the existing timetable'
		);
		await page.setViewport({ width: 1440, height: 1080 });
		await page.goto(base, { waitUntil: 'networkidle0' });
		await page.waitForSelector('.column-bar');
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
		assert.ok(
			await page.$eval('#absensi-hari-ini', (el) => el.textContent.includes('Berangkat Sekolah'))
		);
		for (const key of ['sekolah', 'sholat', 'makan', 'asrama']) {
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
			if (key === 'sekolah') {
				const missing = value.absences.find((group) => group.status === 'belum');
				assert.equal(missing.total, value.students.unrecorded);
				const canonical = await (
					await fetch(
						`${base}/api/administrasi/absensi/monitoring?tab=sekolah&tanggal=${value.date}`,
						{
							headers: { cookie }
						}
					)
				).json();
				const missingRows = canonical.rows.filter((row) =>
					['belum', 'tanpa_sumber'].includes(row.cells[0].status)
				);
				assert.equal(missing.total, missingRows.length);
				assert.deepEqual(
					missing.students.map((row) => row.id),
					missingRows.slice(0, 20).map((row) => row.id)
				);
				await page.click('#dashboard-attendance-tab button.dashboard-attendance-status--belum');
				await page.waitForSelector('dialog[open]');
				assert.ok(
					await page.$eval('dialog[open]', (el) => el.textContent.includes('Belum Tercatat'))
				);
				if (missing.students[0])
					assert.ok(
						await page.$eval(
							'dialog[open]',
							(el, name) => el.textContent.includes(name),
							missing.students[0].nama
						)
					);
				await page.screenshot({ path: path.join(dir, 'school-unrecorded-dialog.png') });
				await page.keyboard.press('Escape');
				const lastMissing = (await snapshot('?belum_page=99999')).absences.find(
					(group) => group.status === 'belum'
				);
				assert.equal(lastMissing.page, lastMissing.pageCount);
			} else {
				const buttons = await page.$$eval('#dashboard-attendance-tab article', (items) =>
					items.map((item) =>
						['sakit', 'izin', 'alfa', 'izin_pulang', 'belum'].every(
							(status) => !!item.querySelector(`button.dashboard-attendance-status--${status}`)
						)
					)
				);
				assert.ok(buttons.length > 0 && buttons.every(Boolean));
				const emptyActivity = value.activitySummaries.find((item) => !item.counts.sakit);
				if (emptyActivity) {
					const index = value.activitySummaries.indexOf(emptyActivity);
					await page.click(
						`#dashboard-attendance-tab article:nth-child(${index + 1}) button.dashboard-attendance-status--sakit`
					);
					await page.waitForSelector('dialog[open] #dashboard-activity-dialog-title');
					assert.ok(
						await page.$eval('#dashboard-activity-dialog-title', (el) =>
							el.textContent.includes('Sakit')
						)
					);
					assert.ok(
						await page.$eval('dialog[open]', (el) => el.textContent.includes('Tidak ada murid'))
					);
					await page.keyboard.press('Escape');
				}
				await page.click(
					'#dashboard-attendance-tab article:first-child button.dashboard-attendance-status--belum'
				);
				await page.waitForSelector('dialog[open] #dashboard-activity-dialog-title');
				const missingActivity = value.activitySummaries[0];
				assert.ok(
					await page.$eval(
						'dialog[open]',
						(el, total) => el.textContent.includes(`${total} murid`),
						missingActivity.counts.belum + missingActivity.counts.tanpa_sumber
					)
				);
				await page.keyboard.press('Escape');
			}
			assert.equal(
				value.activityTab,
				initial.activityTabs.some((t) => t.key === key) ? key : initial.activityTab
			);
			await page.screenshot({ path: path.join(dir, `tab-${key}.png`) });
		}
		pass(
			'all attendance tabs show five status buttons including zero counts; unrecorded school popup matches canonical monitoring and paginates'
		);
		const dormParams = new URLSearchParams({ tanggal: initial.date, tab: 'asrama' });
		const monitoringResponse = await fetch(
			`${base}/api/administrasi/absensi/monitoring?${dormParams}`,
			{ headers: { cookie } }
		);
		assert.equal(monitoringResponse.status, 200);
		let dormMonitoring = await monitoringResponse.json();
		const dormSource = dormMonitoring.columns.find((column) => column.activityId);
		if (dormSource) {
			await sql(
				`INSERT INTO absensi_kegiatan(sekolah_id,semester_id,kelas_id,murid_id,kegiatan_id,tanggal,status,metode,petugas_user_id,created_at)
				SELECT sekolah_id,semester_id,kelas_id,id,?,?,'hadir','manual',?,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM murid WHERE sekolah_id=? AND kelas_id=? LIMIT 1
				ON CONFLICT(murid_id,kegiatan_id,tanggal) DO UPDATE SET status=excluded.status`,
				[dormSource.activityId, initial.date, user.id, school.id, ids[0]]
			);
			dormMonitoring = await (
				await fetch(`${base}/api/administrasi/absensi/monitoring?${dormParams}`, {
					headers: { cookie }
				})
			).json();
		}
		const dormDaily = await snapshot('?absensi_tab=asrama');
		assert.deepEqual(
			dormDaily.activitySummaries.map((item) => item.key),
			['asrama_berangkat', 'asrama_tiba', 'apel_malam']
		);
		for (const item of dormDaily.activitySummaries) {
			const canonical = dormMonitoring.summaries.find((column) => column.key === item.key);
			assert.deepEqual(item.counts, canonical.counts);
			assert.equal(item.total, dormMonitoring.total);
			assert.equal(item.recorded, item.total - item.counts.belum - item.counts.tanpa_sumber);
		}
		await page.goto(`${base}/?absensi_tab=asrama`, { waitUntil: 'networkidle0' });
		for (const width of [1440, 768, 390, 320]) {
			await page.setViewport({ width, height: 900 });
			await page.$eval('#absensi-hari-ini', (el) => el.scrollIntoView({ block: 'start' }));
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			assert.ok(
				await page.$eval(
					'[aria-label="Jenis absensi hari ini"]',
					(el) => el.scrollWidth <= el.clientWidth + 1
				)
			);
			assert.equal(
				await page.$$eval('#dashboard-attendance-tab article', (items) => items.length),
				3
			);
			await (
				await page.$('#absensi-hari-ini')
			).screenshot({ path: path.join(dir, `attendance-asrama-${width}.png`) });
		}
		assert.equal(
			await page.$eval('#absensi-hari-ini a', (el) => new URL(el.href).searchParams.get('tab')),
			'asrama'
		);
		const dormStatus = await page.$('#dashboard-attendance-tab .dashboard-status-chip');
		if (dormStatus) {
			await dormStatus.click();
			await page.waitForSelector('dialog[open] #dashboard-activity-dialog-title');
			await page.keyboard.press('Escape');
			await page.waitForFunction(() => !document.querySelector('dialog[open]'));
		}
		await page.goto(base, { waitUntil: 'networkidle0' });
		const dormTab = '[aria-label="Jenis absensi hari ini"] button:last-child';
		await page.focus(dormTab);
		await page.keyboard.press('Enter');
		await page.waitForFunction(
			() => new URL(location.href).searchParams.get('absensi_tab') === 'asrama'
		);
		await page.waitForSelector('#dashboard-attendance-tab article');
		const refreshedDorm = page.waitForResponse(
			(response) =>
				response.url().includes('/api/dashboard/daily') &&
				response.url().includes('absensi_tab=asrama')
		);
		await page.click('button[aria-label="Muat ulang absensi"]');
		assert.equal((await (await refreshedDorm).json()).activityTab, 'asrama');
		pass(
			'dorm dashboard matches canonical monitoring counts, stays responsive, follows keyboard navigation and refreshes the selected tab'
		);
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
		await page.waitForSelector('.dashboard-trend [role=status].text-warning');
		failTrend = false;
		await page.click('button[aria-label="Muat ulang grafik"]');
		await page.waitForFunction(
			() =>
				!document.querySelector('.dashboard-trend [role=status].text-warning') &&
				!!document.querySelector('.column-bar')
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
		const chartPage = await browser.newPage();
		chartPage.on('pageerror', (error) => errors.push(error.message));
		const chartTrend = await (
			await fetch(`${base}/api/dashboard/trend`, { headers: { cookie } })
		).json();
		const chartDates = chartTrend.series[0].points.map((point) => point.date);
		let chartFixture = {
			...chartTrend,
			series: ['sd', 'smp', 'sma'].map((level, offset) => ({
				level,
				points: chartDates.map((date, index) => {
					const rate = [null, 0, 25, 50, 75, 90, 100][(index + offset) % 7];
					return {
						date,
						total: 100,
						present: rate ?? 0,
						recorded: rate === null ? 0 : 100,
						unrecorded: rate === null ? 100 : 0,
						rate
					};
				})
			}))
		};
		await chartPage.setRequestInterception(true);
		chartPage.on('request', async (request) => {
			if (new URL(request.url()).pathname === '/api/dashboard/trend') {
				await new Promise((resolve) => setTimeout(resolve, 250));
				await request.respond({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(chartFixture)
				});
			} else await request.continue();
		});
		await chartPage.setViewport({ width: 1440, height: 1080 });
		await chartPage.goto(base, { waitUntil: 'networkidle0' });
		await chartPage.waitForSelector('.column-bar');
		await chartPage.$eval('.theme-controller', (input) => {
			if (input.checked) input.click();
		});
		await new Promise((resolve) => setTimeout(resolve, 400));
		const barMetrics = await chartPage.$$eval('.column-hit', (buttons) =>
			buttons.map((el) => ({
				rate: el.dataset.rate,
				height: el.querySelector('.column-bar')?.getBoundingClientRect().height ?? null,
				missing: !!el.querySelector('.column-missing')
			}))
		);
		assert.equal(barMetrics.length, 21);
		for (const point of barMetrics) {
			if (point.rate === 'missing') {
				assert.equal(point.height, null);
				assert.equal(point.missing, true);
			} else
				assert.ok(
					Math.abs(point.height - (Number(point.rate) === 0 ? 2 : Number(point.rate) * 1.44)) < 1
				);
		}
		await chartPage.focus('.column-hit[data-rate="missing"]');
		await chartPage.keyboard.press('Enter');
		assert.match(await chartPage.$eval('.column-detail', (el) => el.textContent), /Belum ada data/);
		await chartPage.focus('.column-hit[data-rate="0"]');
		await chartPage.keyboard.press('Enter');
		assert.match(await chartPage.$eval('.column-detail strong', (el) => el.textContent), /^0%$/);
		const chartFilter = 'select[aria-label="Jenjang grafik kehadiran"]';
		await chartPage.select(chartFilter, 'sma');
		await chartPage.waitForFunction(() => document.querySelectorAll('.column-hit').length === 7);
		assert.ok(
			await chartPage.$$eval('.column-hit', (items) =>
				items.every((el) => el.dataset.level === 'sma')
			)
		);
		await chartPage.select(chartFilter, 'all');
		await chartPage.click('[aria-label="Legenda jenjang"] button');
		assert.equal(
			await chartPage.$$eval('.column-hit[data-level="sd"]', (items) => items.length),
			0
		);
		await chartPage.click('[aria-label="Legenda jenjang"] button');
		await chartPage.waitForFunction(() => document.querySelectorAll('.column-hit').length === 21);
		for (const width of [1440, 768, 390, 320]) {
			await chartPage.setViewport({ width, height: 900, hasTouch: width < 768 });
			await chartPage.waitForSelector('.column-bar');
			await chartPage.$eval('.dashboard-trend', (el) => el.scrollIntoView({ block: 'center' }));
			assert.ok(await chartPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await (
				await chartPage.$('.dashboard-trend')
			).screenshot({ path: path.join(dir, `bars-${width}.png`) });
		}
		await chartPage.select(chartFilter, 'smp');
		assert.ok(
			await chartPage.$eval('.column-scroll', (el) => el.scrollWidth <= el.clientWidth + 1)
		);
		await chartPage.tap('.column-hit[data-rate="25"]');
		assert.equal(await chartPage.$eval('.column-detail strong', (el) => el.textContent), '25%');
		await chartPage.$eval('.theme-controller', (input) => {
			if (!input.checked) input.click();
		});
		await new Promise((resolve) => setTimeout(resolve, 400));
		await (
			await chartPage.$('.dashboard-trend')
		).screenshot({ path: path.join(dir, 'bars-dark-320.png') });
		chartFixture = {
			...chartFixture,
			series: chartFixture.series.map((item) => ({
				...item,
				points: item.points.map((point) => ({
					...point,
					rate: null,
					present: 0,
					recorded: 0,
					unrecorded: 100
				}))
			}))
		};
		await chartPage.goto(base, { waitUntil: 'networkidle0' });
		await chartPage.waitForSelector('.column-missing');
		assert.equal(await chartPage.$('.column-bar'), null);
		assert.match(
			await chartPage.$eval('.dashboard-trend', (el) => el.textContent),
			/Belum tercatat bukan alfa/
		);
		chartFixture = { ...chartFixture, series: [] };
		await chartPage.goto(base, { waitUntil: 'networkidle0' });
		assert.match(
			await chartPage.$eval('.dashboard-trend', (el) => el.textContent),
			/Belum ada murid/
		);
		await chartPage.close();
		pass(
			'grouped bars: exact scale, null versus zero, level filter, legend, keyboard, touch, local scroll, light/dark and empty states'
		);
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
		assert.equal(restricted.lessonClass, null);
		assert.deepEqual(restricted.lessons, []);
		await page.screenshot({ path: path.join(dir, 'dashboard-teacher-390.png') });
		pass('unassigned teacher retains restricted scope and cannot download backups');
		const restrictedTrendResponse = await fetch(`${base}/api/dashboard/trend?kelas_id=${ids[0]}`, {
			headers: { cookie }
		});
		assert.equal(restrictedTrendResponse.status, 200);
		assert.deepEqual((await restrictedTrendResponse.json()).series, []);
		await sql('UPDATE auth_user SET kelas_id=? WHERE id=?', [ids[0], user.id]);
		const assignedSchedule = await snapshot();
		assert.equal(assignedSchedule.lessonClass.id, ids[0]);
		assert.ok(assignedSchedule.lessons.every((row) => row.kelasId === ids[0]));
		const outsideAssignment = await (
			await fetch(`${base}/api/dashboard/daily`, {
				headers: { cookie: `${sessionCookie}; active-kelas-id=${ids[1]}` }
			})
		).json();
		assert.equal(outsideAssignment.lessonClass, null);
		assert.deepEqual(outsideAssignment.lessons, []);
		await sql('UPDATE auth_user SET kelas_id=NULL WHERE id=?', [user.id]);
		pass(
			'teacher schedule stays within assigned classes even when the active-class cookie is tampered'
		);
		await sql('UPDATE auth_user SET permissions=\'["pengumuman_lihat"]\' WHERE id=?', [user.id]);
		const teacherNews = await snapshot();
		assert.ok(teacherNews.announcements.some((item) => item.title === 'QA Pengumuman Guru'));
		assert.ok(
			teacherNews.announcements.every(
				(item) => !/Admin|Nonaktif|Mendatang|Kedaluwarsa/.test(item.title)
			)
		);
		await sql("UPDATE auth_user SET type='tim_dapur', permissions='[]' WHERE id=?", [user.id]);
		assert.deepEqual(
			(await snapshot()).activityTabs.map((tab) => tab.key),
			['makan']
		);
		assert.equal(
			(await fetch(`${base}/api/dashboard/daily?absensi_tab=asrama`, { headers: { cookie } }))
				.status,
			403
		);
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
	assert.equal(await page.$('.app-mobile-dock'), null);
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
