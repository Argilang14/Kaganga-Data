import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import net from 'node:net';
import { suggestedEducationLevel } from '../src/lib/education-unit.ts';

const project = process.cwd();
const require = createRequire(import.meta.url);
const { parse } = await import(
	pathToFileURL(
		require.resolve('devalue', {
			paths: [path.dirname(require.resolve('@sveltejs/kit/package.json'))]
		})
	).href
);
const port = Number(process.env.EDUCATION_UNITS_QA_PORT || 5158);
const development = process.env.EDUCATION_UNITS_QA_DEV === '1';
assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535 && port !== 1206);
const occupied = await new Promise((resolve) => {
	const socket = net.connect(port, '127.0.0.1');
	socket.setTimeout(3000);
	socket.on('connect', () => {
		socket.destroy();
		resolve(true);
	});
	socket.on('error', () => {
		socket.destroy();
		resolve(false);
	});
	socket.on('timeout', () => {
		socket.destroy();
		resolve(true);
	});
});
assert.equal(
	occupied,
	false,
	'QA port already in use; no existing server will be tested or stopped.'
);
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'education-units-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
let child,
	browser,
	mock,
	output = '';
try {
	await db.execute('PRAGMA busy_timeout=10000');
	const original = (await db.execute('SELECT * FROM murid ORDER BY id LIMIT 1')).rows[0];
	assert.ok(original);
	const schoolId = Number(original.sekolah_id),
		semesterId = Number(original.semester_id);
	const classRow = (
		await db.execute({ sql: 'SELECT * FROM kelas WHERE id=?', args: [original.kelas_id] })
	).rows[0];
	const originalStudents = (
		await db.execute('SELECT id,sekolah_id,kelas_id,nis,nisn,qr_token FROM murid ORDER BY id')
	).rows;
	const originalNumbers = (
		await db.execute('SELECT id,nomor_peserta FROM ujian_peserta ORDER BY id')
	).rows;
	const originalSttm = (
		await db.execute('SELECT * FROM martikulasi_hasil WHERE nomor_sttm IS NOT NULL ORDER BY id')
	).rows;
	const originalQr = (await db.execute('SELECT * FROM qr_murid ORDER BY id')).rows;
	const admin = (await db.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0];
	assert.ok(admin);
	await db.execute({
		sql: 'UPDATE auth_user SET must_change_password=0 WHERE id=?',
		args: [admin.id]
	});
	const token = randomBytes(32).toString('base64url'),
		now = new Date().toISOString();
	await db.execute({
		sql: 'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)',
		args: [
			admin.id,
			createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 3600000).toISOString(),
			now,
			now
		]
	});
	const cookie = `rapkumer-session=${token}; active-sekolah-id=${schoolId}; active-kelas-id=${original.kelas_id}`;
	child = spawn(
		process.execPath,
		development
			? [
					'node_modules/vite/bin/vite.js',
					'--host',
					'127.0.0.1',
					'--port',
					String(port),
					'--strictPort'
				]
			: ['build/index.js'],
		{
			cwd: project,
			windowsHide: true,
			env: {
				...process.env,
				PORT: String(port),
				HOST: '127.0.0.1',
				ORIGIN: base,
				DB_URL: `file:${database}`,
				KAGANGA_DATA_DIR: path.join(folder, 'data'),
				NODE_ENV: development ? 'development' : 'production'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(base + '/login')).status === 200) {
				ready = true;
				break;
			}
		} catch {
			/* starting */
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, output.slice(-5000));
	const get = (route, headers = {}) =>
		fetch(base + route, { headers: { cookie, ...headers }, redirect: 'manual' });
	async function post(route, values, status = 200, requestCookie = cookie) {
		const body = values instanceof FormData ? values : new FormData();
		if (!(values instanceof FormData))
			for (const [key, value] of Object.entries(values)) body.set(key, String(value));
		const response = await fetch(base + route, {
			method: 'POST',
			headers: {
				cookie: requestCookie,
				origin: base,
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			body,
			redirect: 'manual'
		});
		const result = await response.text();
		const parsed = JSON.parse(result);
		assert.equal(parsed.status ?? response.status, status, `${route}: ${result}`);
		return parsed.data ? parse(parsed.data) : parsed;
	}
	const unitsRoute = '/sekolah/satuan-pendidikan';
	assert.equal((await get(unitsRoute)).status, 200);
	assert.match(
		await (await get(`/cetak/cover/__data.json?murid_id=${original.id}`)).text(),
		/belum dipetakan/
	);
	await post(unitsRoute + '?/saveUnit', { jenjang: 'sd', nama: 'SD', npsn: 'INVALID' }, 400);
	const official = [
		{ jenjang: 'sd', nama: 'Sekolah Rakyat Dasar Provinsi Bengkulu', npsn: '76550273' },
		{ jenjang: 'smp', nama: 'Sekolah Rakyat Menengah Pertama Provinsi Bengkulu', npsn: '72735090' },
		{ jenjang: 'sma', nama: 'Sekolah Rakyat Menengah Atas Provinsi Bengkulu', npsn: '70055420' }
	];
	for (const unit of official) await post(unitsRoute + '?/saveUnit', unit);
	await post(unitsRoute + '?/saveUnit', { ...official[0], npsn: official[1].npsn }, 400);
	const units = (
		await db.execute({
			sql: 'SELECT * FROM sekolah_satuan_pendidikan WHERE sekolah_id=?',
			args: [schoolId]
		})
	).rows;
	const unitsByLevel = new Map(units.map((row) => [String(row.jenjang), row]));
	async function insertCopy(table, row, overrides) {
		const values = { ...row, ...overrides };
		delete values.id;
		const columns = Object.keys(values);
		return Number(
			(
				await db.execute({
					sql: `INSERT INTO ${table}(${columns.map((key) => `"${key}"`).join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
					args: Object.values(values)
				})
			).lastInsertRowid
		);
	}
	const fixtureClasses = [],
		fixtureStudents = [];
	for (const [name, level, count] of [
		['QA SD B', 'sd', 1],
		['QA SD A', 'sd', 2],
		['QA SMP A', 'smp', 2],
		['QA SMA A', 'sma', 2]
	]) {
		const classId = await insertCopy('kelas', classRow, {
			nama: name,
			fase: level === 'sd' ? 'Fase A' : level === 'smp' ? 'Fase D' : 'Fase E',
			dapodik_rombongan_belajar_id: null
		});
		fixtureClasses.push({ id: classId, level, count, name });
		for (let index = 0; index < count; index++) {
			const ordinal = fixtureStudents.length + 1;
			const id = await insertCopy('murid', original, {
				kelas_id: classId,
				nama: `Murid QA ${level} ${ordinal}`,
				nis: `UNIT-QA-${ordinal}`,
				nisn: String(9900000000 + ordinal),
				qr_token: `unit-qa-${ordinal}`,
				dapodik_peserta_didik_id: `unit-pd-${ordinal}`,
				dapodik_anggota_rombel_id: null
			});
			fixtureStudents.push({ id, classId, level });
		}
	}
	const allClasses = (
		await db.execute({
			sql: 'SELECT id,nama,fase FROM kelas WHERE sekolah_id=? AND semester_id=?',
			args: [schoolId, semesterId]
		})
	).rows;
	const mapping = { semesterId, confirmed: 'on' };
	for (const row of allClasses)
		mapping[`kelas_${row.id}`] = unitsByLevel.get(
			suggestedEducationLevel({
				nama: String(row.nama),
				fase: row.fase == null ? null : String(row.fase)
			})
		)?.id;
	await post(unitsRoute + '?/mapClasses', { semesterId }, 400);
	await post(unitsRoute + '?/mapClasses', mapping);
	const foreignSchool = (
		await db.execute({ sql: 'SELECT id FROM sekolah WHERE id<>? LIMIT 1', args: [schoolId] })
	).rows[0];
	assert.ok(foreignSchool);
	const foreignUnit = await db.execute({
		sql: 'INSERT INTO sekolah_satuan_pendidikan(sekolah_id,jenjang,nama,npsn,created_at) VALUES(?,?,?,?,?)',
		args: [foreignSchool.id, 'sd', 'Foreign SD', '12345678', now]
	});
	await assert.rejects(
		db.execute({
			sql: 'UPDATE kelas_satuan_pendidikan SET satuan_id=? WHERE kelas_id=?',
			args: [Number(foreignUnit.lastInsertRowid), original.kelas_id]
		}),
		/Satuan pendidikan di luar sekolah kelas/
	);
	assert.deepEqual(
		(
			await db.execute(
				`SELECT id,sekolah_id,kelas_id,nis,nisn,qr_token FROM murid WHERE id<=${Number(originalStudents.at(-1).id)} ORDER BY id`
			)
		).rows,
		originalStudents
	);
	assert.deepEqual((await db.execute('SELECT * FROM qr_murid ORDER BY id')).rows, originalQr);
	assert.deepEqual(
		(await db.execute('SELECT id,nomor_peserta FROM ujian_peserta ORDER BY id')).rows,
		originalNumbers
	);
	assert.deepEqual(
		(await db.execute('SELECT * FROM martikulasi_hasil WHERE nomor_sttm IS NOT NULL ORDER BY id'))
			.rows,
		originalSttm
	);
	console.log(
		'PASS: migration/mapping preserve student IDs, QR, old exam numbers and issued STTM; cross-school mapping rejected'
	);
	await post('/ujian?/saveSession', {
		tahunAjaranId: classRow.tahun_ajaran_id,
		semesterId,
		nama: 'Ujian Multi Jenjang QA',
		singkatan: 'QA',
		status: 'draft',
		tanggalCetak: '2026-10-08'
	});
	const exam = (
		await db.execute("SELECT id FROM ujian_session WHERE nama='Ujian Multi Jenjang QA'")
	).rows[0];
	for (const fixture of fixtureClasses)
		await post('/ujian?/addClass', { sessionId: exam.id, classId: fixture.id, room: '01' });
	const participants = (
		await db.execute({
			sql: 'SELECT * FROM ujian_peserta WHERE session_id=? ORDER BY id',
			args: [exam.id]
		})
	).rows;
	assert.deepEqual(
		participants.map((row) => row.nomor_peserta),
		[
			'7655027301',
			'7655027302',
			'7655027303',
			'7273509001',
			'7273509002',
			'7005542001',
			'7005542002'
		]
	);
	assert.deepEqual(
		participants.map((row) => row.sekolah_nama_snapshot),
		['sd', 'sd', 'sd', 'smp', 'smp', 'sma', 'sma'].map((level) => unitsByLevel.get(level).nama)
	);
	await post('/ujian?/addClass', { sessionId: exam.id, classId: fixtureClasses[0].id });
	assert.equal(
		Number(
			(
				await db.execute({
					sql: 'SELECT count(*) AS n FROM ujian_peserta WHERE session_id=?',
					args: [exam.id]
				})
			).rows[0].n
		),
		7
	);
	const preview = await post('/ujian?/previewRenumber', { sessionId: exam.id });
	await post('/ujian?/renumberParticipants', { sessionId: exam.id }, 400);
	await post(
		'/ujian?/renumberParticipants',
		{ sessionId: exam.id, confirmed: 'yes', previewHash: 'stale' },
		409
	);
	await post('/ujian?/renumberParticipants', {
		sessionId: exam.id,
		confirmed: 'yes',
		previewHash: preview.renumberPreview.hash
	});
	console.log(
		'PASS: numbering is per NPSN and class-addition order; duplicate additions and stale renumber preview are rejected'
	);
	for (const layout of ['kartu', 'meja']) {
		const response = await get(
			`/api/pdf/kartu-ujian?session_id=${exam.id}&layout=${layout}&akun_lms=0&qr_absensi=0&ttd_kepsek=1`
		);
		assert.equal(response.status, 200, await response.clone().text());
		const bytes = Buffer.from(await response.arrayBuffer());
		assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
		await writeFile(path.join(folder, `kartu-ujian-${layout}.pdf`), bytes);
	}
	for (const student of fixtureStudents) {
		const response = await get(`/cetak/cover/__data.json?murid_id=${student.id}`);
		assert.equal(response.status, 200, await response.clone().text());
		assert.ok((await response.text()).includes(unitsByLevel.get(student.level).npsn));
	}
	const exportResponse = await get('/api/murid/download-excel');
	assert.equal(exportResponse.status, 200);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
	const sheet = workbook.worksheets[0],
		headers = sheet.getRow(1).values;
	assert.ok(headers.includes('NPSN Satuan'));
	const npsnIndex = headers.indexOf('NPSN Satuan');
	for (const student of fixtureStudents) {
		const row = sheet
			.getRows(2, sheet.rowCount - 1)
			.find((item) => item.getCell(2).value === `UNIT-QA-${fixtureStudents.indexOf(student) + 1}`);
		assert.equal(row.getCell(npsnIndex).value, unitsByLevel.get(student.level).npsn);
	}
	await writeFile(
		path.join(folder, 'murid-multi-jenjang.xlsx'),
		Buffer.from(await workbook.xlsx.writeBuffer())
	);
	const fixtureRows = sheet
		.getRows(2, sheet.rowCount - 1)
		.filter((row) => String(row.getCell(2).value).startsWith('UNIT-QA-'));
	async function importRows(columns, rows, expectedStatus = 200) {
		const imported = new ExcelJS.Workbook();
		const target = imported.addWorksheet('Murid');
		target.addRow(columns);
		for (const row of rows) target.addRow(row);
		const form = new FormData();
		form.set('tahunAjaranId', String(classRow.tahun_ajaran_id));
		form.set('semesterId', String(semesterId));
		form.set(
			'data',
			new Blob([await imported.xlsx.writeBuffer()], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}),
			'qa.xlsx'
		);
		return post('/akademik?/save', form, expectedStatus);
	}
	const columns = headers.slice(1);
	const rows = fixtureRows.map((row) => row.values.slice(1));
	await importRows(columns, rows);
	const mismatched = rows.map((row) => [...row]);
	mismatched[0][npsnIndex - 1] = official[1].npsn;
	await importRows(columns, mismatched, 400);
	await importRows(
		columns.slice(0, -3),
		rows.map((row) => row.slice(0, -3))
	);
	assert.equal(
		Number(
			(await db.execute("SELECT count(*) AS n FROM murid WHERE nis LIKE 'UNIT-QA-%'")).rows[0].n
		),
		7
	);
	console.log(
		'PASS: unit-aware and legacy imports preserve student count; conflicting unit metadata rejected'
	);
	const martikulasiRoute = '/martikulasi/pengaturan';
	await post(martikulasiRoute + '?/simpan', {
		tahunAjaranId: classRow.tahun_ajaran_id,
		formatNomorSttm: '{urut}/STTM/QA/{tahun}',
		nomorUrutSttmBerikutnya: 9000,
		lokasiPenetapan: 'Bengkulu'
	});
	for (const student of fixtureStudents)
		await db.execute({
			sql: 'INSERT INTO martikulasi_hasil(sekolah_id,tahun_ajaran_id,kelas_id,murid_id,status_kelengkapan,level_penempatan,created_at) VALUES(?,?,?,?,?,?,?)',
			args: [
				schoolId,
				classRow.tahun_ajaran_id,
				student.classId,
				student.id,
				'lengkap',
				'madya',
				now
			]
		});
	await post(martikulasiRoute + '?/terbitkanSttm', {
		tahunAjaranId: classRow.tahun_ajaran_id,
		tanggalSttm: '2026-10-08'
	});
	const issuedQuery = {
		sql:
			'SELECT * FROM martikulasi_hasil WHERE murid_id IN (' +
			fixtureStudents.map(() => '?').join(',') +
			') ORDER BY murid_id',
		args: fixtureStudents.map((student) => student.id)
	};
	const issued = (await db.execute(issuedQuery)).rows;
	for (const row of issued) {
		const student = fixtureStudents.find((student) => student.id === Number(row.murid_id));
		assert.equal(row.npsn_snapshot, unitsByLevel.get(student.level).npsn);
		assert.equal(row.sekolah_nama_snapshot, unitsByLevel.get(student.level).nama);
		assert.ok(row.nomor_sttm);
	}
	await post(unitsRoute + '?/saveUnit', {
		...official[0],
		nama: 'SD QA Nama Baru',
		npsn: '12345679'
	});
	await post(martikulasiRoute + '?/terbitkanSttm', {
		tahunAjaranId: classRow.tahun_ajaran_id,
		tanggalSttm: '2026-10-09'
	});
	assert.deepEqual((await db.execute(issuedQuery)).rows, issued);
	assert.deepEqual(
		(
			await db.execute({
				sql: 'SELECT * FROM ujian_peserta WHERE session_id=? ORDER BY id',
				args: [exam.id]
			})
		).rows.map((row) => row.sekolah_npsn_snapshot),
		participants.map((row) => row.sekolah_npsn_snapshot)
	);
	await post(unitsRoute + '?/saveUnit', official[0]);
	for (const jenis of ['sttm', 'raport']) {
		const response = await get(
			`/api/pdf/martikulasi?jenis=${jenis}&tahun_ajaran_id=${classRow.tahun_ajaran_id}&murid_id=${fixtureStudents[0].id}`
		);
		assert.equal(response.status, 200, await response.clone().text());
		await writeFile(
			path.join(folder, `martikulasi-${jenis}.pdf`),
			Buffer.from(await response.arrayBuffer())
		);
	}
	const nextSemester = (
		await db.execute({
			sql: 'SELECT id FROM semester WHERE tahun_ajaran_id=? AND id<>? LIMIT 1',
			args: [classRow.tahun_ajaran_id, semesterId]
		})
	).rows[0];
	assert.ok(nextSemester);
	const targetClassId = await insertCopy('kelas', classRow, {
		nama: 'QA Target SMP',
		fase: 'Fase D',
		semester_id: nextSemester.id,
		dapodik_rombongan_belajar_id: null
	});
	const student = fixtureStudents[0];
	const identity = (
		await db.execute({
			sql: 'SELECT identity_uid FROM murid_identity_link WHERE murid_id=?',
			args: [student.id]
		})
	).rows[0];
	assert.ok(identity);
	const lifecycle = (
		await db.execute({
			sql: 'SELECT id FROM murid_lifecycle WHERE sekolah_id=? AND identity_key=?',
			args: [schoolId, `uid:${identity.identity_uid}`]
		})
	).rows[0];
	assert.ok(lifecycle);
	await post('/murid/arsip?/previewPromotion', { lifecycleIds: lifecycle.id, targetClassId }, 400);
	await db.execute({
		sql: 'INSERT INTO kelas_satuan_pendidikan(kelas_id,satuan_id,nama_snapshot,npsn_snapshot,created_at) VALUES(?,?,?,?,?)',
		args: [targetClassId, unitsByLevel.get('smp').id, official[1].nama, official[1].npsn, now]
	});
	await post('/murid/arsip?/promote', {
		lifecycleIds: lifecycle.id,
		targetClassId,
		confirmed: 'true'
	});
	const promoted = (
		await db.execute({
			sql: 'SELECT m.id,m.kelas_id,mi.identity_uid FROM murid m JOIN murid_identity_link mi ON mi.murid_id=m.id WHERE m.nis=? AND m.semester_id=?',
			args: ['UNIT-QA-1', nextSemester.id]
		})
	).rows[0];
	assert.equal(Number(promoted.kelas_id), targetClassId);
	assert.equal(promoted.identity_uid, identity.identity_uid);
	assert.equal(
		Number(
			(await db.execute({ sql: 'SELECT kelas_id FROM murid WHERE id=?', args: [student.id] }))
				.rows[0].kelas_id
		),
		student.classId
	);
	const targetCover = await (await get(`/cetak/cover/__data.json?murid_id=${promoted.id}`)).text();
	assert.ok(targetCover.includes(official[1].npsn));
	await db.execute({
		sql: "UPDATE auth_user SET type='user',jabatan_akses=NULL,permissions='[]' WHERE id=?",
		args: [admin.id]
	});
	await post(unitsRoute + '?/saveUnit', official[0], 403);
	await post(unitsRoute + '?/mapClasses', mapping, 403);
	await post(
		'/sekolah/form?/save',
		{ id: schoolId, jenjangPendidikan: 'sd', jenjangVariant: 'sd', npsn: '12345678' },
		403
	);
	await db.execute({ sql: "UPDATE auth_user SET type='admin' WHERE id=?", args: [admin.id] });
	console.log(
		'PASS: issued STTM/exam snapshots survive identity edits; promotion retains UID/history and rejects unmapped targets; permissions enforced'
	);
	const activity = (
		await db.execute({
			sql: 'SELECT id FROM kegiatan_absensi WHERE sekolah_id=? AND aktif=1 ORDER BY id LIMIT 1',
			args: [schoolId]
		})
	).rows[0];
	assert.ok(activity);
	for (const level of ['sd', 'smp', 'sma']) {
		const student = fixtureStudents.find(
			(item) => item.level === level && item.id !== fixtureStudents[0].id
		);
		const qr = `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
		await db.execute({
			sql: 'INSERT INTO qr_murid(murid_id,token_hash,token_version,issued_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
			args: [student.id, createHash('sha256').update(qr).digest('hex'), 1, now, now, now]
		});
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await fetch(base + '/api/administrasi/absensi/scan', {
				method: 'POST',
				headers: { cookie, origin: base, 'content-type': 'application/json' },
				body: JSON.stringify({
					mode: 'kegiatan',
					kegiatanId: activity.id,
					token: qr,
					status: 'hadir'
				})
			});
			assert.equal(response.status, 200, await response.clone().text());
			assert.equal((await response.json()).code, attempt ? 'already_present' : 'success');
		}
		assert.equal(
			Number(
				(
					await db.execute({
						sql: 'SELECT count(*) AS n FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?',
						args: [student.id, activity.id]
					})
				).rows[0].n
			),
			1
		);
	}
	console.log(
		'PASS: SD/SMP/SMA QR scans share the same attendance workflow; repeated scans create no duplicates'
	);
	console.log(
		"PASS: cover and XLSX export carry each student's unit identity; PDFs generated for regular and desk cards"
	);
	const yearRow = (
		await db.execute({
			sql: 'SELECT * FROM tahun_ajaran WHERE id=?',
			args: [classRow.tahun_ajaran_id]
		})
	).rows[0];
	const semesterRow = (
		await db.execute({ sql: 'SELECT * FROM semester WHERE id=?', args: [semesterId] })
	).rows[0];
	const copyYear = await insertCopy('tahun_ajaran', yearRow, { nama: 'QA Unit Copy', is_aktif: 0 });
	const copySource = await insertCopy('semester', semesterRow, {
		tahun_ajaran_id: copyYear,
		nama: 'QA Ganjil',
		tipe: 'ganjil',
		is_aktif: 0
	});
	const copyTarget = await insertCopy('semester', semesterRow, {
		tahun_ajaran_id: copyYear,
		nama: 'QA Genap',
		tipe: 'genap',
		is_aktif: 0
	});
	const copyClass = await insertCopy('kelas', classRow, {
		nama: 'QA Copy SD',
		fase: 'Fase A',
		tahun_ajaran_id: copyYear,
		semester_id: copySource,
		dapodik_rombongan_belajar_id: null
	});
	await db.execute({
		sql: 'INSERT INTO kelas_satuan_pendidikan(kelas_id,satuan_id,nama_snapshot,npsn_snapshot,created_at) VALUES(?,?,?,?,?)',
		args: [copyClass, unitsByLevel.get('sd').id, official[0].nama, official[0].npsn, now]
	});
	await insertCopy('murid', original, {
		nama: 'Murid Copy QA',
		nis: 'UNIT-COPY-QA',
		nisn: '9900000099',
		kelas_id: copyClass,
		semester_id: copySource,
		qr_token: 'unit-copy-qr',
		dapodik_peserta_didik_id: null,
		dapodik_anggota_rombel_id: null
	});
	for (let attempt = 0; attempt < 2; attempt++)
		await post('/akademik?/copy-semester', {
			sourceSemesterId: copySource,
			targetSemesterId: copyTarget
		});
	const copied = (
		await db.execute({
			sql: 'SELECT m.id,mp.npsn_snapshot FROM murid m JOIN kelas_satuan_pendidikan mp ON mp.kelas_id=m.kelas_id WHERE m.semester_id=? AND m.nis=?',
			args: [copyTarget, 'UNIT-COPY-QA']
		})
	).rows;
	assert.equal(copied.length, 1);
	assert.equal(copied[0].npsn_snapshot, official[0].npsn);
	console.log(
		'PASS: semester copy inherits the class unit and repeated copy creates no duplicate student'
	);
	const parentSchool = (
		await db.execute({ sql: 'SELECT * FROM sekolah WHERE id=?', args: [schoolId] })
	).rows[0];
	const address = (
		await db.execute({ sql: 'SELECT * FROM alamat WHERE id=?', args: [parentSchool.alamat_id] })
	).rows[0];
	const principal = (
		await db.execute({
			sql: 'SELECT * FROM pegawai WHERE id=?',
			args: [parentSchool.kepala_sekolah_id]
		})
	).rows[0];
	const schoolForm = {
		id: schoolId,
		nama: parentSchool.nama,
		email: parentSchool.email,
		lokasiTandaTangan: parentSchool.lokasi_tanda_tangan || 'Bengkulu',
		naungan: parentSchool.naungan,
		statusKepalaSekolah: parentSchool.status_kepala_sekolah,
		'alamat.jalan': address.jalan || '',
		'alamat.desa': address.desa || '',
		'alamat.kecamatan': address.kecamatan || '',
		'alamat.kabupaten': address.kabupaten || '',
		'alamat.provinsi': address.provinsi || '',
		'alamat.kodePos': address.kode_pos || '',
		'kepalaSekolah.nama': principal.nama,
		'kepalaSekolah.nip': principal.nip
	};
	const oldMappings = (await db.execute('SELECT * FROM kelas_satuan_pendidikan ORDER BY kelas_id'))
		.rows;
	await post(
		'/sekolah/form?/save',
		{ ...schoolForm, jenjangPendidikan: 'constructor', jenjangVariant: '', npsn: '12345678' },
		400
	);
	const srtForm = { ...schoolForm, jenjangPendidikan: 'srt', jenjangVariant: 'srt' };
	await post('/sekolah/form?/save', srtForm);
	assert.equal(
		(await db.execute({ sql: 'SELECT npsn FROM sekolah WHERE id=?', args: [schoolId] })).rows[0]
			.npsn,
		parentSchool.npsn
	);
	await post('/sekolah/form?/save', { ...srtForm, npsn: 'Diatur di Satuan Pendidikan' });
	assert.equal(
		(await db.execute({ sql: 'SELECT npsn FROM sekolah WHERE id=?', args: [schoolId] })).rows[0]
			.npsn,
		parentSchool.npsn
	);
	for (const npsn of ['', '1234567', '123456789', 'Diatur di Satuan Pendidikan'])
		await post(
			'/sekolah/form?/save',
			{ ...schoolForm, jenjangPendidikan: 'sd', jenjangVariant: 'sd', npsn },
			400
		);
	await post(
		'/sekolah/form?/save',
		{ ...schoolForm, jenjangPendidikan: 'sd', jenjangVariant: 'srt', npsn: '12345678' },
		400
	);
	await post('/sekolah/form?/save', {
		...schoolForm,
		jenjangPendidikan: 'sd',
		jenjangVariant: 'sd',
		npsn: '12345678'
	});
	const ordinaryCover = await (
		await get(`/cetak/cover/__data.json?murid_id=${fixtureStudents[0].id}`)
	).text();
	assert.ok(ordinaryCover.includes('12345678'));
	await post('/sekolah/form?/save', srtForm);
	assert.equal(
		(await db.execute({ sql: 'SELECT npsn FROM sekolah WHERE id=?', args: [schoolId] })).rows[0]
			.npsn,
		'12345678'
	);
	await post('/sekolah/form?/save', {
		...schoolForm,
		jenjangPendidikan: 'sd',
		jenjangVariant: 'sd',
		npsn: parentSchool.npsn
	});
	await post('/sekolah/form?/save', srtForm);
	assert.deepEqual(
		(await db.execute('SELECT * FROM kelas_satuan_pendidikan ORDER BY kelas_id')).rows,
		oldMappings
	);
	const newSchoolForm = {
		...srtForm,
		nama: 'QA SRT Tanpa NPSN Induk',
		npsn: 'Diatur di Satuan Pendidikan'
	};
	delete newSchoolForm.id;
	await post('/sekolah/form?/save', newSchoolForm);
	const newSchool = (
		await db.execute(
			"SELECT * FROM sekolah WHERE nama='QA SRT Tanpa NPSN Induk' ORDER BY id DESC LIMIT 1"
		)
	).rows[0];
	assert.ok(newSchool);
	assert.equal(newSchool.npsn, '');
	assert.equal(
		Number(
			(
				await db.execute({
					sql: 'SELECT sekolah_id FROM pegawai WHERE id=?',
					args: [newSchool.kepala_sekolah_id]
				})
			).rows[0].sekolah_id
		),
		Number(newSchool.id)
	);
	const newCookie = `rapkumer-session=${token}; active-sekolah-id=${newSchool.id}`;
	await post(unitsRoute + '?/saveUnit', official[0], 200, newCookie);
	assert.equal(
		(
			await db.execute({
				sql: 'SELECT npsn FROM sekolah_satuan_pendidikan WHERE sekolah_id=?',
				args: [newSchool.id]
			})
		).rows[0].npsn,
		official[0].npsn
	);
	console.log(
		'PASS: school form preserves legacy NPSN, rejects invalid ordinary NPSN/variants, switches identity safely, and creates SRT without parent NPSN'
	);
	let mockCalls = 0;
	mock = createServer((request, response) => {
		mockCalls++;
		const url = new URL(request.url, 'http://localhost');
		assert.equal(url.searchParams.get('npsn'), official[1].npsn);
		let rows = [];
		if (url.pathname.endsWith('getSekolah'))
			rows = [{ sekolah_id: 'unit-school-smp', npsn: official[1].npsn, nama: official[1].nama }];
		if (url.pathname.endsWith('getRombonganBelajar'))
			rows = [
				{
					rombongan_belajar_id: 'unit-rombel-smp',
					nama: fixtureClasses[2].name,
					jenis_rombel: 1,
					tingkat_pendidikan_id: 7
				}
			];
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(rows));
	});
	mock.listen(0, '127.0.0.1');
	await once(mock, 'listening');
	const dapodikInput = {
		satuanId: unitsByLevel.get('smp').id,
		url: `http://127.0.0.1:${mock.address().port}`,
		token: 'unit-qa-token',
		npsn: official[1].npsn,
		semesterId: '20261'
	};
	await post('/sekolah/form/sync-dapodik?/run', { ...dapodikInput, operation: 'save' });
	assert.equal(mockCalls, 0);
	await post('/sekolah/form/sync-dapodik?/run', { ...dapodikInput, operation: 'preview' });
	const callsBefore = mockCalls;
	await post(
		'/sekolah/form/sync-dapodik?/run',
		{ ...dapodikInput, operation: 'apply', confirmApply: 'yes', categories: 'kelas' },
		409
	);
	assert.equal(mockCalls, callsBefore);
	const dapodikConfigs = (await db.execute('SELECT * FROM dapodik_satuan_settings')).rows;
	assert.equal(dapodikConfigs.length, 1);
	assert.equal(Number(dapodikConfigs[0].satuan_id), Number(unitsByLevel.get('smp').id));
	console.log(
		'PASS: Dapodik settings/preview use a unit; save and blocked apply send no request to real Dapodik'
	);
	const executablePath = [
		process.env.PUPPETEER_EXECUTABLE_PATH,
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
	]
		.filter(Boolean)
		.find(existsSync);
	assert.ok(executablePath);
	browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
	const page = await browser.newPage();
	await page.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(schoolId), url: base },
		{ name: 'active-kelas-id', value: String(original.kelas_id), url: base }
	);
	for (const width of [1366, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(base + unitsRoute, { waitUntil: 'networkidle0' });
		await new Promise((resolve) => setTimeout(resolve, 600));
		assert.equal(
			await page
				.locator('h1')
				.map((el) => el.textContent)
				.wait(),
			'Satuan Pendidikan'
		);
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
			`page overflow ${width}`
		);
		await page.screenshot({ path: path.join(folder, `satuan-${width}.png`), fullPage: true });
		await page.$eval('.mapping-section', (element) => element.scrollIntoView({ block: 'start' }));
		await new Promise((resolve) => setTimeout(resolve, 200));
		assert.ok(
			await page.$$eval('.mapping-selection select', (elements) =>
				elements.every((element) => {
					const bounds = element.getBoundingClientRect();
					return bounds.left >= 0 && bounds.right <= window.innerWidth;
				})
			),
			`mapping controls overflow ${width}`
		);
		await page.screenshot({ path: path.join(folder, `mapping-${width}.png`), fullPage: true });
		await page.goto(base + '/sekolah/form', { waitUntil: 'networkidle0' });
		await page.waitForSelector('input[name="npsn"]:disabled');
		assert.ok(await page.$('a[href="/sekolah/satuan-pendidikan"]'));
		assert.equal(
			await page.$eval('input[name="npsn"]', (element) => element.value),
			parentSchool.npsn
		);
		await page.select('select[name="jenjangPendidikan"]', 'sd');
		assert.equal(await page.$eval('input[name="npsn"]', (element) => element.disabled), false);
		await page.$eval('input[name="npsn"]', (element) => {
			element.value = '87654321';
			element.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.select('select[name="jenjangPendidikan"]', 'srt');
		await page.select('select[name="jenjangPendidikan"]', 'sd');
		assert.equal(await page.$eval('input[name="npsn"]', (element) => element.value), '87654321');
		await page.reload({ waitUntil: 'networkidle0' });
		await page.waitForSelector('input[name="npsn"]:disabled');
		await page.$eval('input[name="npsn"]', (element) =>
			element.parentElement.parentElement.scrollIntoView({ block: 'center' })
		);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		await page.screenshot({ path: path.join(folder, `school-form-${width}.png`), fullPage: true });
		await page.goto(base + '/sekolah/form?mode=new', { waitUntil: 'networkidle0' });
		await page.select('select[name="jenjangPendidikan"]', 'srt');
		assert.ok(await page.$('button[title="Simpan sekolah terlebih dahulu"]:disabled'));
	}
	assert.equal(String((await db.execute('PRAGMA quick_check')).rows[0].quick_check), 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	console.log(
		`PASS: responsive desktop/tablet/mobile UI, SQLite and foreign keys. Artifacts: ${folder}`
	);
} catch (cause) {
	console.error(output.slice(-8000));
	throw cause;
} finally {
	await browser?.close();
	if (mock) await new Promise((resolve) => mock.close(resolve));
	if (child && child.exitCode === null) {
		const stopped = once(child, 'exit');
		child.kill();
		await stopped;
	}
	db.close();
	await writeFile(path.join(folder, 'server.log'), output);
}
