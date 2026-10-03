import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { renderKartuUjianMejaHTML } from '../src/lib/server/pdf/templates/kartu-ujian-meja.ts';

const project = process.cwd();
const port = Number(process.env.EXAM_DESK_QA_PORT || 5156);
assert.ok(port !== 1206 && port !== 5152, 'QA requires a separate port');
await mkdir(path.join(project, 'tmp', 'pdfs'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'exam-desk-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
let child, browser;
try {
	await db.execute('PRAGMA busy_timeout=10000');
	await db.execute('PRAGMA journal_mode=WAL');
	const context = (
		await db.execute(`SELECT k.sekolah_id,k.tahun_ajaran_id,k.semester_id
		FROM kelas k JOIN murid m ON m.kelas_id=k.id ORDER BY k.id LIMIT 1`)
	).rows[0];
	assert.ok(context);
	const admin = (await db.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0];
	assert.ok(admin);
	const schoolId = Number(context.sekolah_id);
	const now = new Date().toISOString();
	await db.execute({
		sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
		args: [schoolId, admin.id]
	});
	const token = randomBytes(32).toString('base64url');
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(token).digest('hex'),
			'Desk card QA',
			'127.0.0.1',
			new Date(Date.now() + 900000).toISOString(),
			now,
			now
		]
	});
	const session = await db.execute({
		sql: `INSERT INTO ujian_session(sekolah_id,tahun_ajaran_id,semester_id,nama,singkatan,tanggal_cetak,created_at) VALUES(?,?,?,?,?,?,?)`,
		args: [
			schoolId,
			context.tahun_ajaran_id,
			context.semester_id,
			'Asesmen Sumatif Tengah Semester',
			'ASTS',
			'2026-10-05',
			now
		]
	});
	const sessionId = Number(session.lastInsertRowid);
	const peserta = Array.from({ length: 17 }, (_, i) => ({
		nama: i === 0 ? 'Muhammad Abdurrahman Pratama Wijaya Kusuma' : `Peserta Uji ${i + 1}`,
		nomorPeserta: `70055420${String(i + 1).padStart(2, '0')}`,
		nisn: `010883${String(i + 1).padStart(4, '0')}`,
		kelas: i < 9 ? 'X.A' : 'X.B',
		ruang: i < 8 ? '01' : '02',
		usernameLms: `s2530060${String(i + 1).padStart(2, '0')}`,
		passwordLms: 'DESK-LMS-SECRET'
	}));
	for (const p of peserta)
		await db.execute({
			sql: `INSERT INTO ujian_peserta(session_id,nomor_peserta,murid_nama_snapshot,nisn_snapshot,kelas_nama_snapshot,ruang,username_lms,password_lms,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
			args: [
				sessionId,
				p.nomorPeserta,
				p.nama,
				p.nisn,
				p.kelas,
				p.ruang,
				p.usernameLms,
				p.passwordLms,
				now
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
			KAGANGA_DATA_DIR: path.join(folder, 'data'),
			NODE_ENV: 'production'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let i = 0; i < 80; i++) {
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
	assert.ok(ready, output.slice(-2000));
	const cookie = `rapkumer-session=${token}; active-sekolah-id=${schoolId}`;
	const endpoint = `${base}/api/pdf/kartu-ujian?session_id=${sessionId}`;
	for (const [query, pages, filename] of [
		['layout=meja&akun_lms=0', 3, 'desk-lms-off'],
		['layout=meja&akun_lms=1', 3, 'desk-lms-on'],
		['layout=meja&akun_lms=0&ttd_kepsek=0', 3, 'desk-signature-off'],
		['layout=meja&akun_lms=1&ttd_kepsek=0', 3, 'desk-signature-off-lms-on'],
		['layout=meja&kelas=X.A', 2, 'desk-class'],
		['layout=meja&ruang=01', 1, 'desk-room'],
		['layout=meja&kelas=X.A&ruang=02', 1, 'desk-class-room'],
		['layout=kartu&ttd_kepsek=0', 5, 'desk-old-card-regression']
	]) {
		const response = await fetch(`${endpoint}&${query}`, { headers: { cookie } });
		assert.equal(response.status, 200, `${query}: ${response.status}`);
		assert.match(response.headers.get('content-disposition'), /inline/);
		if (query.includes('layout=meja'))
			assert.match(response.headers.get('content-disposition'), /Kartu Ujian Meja/);
		const bytes = Buffer.from(await response.arrayBuffer());
		assert.equal((await PDFDocument.load(bytes)).getPageCount(), pages, query);
		await writeFile(path.join(project, 'tmp', 'pdfs', `${filename}.pdf`), bytes);
	}
	for (const [query, expected] of [
		['layout=invalid', 400],
		['layout=meja&qr_absensi=1', 400],
		['layout=meja&ruang=nonexistent', 400]
	]) {
		assert.equal((await fetch(`${endpoint}&${query}`, { headers: { cookie } })).status, expected);
	}
	const otherSchool = (
		await db.execute({ sql: 'SELECT id FROM sekolah WHERE id<>? LIMIT 1', args: [schoolId] })
	).rows[0];
	if (otherSchool) {
		await db.execute({
			sql: 'UPDATE auth_user SET sekolah_id=? WHERE id=?',
			args: [otherSchool.id, admin.id]
		});
		assert.equal(
			(
				await fetch(`${endpoint}&layout=meja`, {
					headers: { cookie: `rapkumer-session=${token}; active-sekolah-id=${otherSchool.id}` }
				})
			).status,
			404
		);
	}
	await db.execute({
		sql: "UPDATE auth_user SET sekolah_id=?,type='user',jabatan_akses=NULL,permissions='[]' WHERE id=?",
		args: [schoolId, admin.id]
	});
	assert.equal((await fetch(`${endpoint}&layout=meja`, { headers: { cookie } })).status, 403);
	await db.execute({ sql: "UPDATE auth_user SET type='admin' WHERE id=?", args: [admin.id] });
	console.log(
		'PASS PDF pagination 17/9/8/1 participants, filters, filenames, old cards, invalid requests, permissions and school isolation'
	);
	const executablePath = [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
	].find(existsSync);
	browser = await puppeteer.launch({ executablePath, headless: true });
	await browser.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(schoolId), url: base }
	);
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(`${base}/cetak?dokumen=kartu-ujian-meja&session_id=${sessionId}`, {
		waitUntil: 'networkidle0'
	});
	await page.waitForSelector('button[title="Preview PDF Kartu Ujian Meja"]');
	assert.equal(await page.$('button[aria-label="QR Absensi"]'), null);
	assert.equal(
		await page.$eval('button[aria-label="Akun LMS"]', (e) => e.getAttribute('aria-checked')),
		'false'
	);
	assert.equal(
		await page.$eval('button[aria-label="TTD Kepsek"]', (e) => e.getAttribute('aria-checked')),
		'true'
	);
	const filters = await page.$$('select.select-bordered');
	assert.equal(filters.length, 3);
	await page.select('select.select-bordered:nth-of-type(1)', String(sessionId));
	const response = page.waitForResponse(
		(r) => r.url().includes('/api/pdf/kartu-ujian?') && r.url().includes('layout=meja')
	);
	await page.click('button[title="Preview PDF Kartu Ujian Meja"]');
	assert.equal((await response).status(), 200);
	await page.waitForSelector('object[type="application/pdf"]');
	await page.click('button[aria-label="TTD Kepsek"]');
	await page.waitForFunction(() => !document.querySelector('object[type="application/pdf"]'));
	assert.equal(
		await page.$eval('button[aria-label="TTD Kepsek"]', (e) => e.getAttribute('aria-checked')),
		'false'
	);
	const signatureOffResponse = page.waitForResponse(
		(r) => r.url().includes('/api/pdf/kartu-ujian?') && r.url().includes('ttd_kepsek=0')
	);
	await page.click('button[title="Preview PDF Kartu Ujian Meja"]');
	assert.equal((await signatureOffResponse).status(), 200);
	await page.waitForSelector('object[type="application/pdf"]');
	await page.click('button[aria-label="Akun LMS"]');
	await page.waitForFunction(() => !document.querySelector('object[type="application/pdf"]'));
	await page.screenshot({ path: 'tmp/pdfs/desk-ui-desktop.png' });
	for (const [width, height, name] of [
		[768, 1024, 'tablet'],
		[390, 844, 'mobile']
	]) {
		await page.setViewport({ width, height });
		await page.$eval('#my-drawer-2', (e) => {
			e.checked = false;
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
		await page.screenshot({ path: `tmp/pdfs/desk-ui-${name}.png` });
	}
	assert.deepEqual(errors, []);
	const school = (
		await db.execute({
			sql: 'SELECT nama,logo,logo_type,logo_dinas,logo_dinas_type FROM sekolah WHERE id=?',
			args: [schoolId]
		})
	).rows[0];
	const image = (blob, type) =>
		blob && type ? `data:${type};base64,${Buffer.from(blob).toString('base64')}` : null;
	const data = {
		sekolah: {
			nama: String(school.nama),
			naungan: 'kemsos',
			alamat: 'Jl. Terminal Regional, Gg Serawai RT/RW 25/07, Pekan Sabtu, Selebar, Kota Bengkulu',
			email: 'sekolah@example.sch.id',
			logoUrl: image(school.logo, school.logo_type),
			logoDinasUrl: image(school.logo_dinas, school.logo_dinas_type)
		},
		ujian: {
			nama: 'Asesmen Sumatif Tengah Semester',
			singkatan: 'ASTS',
			semester: 'Semester Ganjil',
			tahunAjaran: '2026/2027'
		},
		peserta,
		tandaTangan: {
			tempatTanggal: 'Bengkulu, 5 Oktober 2026',
			jabatan: 'Kepala Sekolah',
			nama: 'Yuliarma Yenni, M.Pd.',
			nip: '198107112023122005'
		}
	};
	const layoutPage = await browser.newPage();
	await layoutPage.setViewport({ width: 1000, height: 1400 });
	await layoutPage.emulateMediaType('print');
	for (const [lms, signature] of [
		[false, true],
		[true, true],
		[false, false],
		[true, false]
	]) {
		await layoutPage.setContent(
			renderKartuUjianMejaHTML({ ...data, showLmsAccount: lms, showPrincipalSignature: signature }),
			{
				waitUntil: 'load'
			}
		);
		const issues = await layoutPage.evaluate(() =>
			[...document.querySelectorAll('.desk-card')].flatMap((card, index) => {
				const c = card.getBoundingClientRect(),
					id = card.querySelector('.desk-identity').getBoundingClientRect(),
					s = card.querySelector('.desk-signature')?.getBoundingClientRect();
				return Math.abs((c.width * 25.4) / 96 - 94) > 0.1 ||
					Math.abs((c.height * 25.4) / 96 - 62) > 0.1 ||
					id.bottom > c.bottom - 5 ||
					(s && (s.bottom > c.bottom - 5 || id.right > s.left)) ||
					card.scrollHeight > card.clientHeight + 1
					? [{ index, card: c.toJSON(), identity: id.toJSON(), signature: s?.toJSON() }]
					: [];
			})
		);
		assert.deepEqual(issues, [], `LMS ${lms}, signature ${signature}`);
		assert.equal((await layoutPage.$$('.desk-signature')).length, signature ? peserta.length : 0);
		const sheet = await layoutPage.$('.desk-sheet');
		await sheet.screenshot({
			path: `tmp/pdfs/desk-layout-lms-${Number(lms)}-signature-${Number(signature)}.png`
		});
	}
	console.log(
		'PASS embedded preview, LMS toggle, desktop/tablet/mobile, long name, 94x62 mm dimensions and non-overlapping signatures'
	);
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const exited = once(child, 'exit');
		if (process.platform === 'win32') {
			const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
				windowsHide: true,
				stdio: 'ignore'
			});
			await once(killer, 'exit');
		} else child.kill();
		await exited;
	}
	db.close();
	assert.ok(folder.startsWith(path.join(project, 'tmp') + path.sep));
	await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
