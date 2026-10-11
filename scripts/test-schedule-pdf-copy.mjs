import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';

const port = Number(process.env.SCHEDULE_PDF_QA_PORT || 5162);
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535 && ![1206, 5152].includes(port));
const available = await new Promise((resolve) => {
	const probe = net.connect(port, '127.0.0.1');
	probe.on('connect', () => {
		probe.destroy();
		resolve(false);
	});
	probe.on('error', () => {
		probe.destroy();
		resolve(true);
	});
});
assert.ok(available, 'QA port is already in use.');
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.join(process.cwd(), 'tmp', 'schedule-pdf-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
const results = [];
let child,
	browser,
	output = '';
try {
	const school = (
		await db.execute(
			"SELECT id,nama FROM sekolah WHERE jenjang_pendidikan='srt' ORDER BY id LIMIT 1"
		)
	).rows[0];
	assert.ok(school);
	const schoolId = Number(school.id);
	const year = (
		await db.execute({
			sql: 'SELECT id FROM tahun_ajaran WHERE sekolah_id=? AND is_aktif=1 LIMIT 1',
			args: [schoolId]
		})
	).rows[0];
	const kelas = (
		await db.execute({
			sql: 'SELECT id FROM kelas WHERE sekolah_id=? AND tahun_ajaran_id=? LIMIT 1',
			args: [schoolId, year.id]
		})
	).rows[0];
	const signer = (
		await db.execute({
			sql: "SELECT id FROM pegawai WHERE sekolah_id=? AND jenis='guru' AND status='aktif' LIMIT 1",
			args: [schoolId]
		})
	).rows[0];
	const units = (
		await db.execute({
			sql: 'SELECT id,jenjang,nama FROM sekolah_satuan_pendidikan WHERE sekolah_id=?',
			args: [schoolId]
		})
	).rows;
	const cookies = {};
	for (const role of ['admin', 'waka']) {
		const user = (
			await db.execute(
				role === 'admin'
					? "SELECT id FROM auth_user WHERE type='admin' LIMIT 1"
					: "SELECT id FROM auth_user WHERE jabatan_akses='waka_kurikulum' LIMIT 1"
			)
		).rows[0];
		assert.ok(user, role);
		await db.execute({
			sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
			args: [schoolId, user.id]
		});
		if (role === 'waka')
			await db.execute({
				sql: "UPDATE auth_user SET type='user',permissions='[]' WHERE id=?",
				args: [user.id]
			});
		const token = randomBytes(32).toString('base64url');
		const now = new Date().toISOString();
		await db.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
			args: [
				user.id,
				createHash('sha256').update(token).digest('hex'),
				'Isolated schedule PDF QA',
				'127.0.0.1',
				new Date(Date.now() + 1800000).toISOString(),
				now,
				now
			]
		});
		cookies[role] =
			`rapkumer-session=${token}; active-sekolah-id=${schoolId}; active-kelas-id=${kelas.id}`;
	}
	child = spawn(process.execPath, ['build/index.js'], {
		cwd: process.cwd(),
		windowsHide: true,
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: folder,
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
			/* Wait for own server. */
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, output.slice(-2000));
	const params = {
		docType: 'jadwal-pelajaran',
		docLabel: 'Jadwal Pelajaran',
		tahunAjaranId: Number(year.id),
		jenisJadwal: 'ganjil',
		jenjang: 'srmp',
		orientation: 'portrait',
		layoutMode: 'padat',
		wakaKurikulumPegawaiId: Number(signer?.id || 0)
	};
	async function post(role, options = {}) {
		return fetch(`${base}/api/pdf/token`, {
			method: 'POST',
			headers: { cookie: cookies[role], Origin: base, 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...params, ...options })
		});
	}
	for (const role of ['admin', 'waka']) {
		for (const options of [
			...['srmp', 'srd', 'srma', 'semua'].map((jenjang) => ({ jenjang })),
			{ orientation: 'landscape', layoutMode: 'multi' }
		]) {
			const selected = { ...params, ...options };
			const query = new URLSearchParams({
				tahun_ajaran_id: String(year.id),
				jenis: 'ganjil',
				jenjang: selected.jenjang
			});
			const payloadResponse = await fetch(`${base}/cetak/jadwal-pelajaran.json?${query}`, {
				headers: { cookie: cookies[role] }
			});
			assert.equal(payloadResponse.status, 200, await payloadResponse.clone().text());
			const payload = (await payloadResponse.json()).jadwalPelajaranData;
			const level = { srd: 'sd', srmp: 'smp', srma: 'sma' }[selected.jenjang];
			assert.equal(
				payload.sekolah.nama,
				level ? units.find((unit) => unit.jenjang === level)?.nama : school.nama
			);
			const tokenResponse = await post(role, options);
			assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
			const { token, slug } = await tokenResponse.json();
			const pdf = await fetch(`${base}/cetak/pdf/${encodeURIComponent(slug)}/${token}`, {
				headers: { cookie: cookies[role] },
				signal: AbortSignal.timeout(90000)
			});
			assert.equal(pdf.status, 200, await pdf.clone().text());
			assert.match(pdf.headers.get('content-type'), /application\/pdf/);
			const bytes = Buffer.from(await pdf.arrayBuffer());
			assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
			const document = await PDFDocument.load(bytes);
			results.push({ role, ...options, pages: document.getPageCount(), bytes: bytes.length });
		}
	}
	const chrome = [
		process.env.PUPPETEER_EXECUTABLE_PATH,
		path.join(
			process.env.PROGRAMFILES || 'C:\\Program Files',
			'Google/Chrome/Application/chrome.exe'
		),
		path.join(
			process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
			'Microsoft/Edge/Application/msedge.exe'
		)
	].find((file) => file && existsSync(file));
	assert.ok(chrome);
	browser = await puppeteer.launch({ executablePath: chrome, headless: true });
	const page = await browser.newPage();
	await page.setViewport({ width: 1366, height: 900 });
	await page.setCookie(
		...cookies.waka.split('; ').map((value) => {
			const [name, ...rest] = value.split('=');
			return { name, value: rest.join('='), url: base };
		})
	);
	await page.goto(`${base}/cetak?dokumen=jadwal-pelajaran`, { waitUntil: 'networkidle0' });
	await page.evaluate(() => {
		const select = [...document.querySelectorAll('select')].find((element) =>
			[...element.options].some((option) => option.value === 'srmp')
		);
		if (!select) throw new Error('Jenjang selector missing');
		select.value = 'srmp';
		select.dispatchEvent(new Event('change', { bubbles: true }));
	});
	const validToken = await post('waka');
	assert.equal(validToken.status, 200);
	const stored = await validToken.json();
	const smp = units.find((unit) => unit.jenjang === 'smp');
	assert.ok(smp);
	await db.execute({
		sql: 'DELETE FROM kelas_satuan_pendidikan WHERE satuan_id=?',
		args: [smp.id]
	});
	await db.execute({
		sql: 'DELETE FROM dapodik_satuan_settings WHERE satuan_id=?',
		args: [smp.id]
	});
	await db.execute({ sql: 'DELETE FROM sekolah_satuan_pendidikan WHERE id=?', args: [smp.id] });
	for (const docType of ['jadwal-pelajaran', 'kalender-pendidikan']) {
		const rejected = await post('waka', { docType });
		assert.equal(rejected.status, 409);
		const message = await rejected.json();
		assert.match(message.message, /Identitas satuan SMP belum diisi/);
		assert.ok(!message.token, 'Invalid identity must not issue a PDF token.');
	}
	const lateFailure = await fetch(
		`${base}/cetak/pdf/${encodeURIComponent(stored.slug)}/${stored.token}`,
		{ headers: { cookie: cookies.waka } }
	);
	assert.equal(lateFailure.status, 409);
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((button) => button.textContent.trim() === 'Preview')
			?.click()
	);
	await page.waitForFunction(
		() => document.body.innerText.includes('Identitas satuan SMP belum diisi'),
		{ timeout: 10000 }
	);
	await page.screenshot({ path: path.join(folder, 'missing-smp-message.png') });
	const all = await post('waka', { jenjang: 'semua' });
	assert.equal(all.status, 200, await all.clone().text());
	const invalidSigner = await post('waka', {
		jenjang: 'semua',
		wakaKurikulumPegawaiId: 2147483647
	});
	assert.equal(invalidSigner.status, 400);
	assert.match((await invalidSigner.json()).message, /guru aktif/);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	console.log(
		'PASS 10 schedule PDFs for admin/Wakakur, parent/unit letterhead identities, missing identity preflight, late failure, visible preview error, invalid signer, and SQLite integrity.'
	);
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const ended = once(child, 'exit');
		execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
		await ended;
	}
	await writeFile(path.join(folder, 'server.log'), output);
	await writeFile(path.join(folder, 'results.json'), JSON.stringify(results, null, 2));
	db.close();
	console.log(`QA folder: ${folder}`);
}
