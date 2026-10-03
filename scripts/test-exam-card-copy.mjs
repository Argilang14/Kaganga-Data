import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';
import { renderKartuUjianHTML } from '../src/lib/server/pdf/templates/kartu-ujian.ts';
import {
	examParticipantNumber,
	participantsInClassAdditionOrder
} from '../src/lib/server/ujian-numbering.ts';

const project = process.cwd();
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'exam-card-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: process.env.DB_URL || 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const port = Number(process.env.EXAM_QA_PORT || 5155);
assert.ok(port !== 1206 && port !== 5152, 'Gunakan port QA terpisah');
const base = `http://127.0.0.1:${port}`;
let child, browser;
const now = new Date().toISOString();
const secret = 'exam-card-copy-only';
try {
	const classes = (
		await db.execute(`SELECT k.id,k.sekolah_id,k.tahun_ajaran_id,k.semester_id,COUNT(m.id) AS total
		FROM kelas k JOIN murid m ON m.kelas_id=k.id AND m.sekolah_id=k.sekolah_id
		GROUP BY k.id HAVING COUNT(m.id)>0 ORDER BY total=23 DESC,total=24 DESC,k.id`)
	).rows;
	const first = classes.find((c) =>
		classes.some(
			(other) =>
				other.id !== c.id &&
				other.sekolah_id === c.sekolah_id &&
				other.tahun_ajaran_id === c.tahun_ajaran_id &&
				other.semester_id === c.semester_id
		)
	);
	assert.ok(first, 'QA memerlukan dua kelas pada sekolah/tahun/semester yang sama');
	const second = classes.find(
		(c) =>
			c.id !== first.id &&
			c.sekolah_id === first.sekolah_id &&
			c.tahun_ajaran_id === first.tahun_ajaran_id &&
			c.semester_id === first.semester_id
	);
	const schoolId = first.sekolah_id;
	const admin = (
		await db.execute("SELECT id FROM auth_user WHERE type='admin' ORDER BY id LIMIT 1")
	).rows[0];
	assert.ok(admin);
	await db.execute({
		sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
		args: [schoolId, admin.id]
	});
	await db.execute({ sql: 'UPDATE sekolah SET npsn=? WHERE id=?', args: ['70055420', schoolId] });
	const authToken = randomBytes(32).toString('base64url');
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(authToken).digest('hex'),
			'Exam card QA',
			'127.0.0.1',
			new Date(Date.now() + 600000).toISOString(),
			now,
			now
		]
	});
	await mkdir(path.join(folder, 'data', 'uploads'), { recursive: true });
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
			RAPKUMER_QR_SECRET: secret,
			NODE_ENV: 'production'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let serverOutput = '';
	child.stdout.on('data', (chunk) => (serverOutput += chunk));
	child.stderr.on('data', (chunk) => (serverOutput += chunk));
	let ready = false;
	for (let i = 0; i < 60; i++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) {
				ready = true;
				break;
			}
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, `QA server tidak siap: ${serverOutput.slice(-1000)}`);
	const cookie = `rapkumer-session=${authToken}; active-sekolah-id=${schoolId}`;
	const post = async (action, values, expected = 200) => {
		const form = new FormData();
		for (const [key, value] of Object.entries(values)) form.set(key, String(value ?? ''));
		const response = await fetch(`${base}/ujian?/${action}`, {
			method: 'POST',
			headers: { cookie, origin: base },
			body: form,
			redirect: 'manual'
		});
		const body = await response.text();
		let actionStatus = response.status;
		try {
			actionStatus = JSON.parse(body).status ?? actionStatus;
		} catch {}
		assert.equal(actionStatus, expected, `${action}: ${body.slice(0, 150)}`);
	};
	const marker = `Exam QA ${Date.now()}`;
	await post('saveSession', {
		nama: marker,
		singkatan: 'ASTS',
		tahunAjaranId: first.tahun_ajaran_id,
		semesterId: first.semester_id,
		status: 'draft'
	});
	const sessionId = (
		await db.execute({
			sql: 'SELECT id FROM ujian_session WHERE nama=? AND sekolah_id=?',
			args: [marker, schoolId]
		})
	).rows[0].id;
	const rows = async () =>
		(
			await db.execute({
				sql: 'SELECT id,murid_id,nomor_peserta,kelas_nama_snapshot AS kelas,ruang,username_lms,password_lms FROM ujian_peserta WHERE session_id=? ORDER BY id',
				args: [sessionId]
			})
		).rows;
	await db.execute({ sql: 'UPDATE sekolah SET npsn=? WHERE id=?', args: ['', schoolId] });
	await post('addClass', { sessionId, classId: first.id }, 400);
	assert.equal((await rows()).length, 0);
	await db.execute({ sql: 'UPDATE sekolah SET npsn=? WHERE id=?', args: ['70055420', schoolId] });
	await post('addClass', { sessionId, classId: first.id, room: '01' });
	const firstRows = await rows();
	assert.equal(firstRows.length, Number(first.total));
	firstRows.forEach((p, i) =>
		assert.equal(p.nomor_peserta, examParticipantNumber('70055420', i + 1))
	);
	await post('addClass', { sessionId, classId: first.id, room: '01' });
	assert.deepEqual(
		(await rows()).map((p) => p.nomor_peserta),
		firstRows.map((p) => p.nomor_peserta)
	);
	await post('addClass', { sessionId, classId: second.id, room: '02' });
	let all = await rows();
	assert.equal(all.length, Number(first.total) + Number(second.total));
	all.forEach((p, i) => assert.equal(p.nomor_peserta, examParticipantNumber('70055420', i + 1)));
	const removed = firstRows[1];
	await post('deleteParticipant', { id: removed.id });
	await post('addClass', { sessionId, classId: first.id });
	all = await rows();
	assert.equal(all.at(-1).nomor_peserta, examParticipantNumber('70055420', all.length + 1));
	const beforeRenumber = all.map((p) => [p.id, p.ruang, p.username_lms, p.password_lms]);
	await post('renumberParticipants', { sessionId });
	all = await rows();
	participantsInClassAdditionOrder(all).forEach((p, i) =>
		assert.equal(p.nomor_peserta, examParticipantNumber('70055420', i + 1))
	);
	assert.deepEqual(
		all.map((p) => [p.id, p.ruang, p.username_lms, p.password_lms]),
		beforeRenumber
	);
	console.log(
		`PASS penomoran ${first.total}+${second.total}, tambah ulang, hapus/tambah, Nomori Ulang, NPSN kosong ditolak`
	);

	const four = all.slice(0, 4);
	assert.equal(four.length, 4);
	await db.execute({
		sql: `DELETE FROM ujian_peserta WHERE session_id=? AND id NOT IN (${four.map(() => '?').join(',')})`,
		args: [sessionId, ...four.map((p) => p.id)]
	});
	const qrTokens = [];
	for (const p of four) {
		await db.execute({ sql: 'DELETE FROM qr_murid WHERE murid_id=?', args: [p.murid_id] });
		const payload = `${p.murid_id}.10.${now}`;
		const token = `rapkumer-absensi:v2:${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
		qrTokens.push(token);
		await db.execute({
			sql: 'INSERT INTO qr_murid(murid_id,token_hash,token_version,issued_at,created_at) VALUES(?,?,?,?,?)',
			args: [p.murid_id, createHash('sha256').update(token).digest('hex'), 10, now, now]
		});
		await db.execute({
			sql: 'UPDATE ujian_peserta SET password_lms=? WHERE id=?',
			args: ['QA-LMS-SECRET', p.id]
		});
	}
	await mkdir('tmp/pdfs', { recursive: true });
	for (const lms of [0, 1]) {
		const response = await fetch(
			`${base}/api/pdf/kartu-ujian?session_id=${sessionId}&akun_lms=${lms}&qr_absensi=1`,
			{ headers: { cookie } }
		);
		assert.equal(response.status, 200);
		await writeFile(`tmp/pdfs/exam-lms-${lms}.pdf`, Buffer.from(await response.arrayBuffer()));
	}
	const executablePath = [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
	].find(existsSync);
	browser = await puppeteer.launch({ executablePath, headless: true });
	await browser.setCookie(
		{ name: 'rapkumer-session', value: authToken, url: base },
		{ name: 'active-sekolah-id', value: String(schoolId), url: base }
	);
	const page = await browser.newPage();
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(`${base}/cetak?dokumen=kartu-ujian&session_id=${sessionId}`, {
		waitUntil: 'networkidle0'
	});
	await page.waitForSelector('button[aria-label="Akun LMS"]');
	assert.equal(
		await page.$eval('button[aria-label="Akun LMS"]', (e) => e.getAttribute('aria-checked')),
		'false'
	);
	await page.click('button[aria-label="Akun LMS"]');
	assert.equal(
		await page.$eval('button[aria-label="Akun LMS"]', (e) => e.getAttribute('aria-checked')),
		'true'
	);
	const previewResponse = page.waitForResponse(
		(r) => r.url().includes('/api/pdf/kartu-ujian?') && r.url().includes('akun_lms=1')
	);
	await page.click('button[title="Preview PDF Kartu Ujian"]');
	assert.equal((await previewResponse).status(), 200);
	await page.waitForSelector('object[type="application/pdf"]');
	await page.click('button[aria-label="Akun LMS"]');
	assert.equal(await page.$('object[type="application/pdf"]'), null);
	await page.setViewport({ width: 390, height: 844 });
	await page.$eval('#my-drawer-2', (e) => {
		e.checked = false;
	});
	await new Promise((resolve) => setTimeout(resolve, 400));
	await page.screenshot({ path: 'tmp/pdfs/exam-lms-mobile.png' });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

	const data = {
		sekolah: { nama: 'Sekolah Rakyat Terintegrasi 3 Provinsi Bengkulu' },
		ujian: {
			nama: 'Asesmen Sumatif Tengah Semester',
			semester: 'Semester Ganjil',
			tahunAjaran: '2026/2027'
		},
		peserta: await Promise.all(
			qrTokens.map(async (token, i) => ({
				nama: i === 0 ? 'Muhammad Abdurrahman Pratama Wijaya' : `Murid ${i + 1}`,
				nomorPeserta: `70055420${String(i + 1).padStart(2, '0')}`,
				nisn: '0108831548',
				kelas: 'X.A',
				usernameLms: 's253006012',
				passwordLms: 'QA-LMS-SECRET',
				ruang: '01',
				qrDataUrl: await QRCode.toDataURL(token, { margin: 4, width: 480 })
			}))
		),
		tandaTangan: {
			tempatTanggal: 'Bengkulu, 5 Oktober 2026',
			jabatan: 'Kepala Sekolah',
			nama: 'Yuliarma Yenni, M.Pd.',
			nip: '198107112023122005'
		}
	};
	await page.setViewport({ width: 1000, height: 1300 });
	await page.emulateMediaType('print');
	for (const qr of [false, true])
		for (const lms of [false, true]) {
			await page.setContent(
				renderKartuUjianHTML({ ...data, showAttendanceQr: qr, showLmsAccount: lms })
			);
			const fits = await page.evaluate(() =>
				[...document.querySelectorAll('.exam-card')].every((card) => {
					const c = card.getBoundingClientRect(),
						id = card.querySelector('.identity').getBoundingClientRect(),
						s = card.querySelector('.signature').getBoundingClientRect(),
						q = card.querySelector('.attendance-qr')?.getBoundingClientRect();
					return (
						Math.abs((c.width * 25.4) / 96 - 94) < 0.1 &&
						Math.abs((c.height * 25.4) / 96 - 123) < 0.1 &&
						id.bottom < s.top &&
						s.bottom < c.bottom &&
						(!q || (q.bottom < c.bottom && q.right < s.left))
					);
				})
			);
			assert.ok(fits, `Layout QR=${qr} LMS=${lms}`);
		}
	console.log(
		'PASS PDF LMS ON/OFF, tombol dan preview desktop/mobile, ukuran 94x123, 4 kombinasi QR/LMS dengan nama panjang'
	);
} catch (error) {
	console.error('QA_FAILURE', error);
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const exited = once(child, 'exit');
		child.kill();
		await exited;
	}
	db.close();
	assert.ok(folder.startsWith(path.join(project, 'tmp') + path.sep));
	await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
