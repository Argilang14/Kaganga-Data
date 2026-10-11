import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer-core';
import { isIntegratedSchool, suggestedEducationLevel } from '../src/lib/education-unit.ts';
const { parse: parseActionData } = await import(
	pathToFileURL(createRequire(import.meta.resolve('@sveltejs/kit')).resolve('devalue')).href
);

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
		} catch {
			// Retry while the isolated server starts.
		}
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
		} catch {
			// Redirect responses are not JSON action results.
		}
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
	const subject = await db.execute({
		sql: "INSERT INTO mata_pelajaran(kelas_id,nama,jenis,created_at) VALUES(?,'Identitas QA Mapel','wajib',CURRENT_TIMESTAMP)",
		args: [kelas]
	});
	await db.execute({
		sql: 'INSERT INTO asesmen_sumatif(murid_id,mata_pelajaran_id,nilai_akhir,created_at) VALUES(?,?,87,CURRENT_TIMESTAMP)',
		args: [students[0].id, Number(subject.lastInsertRowid)]
	});
	await db.execute({
		sql: "INSERT INTO absensi_harian(sekolah_id,semester_id,kelas_id,murid_id,tanggal,status,metode,created_at) VALUES(?,?,?,?,'2026-10-11','hadir','manual',CURRENT_TIMESTAMP)",
		args: [school, semester, kelas, students[0].id]
	});
	async function protectedData() {
		const result = {};
		for (const table of ['murid', 'asesmen_sumatif', 'absensi_harian']) {
			result[table] = (
				await db.execute({
					sql: `SELECT * FROM ${table} WHERE ${table === 'murid' ? 'id' : 'murid_id'}=? ORDER BY id`,
					args: [students[0].id]
				})
			).rows;
		}
		return result;
	}
	const protectedBefore = await protectedData();
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
	assert.equal(result.status, 400, result.body);
	const reviewPage = await (await get('/murid/arsip?perlu_periksa=1&q=Identitas%20QA')).text();
	assert.match(reviewPage, /Periksa Identitas/);
	assert.match(reviewPage, /IDENTITY-QA-3/);
	result = await post('/murid/arsip?/resolveIdentity', {
		lifecycleIds: [pending.id, pending.id + 1],
		status: 'aktif',
		identityKey: pending.identity_key,
		identityReviewed: 'true',
		alasan: 'Tidak boleh memulihkan massal identitas ambigu'
	});
	assert.equal(result.status, 400, result.body);
	result = await post('/murid/arsip?/resolveIdentity', {
		lifecycleIds: pending.id,
		status: 'aktif',
		identityKey: 'uid:wrong',
		identityReviewed: 'true',
		alasan: 'Identitas yang dikirim tidak cocok'
	});
	assert.equal(result.status, 409, result.body);
	result = await post('/murid/arsip?/resolveIdentity', {
		lifecycleIds: pending.id,
		status: 'aktif',
		identityKey: pending.identity_key,
		expectedUpdatedAt: 'outdated',
		identityReviewed: 'true',
		alasan: 'Formulir pemeriksaan kedaluwarsa'
	});
	assert.equal(result.status, 409, result.body);
	result = await post('/murid/arsip?/resolveIdentity', {
		lifecycleIds: pending.id,
		status: 'aktif',
		identityKey: pending.identity_key,
		identityReviewed: 'true',
		expectedUpdatedAt: pending.updated_at,
		alasan: 'Identitas diperiksa pada fixture QA'
	});
	assert.equal(result.status, 200, result.body);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT needs_identity_review FROM murid_lifecycle WHERE id=?',
				args: [pending.id]
			})
		).rows[0].needs_identity_review,
		0
	);
	assert.ok(
		(
			await db.execute({
				sql: "SELECT id FROM audit_log WHERE entity_type='murid_lifecycle' AND action='status_change' AND summary LIKE 'Pemeriksaan identitas%' AND entity_id=?",
				args: [String(pending.id)]
			})
		).rows.length
	);
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
	result = await post('/murid/arsip?/previewPromotion', {
		lifecycleIds: sourceLifecycle.id,
		targetClassId: kelas
	});
	assert.equal(result.status, 400, result.body);
	assert.match(result.body, /Pindah kelas dalam semester yang sama belum tersedia/);
	let sourceUnit = (
		await db.execute({
			sql: 'SELECT * FROM kelas_satuan_pendidikan WHERE kelas_id=?',
			args: [kelas]
		})
	).rows[0];
	const schoolRow = (
		await db.execute({
			sql: 'SELECT jenjang_pendidikan AS jenjangPendidikan, jenjang_variant AS jenjangVariant FROM sekolah WHERE id=?',
			args: [school]
		})
	).rows[0];
	if (!sourceUnit && isIntegratedSchool(schoolRow)) {
		const level = suggestedEducationLevel(classRow) ?? 'sma';
		let unit = (
			await db.execute({
				sql: 'SELECT * FROM sekolah_satuan_pendidikan WHERE sekolah_id=? AND jenjang=?',
				args: [school, level]
			})
		).rows[0];
		if (!unit) {
			result = await post('/sekolah/satuan-pendidikan?/saveUnit', {
				jenjang: level,
				nama: 'Satuan Identity QA',
				npsn: '99998888'
			});
			assert.equal(result.status, 200, result.body);
			unit = (
				await db.execute({
					sql: 'SELECT * FROM sekolah_satuan_pendidikan WHERE sekolah_id=? AND jenjang=?',
					args: [school, level]
				})
			).rows[0];
		}
		sourceUnit = { satuan_id: unit.id, nama_snapshot: unit.nama, npsn_snapshot: unit.npsn };
	}
	if (sourceUnit) {
		result = await post('/murid/arsip?/promote', {
			lifecycleIds: sourceLifecycle.id,
			targetClassId: Number(target.lastInsertRowid),
			confirmed: 'true'
		});
		assert.equal(result.status, 400, result.body);
		assert.match(result.body, /Satuan kelas tujuan belum dipetakan/);
		await db.execute({
			sql: 'INSERT INTO kelas_satuan_pendidikan(kelas_id,satuan_id,nama_snapshot,npsn_snapshot,created_at) VALUES(?,?,?,?,?)',
			args: [
				Number(target.lastInsertRowid),
				sourceUnit.satuan_id,
				sourceUnit.nama_snapshot,
				sourceUnit.npsn_snapshot,
				new Date().toISOString()
			]
		});
	}
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
	// A corrupt historical link must block the whole operation before any selected status changes.
	const promotedRow = (
		await db.execute({
			sql: 'SELECT id,nama FROM murid WHERE nis=? AND semester_id=?',
			args: [students[1].nis, nextSemester.id]
		})
	).rows[0];
	await db.execute({
		sql: 'UPDATE murid SET nama=? WHERE id=?',
		args: ['Orang Berbeda QA', promotedRow.id]
	});
	const firstStatus = (
		await db.execute({ sql: 'SELECT status FROM murid_lifecycle WHERE id=?', args: [archived.id] })
	).rows[0].status;
	result = await post(`/murid/${students[1].id}/delete?/delete`, {});
	assert.equal(result.status, 409, result.body);
	result = await post('/murid?/deleteSelected', { muridIds: [students[0].id, students[1].id] });
	assert.equal(result.status, 409, result.body);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT status FROM murid_lifecycle WHERE id=?',
				args: [archived.id]
			})
		).rows[0].status,
		firstStatus
	);
	result = await post('/murid/arsip?/updateStatus', {
		lifecycleIds: sourceLifecycle.id,
		status: 'keluar',
		tanggalStatus: '2026-10-11'
	});
	assert.equal(result.status, 409, result.body);
	await db.execute({
		sql: 'UPDATE murid SET nama=? WHERE id=?',
		args: [promotedRow.nama, promotedRow.id]
	});
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
	await db.execute({
		sql: "UPDATE auth_user SET type='user',permissions='[\"murid_arsip\"]' WHERE id=?",
		args: [admin.id]
	});
	result = await post('/murid/arsip?/resolveIdentity', {
		lifecycleIds: pending.id,
		status: 'aktif',
		identityKey: pending.identity_key,
		expectedUpdatedAt: pending.updated_at,
		identityReviewed: 'true',
		alasan: 'Tidak boleh diperiksa non-admin'
	});
	assert.equal(result.status, 403, result.body);
	await db.execute({
		sql: "UPDATE auth_user SET type='admin',permissions='[]' WHERE id=?",
		args: [admin.id]
	});
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
	await db.execute({
		sql: 'UPDATE murid_lifecycle SET needs_identity_review=1 WHERE id=?',
		args: [pending.id]
	});
	for (const width of [1366, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(`${base}/murid/arsip?perlu_periksa=1&q=Identitas%20QA%203`, {
			waitUntil: 'networkidle0'
		});
		await page.waitForSelector('details:has(form[action="?/resolveIdentity"]) summary');
		await page.click('details:has(form[action="?/resolveIdentity"]) summary');
		await page.$eval('form[action="?/resolveIdentity"]', (el) =>
			el.scrollIntoView({ block: 'center' })
		);
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
			`Review overflow ${width}`
		);
		assert.equal(
			await page.$eval('input[aria-label="Pilih Identitas QA 3"]', (el) => el.disabled),
			true
		);
		await page.screenshot({
			path: path.join(folder, `identity-review-${width}.png`),
			fullPage: true
		});
	}
	const reviewForm = 'form[action="?/resolveIdentity"]';
	await page.select(`${reviewForm} select[name="status"]`, 'aktif');
	await page.type(
		`${reviewForm} textarea[name="alasan"]`,
		'Identitas diverifikasi melalui browser QA'
	);
	await page.click(`${reviewForm} input[name="identityReviewed"]`);
	await page.click(`${reviewForm} button[type="submit"]`);
	await page.waitForFunction(() =>
		document.querySelector('.alert-success')?.textContent.includes('dipulihkan')
	);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT needs_identity_review FROM murid_lifecycle WHERE id=?',
				args: [pending.id]
			})
		).rows[0].needs_identity_review,
		0
	);
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
	result = await post('/murid/arsip?/updateStatus', {
		lifecycleIds: pending.id,
		status: 'aktif'
	});
	assert.equal(result.status, 200, result.body);
	await page.goto(`${base}/murid/arsip?q=Identitas%20QA%203`, { waitUntil: 'networkidle0' });
	await page.click('input[aria-label="Pilih Identitas QA 3"]:not(:disabled)');
	const statusForm = 'form[action="?/updateStatus"]';
	const placementForm = 'form[action="?/previewPromotion"]';
	await page.waitForSelector(statusForm);
	assert.equal(await page.$(placementForm), null);
	assert.equal(await page.$eval(`${statusForm} select[name="status"]`, (el) => el.value), '');
	assert.deepEqual(
		await page.$$eval(`${statusForm} select option`, (els) =>
			els.map((el) => el.textContent.trim())
		),
		['Pilih status tujuan', 'Aktif', 'Pindah Sekolah', 'Keluar Sekolah', 'Alumni / Lulus']
	);
	await page.select(`${statusForm} select[name="status"]`, 'pindah');
	assert.equal(await page.$eval(statusForm, (el) => el.checkValidity()), false);
	await page.click(`${statusForm} input[type="checkbox"]`);
	assert.equal(await page.$eval(statusForm, (el) => el.checkValidity()), true);
	await page.screenshot({ path: path.join(folder, 'arsip-status-desktop.png'), fullPage: true });
	await page.click('input[aria-label="Penempatan Kelas"]');
	await page.waitForSelector(placementForm);
	assert.equal(await page.$(statusForm), null);
	assert.equal(
		await page.$eval(`select[name="targetClassId"] option[value="${kelas}"]`, (el) => el.disabled),
		true
	);
	await page.select('select[name="targetClassId"]', String(target.lastInsertRowid));
	await page.click(`${placementForm} button[type="submit"]`);
	await page.waitForSelector('form[action="?/promote"]');
	for (const [width, height] of [
		[1366, 900],
		[390, 844],
		[320, 800]
	]) {
		await page.setViewport({ width, height });
		await new Promise((resolve) => setTimeout(resolve, 600));
		await page.evaluate(() => {
			document.querySelector('.app-page-viewport').scrollTop = 0;
		});
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
			`Arsip overflow at ${width}`
		);
		await page.screenshot({
			path: path.join(folder, `arsip-placement-${width}.png`),
			fullPage: true
		});
		await page.$eval('form[action="?/promote"]', (el) => el.scrollIntoView({ block: 'center' }));
		await page.screenshot({
			path: path.join(folder, `arsip-placement-details-${width}.png`),
			fullPage: true
		});
	}
	await page.select('select[name="targetClassId"]', '');
	await page.waitForFunction(() => !document.querySelector('form[action="?/promote"]'));
	await page.select('select[name="targetClassId"]', String(target.lastInsertRowid));
	await page.click(`${placementForm} button[type="submit"]`);
	await page.waitForSelector('form[action="?/promote"]');
	await page.click('input[aria-label="Pilih Identitas QA 3"]:not(:disabled)');
	await page.waitForFunction(() => !document.querySelector('form[action="?/promote"]'));
	await page.click('input[aria-label="Pilih Identitas QA 3"]:not(:disabled)');
	await page.click('input[aria-label="Status Sekolah"]');
	await page.select(`${statusForm} select[name="status"]`, 'pindah');
	await page.click(`${statusForm} input[type="checkbox"]`);
	await page.click(`${statusForm} button[type="submit"]`);
	await page.waitForFunction(() =>
		document.querySelector('.alert-success')?.textContent.includes('Pindah Sekolah')
	);
	assert.equal(await page.$(statusForm), null);
	await page.click('input[aria-label="Pilih Identitas QA 3"]:not(:disabled)');
	await page.waitForSelector('input[aria-label="Penempatan Kelas"]');
	assert.equal(await page.$eval('input[aria-label="Penempatan Kelas"]', (el) => el.disabled), true);
	assert.equal(
		(await db.execute({ sql: 'SELECT status FROM murid_lifecycle WHERE id=?', args: [pending.id] }))
			.rows[0].status,
		'pindah'
	);
	assert.equal(
		(await db.execute({ sql: 'SELECT kelas_id FROM murid WHERE id=?', args: [students[2].id] }))
			.rows[0].kelas_id,
		kelas
	);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.deepEqual(
		await protectedData(),
		protectedBefore,
		'Nilai, presensi, QR, foto dan data sumber tidak boleh berubah saat arsip/pemulihan'
	);
	// Permanent deletion uses the same isolated database; no live student is touched.
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: sourceLifecycle.id });
	assert.equal(result.status, 409, result.body);
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: pending.id });
	assert.equal(result.status, 409, result.body);
	await db.execute({
		sql: "UPDATE auth_user SET type='user',permissions='[\"murid_arsip\"]' WHERE id=?",
		args: [admin.id]
	});
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: pending.id });
	assert.equal(result.status, 403, result.body);
	result = await post('/murid/arsip?/purge', { lifecycleIds: pending.id });
	assert.equal(result.status, 403, result.body);
	await db.execute({
		sql: "UPDATE auth_user SET type='admin',permissions='[]' WHERE id=?",
		args: [admin.id]
	});
	result = await post('/murid/arsip?/updateStatus', { lifecycleIds: pending.id, status: 'aktif' });
	assert.equal(result.status, 200, result.body);
	result = await post('/murid/arsip?/promote', {
		lifecycleIds: pending.id,
		targetClassId: Number(target.lastInsertRowid),
		confirmed: 'true'
	});
	assert.equal(result.status, 200, result.body);
	const toDeleteIds = (
		await db.execute({
			sql: 'SELECT murid_id FROM murid_identity_link WHERE sekolah_id=? AND identity_uid=? ORDER BY murid_id',
			args: [school, links[2].identity_uid]
		})
	).rows.map((row) => Number(row.murid_id));
	assert.equal(toDeleteIds.length, 2);
	result = await post('/murid/arsip?/updateStatus', {
		lifecycleIds: pending.id,
		status: 'keluar',
		tanggalStatus: '2026-10-11',
		alasan: 'Data salah input QA'
	});
	assert.equal(result.status, 200, result.body);
	await db.execute({
		sql: 'UPDATE murid_lifecycle SET needs_identity_review=1 WHERE id=?',
		args: [pending.id]
	});
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: pending.id });
	assert.equal(result.status, 409, result.body);
	await db.execute({
		sql: 'UPDATE murid_lifecycle SET needs_identity_review=0 WHERE id=?',
		args: [pending.id]
	});
	await db.execute({
		sql: 'INSERT INTO asesmen_sumatif(murid_id,mata_pelajaran_id,nilai_akhir,created_at) VALUES(?,?,90,CURRENT_TIMESTAMP)',
		args: [students[2].id, Number(subject.lastInsertRowid)]
	});
	const certificate = await db.execute({
		sql: "INSERT INTO martikulasi_hasil(sekolah_id,tahun_ajaran_id,kelas_id,murid_id,nomor_sttm,created_at) VALUES(?,?,?,?,'STTM-QA',CURRENT_TIMESTAMP)",
		args: [school, classRow.tahun_ajaran_id, kelas, students[2].id]
	});
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: pending.id });
	assert.equal(result.status, 200, result.body);
	let purgePlan = parseActionData(JSON.parse(result.body).data).purgePreview;
	assert.ok(purgePlan.blockers.some((item) => item.includes('STTM')));
	result = await post('/murid/arsip?/purge', {
		lifecycleIds: pending.id,
		fingerprint: purgePlan.fingerprint,
		confirmName: students[2].nama,
		purgeAck: 'true',
		alasan: 'QA'
	});
	assert.equal(result.status, 409, result.body);
	await db.execute({
		sql: 'DELETE FROM martikulasi_hasil WHERE id=?',
		args: [Number(certificate.lastInsertRowid)]
	});
	const attachment = await db.execute({
		sql: "INSERT INTO document_attachment(sekolah_id,entity_type,entity_id,entity_label_snapshot,category,original_name,stored_path,mime_type,size_bytes,sha256,created_at) VALUES(?,'murid',?,?,'ijazah','QA.pdf','qa/permanent-delete.pdf','application/pdf',1,?,CURRENT_TIMESTAMP)",
		args: [school, String(students[2].id), students[2].nama, 'a'.repeat(64)]
	});
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: pending.id });
	purgePlan = parseActionData(JSON.parse(result.body).data).purgePreview;
	assert.ok(purgePlan.blockers.some((item) => item.includes('lampiran')));
	await db.execute({
		sql: 'DELETE FROM document_attachment WHERE id=?',
		args: [Number(attachment.lastInsertRowid)]
	});
	const examSession = await db.execute({
		sql: "INSERT INTO ujian_session(sekolah_id,tahun_ajaran_id,semester_id,nama,created_at) VALUES(?,?,?,'Snapshot Purge QA',CURRENT_TIMESTAMP)",
		args: [school, classRow.tahun_ajaran_id, semester]
	});
	const examCard = await db.execute({
		sql: "INSERT INTO ujian_peserta(session_id,murid_id,murid_nama_snapshot,nomor_peserta,created_at) VALUES(?,?,?,'12345001',CURRENT_TIMESTAMP)",
		args: [Number(examSession.lastInsertRowid), students[2].id, students[2].nama]
	});
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: pending.id });
	purgePlan = parseActionData(JSON.parse(result.body).data).purgePreview;
	assert.equal(purgePlan.blockers.length, 0);
	assert.equal(purgePlan.periods, 2);
	assert.ok(
		purgePlan.dependencies.some(
			(item) => item.table === 'asesmen_sumatif' && item.effect === 'hapus'
		)
	);
	assert.ok(
		purgePlan.dependencies.some(
			(item) => item.table === 'ujian_peserta' && item.effect === 'dipertahankan'
		)
	);
	result = await post('/murid/arsip?/purge', {
		lifecycleIds: pending.id,
		fingerprint: purgePlan.fingerprint,
		confirmName: 'Nama salah',
		purgeAck: 'true',
		alasan: 'QA'
	});
	assert.equal(result.status, 409, result.body);
	await db.execute({
		sql: 'UPDATE asesmen_sumatif SET nilai_akhir=91 WHERE murid_id=?',
		args: [students[2].id]
	});
	result = await post('/murid/arsip?/purge', {
		lifecycleIds: pending.id,
		fingerprint: purgePlan.fingerprint,
		confirmName: students[2].nama,
		purgeAck: 'true',
		alasan: 'QA'
	});
	assert.equal(result.status, 409, result.body);
	for (const width of [1366, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(`${base}/murid/arsip?q=Identitas%20QA%203`, { waitUntil: 'networkidle0' });
		// The archive row has one permanent-delete command; its preview is a separate modal form.
		await page.click(`button[data-purge-id="${pending.id}"]`);
		await page.waitForSelector('dialog[open] form[action="?/previewPurge"]');
		await page.click('dialog[open] form[action="?/previewPurge"] button[type="submit"]');
		await page.waitForSelector('dialog[open] form[action="?/purge"]');
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
			`Purge overflow ${width}`
		);
		assert.equal(
			await page.$eval(
				'dialog[open] form[action="?/purge"] button[type="submit"]',
				(button) => button.disabled
			),
			true
		);
		await page.evaluate(async () => {
			await Promise.all(
				(document.querySelector('dialog[open]')?.getAnimations({ subtree: true }) ?? [])
					.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
					.map((animation) => animation.finished.catch(() => {}))
			);
		});
		await page.screenshot({
			path: path.join(folder, `purge-preview-${width}.png`),
			fullPage: true
		});
		if (width !== 320) await page.click('dialog[open] button[aria-label="Tutup"]');
	}
	const deleteForm = 'dialog[open] form[action="?/purge"]';
	await page.type(`${deleteForm} input[name="confirmName"]`, students[2].nama);
	await page.type(
		`${deleteForm} textarea[name="alasan"]`,
		'Hapus data uji yang salah input setelah backup otomatis'
	);
	await page.click(`${deleteForm} input[name="purgeAck"]`);
	await page.click(`${deleteForm} button[type="submit"]`);
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.equal(
		(await db.execute({ sql: 'SELECT id FROM murid WHERE id IN (?,?)', args: toDeleteIds })).rows
			.length,
		0
	);
	assert.equal(
		(await db.execute({ sql: 'SELECT id FROM murid_lifecycle WHERE id=?', args: [pending.id] }))
			.rows.length,
		0
	);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT id FROM asesmen_sumatif WHERE murid_id=?',
				args: [students[2].id]
			})
		).rows.length,
		0
	);
	const snapshot = (
		await db.execute({
			sql: 'SELECT * FROM ujian_peserta WHERE id=?',
			args: [Number(examCard.lastInsertRowid)]
		})
	).rows[0];
	assert.equal(snapshot.murid_id, null);
	assert.equal(snapshot.murid_nama_snapshot, students[2].nama);
	const purgeAudit = (
		await db.execute({
			sql: "SELECT after_data FROM audit_log WHERE entity_type='murid_permanent' AND entity_id=? ORDER BY id DESC LIMIT 1",
			args: [String(pending.id)]
		})
	).rows[0];
	const backupFile = JSON.parse(purgeAudit.after_data).backupFile;
	const purgeBackup = createClient({ url: `file:${path.join(folder, backupFile)}` });
	assert.equal(
		(
			await purgeBackup.execute({
				sql: 'SELECT id FROM murid WHERE id IN (?,?)',
				args: toDeleteIds
			})
		).rows.length,
		2
	);
	purgeBackup.close();
	const legacySnapshot = (
		await db.execute({
			sql: "SELECT id,nama_snapshot FROM murid_lifecycle WHERE sekolah_id=? AND identity_key='nisn:00000000'",
			args: [school]
		})
	).rows[0];
	assert.ok(legacySnapshot);
	result = await post('/murid/arsip?/previewPurge', { lifecycleIds: legacySnapshot.id });
	assert.equal(result.status, 200, result.body);
	const legacyPlan = parseActionData(JSON.parse(result.body).data).purgePreview;
	assert.equal(legacyPlan.periods, 0);
	assert.equal(legacyPlan.blockers.length, 0);
	result = await post('/murid/arsip?/purge', {
		lifecycleIds: legacySnapshot.id,
		fingerprint: legacyPlan.fingerprint,
		confirmName: legacySnapshot.nama_snapshot,
		purgeAck: 'true',
		alasan: 'QA pembersihan snapshot lama yang sudah terlepas dari murid aktif'
	});
	assert.equal(result.status, 200, result.body);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT id FROM murid_lifecycle WHERE id=?',
				args: [legacySnapshot.id]
			})
		).rows.length,
		0
	);
	assert.deepEqual(await protectedData(), protectedBefore);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.deepEqual(errors, []);
	await writeFile(path.join(folder, 'server.log'), output);
	console.log(
		'PASS migration/review evidence, single-only admin recovery, stale identity rejection, corrupt shared UID rollback, single/bulk archive, restore, transactional import rollback, promotion, stable UID after NISN edit, leading zero export, duplicate rejection, admin-only permanent purge with verified backup, protected STTM/attachments, retained exam snapshots, SQLite and desktop/mobile UI.'
	);
	console.log('QA artifacts:', folder);
} catch (error) {
	if (browser) {
		const pages = await browser.pages();
		const lastPage = pages.at(-1);
		if (lastPage) {
			await lastPage.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true });
			await writeFile(path.join(folder, 'failure.html'), await lastPage.content());
		}
		console.error('QA failure artifacts:', folder);
	}
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
