import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';

const port = 5183,
	base = `http://127.0.0.1:${port}`;
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp', 'scan-duplicate-popup-'));
const file = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	const available = await new Promise((resolve) => {
		const probe = createServer();
		probe.once('error', () => resolve(false));
		probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
	});
	assert.equal(available, true, 'Isolated QA port must be unused');
	await source.execute({ sql: 'VACUUM INTO ?', args: [file] });
} finally {
	source.close();
}
const db = createClient({ url: `file:${file}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const clone = (original, changes) => {
	const copy = { ...original, ...changes };
	delete copy.id;
	return copy;
};
async function insert(table, values) {
	const keys = Object.keys(values);
	return Number(
		(
			await db.execute({
				sql: `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
				args: Object.values(values)
			})
		).lastInsertRowid
	);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child,
	browser,
	output = '',
	page;
const errors = [],
	checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
try {
	const student = await row('SELECT * FROM murid LIMIT 1');
	const school = Number(student.sekolah_id),
		semester = Number(student.semester_id);
	const originalClass = await row('SELECT * FROM kelas WHERE id=?', [student.kelas_id]);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [originalClass.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [semester, originalClass.tahun_ajaran_id]
	});
	const kelas = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Popup Scan',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	const now = new Date().toISOString();
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
	const accounts = [];
	for (const name of ['A', 'B']) {
		const staff = await insert(
			'pegawai',
			clone(employee, {
				nama: `Guru ${name}`,
				nip: `QA-POPUP-${name}`,
				kode_pegawai: `QA-POPUP-${name}`,
				nik: null,
				nuptk: null,
				nomor_induk_pppk: null,
				dapodik_ptk_id: null,
				foto: null,
				jenis: 'guru',
				status: 'aktif'
			})
		);
		const id = await insert(
			'auth_user',
			clone(admin, {
				username: `qa-popup-guru-${name}`,
				username_normalized: `qa-popup-guru-${name.toLowerCase()}`,
				type: 'user',
				jabatan_akses: null,
				sekolah_id: school,
				kelas_id: kelas,
				pegawai_id: staff,
				mata_pelajaran_id: null,
				permissions: '[]',
				must_change_password: 0
			})
		);
		await insert('auth_user_kelas', {
			auth_user_id: id,
			kelas_id: kelas,
			created_at: now,
			updated_at: now
		});
		const token = randomBytes(32).toString('base64url');
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			expires_at: new Date(Date.now() + 1800000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts.push({
			id,
			token,
			cookie: `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${kelas}`
		});
	}
	const students = [],
		tokens = [];
	for (let index = 0; index < 3; index++) {
		const id = await insert(
			'murid',
			clone(student, {
				kelas_id: kelas,
				nama: `Murid Uji Popup ${index + 1}`,
				nis: `QA-POPUP-${index}`,
				nisn: `888888800${index}`,
				qr_token: randomBytes(12).toString('hex'),
				dapodik_peserta_didik_id: null,
				dapodik_anggota_rombel_id: null
			})
		);
		const token = `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
		await insert('qr_murid', {
			murid_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			token_version: 1,
			issued_at: now,
			created_at: now,
			updated_at: now
		});
		students.push(id);
		tokens.push(token);
	}
	const activities = [];
	for (let index = 0; index < 2; index++)
		activities.push(
			await insert('kegiatan_absensi', {
				sekolah_id: school,
				kode: `qa_popup_${index}`,
				nama: `Kegiatan Uji ${index + 1}`,
				kategori: 'sekolah',
				akses_edit: 'sekolah',
				aktif: 1,
				auto_alfa: 0,
				masuk_rapor: 0,
				urutan: 999 + index,
				created_at: now,
				updated_at: now
			})
		);
	child = spawn(process.execPath, ['build/index.js'], {
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			DB_URL: `file:${file}`,
			KAGANGA_DATA_DIR: path.join(folder, 'data'),
			NODE_ENV: 'production'
		}
	});
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let index = 0; index < 120; index++) {
		try {
			if ((await fetch(base + '/login')).status === 200) {
				ready = true;
				break;
			}
		} catch {
			/* Starting copied server. */
		}
		await delay(500);
	}
	assert.ok(ready, output);
	const scan = async (account, index, activity = activities[0]) => {
		const response = await fetch(base + '/api/administrasi/absensi/scan', {
			method: 'POST',
			headers: { cookie: account.cookie, origin: base, 'content-type': 'application/json' },
			body: JSON.stringify({
				token: tokens[index],
				mode: 'kegiatan',
				scanGroup: 'sekolah',
				kegiatanId: activity
			})
		});
		const payload = await response.json();
		assert.equal(response.status, 200, JSON.stringify(payload));
		return payload;
	};
	const first = await scan(accounts[0], 0);
	assert.equal(first.code, 'success');
	const duplicate = await scan(accounts[1], 0);
	assert.equal(duplicate.code, 'already_present');
	assert.match(duplicate.petugas.nama, /^Guru A(?: \(Guru Mapel\))?$/);
	assert.equal(duplicate.waktuScan, first.waktuScan);
	const concurrent = await Promise.all(
		Array.from({ length: 8 }, (_, i) => scan(accounts[i % 2], 1))
	);
	assert.equal(concurrent.filter((value) => value.code === 'success').length, 1);
	assert.equal(concurrent.filter((value) => value.code === 'already_present').length, 7);
	const saved = await row(
		'SELECT * FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=? AND tanggal=?',
		[students[0], activities[0], today]
	);
	pass('Guru B receives the original Guru A receipt; eight concurrent scans save one record');
	await insert('absensi_kegiatan', {
		sekolah_id: school,
		semester_id: semester,
		kelas_id: kelas,
		murid_id: students[2],
		kegiatan_id: activities[0],
		tanggal: today,
		status: 'sakit',
		metode: 'manual',
		petugas_user_id: accounts[0].id,
		created_at: now,
		updated_at: now
	});
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const context = await browser.createBrowserContext();
	page = await context.newPage();
	page.on('pageerror', (error) => errors.push(error.message));
	let scanRequests = 0;
	page.on('request', (request) => {
		if (
			request.method() === 'POST' &&
			new URL(request.url()).pathname === '/api/administrasi/absensi/scan'
		)
			scanRequests++;
	});
	await context.setCookie(
		...Object.entries({
			'rapkumer-session': accounts[1].token,
			'active-sekolah-id': String(school),
			'active-kelas-id': String(kelas)
		}).map(([name, value]) => ({ name, value, url: base }))
	);
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(base + '/administrasi/absensi/scan', { waitUntil: 'networkidle0' });
	await page.select('[aria-label="Mode scan"]', 'sekolah');
	await page.select('[aria-label="Kegiatan absensi"]', 'qa_popup_0');
	const qrImages = await Promise.all(
		tokens.map((token) => QRCode.toDataURL(token, { width: 480, margin: 4 }))
	);
	await page.evaluate(async (imageUrl) => {
		window.setScanImage = async (url) => {
			const image = new Image();
			image.src = url;
			await image.decode();
			window.scanImage = image;
		};
		await window.setScanImage(imageUrl);
		navigator.mediaDevices.getUserMedia = async () => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 480;
			const draw = () => canvas.getContext('2d').drawImage(window.scanImage, 0, 0);
			draw();
			window.setInterval(draw, 100);
			return canvas.captureStream(10);
		};
	}, qrImages[0]);
	await page.click('button[title="Mulai scan QR"]');
	await page.waitForSelector('dialog[open] [data-testid="duplicate-scan-notice"]', {
		timeout: 20000
	});
	const text = await page.$eval('dialog[open]', (el) => el.innerText);
	assert.match(text, /Sudah Dipindai/);
	assert.match(text, /Guru A/);
	assert.match(text, /Murid Uji Popup 1/);
	assert.match(text, /WIB/);
	const countAtPopup = scanRequests;
	await delay(4800);
	assert.equal(scanRequests, countAtPopup, 'Open popup must pause camera submissions');
	for (const width of [1440, 1024, 768, 390, 320]) {
		await page.setViewport({ width, height: width <= 390 ? 650 : 1000 });
		const measured = await page.$eval('dialog[open] .app-modal-box', (el) => {
			const r = el.getBoundingClientRect();
			return {
				x: r.x,
				right: r.right,
				y: r.y,
				bottom: r.bottom,
				width: r.width,
				overflow: el.scrollWidth > el.clientWidth + 1
			};
		});
		assert.ok(
			measured.x >= 0 &&
				measured.right <= width + 1 &&
				measured.y >= 0 &&
				measured.bottom <= (width <= 390 ? 650 : 1000) + 1
		);
		assert.equal(measured.overflow, false);
		const footer = await page.$eval('dialog[open] .app-modal-actions', (el) => {
			const r = el.getBoundingClientRect();
			return { top: r.top, bottom: r.bottom };
		});
		assert.ok(footer.top >= measured.y && footer.bottom <= measured.bottom + 1);
		await page.keyboard.press('Tab');
		assert.ok(
			await page.evaluate(
				() =>
					document.activeElement === document.body ||
					document.querySelector('dialog[open]').contains(document.activeElement)
			)
		);
		await page.screenshot({ path: path.join(folder, `popup-${width}.png`) });
	}
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.screenshot({ path: path.join(folder, 'popup-dark.png') });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	pass(
		'Real QR decoding on a second account opens responsive popup and pauses repeated camera requests'
	);
	await page.evaluate((image) => window.setScanImage(image), qrImages[2]);
	await page.keyboard.press('Escape');
	await page.waitForFunction(
		() => document.querySelector('dialog[open]')?.innerText.includes('Sudah Tercatat'),
		{ timeout: 12000 }
	);
	assert.match(await page.$eval('dialog[open]', (el) => el.innerText), /Sakit/);
	assert.match(await page.$eval('dialog[open]', (el) => el.innerText), /Tidak ada catatan scan/);
	await page.screenshot({ path: path.join(folder, 'popup-manual-sakit.png') });
	await page.$eval('dialog[open] .app-modal-actions button', (el) => el.click());
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((el) => el.textContent.trim() === 'Berhenti')
			.click()
	);
	await delay(600);
	assert.equal(await page.$('dialog[open]'), null, 'Acknowledged popup must stay closed');
	assert.equal(
		(
			await row(
				'SELECT status,waktu_scan FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?',
				[students[2], activities[0]]
			)
		).status,
		'sakit'
	);
	pass('Manual sick status is retained; Escape and continue close the popup without reopening it');
	await page.setViewport({ width: 1440, height: 1000 });
	await page.select('[aria-label="Kegiatan absensi"]', 'qa_popup_1');
	await page.evaluate((image) => window.setScanImage(image), qrImages[0]);
	const nextActivity = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			new URL(response.url()).pathname === '/api/administrasi/absensi/scan'
	);
	await page.click('button[title="Mulai scan QR"]');
	assert.equal((await (await nextActivity).json()).code, 'success');
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((el) => el.textContent.trim() === 'Berhenti')
			.click()
	);
	assert.equal(await page.$('dialog[open]'), null);
	assert.deepEqual(await row('SELECT * FROM absensi_kegiatan WHERE id=?', [saved.id]), saved);
	assert.equal(
		Number(
			(
				await row('SELECT count(*) n FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?', [
					students[0],
					activities[0]
				])
			).n
		),
		1
	);
	pass('Different activity remains available and original attendance row is unchanged');
	await page.evaluate(
		({ key, token, activity }) =>
			localStorage.setItem(
				key,
				JSON.stringify([
					{
						id: crypto.randomUUID(),
						token,
						mode: 'kegiatan',
						kegiatanId: String(activity),
						scanGroup: 'sekolah',
						status: null,
						capturedAt: new Date().toISOString()
					}
				])
			),
		{
			key: `kaganga-absensi-offline-v1:${school}:${accounts[1].id}`,
			token: tokens[0],
			activity: activities[0]
		}
	);
	await page.reload({ waitUntil: 'networkidle0' });
	await page.waitForSelector('dialog[open] [data-testid="duplicate-scan-notice"]');
	assert.match(await page.$eval('dialog[open]', (el) => el.innerText), /Guru A/);
	assert.equal(
		await page.evaluate(
			(key) => JSON.parse(localStorage.getItem(key)).length,
			`kaganga-absensi-offline-v1:${school}:${accounts[1].id}`
		),
		0
	);
	await page.keyboard.press('Escape');
	await delay(500);
	assert.equal(await page.$('dialog[open]'), null);
	assert.deepEqual(errors, []);
	pass('Offline queue duplicate is acknowledged on synchronization without adding another row');
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify({ status: 'PASS', checks, errors, scanRequests }, null, 2)
	);
	console.log(JSON.stringify({ status: 'PASS', folder, checks: checks.length }));
} catch (error) {
	console.error(error);
	if (page && error.name !== 'TimeoutError')
		await Promise.race([
			page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {}),
			delay(3000)
		]);
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const exited = once(child, 'exit');
		child.kill();
		await exited;
	}
	db.close();
	await writeFile(path.join(folder, 'server.log'), output);
}
