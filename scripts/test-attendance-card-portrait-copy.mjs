import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { homedir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { renderKartuAbsensiSheetHTML } from '../src/lib/server/pdf/templates/kartu-absensi.ts';

const { PNG } = createRequire(import.meta.resolve('qrcode'))('pngjs');
const { MultiFormatReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = createRequire(
	import.meta.resolve('@zxing/browser')
)('@zxing/library');
const project = process.cwd();
const port = Number(process.env.ATTENDANCE_CARD_QA_PORT || 5158);
assert.ok(![1206, 5152].includes(port));
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'attendance-card-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
const secret = 'attendance-card-isolated-qa';
let child,
	browser,
	output = '';
try {
	const original = (await db.execute('SELECT * FROM murid ORDER BY id LIMIT 1')).rows[0];
	assert.ok(original);
	const school = Number(original.sekolah_id),
		kelas = Number(original.kelas_id);
	const classRow = (await db.execute({ sql: 'SELECT * FROM kelas WHERE id=?', args: [kelas] }))
		.rows[0];
	await db.execute({
		sql: "UPDATE sekolah SET nama='Sekolah Rakyat Menengah Atas Provinsi Bengkulu',jenjang_pendidikan='srma',jenjang_variant=NULL WHERE id=?",
		args: [school]
	});
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [classRow.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [original.semester_id, classRow.tahun_ajaran_id]
	});
	const ids = [];
	for (let index = 1; index <= 9; index++) {
		const values = { ...original };
		delete values.id;
		Object.assign(values, {
			nama: index === 1 ? 'Muhammad Abdurrahman Pratama Wijaya Kusuma' : `Murid Uji ${index}`,
			nis: `QA-QR-${index}`,
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
	const issuedAt = new Date().toISOString();
	const tokens = new Map();
	const students = (
		await db.execute({ sql: 'SELECT id FROM murid WHERE kelas_id=?', args: [kelas] })
	).rows;
	for (const student of students) {
		const id = Number(student.id),
			payload = `${id}.1.${issuedAt}`;
		const token = `rapkumer-absensi:v2:${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
		tokens.set(id, token);
		await db.execute({ sql: 'DELETE FROM qr_murid WHERE murid_id=?', args: [id] });
		await db.execute({
			sql: 'INSERT INTO qr_murid(murid_id,token_hash,token_version,issued_at,created_at,updated_at) VALUES(?,?,1,?,?,?)',
			args: [id, createHash('sha256').update(token).digest('hex'), issuedAt, issuedAt, issuedAt]
		});
	}
	const qrBefore = (await db.execute('SELECT * FROM qr_murid ORDER BY id')).rows;
	const admin = (await db.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0];
	await db.execute({
		sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
		args: [school, admin.id]
	});
	const session = randomBytes(32).toString('base64url');
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(session).digest('hex'),
			'Portrait card QA',
			'127.0.0.1',
			new Date(Date.now() + 900000).toISOString(),
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
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: folder,
			RAPKUMER_QR_SECRET: secret,
			NODE_ENV: 'production'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let attempt = 0; attempt < 80; attempt++) {
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
	const cookie = `rapkumer-session=${session}; active-sekolah-id=${school}; active-kelas-id=${kelas}`;
	async function post(endpoint, body) {
		return fetch(`${base}${endpoint}`, {
			method: 'POST',
			headers: { cookie, Origin: base, 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	}
	const cards = [];
	for (const id of ids) {
		const response = await fetch(
			`${base}/cetak/kartu-absensi.json?murid_id=${id}&kartu_layout=qr-only`,
			{ headers: { cookie } }
		);
		assert.equal(response.status, 200, await response.clone().text());
		const card = (await response.json()).kartuAbsensiData;
		assert.equal(card.kelas.jenjang, 'srma');
		assert.equal(card.layout, 'qr-only');
		cards.push(card);
	}
	for (const [layout, count, pages] of [
		['qr-only', 1, 1],
		['qr-only', 4, 1],
		['qr-only', 5, 2],
		['qr-only', 9, 3],
		['photo-qr', 9, 2],
		['duplex', 9, 4]
	]) {
		const response = await post('/api/pdf/bulk', {
			docType: 'kartu-absensi',
			muridIds: ids.slice(0, count),
			kelasId: kelas,
			kartuLayout: layout
		});
		assert.equal(response.status, 200, await response.clone().text());
		const bytes = Buffer.from(await response.arrayBuffer());
		const pdf = await PDFDocument.load(bytes);
		assert.equal(pdf.getPageCount(), pages, `${layout} ${count}`);
		for (const page of pdf.getPages()) {
			assert.ok(Math.abs((page.getWidth() * 25.4) / 72 - 210) < 0.2);
			assert.ok(Math.abs((page.getHeight() * 25.4) / 72 - 297) < 0.2);
		}
		await writeFile(path.join(folder, `${layout}-${count}.pdf`), bytes);
	}
	const singleTokenResponse = await post('/api/pdf/token', {
		docType: 'kartu-absensi',
		muridId: ids[0],
		kelasId: kelas,
		kartuLayout: 'qr-only'
	});
	assert.equal(singleTokenResponse.status, 200, await singleTokenResponse.clone().text());
	const singleToken = await singleTokenResponse.json();
	const singlePdf = await fetch(`${base}/cetak/pdf/${singleToken.slug}/${singleToken.token}`, {
		headers: { cookie }
	});
	assert.equal(singlePdf.status, 200);
	assert.match(singlePdf.headers.get('content-disposition'), /inline/);
	assert.equal((await PDFDocument.load(await singlePdf.arrayBuffer())).getPageCount(), 1);
	const executablePath = [
		process.env.PUPPETEER_EXECUTABLE_PATH,
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
	]
		.filter(Boolean)
		.find(existsSync);
	browser = await puppeteer.launch({ executablePath, headless: true });
	const page = await browser.newPage();
	await page.setContent(renderKartuAbsensiSheetHTML(cards.slice(0, 4)), { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready);
	const cardMetrics = await page.$$eval('.portrait-card', (elements) =>
		elements.map((card) => {
			const rect = card.getBoundingClientRect();
			return {
				width: rect.width,
				height: rect.height,
				images: [...card.querySelectorAll('img')].every(
					(img) => img.complete && img.naturalWidth > 0
				),
				textFits: [...card.querySelectorAll('.portrait-school,.portrait-name')].every(
					(el) => el.scrollHeight <= el.clientHeight + 1
				)
			};
		})
	);
	for (const metrics of cardMetrics) {
		assert.ok(Math.abs((metrics.width * 25.4) / 96 - 94) < 0.1);
		assert.ok(Math.abs((metrics.height * 25.4) / 96 - 123) < 0.1);
		assert.ok(metrics.images && metrics.textFits, JSON.stringify(metrics));
	}
	await page.setViewport({ width: 820, height: 1160 });
	await page.screenshot({ path: path.join(folder, 'portrait-sheet.png'), fullPage: true });
	await browser.setCookie(
		{ name: 'rapkumer-session', value: session, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base },
		{ name: 'active-kelas-id', value: String(kelas), url: base }
	);
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	for (const width of [1366, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(`${base}/cetak?dokumen=kartu-absensi`, { waitUntil: 'networkidle0' });
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find((button) => button.textContent.trim() === 'QR Saja')
				.click()
		);
		await page.waitForFunction(() => document.body.textContent.includes('94 × 123 mm'));
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
			`UI overflow ${width}`
		);
		await page.screenshot({ path: path.join(folder, `ui-${width}.png`), fullPage: true });
	}
	await page.select('select[title="Pilih murid yang ingin dipreview dokumennya"]', String(ids[0]));
	await page.waitForFunction(() =>
		[...document.querySelectorAll('button')].some(
			(button) => button.textContent.trim() === 'Preview' && !button.disabled
		)
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((button) => button.textContent.trim() === 'Preview')
			.click()
	);
	await page.waitForSelector('object[type="application/pdf"]');
	async function previewPageCount() {
		const bytes = await page.$eval('object[type="application/pdf"]', async (object) =>
			Array.from(new Uint8Array(await (await fetch(object.data)).arrayBuffer()))
		);
		return (await PDFDocument.load(Uint8Array.from(bytes))).getPageCount();
	}
	assert.equal(await previewPageCount(), 1);
	const previousPreview = await page.$eval(
		'object[type="application/pdf"]',
		(object) => object.data
	);
	const bulkResponse = page.waitForResponse((response) => response.url().endsWith('/api/pdf/bulk'));
	const visibleStudentCount = await page.$eval(
		'select[title="Pilih murid yang ingin dipreview dokumennya"]',
		(select) => select.options.length - 1
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((button) => button.textContent.trim() === 'Semua Murid (A4)')
			.click()
	);
	assert.equal((await bulkResponse).status(), 200);
	await page.waitForFunction(
		(previous) => document.querySelector('object[type="application/pdf"]')?.data !== previous,
		{},
		previousPreview
	);
	assert.equal(await previewPageCount(), Math.ceil(visibleStudentCount / 4));
	assert.equal((await browser.pages()).length, 2, 'Preview must not open another browser tab');
	assert.deepEqual(errors, []);
	assert.deepEqual(
		(await db.execute('SELECT * FROM qr_murid ORDER BY id')).rows,
		qrBefore,
		'Printing must not replace active QR tokens'
	);
	const poppler =
		process.env.PDFTOPPM_PATH ||
		path.join(
			homedir(),
			'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
		);
	assert.ok(existsSync(poppler), 'Set PDFTOPPM_PATH for raster PDF/QR verification');
	execFileSync(
		poppler,
		['-r', '150', '-png', path.join(folder, 'qr-only-9.pdf'), path.join(folder, 'render')],
		{ windowsHide: true }
	);
	const mm = (value) => Math.round((value * 150) / 25.4);
	for (let index = 0; index < ids.length; index++) {
		const png = PNG.sync.read(
			await readFile(path.join(folder, `render-${Math.floor(index / 4) + 1}.png`))
		);
		const slot = index % 4,
			left = mm(8 + (slot % 2) * 100 + 25),
			top = mm(9 + Math.floor(slot / 2) * 130 + 38),
			size = mm(44);
		const luminance = new Uint8ClampedArray(size * size);
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) {
				const source = ((top + y) * png.width + left + x) * 4;
				luminance[y * size + x] =
					(png.data[source] + 2 * png.data[source + 1] + png.data[source + 2]) / 4;
			}
		const bitmap = new BinaryBitmap(
			new HybridBinarizer(new RGBLuminanceSource(luminance, size, size))
		);
		assert.equal(
			new MultiFormatReader().decode(bitmap).getText(),
			tokens.get(ids[index]),
			`Rendered QR ${index + 1}`
		);
	}
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	await writeFile(path.join(folder, 'server.log'), output);
	console.log(
		'PASS 94x123mm cards, A4 1/4/5/9 pagination, single PDF token, photo/duplex regression, loaded assets, long names, desktop/tablet/mobile UI, 9 rasterized QR tokens and unchanged active QR records.'
	);
	console.log('QA artifacts:', folder);
} catch (error) {
	if (browser) {
		const pages = await browser.pages();
		const failedPage = pages.at(-1);
		if (failedPage) {
			await failedPage.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true });
			await writeFile(path.join(folder, 'failure.html'), await failedPage.content());
		}
	}
	console.error(output.slice(-6000));
	console.error('QA artifacts:', folder);
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const ended = once(child, 'exit');
		if (process.platform === 'win32')
			execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
		else child.kill();
		await ended;
	}
	db.close();
}
