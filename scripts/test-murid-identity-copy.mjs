import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer-core';

const project = process.cwd();
const port = Number(process.env.MURID_IDENTITY_QA_PORT || 5157);
assert.ok(![1206, 5152].includes(port));
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'murid-identity-qa-'));
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
	await db.execute('PRAGMA busy_timeout=10000');
	const marker = await db.execute(
		"SELECT 1 FROM sqlite_master WHERE type='table' AND name='murid_identity_migration'"
	);
	// Only the isolated copy is reset so legacy fixtures also work after the local DB migrates.
	if (marker.rows.length) await db.execute('DELETE FROM murid_identity_migration WHERE version=1');
	const original = (await db.execute('SELECT * FROM murid ORDER BY id LIMIT 1')).rows[0];
	assert.ok(original);
	const classRow = (
		await db.execute({ sql: 'SELECT * FROM kelas WHERE id=?', args: [original.kelas_id] })
	).rows[0];
	const school = Number(original.sekolah_id),
		semester = Number(original.semester_id),
		kelas = Number(original.kelas_id);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [classRow.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [semester, classRow.tahun_ajaran_id]
	});
	const students = [];
	for (let i = 1; i <= 3; i++) {
		const values = { ...original };
		delete values.id;
		Object.assign(values, {
			nis: `IDENTITY-QA-${i}`,
			nisn: '00000000',
			nama: `Identitas QA ${i}`,
			qr_token: `identity-qa-${i}`,
			dapodik_peserta_didik_id: null,
			dapodik_anggota_rombel_id: null
		});
		const columns = Object.keys(values);
		const inserted = await db.execute({
			sql: `INSERT INTO murid(${columns.map((c) => `"${c}"`).join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
			args: Object.values(values)
		});
		const id = Number(inserted.lastInsertRowid);
		students.push({ ...values, id });
		await db.execute({
			sql: `INSERT INTO murid_riwayat_kelas(sekolah_id,identity_key,murid_id,tahun_ajaran_id,semester_id,kelas_id,nama_snapshot,nis_snapshot,nisn_snapshot,tahun_ajaran_snapshot,semester_snapshot,kelas_snapshot,status_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			args: [
				school,
				'nisn:00000000',
				id,
				classRow.tahun_ajaran_id,
				semester,
				kelas,
				values.nama,
				values.nis,
				values.nisn,
				'QA',
				'QA',
				classRow.nama,
				'aktif'
			]
		});
	}
	await db.execute({
		sql: "INSERT INTO murid_lifecycle(sekolah_id,identity_key,nis,nisn,nama_snapshot,status,last_murid_id) VALUES(?,'nisn:00000000',?,'00000000',?,'keluar',?)",
		args: [school, students[2].nis, students[2].nama, students[2].id]
	});
	await db.execute({
		sql: "INSERT INTO audit_log(sekolah_id,username_snapshot,role_snapshot,action,entity_type,summary,before_data) VALUES(?,'QA','admin','delete','murid','QA penghapusan lama',?)",
		args: [
			school,
			JSON.stringify({
				id: 999999,
				nis: 'IDENTITY-QA-TERHAPUS',
				nisn: '00000000',
				nama: 'Murid Terhapus QA'
			})
		]
	});
	const admin = (await db.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0];
	assert.ok(admin);
	await db.execute({
		sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
		args: [school, admin.id]
	});
	const token = randomBytes(32).toString('base64url'),
		now = new Date().toISOString();
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(token).digest('hex'),
			'Student identity QA',
			'127.0.0.1',
			new Date(Date.now() + 1200000).toISOString(),
			now,
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
	child.stdout.on('data', (v) => (output += v));
	child.stderr.on('data', (v) => (output += v));
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) {
				ready = true;
				break;
			}
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	assert.ok(ready, output.slice(-5000));
	const cookie = `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${kelas}`;
	async function get(route) {
		const response = await fetch(base + route, { headers: { cookie }, redirect: 'manual' });
		assert.equal(response.status, 200, `${route}: ${await response.clone().text()}`);
		return response;
	}
	async function post(route, data) {
		const form = new FormData();
		for (const [key, value] of Object.entries(data))
			for (const item of Array.isArray(value) ? value : [value]) {
				if (item instanceof Blob) form.append(key, item, 'QA.xlsx');
				else form.append(key, String(item));
			}
		const response = await fetch(base + route, {
			method: 'POST',
			headers: { cookie, origin: base, accept: 'application/json', 'x-sveltekit-action': 'true' },
			body: form,
			redirect: 'manual'
		});
		const body = await response.text();
		let status = response.status;
		try {
			status = JSON.parse(body).status || status;
		} catch {}
		return { status, body };
	}
	async function importRows(rows) {
		const workbook = new ExcelJS.Workbook(),
			sheet = workbook.addWorksheet('Murid');
		sheet.addRow(['Nama', 'NIPD', 'Rombel', 'NISN', 'Tanggal Lahir']);
		for (const row of rows) sheet.addRow(row);
		return post('/akademik?/save', {
			tahunAjaranId: classRow.tahun_ajaran_id,
			semesterId: semester,
			file: new Blob([await workbook.xlsx.writeBuffer()], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			})
		});
	}
	const list = await (await get(`/murid?kelas_id=${kelas}&q=Identitas%20QA`)).text();
	assert.match(list, /Identitas QA 1/);
	assert.match(list, /Identitas QA 2/);
	assert.doesNotMatch(list, />Identitas QA 3</);
	const links = (
		await db.execute({
			sql: 'SELECT * FROM murid_identity_link WHERE murid_id IN (?,?,?) ORDER BY murid_id',
			args: students.map((s) => s.id)
		})
	).rows;
	assert.equal(new Set(links.map((l) => l.identity_uid)).size, 3);
	const pending = (
		await db.execute({
			sql: 'SELECT * FROM murid_lifecycle WHERE sekolah_id=? AND identity_key=?',
			args: [school, `uid:${links[2].identity_uid}`]
		})
	).rows[0];
	assert.equal(pending.needs_identity_review, 1);
	let result = await post('/murid/arsip?/updateStatus', {
		lifecycleIds: pending.id,
		status: 'aktif'
	});
	assert.equal(result.status, 400, result.body);
	result = await post('/murid/arsip?/updateStatus', {
		lifecycleIds: pending.id,
		status: 'aktif',
		identityReviewed: 'true',
		alasan: 'Identitas diperiksa pada fixture QA'
	});
	assert.equal(result.status, 200, result.body);
	const edit = {
		nis: students[1].nis,
		nisn: '0009876543',
		nama: students[1].nama,
		kelasId: kelas,
		tempatLahir: original.tempat_lahir,
		tanggalLahir: original.tanggal_lahir,
		jenisKelamin: original.jenis_kelamin,
		agama: original.agama,
		pendidikanSebelumnya: original.pendidikan_sebelumnya,
		tanggalMasuk: original.tanggal_masuk,
		'alamat.jalan': 'Alamat QA'
	};
	result = await post(`/murid/form/${students[1].id}?/save`, edit);
	assert.equal(result.status, 200, result.body);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT identity_uid FROM murid_identity_link WHERE murid_id=?',
				args: [students[1].id]
			})
		).rows[0].identity_uid,
		links[1].identity_uid
	);
	result = await post(`/murid/${students[0].id}/delete?/delete`, {});
	assert.equal(result.status, 200, result.body);
	const remaining = await (await get(`/murid?kelas_id=${kelas}&q=Identitas%20QA`)).text();
	assert.doesNotMatch(remaining, />Identitas QA 1</);
	assert.match(remaining, /Identitas QA 2/);
	assert.match(remaining, /Identitas QA 3/);
	const roster = await (await get(`/api/murid/daftar?kelas_id=${kelas}`)).json();
	assert.ok(!roster.some((row) => row.id === students[0].id));
	assert.ok(roster.some((row) => row.id === students[1].id));
	for (const route of [
		'/asesmen-sumatif',
		'/asesmen-formatif',
		'/nilai-ekstrakurikuler',
		'/asesmen-kokurikuler',
		'/asesmen-keasramaan',
		'/nilai-akhir',
		'/catatan-wali-asrama',
		'/catatan-wali-kelas',
		'/status-akhir',
		'/absen'
	])
		await get(`${route}?kelas_id=${kelas}`);
	const stored = (
		await db.execute({ sql: 'SELECT qr_token FROM murid WHERE id=?', args: [students[0].id] })
	).rows[0];
	assert.equal(stored.qr_token, 'identity-qa-1');
	const archived = (
		await db.execute({
			sql: 'SELECT id FROM murid_lifecycle WHERE identity_key=? AND sekolah_id=?',
			args: [`uid:${links[0].identity_uid}`, school]
		})
	).rows[0];
	for (const status of ['aktif', 'arsip', 'semua']) {
		const response = await get(`/api/murid/download-excel?status=${status}`);
		assert.match(response.headers.get('content-disposition'), new RegExp(status));
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
		const rows = workbook.worksheets[0]
			.getSheetValues()
			.filter(Boolean)
			.map((row) => row.slice(1));
		const names = rows.map((row) => row[0]);
		assert.equal(names.includes('Identitas QA 1'), status !== 'aktif');
		assert.equal(names.includes('Identitas QA 2'), status !== 'arsip');
		if (status !== 'arsip')
			assert.equal(rows.find((row) => row[0] === 'Identitas QA 2')[3], '0009876543');
	}
	result = await post('/murid/arsip?/updateStatus', { lifecycleIds: archived.id, status: 'aktif' });
	assert.equal(result.status, 200, result.body);
	const beforeCount = Number((await db.execute('SELECT count(*) AS n FROM murid')).rows[0].n);
	result = await post('/murid/form?/save', {
		...edit,
		nis: 'IDENTITY-QA-DUP',
		nama: 'Anak lain',
		nisn: '0009876543'
	});
	assert.equal(result.status, 400, result.body);
	assert.equal(
		Number((await db.execute('SELECT count(*) AS n FROM murid')).rows[0].n),
		beforeCount
	);
	result = await importRows([
		['Impor QA 1', 'IMQA-1', classRow.nama, '000', original.tanggal_lahir],
		['Impor QA 2', 'IMQA-2', classRow.nama, '', original.tanggal_lahir]
	]);
	assert.equal(result.status, 200, result.body);
	const imported = (
		await db.execute(
			"SELECT mi.identity_uid,m.nisn FROM murid m JOIN murid_identity_link mi ON mi.murid_id=m.id WHERE m.nis IN ('IMQA-1','IMQA-2')"
		)
	).rows;
	assert.equal(imported.length, 2);
	assert.notEqual(imported[0].identity_uid, imported[1].identity_uid);
	assert.ok(imported.every((r) => r.nisn === ''));
	const baseline = Number((await db.execute('SELECT count(*) AS n FROM murid')).rows[0].n);
	result = await importRows([
		['Rollback QA', 'ROLLBACK-QA', 'Kelas Rollback QA', '', original.tanggal_lahir],
		['Konflik QA', 'CONFLICT-QA', 'Kelas Rollback QA', '0009876543', original.tanggal_lahir]
	]);
	assert.equal(result.status, 400, result.body);
	assert.equal(Number((await db.execute('SELECT count(*) AS n FROM murid')).rows[0].n), baseline);
	assert.equal(
		(await db.execute("SELECT id FROM kelas WHERE nama='Kelas Rollback QA'")).rows.length,
		0
	);
	result = await importRows([
		['Orang berbeda', students[1].nis, classRow.nama, '', original.tanggal_lahir]
	]);
	assert.equal(result.status, 400, result.body);
	assert.equal(
		(await db.execute({ sql: 'SELECT nama FROM murid WHERE id=?', args: [students[1].id] })).rows[0]
			.nama,
		students[1].nama
	);
	result = await importRows([
		['Nomor tidak valid', 'INVALID-QA', classRow.nama, '12345', original.tanggal_lahir]
	]);
	assert.equal(result.status, 400, result.body);
	const nextSemester = (
		await db.execute({
			sql: 'SELECT id FROM semester WHERE tahun_ajaran_id=? AND id<>? LIMIT 1',
			args: [classRow.tahun_ajaran_id, semester]
		})
	).rows[0];
	assert.ok(nextSemester, 'Fixture needs another semester');
	const targetClass = { ...classRow, nama: 'Identity QA Promotion', semester_id: nextSemester.id };
	delete targetClass.id;
	const targetColumns = Object.keys(targetClass);
	const target = await db.execute({
		sql: `INSERT INTO kelas(${targetColumns.map((c) => `"${c}"`).join(',')}) VALUES(${targetColumns.map(() => '?').join(',')})`,
		args: Object.values(targetClass)
	});
	const sourceLifecycle = (
		await db.execute({
			sql: 'SELECT id FROM murid_lifecycle WHERE sekolah_id=? AND identity_key=?',
			args: [school, `uid:${links[1].identity_uid}`]
		})
	).rows[0];
	result = await post('/murid/arsip?/promote', {
		lifecycleIds: sourceLifecycle.id,
		targetClassId: Number(target.lastInsertRowid),
		confirmed: 'true'
	});
	assert.equal(result.status, 200, result.body);
	const promoted = (
		await db.execute({
			sql: 'SELECT mi.identity_uid FROM murid m JOIN murid_identity_link mi ON mi.murid_id=m.id WHERE m.nis=? AND m.semester_id=?',
			args: [students[1].nis, nextSemester.id]
		})
	).rows[0];
	assert.equal(promoted.identity_uid, links[1].identity_uid);
	result = await post('/murid?/deleteSelected', { muridIds: [students[0].id, students[2].id] });
	assert.equal(result.status, 200, result.body);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT id FROM murid WHERE id IN (?,?,?)',
				args: students.map((s) => s.id)
			})
		).rows.length,
		3
	);
	result = await importRows([
		[students[0].nama, students[0].nis, classRow.nama, '', original.tanggal_lahir]
	]);
	assert.equal(result.status, 400, result.body);
	result = await post('/murid/arsip?/previewPromotion', {
		lifecycleIds: archived.id,
		targetClassId: Number(target.lastInsertRowid)
	});
	assert.equal(result.status, 400, result.body);
	await db.execute({
		sql: "UPDATE auth_user SET type='user',jabatan_akses=NULL,permissions='[]' WHERE id=?",
		args: [admin.id]
	});
	result = await post(`/murid/${students[1].id}/delete?/delete`, {});
	assert.equal(result.status, 403, result.body);
	await db.execute({ sql: "UPDATE auth_user SET type='admin' WHERE id=?", args: [admin.id] });
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal(String((await db.execute('PRAGMA quick_check')).rows[0].quick_check), 'ok');
	const executablePath = [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
	].find(existsSync);
	browser = await puppeteer.launch({ executablePath, headless: true });
	await browser.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base },
		{ name: 'active-kelas-id', value: String(kelas), url: base }
	);
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	for (const [width, height] of [
		[1366, 900],
		[390, 844]
	]) {
		await page.setViewport({ width, height });
		await page.goto(`${base}/murid?kelas_id=${kelas}&q=Identitas%20QA`, {
			waitUntil: 'networkidle0'
		});
		assert.match(await page.content(), /Identitas QA 2/);
		await page.screenshot({ path: path.join(folder, `murid-${width}.png`), fullPage: true });
	}
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(`${base}/murid/arsip?q=Identitas%20QA`, { waitUntil: 'networkidle0' });
	await page.screenshot({ path: path.join(folder, 'arsip.png'), fullPage: true });
	assert.deepEqual(errors, []);
	await writeFile(path.join(folder, 'server.log'), output);
	console.log(
		'PASS migration/review, single/bulk archive, restore, transactional import rollback, promotion, stable UID after NISN edit, leading zero export, duplicate rejection, permissions, SQLite and desktop/mobile UI.'
	);
	console.log('QA artifacts:', folder);
} catch (error) {
	console.error(output.slice(-6000));
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const ended = once(child, 'exit');
		child.kill();
		await ended;
	}
	db.close();
}
