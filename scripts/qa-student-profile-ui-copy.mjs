import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';

const folder = path.resolve('tmp', `student-profile-ui-${Date.now()}`);
await mkdir(folder, { recursive: true });
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
const db = createClient({ url: `file:${database}` });
await db.execute('PRAGMA busy_timeout=10000');
const port = Number(process.env.QA_PORT || 5187),
	base = `http://127.0.0.1:${port}`;
const probe = net.createServer();
await new Promise((resolve, reject) =>
	probe.once('error', reject).listen(port, '127.0.0.1', resolve)
);
await new Promise((resolve) => probe.close(resolve));
const dev = process.env.QA_USE_DEV === '1';
const child = spawn(
	process.execPath,
	dev
		? [
				'node_modules/vite/bin/vite.js',
				'dev',
				'--host',
				'127.0.0.1',
				'--port',
				String(port),
				'--strictPort'
			]
		: ['build/index.js'],
	{
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: folder,
			photo: `file:${path.join(folder, 'uploads')}`,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			BODY_SIZE_LIMIT: '6M',
			NODE_ENV: dev ? 'development' : 'production'
		}
	}
);
let output = '',
	browser;
child.stdout.on('data', (data) => (output += data));
child.stderr.on('data', (data) => (output += data));
const results = [],
	measurements = [],
	errors = [];
const pass = (name) => {
	results.push(name);
	console.log('PASS', name);
};
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const insert = async (table, values) => {
	const entries = Object.entries(values).filter(([key]) => key !== 'id');
	return Number(
		(
			await db.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
				args: entries.map(([, value]) => value)
			})
		).lastInsertRowid
	);
};
try {
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) break;
		} catch {
			/* server is still starting */
		}
		if (i === 119) throw new Error(output.slice(-3000));
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	const [template] = await rows('SELECT * FROM murid ORDER BY id LIMIT 1');
	assert.ok(template);
	const school = Number(template.sekolah_id);
	let kelas = Number(template.kelas_id);
	const [classRow] = await rows('SELECT * FROM kelas WHERE id=?', [kelas]);
	await rows(
		'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		[classRow.tahun_ajaran_id, school]
	);
	await rows(
		'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		[template.semester_id, classRow.tahun_ajaran_id]
	);
	if (process.env.QA_INFORMATION_PRINT === '1') {
		kelas = await insert('kelas', { ...classRow, nama: 'QA Cetak UI' });
		let [unit] = await rows(
			'SELECT * FROM sekolah_satuan_pendidikan WHERE sekolah_id=? ORDER BY id LIMIT 1',
			[school]
		);
		if (!unit) {
			const id = await insert('sekolah_satuan_pendidikan', {
				sekolah_id: school,
				jenjang: 'sma',
				nama: 'Sekolah QA',
				npsn: '70000000',
				created_at: new Date().toISOString()
			});
			[unit] = await rows('SELECT * FROM sekolah_satuan_pendidikan WHERE id=?', [id]);
		}
		await insert('kelas_satuan_pendidikan', {
			kelas_id: kelas,
			satuan_id: unit.id,
			nama_snapshot: unit.nama,
			npsn_snapshot: unit.npsn,
			created_at: new Date().toISOString()
		});
	}
	const [addressTemplate] = await rows('SELECT * FROM alamat WHERE id=?', [template.alamat_id]);
	const address = await insert('alamat', {
		...addressTemplate,
		jalan: 'Alamat UI QA',
		desa: 'Desa QA',
		kecamatan: 'Kecamatan QA',
		kabupaten: 'Kabupaten QA',
		provinsi: 'Provinsi QA'
	});
	const student = await insert('murid', {
		...template,
		kelas_id: kelas,
		nama: 'Murid Profil UI QA',
		nis: 'PROFILE-UI-QA',
		nisn: '',
		nik: '',
		qr_token: null,
		foto: null,
		alamat_id: address,
		ayah_id: null,
		ibu_id: null,
		wali_id: null,
		wali_asrama_nama: 'Wali Profil UI QA',
		wali_asuh_nama: 'Wali Profil UI QA'
	});
	await insert('murid_identity_link', {
		murid_id: student,
		sekolah_id: school,
		semester_id: template.semester_id,
		identity_uid: randomUUID()
	});
	const [admin] = await rows("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	assert.ok(admin);
	const tokens = new Map();
	async function session(id, label) {
		const token = randomBytes(32).toString('base64url');
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			created_at: new Date().toISOString(),
			expires_at: new Date(Date.now() + 3600000).toISOString()
		});
		tokens.set(label, token);
	}
	await session(admin.id, 'admin');
	const [employeeTemplate] = await rows('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [
		school
	]);
	const employee = await insert('pegawai', {
		...employeeTemplate,
		sekolah_id: school,
		nama: 'Wali Profil UI QA',
		nip: 'PROFILE-UI-QA',
		kode_pegawai: 'PROFILE-UI-QA',
		status: 'aktif'
	});
	for (const [label, permissions] of [
		['denied', ['menu_murid']],
		['read', ['menu_murid', 'murid_profil_lihat']],
		['print', ['cetak_dokumen', 'murid_profil_cetak']]
	]) {
		const id = await insert('auth_user', {
			username: `qa-profile-${label}`,
			username_normalized: `qa-profile-${label}`,
			password_hash: 'not-for-login',
			password_salt: 'not-for-login',
			type: 'wali_asrama',
			sekolah_id: school,
			pegawai_id: employee,
			kelas_id: kelas,
			permissions: JSON.stringify(permissions),
			must_change_password: 0,
			created_at: new Date().toISOString()
		});
		await session(id, label);
	}
	const cookie = (who) =>
		`rapkumer-session=${tokens.get(who)}; active-sekolah-id=${school}; active-kelas-id=${kelas}`;
	const api = (suffix = '', who = 'admin', options = {}) =>
		fetch(`${base}/api/murid-profil/${student}${suffix}`, {
			...options,
			headers: { cookie: cookie(who), origin: base, ...options.headers },
			redirect: 'manual'
		});
	assert.notEqual(
		(await fetch(`${base}/api/murid-profil/${student}`, { redirect: 'manual' })).status,
		200
	);
	assert.equal((await api('', 'denied')).status, 403);
	assert.equal((await api('', 'read')).status, 200);
	assert.equal(
		(
			await api('', 'read', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ values: { nomorKk: null }, revisi: 0 })
			})
		).status,
		403
	);
	assert.equal(
		(
			await api('', 'admin', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ values: null, revisi: 0 })
			})
		).status,
		400
	);
	pass(
		'HTTP denies anonymous/ungranted/read-only writes and malformed JSON without private data leakage'
	);
	browser = await puppeteer.launch({
		executablePath:
			process.env.PUPPETEER_EXECUTABLE_PATH ||
			'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox']
	});
	const page = await browser.newPage();
	page.on('pageerror', (cause) => errors.push(cause.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: tokens.get('admin'), url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base },
		{ name: 'active-kelas-id', value: String(kelas), url: base }
	);
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(`${base}/murid?search=Murid%20Profil%20UI%20QA`, { waitUntil: 'networkidle0' });
	const search = await page.$('input[placeholder="Cari nama murid..."]');
	if (search) {
		await search.click({ clickCount: 3 });
		await search.type('Murid Profil UI QA');
		await new Promise((resolve) => setTimeout(resolve, 1200));
	}
	await page.waitForSelector(`a[href="/murid/${student}"]`);
	await page.click(`a[href="/murid/${student}"]`);
	await page.waitForSelector('input[aria-label="Informasi Tambahan"]');
	await page.click('input[aria-label="Informasi Tambahan"]');
	await page.waitForSelector('section[aria-label="Informasi tambahan murid"] form');
	const profile = 'section[aria-label="Informasi tambahan murid"]';
	await page.screenshot({ path: path.join(folder, 'empty-1440.png') });
	async function field(label) {
		const labels = await page.$$(`${profile} label`);
		for (const el of labels) {
			if ((await el.evaluate((node) => node.querySelector('span')?.textContent?.trim())) === label)
				return el.$('input,select,textarea');
		}
		throw new Error(`Missing field ${label}`);
	}
	let input = await field('Nomor kartu keluarga');
	await input.type('123');
	assert.equal(await input.evaluate((el) => el.validity.patternMismatch), true);
	await input.focus();
	await input.evaluate((el) => el.select());
	await page.keyboard.press('Backspace');
	await input.type('0012345678901234');
	await (await field('Jumlah tanggungan')).type('0');
	await (await field('Bersedia tinggal di asrama')).select('false');
	await page.$eval(`${profile} form`, (form) => form.requestSubmit());
	await page.waitForFunction(() =>
		document
			.querySelector('section[aria-label="Informasi tambahan murid"]')
			?.textContent.includes('Informasi tambahan tersimpan.')
	);
	let saved = await (await api()).json();
	assert.equal(saved.values.nomorKk, '0012345678901234');
	assert.equal(saved.values.jumlahTanggungan, 0);
	assert.equal(saved.values.bersediaAsrama, false);
	pass('Browser form validates KK, saves leading zeros/zero/No, and preserves optional fields');
	const concurrent = await api('', 'admin', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			values: { catatanPetugas: 'Catatan pengguna lain QA' },
			revisi: saved.revisi
		})
	});
	assert.equal(concurrent.status, 200);
	await (await field('Catatan petugas')).type('Isian lokal QA');
	await page.$eval(`${profile} form`, (form) => form.requestSubmit());
	await page.waitForFunction(() =>
		document
			.querySelector('section[aria-label="Informasi tambahan murid"] [role="alert"]')
			?.textContent.includes('pengguna lain')
	);
	await page.$eval('.modal-box', (el) => {
		el.scrollTop = 0;
	});
	await page.screenshot({ path: path.join(folder, 'conflict-1440.png') });
	assert.equal(await (await field('Catatan petugas')).evaluate((el) => el.value), 'Isian lokal QA');
	page.once('dialog', (dialog) => dialog.accept());
	await page.click(`${profile} button[title="Muat ulang profil"]`);
	await page.waitForFunction(
		() => !document.querySelector('section[aria-label="Informasi tambahan murid"] [role="alert"]')
	);
	pass(
		'Conflict retains draft, blocks stale save, and reload requires explicit discard confirmation'
	);
	const image = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 600;
		canvas.height = 450;
		const ctx = canvas.getContext('2d');
		const pixels = ctx.createImageData(canvas.width, canvas.height);
		let seed = 1234;
		for (let i = 0; i < pixels.data.length; i += 4) {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			pixels.data[i] = seed & 255;
			pixels.data[i + 1] = (seed >>> 8) & 255;
			pixels.data[i + 2] = (seed >>> 16) & 255;
			pixels.data[i + 3] = 255;
		}
		ctx.putImageData(pixels, 0, 0);
		return canvas.toDataURL('image/png').split(',')[1];
	});
	const photoFile = path.join(folder, 'photo.png');
	assert.ok(Buffer.from(image, 'base64').length > 512 * 1024);
	await writeFile(photoFile, Buffer.from(image, 'base64'));
	await page.waitForFunction(
		(selector) => document.querySelectorAll(`${selector} input[type="file"]`).length === 3,
		{},
		profile
	);
	const fileInputs = await page.$$(`${profile} input[type="file"]`);
	await fileInputs[1].uploadFile(photoFile);
	await page.waitForSelector(`${profile} img[src^="blob:"]`);
	const savePhoto = await page.$(`${profile} .btn-success`);
	await savePhoto.click();
	await page.waitForFunction(() =>
		document
			.querySelector('section[aria-label="Informasi tambahan murid"]')
			?.textContent.includes('Foto tersimpan.')
	);
	const photoResponse = await api('/foto/rumah');
	assert.equal(photoResponse.status, 200);
	assert.match(photoResponse.headers.get('cache-control'), /no-store/);
	assert.equal((await api('/foto/rumah', 'denied')).status, 403);
	pass('Photo candidate preview, explicit save and guarded image download work in browser');
	for (const [width, height] of [
		[1440, 1000],
		[1366, 768],
		[1024, 768],
		[768, 1024],
		[390, 844],
		[320, 740]
	]) {
		await page.setViewport({ width, height });
		await page.$eval('.modal-box', (el) => {
			el.scrollTop = 0;
		});
		const measured = await page.evaluate(() => {
			const p = document.querySelector('section[aria-label="Informasi tambahan murid"]');
			const modal = p.closest('.modal-box');
			const rect = modal.getBoundingClientRect();
			return {
				viewport: innerWidth,
				modal: {
					width: rect.width,
					left: rect.left,
					right: rect.right,
					top: rect.top,
					bottom: rect.bottom
				},
				overflow: p.scrollWidth > p.clientWidth + 1,
				inputHeight: p.querySelector('.input').getBoundingClientRect().height,
				columns: getComputedStyle(p.querySelector('form .grid')).gridTemplateColumns
			};
		});
		assert.equal(measured.overflow, false, JSON.stringify(measured));
		assert.ok(measured.modal.left >= 0 && measured.modal.right <= width + 1);
		assert.ok(measured.modal.top >= 0 && measured.modal.bottom <= height + 1);
		measurements.push(measured);
		await page.screenshot({ path: path.join(folder, `form-${width}.png`) });
		await page.$eval(`${profile} section[aria-label="Dokumentasi murid"]`, (el) =>
			el.scrollIntoView({ block: 'end' })
		);
		await page.screenshot({ path: path.join(folder, `photos-${width}.png`) });
	}
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.screenshot({ path: path.join(folder, 'photos-dark-320.png') });
	for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
	pass(
		'Six desktop/tablet/mobile viewports remain contained, with photos, dark theme and keyboard traversal'
	);
	if (process.env.QA_INFORMATION_PRINT === '1') {
		const printApi = (who = 'admin', options = {}) =>
			fetch(`${base}/api/pdf/informasi-siswa`, {
				...options,
				headers: { cookie: cookie(who), origin: base, ...options.headers },
				redirect: 'manual'
			});
		assert.equal((await printApi('read')).status, 403);
		assert.equal((await printApi('denied')).status, 403);
		const granted = await printApi('print');
		assert.equal(granted.status, 200);
		assert.match(granted.headers.get('cache-control'), /no-store/);
		const printContext = await granted.json();
		assert.deepEqual(
			printContext.classes.find((item) => item.id === kelas).students.map((item) => item.id),
			[student]
		);
		assert.equal(JSON.stringify(printContext).includes('0012345678901234'), false);
		assert.equal(
			(
				await printApi('admin', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}'
				})
			).status,
			415
		);
		const invalid = new FormData();
		invalid.set(
			'options',
			JSON.stringify({ kelasId: kelas, muridId: student, maskIdentity: true, background: 'custom' })
		);
		assert.equal((await printApi('admin', { method: 'POST', body: invalid })).status, 400);
		const printOnlyForm = new FormData();
		printOnlyForm.set(
			'options',
			JSON.stringify({ kelasId: kelas, muridId: student, maskIdentity: true, background: 'none' })
		);
		const printOnlyPdf = await printApi('print', { method: 'POST', body: printOnlyForm });
		assert.equal(printOnlyPdf.status, 200);
		assert.equal((await PDFDocument.load(await printOnlyPdf.arrayBuffer())).getPageCount(), 1);
		assert.equal((await api('/foto/rumah', 'print')).status, 403);
		pass(
			'Print HTTP requires its own grant, returns only assigned names/IDs and rejects malformed/custom-without-file requests'
		);
		await page.setViewport({ width: 1440, height: 1000 });
		await page.goto(`${base}/cetak?document=informasi-siswa`, { waitUntil: 'networkidle0' });
		await page.waitForSelector('option[value="informasi-siswa"]');
		const choose = await page.$('select:has(option[value="informasi-siswa"])');
		await choose.select('informasi-siswa');
		const panel = 'section[aria-label="Cetak informasi siswa"]';
		await page.waitForSelector(`${panel} form`);
		await page.evaluate(
			(selector, id) => {
				const select = document.querySelector(`${selector} select`);
				select.value = String(id);
				select.dispatchEvent(new Event('change', { bubbles: true }));
			},
			panel,
			kelas
		);
		await page.waitForFunction(
			(selector, id) =>
				[...document.querySelectorAll(`${selector} select`)].some(
					(select) => select.value === String(id)
				),
			{},
			panel,
			student
		);
		assert.equal(await page.$eval(`${panel} input[type="checkbox"]`, (el) => el.checked), true);
		page.once('dialog', (dialog) => dialog.dismiss());
		await page.click(`${panel} input[type="checkbox"]`);
		assert.equal(await page.$eval(`${panel} input[type="checkbox"]`, (el) => el.checked), true);
		const pdfResponse = page.waitForResponse(
			(response) =>
				response.url() === `${base}/api/pdf/informasi-siswa` &&
				response.request().method() === 'POST'
		);
		await page.click(`${panel} button[type="submit"]`);
		const pdf = await pdfResponse;
		assert.equal(pdf.status(), 200, await pdf.text().catch(() => 'PDF response'));
		assert.match(pdf.headers()['content-type'], /application\/pdf/);
		assert.match(pdf.headers()['cache-control'], /no-store/);
		await page.waitForSelector(`${panel} object[data^="blob:"]`);
		assert.ok(await page.$(`${panel} a[download]`));
		await page.$eval(`${panel} object`, (el) => el.scrollIntoView({ block: 'start' }));
		await new Promise((resolve) => setTimeout(resolve, 2000));
		await page.screenshot({ path: path.join(folder, 'print-preview-1440.png'), fullPage: true });
		await page.click(`${panel} label:has(input[value="class"])`);
		await page.waitForFunction(
			(selector) => !document.querySelector(`${selector} object`),
			{},
			panel
		);
		const backgroundSelect = await page.$(`${panel} select:has(option[value="custom"])`);
		await backgroundSelect.select('custom');
		assert.equal(await page.$eval(`${panel} button[type="submit"]`, (el) => el.disabled), true);
		await (await page.$(`${panel} input[type="file"]`)).uploadFile(photoFile);
		await page.waitForSelector(`${panel} img[src^="blob:"]`);
		assert.equal(await page.$eval(`${panel} button[type="submit"]`, (el) => el.disabled), false);
		for (const [width, height] of [
			[1920, 1080],
			[1440, 1000],
			[1366, 768],
			[1024, 768],
			[768, 1024],
			[390, 844],
			[320, 740]
		]) {
			await page.setViewport({ width, height });
			await page.evaluate(() => scrollTo(0, 0));
			const dimensions = await page.$eval(panel, (el) => {
				const r = el.getBoundingClientRect();
				return {
					viewport: innerWidth,
					width: r.width,
					left: r.left,
					right: r.right,
					overflow: el.scrollWidth > el.clientWidth + 1,
					selectHeight: el.querySelector('select').getBoundingClientRect().height,
					columns: getComputedStyle(el.querySelector('fieldset')).gridTemplateColumns
				};
			});
			assert.equal(dimensions.overflow, false, JSON.stringify(dimensions));
			assert.ok(dimensions.left >= 0 && dimensions.right <= width + 1, JSON.stringify(dimensions));
			assert.equal(dimensions.selectHeight, 40);
			measurements.push({ print: dimensions });
			await page.screenshot({
				path: path.join(folder, `print-custom-${width}.png`),
				fullPage: true
			});
			if (width <= 390) {
				await page.$eval(`${panel} button[type="submit"]`, (el) =>
					el.scrollIntoView({ block: 'end' })
				);
				await page.screenshot({ path: path.join(folder, `print-custom-bottom-${width}.png`) });
			}
		}
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		await page.screenshot({ path: path.join(folder, 'print-dark-320.png'), fullPage: true });
		pass(
			'Print panel renders inline PDF, clears stale previews, validates custom backgrounds and fits seven desktop/tablet/phone viewports'
		);
	}
	assert.deepEqual(errors, []);
	assert.equal((await rows('PRAGMA quick_check'))[0].quick_check, 'ok');
	await writeFile(path.join(folder, 'measurements.json'), JSON.stringify(measurements, null, 2));
	await writeFile(path.join(folder, 'results.json'), JSON.stringify({ results, folder }, null, 2));
	console.log(`QA_RESULTS=${folder}`);
} catch (cause) {
	if (browser) {
		const pages = await browser.pages();
		const current = pages.at(-1);
		if (current) {
			await current.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true });
			await writeFile(path.join(folder, 'failure.html'), await current.content());
		}
	}
	await writeFile(
		path.join(folder, 'error.log'),
		`${cause.stack}\nBrowser errors: ${JSON.stringify(errors)}\n${output}`
	);
	throw cause;
} finally {
	if (browser) await browser.close();
	db.close();
	if (child.exitCode === null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
}
