import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const project = process.cwd();
const port = Number(process.env.FOLLOW_UP_QA_PORT || 5186);
assert.ok(Number.isInteger(port) && ![1206, 5152].includes(port));
await new Promise((resolve, reject) => {
	const server = net.createServer();
	server.once('error', reject);
	server.listen(port, '127.0.0.1', () => server.close(resolve));
});
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'attendance-follow-up-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
async function insert(table, original, changes = {}) {
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
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
function dateBefore(days) {
	const date = new Date(`${today}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().slice(0, 10);
}
let child,
	browser,
	output = '';
try {
	const original = await row('SELECT * FROM murid WHERE kelas_id IS NOT NULL ORDER BY id LIMIT 1');
	assert.ok(original);
	const school = Number(original.sekolah_id),
		semester = Number(original.semester_id);
	const classRow = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	const classChanges = {
		nama: 'QA Tindak Lanjut',
		wali_kelas_id: null,
		wali_asuh_id: null,
		wali_asrama_id: null,
		dapodik_rombongan_belajar_id: null
	};
	const kelas = await insert('kelas', classRow, classChanges);
	const emptyKelas = await insert('kelas', classRow, {
		...classChanges,
		nama: 'QA Tanpa Indikator'
	});
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [classRow.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [semester, classRow.tahun_ajaran_id]
	});
	await db.execute({
		sql: 'UPDATE kegiatan_absensi SET auto_alfa=0 WHERE sekolah_id=?',
		args: [school]
	});
	// Only the isolated database is changed; dates stay relative to the test run.
	await db.execute({ sql: 'DELETE FROM kalender_pendidikan WHERE sekolah_id=?', args: [school] });
	await db.execute({
		sql: 'UPDATE presensi_settings SET hari_sekolah=7,libur_nasional=?,libur_semester=? WHERE sekolah_id=?',
		args: ['[]', '[]', school]
	});
	const activity = await row('SELECT * FROM kegiatan_absensi WHERE sekolah_id=? LIMIT 1', [school]);
	assert.ok(activity);
	const names = [
		'QA Muhammad Abdurrahman Pratama Wijaya Kusuma',
		'QA Sakit Berulang',
		'QA Izin Pulang',
		'QA Alfa Berulang'
	];
	const ids = [];
	for (let index = 0; index < names.length; index++) {
		ids.push(
			await insert('murid', original, {
				nama: names[index],
				nis: `QA-FOLLOW-${index}`,
				nisn: `999987000${index}`,
				kelas_id: kelas,
				foto: null,
				qr_token: null,
				dapodik_peserta_didik_id: null,
				dapodik_anggota_rombel_id: null
			})
		);
	}
	const now = new Date().toISOString();
	for (const [index, status, days] of [
		[0, 'sakit', [1, 2, 3, 4]],
		[1, 'sakit', [2, 5, 8]],
		[3, 'alfa', [1, 3, 5]]
	]) {
		for (const day of days) {
			await insert('absensi_kegiatan', {
				sekolah_id: school,
				semester_id: semester,
				kelas_id: kelas,
				murid_id: ids[index],
				kegiatan_id: activity.id,
				tanggal: dateBefore(day),
				status,
				metode: 'manual',
				created_at: now,
				updated_at: now
			});
		}
	}
	await insert('izin_pulang_murid', {
		sekolah_id: school,
		tahun_ajaran_id: classRow.tahun_ajaran_id,
		semester_id: semester,
		kelas_id: kelas,
		murid_id: ids[2],
		nis_snapshot: 'QA-FOLLOW-2',
		nama_snapshot: names[2],
		kelas_snapshot: 'QA Tindak Lanjut',
		tanggal_keluar: dateBefore(5),
		rencana_kembali: dateBefore(2),
		alasan: 'Keperluan keluarga QA',
		status: 'sedang_izin',
		created_at: now
	});
	const currentPermit = await insert('izin_pulang_murid', {
		sekolah_id: school,
		tahun_ajaran_id: classRow.tahun_ajaran_id,
		semester_id: semester,
		kelas_id: kelas,
		murid_id: ids[1],
		nis_snapshot: 'QA-FOLLOW-1',
		nama_snapshot: names[1],
		kelas_snapshot: 'QA Tindak Lanjut',
		tanggal_keluar: today,
		rencana_kembali: dateBefore(-2),
		alasan: 'Izin masih berlaku QA',
		status: 'sedang_izin',
		created_at: now
	});
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	assert.ok(admin);
	const user = await insert('auth_user', admin, {
		username: 'qa-follow-up-admin',
		username_normalized: 'qa-follow-up-admin',
		sekolah_id: school,
		kelas_id: null,
		pegawai_id: null,
		must_change_password: 0
	});
	const token = randomBytes(32).toString('base64url');
	await insert('auth_session', {
		user_id: user,
		token_hash: createHash('sha256').update(token).digest('hex'),
		expires_at: new Date(Date.now() + 3600000).toISOString(),
		created_at: now,
		updated_at: now
	});
	child = spawn(process.execPath, ['build/index.js'], {
		cwd: project,
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			NODE_ENV: 'production',
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: folder
		}
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
			/* Wait for QA server. */
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
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base },
		{ name: 'active-kelas-id', value: String(kelas), url: base }
	);
	const page = await browser.newPage(),
		errors = [];
	await page.setCacheEnabled(false);
	const settleAnimations = () =>
		page.waitForFunction(() =>
			document
				.getAnimations()
				.every(
					(animation) =>
						animation.playState !== 'running' ||
						animation.effect?.getComputedTiming().iterations === Infinity
				)
		);
	page.on('pageerror', (error) => errors.push(error.message));
	const url = `${base}/administrasi/absensi/kegiatan/rekap?kelas_id=${kelas}&tanggal_awal=${dateBefore(10)}&tanggal_akhir=${today}`;
	for (const width of [1440, 1280, 768, 390, 320]) {
		await page.setViewport({ width, height: 1000 });
		assert.equal(
			(await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 })).status(),
			200
		);
		await page.waitForSelector('[data-attendance-follow-up]');
		const metrics = await page.$eval('[data-attendance-follow-up]', (grid) => ({
			columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
			counts: [...grid.querySelectorAll(':scope > section')].map(
				(section) => section.querySelectorAll('[data-follow-up-alerts] button').length
			),
			aboveSummary: Boolean(
				grid.compareDocumentPosition(document.querySelector('.recap-summary')) &
				Node.DOCUMENT_POSITION_FOLLOWING
			),
			permitsIntegrated:
				grid.querySelector('section[aria-labelledby="follow-up-pulang"] [data-permit-records]')
					?.children.length === 2,
			permitActions: grid.querySelectorAll(
				'section[aria-labelledby="follow-up-pulang"] form[action*="markIzinReturned"]'
			).length,
			bodyFits: document.documentElement.scrollWidth <= innerWidth + 1,
			headerCounts: [...grid.querySelectorAll('header > .badge')].map((badge) =>
				badge.textContent.trim()
			)
		}));
		assert.deepEqual(metrics.counts, [2, 1, 1]);
		assert.deepEqual(metrics.headerCounts, ['2 murid', '2 murid', '1 murid']);
		assert.ok(metrics.aboveSummary && metrics.permitsIntegrated);
		assert.equal(metrics.permitActions, 2);
		assert.equal(metrics.columns, width >= 1280 ? 3 : 1);
		assert.ok(metrics.bodyFits, JSON.stringify({ width, metrics }));
		await page.$eval('[data-attendance-follow-up]', (grid) =>
			grid.scrollIntoView({ block: 'start' })
		);
		await page.evaluate(() => window.scrollBy(0, -85));
		await settleAnimations();
		await page.screenshot({ path: path.join(folder, `follow-up-${width}.png`) });
		await page.click('section[aria-labelledby="follow-up-sakit"] button');
		await page.waitForSelector('#attendance-follow-up-dialog[open] select');
		await page.waitForFunction(
			() =>
				getComputedStyle(document.querySelector('#attendance-follow-up-dialog .modal-box'))
					.opacity === '1'
		);
		assert.equal(
			await page.$eval('#attendance-follow-up-dialog [name=muridId]', (input) =>
				Number(input.value)
			),
			ids[0]
		);
		assert.ok(
			await page.$eval('#attendance-follow-up-dialog .modal-box', (box) => {
				const rect = box.getBoundingClientRect();
				return (
					rect.left >= 0 && rect.right <= innerWidth + 1 && box.scrollWidth <= box.clientWidth + 1
				);
			})
		);
		await page.screenshot({ path: path.join(folder, `dialog-${width}.png`) });
		await page.keyboard.press('Escape');
		await page.waitForSelector('#attendance-follow-up-dialog[open]', { hidden: true });
		await settleAnimations();
		assert.ok(
			await page.evaluate(() =>
				document.activeElement?.getAttribute('aria-label')?.startsWith('Tindak lanjut ')
			)
		);
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.$eval('[data-attendance-follow-up]', (grid) =>
		grid.scrollIntoView({ block: 'start' })
	);
	await page.evaluate(() => window.scrollBy(0, -85));
	await settleAnimations();
	await page.screenshot({ path: path.join(folder, 'follow-up-dark.png') });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	for (const [group, index] of [
		['sakit', 0],
		['pulang', 2],
		['alfa', 3]
	]) {
		const button = `section[aria-labelledby="follow-up-${group}"] button[aria-label^="Tindak lanjut ${names[index]}:"]`;
		await page.click(button);
		await page.waitForSelector('#attendance-follow-up-dialog[open] select');
		await page.select('#attendance-follow-up-dialog select', 'selesai');
		await page.type('#attendance-follow-up-dialog textarea', `Catatan QA ${group}`);
		if (group === 'sakit') {
			const start = await page.$eval(
				'#attendance-follow-up-dialog [name=periodeMulai]',
				(input) => {
					const value = input.value;
					input.value = '';
					return value;
				}
			);
			const rejected = page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('saveFollowUp')
			);
			await page.click('#attendance-follow-up-dialog button[type=submit]');
			const rejection = await (await rejected).json();
			assert.equal(rejection.type, 'failure', JSON.stringify(rejection));
			assert.equal(rejection.status, 400);
			assert.ok(await page.$('#attendance-follow-up-dialog[open]'));
			assert.equal(
				await page.$eval('#attendance-follow-up-dialog textarea', (input) => input.value),
				`Catatan QA ${group}`
			);
			await page.$eval(
				'#attendance-follow-up-dialog [name=periodeMulai]',
				(input, value) => {
					input.value = value;
				},
				start
			);
		}
		const submitted = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().includes('saveFollowUp')
		);
		await page.click('#attendance-follow-up-dialog button[type=submit]');
		assert.equal((await submitted).status(), 200);
		await page.waitForSelector('#attendance-follow-up-dialog[open]', { hidden: true });
		await page.waitForFunction(
			(group) =>
				document
					.querySelector(`section[aria-labelledby="follow-up-${group}"]`)
					.textContent.includes(`Catatan QA ${group}`),
			{},
			group
		);
		const saved = await row('SELECT status,catatan FROM tindak_lanjut_absensi WHERE murid_id=?', [
			ids[index]
		]);
		assert.equal(saved.status, 'selesai');
		assert.equal(saved.catatan, `Catatan QA ${group}`);
		await page.click(button);
		await page.waitForSelector('#attendance-follow-up-dialog[open] select');
		assert.equal(
			await page.$eval('#attendance-follow-up-dialog select', (select) => select.value),
			'selesai'
		);
		assert.equal(
			await page.$eval('#attendance-follow-up-dialog textarea', (input) => input.value),
			`Catatan QA ${group}`
		);
		await page.type('#attendance-follow-up-dialog textarea', ' BATAL');
		await page.keyboard.press('Escape');
		await page.waitForSelector('#attendance-follow-up-dialog[open]', { hidden: true });
		await page.click(button);
		await page.waitForSelector('#attendance-follow-up-dialog[open] textarea');
		assert.equal(
			await page.$eval('#attendance-follow-up-dialog textarea', (input) => input.value),
			`Catatan QA ${group}`
		);
		await page.keyboard.press('Escape');
		await page.waitForSelector('#attendance-follow-up-dialog[open]', { hidden: true });
	}
	assert.equal(page.url(), url, 'Saving keeps class and date filters.');
	await page.reload({ waitUntil: 'networkidle0' });
	assert.equal(
		await page.$$eval('[data-attendance-follow-up] .badge-success', (badges) => badges.length),
		3
	);
	await page.click('section[aria-labelledby="follow-up-pulang"] > div > button');
	await page.waitForSelector('dialog[open] select[name=muridId]');
	await settleAnimations();
	await page.screenshot({ path: path.join(folder, 'integrated-permit-dialog.png') });
	await page.keyboard.press('Escape');
	await settleAnimations();
	const returned = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().includes('markIzinReturned')
	);
	await page.click(
		`[data-permit-records] form:has(input[name=id][value="${currentPermit}"])[action*="markIzinReturned"] button`
	);
	assert.equal((await returned).status(), 200);
	await page.waitForFunction(() =>
		document.querySelector('[data-permit-records]').textContent.includes('Sudah Kembali')
	);
	assert.equal(
		(await row('SELECT tanggal_kembali FROM izin_pulang_murid WHERE id=?', [currentPermit]))
			.tanggal_kembali,
		today
	);
	assert.equal(page.url(), url, 'Returning a student keeps class and date filters.');
	await page.goto(`${base}/administrasi/absensi/kegiatan/rekap?kelas_id=all`, {
		waitUntil: 'networkidle0'
	});
	assert.ok(
		await page.$eval(
			'section[aria-labelledby="follow-up-pulang"] > div > button',
			(button) => button.disabled
		)
	);
	await page.goto(`${base}/administrasi/absensi/kegiatan/rekap?kelas_id=${emptyKelas}`, {
		waitUntil: 'networkidle0'
	});
	assert.equal(
		await page.$$eval('[data-attendance-follow-up] ul button', (buttons) => buttons.length),
		0
	);
	assert.deepEqual(
		await page.$$eval('[data-attendance-follow-up] header > .badge', (badges) =>
			badges.map((badge) => badge.textContent.trim())
		),
		['0 murid', '0 murid', '0 murid']
	);
	await page.$eval('[data-attendance-follow-up]', (grid) =>
		grid.scrollIntoView({ block: 'start' })
	);
	await page.screenshot({ path: path.join(folder, 'follow-up-empty.png') });
	assert.deepEqual(errors, []);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	console.log(
		'PASS follow-up above summary, permits/actions integrated in the middle column, unique-student counts, responsive/dark/empty layouts, modal save/reopen/cancel, return action, all-class restriction and persistent filters.'
	);
	console.log(`QA artifacts: ${folder}`);
} catch (error) {
	if (browser)
		await (
			await browser.pages()
		)
			.at(-1)
			?.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true })
			.catch(() => {});
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
