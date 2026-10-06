import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';

const project = process.cwd(),
	port = Number(process.env.ACCESS_QA_PORT || 5164);
assert.ok(![5152, 1206].includes(port));
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'role-menu-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
let child,
	browser,
	output = '';
const checks = [];
const check = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
async function insert(table, values) {
	const keys = Object.keys(values);
	return Number(
		(
			await db.execute({
				sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
				args: Object.values(values)
			})
		).lastInsertRowid
	);
}
function clone(original, overrides) {
	const result = { ...original, ...overrides };
	delete result.id;
	return result;
}
try {
	await db.execute('PRAGMA busy_timeout=10000');
	const original = await row('SELECT * FROM murid ORDER BY id LIMIT 1');
	assert.ok(original, 'Data contoh murid diperlukan');
	const school = Number(original.sekolah_id),
		semester = Number(original.semester_id);
	const oldClass = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [oldClass.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [semester, oldClass.tahun_ajaran_id]
	});
	const classA = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'QA Akses A',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const classB = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'QA Akses B',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	assert.ok(employee);
	const pegawai = {};
	for (const role of ['guru', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'tim_dapur'])
		pegawai[role] = await insert(
			'pegawai',
			clone(employee, {
				nama: `QA Akses ${role}`,
				nip: `QA-${role}`,
				kode_pegawai: `QA-${role}`,
				nomor_induk_pppk: null,
				nik: null,
				nuptk: null,
				foto: null,
				dapodik_ptk_id: null
			})
		);
	await db.execute({
		sql: 'UPDATE kelas SET wali_kelas_id=? WHERE id=?',
		args: [pegawai.wali_kelas, classA]
	});
	const students = [];
	for (let i = 0; i < 3; i++)
		students.push(
			await insert(
				'murid',
				clone(original, {
					nama: `QA Akses Murid ${i + 1}`,
					nis: `QA-ACCESS-${i}`,
					nisn: `999990000${i}`,
					kelas_id: i === 2 ? classB : classA,
					wali_asuh_nama: i === 0 ? 'QA Akses wali_asuh' : null,
					wali_asrama_nama: i === 0 ? 'QA Akses wali_asrama' : null,
					qr_token: `qa-access-${randomBytes(8).toString('hex')}`,
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null
				})
			)
		);
	const now = new Date().toISOString();
	const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
	const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
	const kegiatan = {};
	for (const scope of ['sekolah', 'asrama', 'makan'])
		kegiatan[scope] = await insert('kegiatan_absensi', {
			sekolah_id: school,
			kode: `qa_access_${scope}`,
			nama: `QA ${scope}`,
			kategori: scope,
			akses_edit: scope === 'makan' ? 'asrama' : scope,
			aktif: 1,
			auto_alfa: 0,
			masuk_rapor: 0,
			urutan: 999,
			created_at: now,
			updated_at: now
		});
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const accounts = {};
	for (const [name, type, position] of [
		['admin', 'admin', null],
		['kepsek', 'user', 'kepala_sekolah'],
		['wakakur', 'user', 'waka_kurikulum'],
		['kepsek_asrama', 'wali_asrama', 'kepala_sekolah'],
		['kepsek_kelas', 'wali_kelas', 'kepala_sekolah'],
		['kepsek_asuh', 'wali_asuh', 'kepala_sekolah'],
		['guru', 'user', null],
		['wali_kelas', 'wali_kelas', null],
		['wali_asuh', 'wali_asuh', null],
		['wali_asrama', 'wali_asrama', null],
		['tanpa_kelas', 'user', null],
		['tim_dapur', 'tim_dapur', null],
		['humas', 'user', 'waka_humas']
	]) {
		const token = randomBytes(32).toString('base64url');
		const id = await insert(
			'auth_user',
			clone(admin, {
				username: `qa-access-${name}`,
				username_normalized: `qa-access-${name}`,
				type,
				jabatan_akses: position,
				sekolah_id: school,
				kelas_id: ['guru', 'wali_kelas'].includes(name) ? classA : null,
				pegawai_id: pegawai[name] ?? null,
				mata_pelajaran_id: null,
				permissions: '[]',
				must_change_password: 0
			})
		);
		if (name === 'guru')
			await insert('auth_user_kelas', {
				auth_user_id: id,
				kelas_id: classA,
				created_at: now,
				updated_at: now
			});
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			user_agent: 'QA akses',
			ip_address: '127.0.0.1',
			expires_at: new Date(Date.now() + 1200000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts[name] = {
			id,
			token,
			cookie: `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${classA}`
		};
	}
	const qrTokens = [];
	for (const muridId of students) {
		const payload = `${muridId}.1.${now}`;
		const signature = createHmac(
			'sha256',
			process.env.RAPKUMER_QR_SECRET ||
				process.env.INTERNAL_RELOAD_SECRET ||
				'rapkumer-absensi-digital-v1'
		)
			.update(payload)
			.digest('base64url');
		const token = `rapkumer-absensi:v2:${payload}.${signature}`;
		await insert('qr_murid', {
			murid_id: muridId,
			token_hash: createHash('sha256').update(token).digest('hex'),
			token_version: 1,
			issued_at: now,
			created_at: now,
			updated_at: now
		});
		qrTokens.push(token);
	}
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
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(base + '/login')).status === 200) {
				ready = true;
				break;
			}
		} catch {
			// The isolated server may still be starting.
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	assert.ok(ready, output.slice(-5000));
	async function request(name, route, data, json = false) {
		const headers = { cookie: accounts[name].cookie, origin: base, accept: 'application/json' };
		let body;
		if (data) {
			if (json) {
				headers['content-type'] = 'application/json';
				body = JSON.stringify(data);
			} else {
				headers['x-sveltekit-action'] = 'true';
				body = new FormData();
				for (const [k, v] of Object.entries(data))
					body.append(k, v instanceof Blob ? v : String(v));
			}
		}
		const response = await fetch(base + route, {
			method: data ? 'POST' : 'GET',
			headers,
			body,
			redirect: 'manual'
		});
		const text = await response.text();
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch {
			// HTML and redirect responses are intentionally not JSON.
		}
		return {
			status: typeof parsed?.status === 'number' ? parsed.status : response.status,
			text,
			parsed,
			headers: response.headers
		};
	}

	for (const role of ['guru', 'wali_asuh', 'wali_asrama', 'tim_dapur']) {
		for (const route of ['/sekolah', '/pegawai', '/kelas', '/inventaris', '/api/database/backup'])
			assert.equal((await request(role, route)).status, 403, role + route);
		for (const route of [
			'/administrasi/absensi/scan',
			'/administrasi/absensi/kegiatan',
			'/administrasi/absensi/kegiatan/rekap',
			'/surat-menyurat/sppd',
			'/surat-menyurat/dinas-luar',
			'/pengaturan/profil'
		]) {
			const result = await request(role, route);
			assert.equal(result.status, 200, role + route + result.text.slice(0, 500));
		}
	}
	check('Requested menus accessible and other menus rejected for all four roles');
	const prayerCodes = [
		'sholat_subuh',
		'sholat_zuhur',
		'sholat_asar',
		'sholat_magrib',
		'sholat_isya'
	];
	const prayers = {};
	for (const kode of prayerCodes) {
		const activity = await row('SELECT * FROM kegiatan_absensi WHERE sekolah_id=? AND kode=?', [
			school,
			kode
		]);
		assert.ok(activity, kode);
		prayers[kode] = Number(activity.id);
		await db.execute({
			sql: 'UPDATE kegiatan_absensi SET aktif=1, auto_alfa=0 WHERE id=?',
			args: [activity.id]
		});
	}
	const prayerRoles = ['guru', 'wali_kelas', 'wali_asuh', 'wali_asrama'];
	for (const role of prayerRoles)
		await db.execute({
			sql: 'UPDATE auth_user SET permissions=? WHERE id=?',
			args: ['["absensi_koreksi_lama"]', accounts[role].id]
		});
	const prayerForm = {
		semesterId: semester,
		kelasId: classA,
		muridId: students[0],
		tanggal: '2026-08-03',
		status: 'hadir',
		catatan: 'Uji akses sholat pada salinan database'
	};
	for (const role of ['guru', 'wali_kelas']) {
		for (const kode of prayerCodes) {
			const permitted = ['sholat_zuhur', 'sholat_asar'].includes(kode);
			for (const action of ['updateManual', 'bulkUpdateManual', 'clearStatus']) {
				const result = await request(role, '/administrasi/absensi/kegiatan?/' + action, {
					...prayerForm,
					kegiatanId: prayers[kode]
				});
				assert.equal(result.status, permitted ? 200 : 403, role + kode + action + result.text);
			}
			for (const tanggal of ['2026-08-08', '2026-08-09']) {
				const result = await request(role, '/administrasi/absensi/kegiatan?/updateManual', {
					...prayerForm,
					kegiatanId: prayers[kode],
					tanggal
				});
				assert.equal(result.status, 403, role + kode + tanggal + result.text);
			}
		}
		const outside = await request(role, '/administrasi/absensi/kegiatan?/updateManual', {
			...prayerForm,
			kegiatanId: prayers.sholat_zuhur,
			kelasId: classB,
			muridId: students[2]
		});
		assert.equal(outside.status, 403, outside.text);
	}
	check(
		'Teachers: weekday Zuhur/Asar single, bulk and clear allowed; other prayers, weekends and unassigned classes denied'
	);
	for (const role of ['wali_asuh', 'wali_asrama']) {
		for (const kode of prayerCodes) {
			for (const tanggal of ['2026-08-03', '2026-08-08', '2026-08-09']) {
				const result = await request(role, '/administrasi/absensi/kegiatan?/updateManual', {
					...prayerForm,
					kegiatanId: prayers[kode],
					tanggal
				});
				assert.equal(result.status, 200, role + kode + tanggal + result.text);
			}
		}
		const outside = await request(role, '/administrasi/absensi/kegiatan?/updateManual', {
			...prayerForm,
			kegiatanId: prayers.sholat_zuhur,
			muridId: students[1]
		});
		assert.equal(outside.status, 403, outside.text);
	}
	check('Guardians: all five prayers on weekdays and weekends; unassigned children still denied');
	for (const [role, tanggal, expected] of [
		['guru', '2026-08-03', ['sholat_zuhur', 'sholat_asar']],
		['guru', '2026-08-08', []],
		['wali_asuh', '2026-08-08', prayerCodes],
		['wali_asrama', '2026-08-09', prayerCodes]
	]) {
		const options = await request(
			role,
			'/api/administrasi/absensi/kegiatan/ringkasan?options=1&tanggal=' + tanggal
		);
		assert.equal(options.status, 200, options.text);
		for (const kode of prayerCodes)
			assert.equal(
				options.parsed.activities.some((item) => item.id === prayers[kode]),
				expected.includes(kode),
				role + tanggal + kode
			);
		const monitoring = await request(
			role,
			'/api/administrasi/absensi/monitoring?tab=sholat&tanggal=' + tanggal + '&kelas_id=' + classA
		);
		assert.equal(monitoring.status, 200, monitoring.text);
		for (const kode of prayerCodes) {
			const column = monitoring.parsed.columns.find((item) => item.activityId === prayers[kode]);
			assert.ok(column, kode);
			assert.equal(Boolean(column.entryPath), expected.includes(kode), role + tanggal + kode);
		}
	}
	const isWeekday =
		new Date(`${today}T00:00:00Z`).getUTCDay() >= 1 &&
		new Date(`${today}T00:00:00Z`).getUTCDay() <= 5;
	for (const kode of prayerCodes) {
		const result = await request(
			'guru',
			'/api/administrasi/absensi/scan',
			{
				token: qrTokens[0],
				mode: 'kegiatan',
				kegiatanId: prayers[kode]
			},
			true
		);
		assert.equal(
			result.status,
			isWeekday && ['sholat_zuhur', 'sholat_asar'].includes(kode) ? 200 : 403,
			kode + result.text
		);
	}
	for (const role of ['wali_asuh', 'wali_asrama']) {
		const result = await request(
			role,
			'/api/administrasi/absensi/scan',
			{
				token: qrTokens[0],
				mode: 'kegiatan',
				kegiatanId: prayers.sholat_subuh
			},
			true
		);
		assert.equal(result.status, 200, result.text);
	}
	check('QR and summary options enforce the same prayer/date policy');
	await db.execute({
		sql: 'UPDATE auth_user SET permissions=? WHERE id=?',
		args: ['["absensi_koreksi_lama","absensi_impor"]', accounts.guru.id]
	});
	const prayerWorkbook = new ExcelJS.Workbook();
	const prayerSheet = prayerWorkbook.addWorksheet('Import Absensi');
	prayerSheet.addRow([
		'Tanggal',
		'Kelas ID',
		'Kelas',
		'Kegiatan ID',
		'Kode Kegiatan',
		'Kegiatan',
		'Murid ID',
		'Nama',
		'NIS',
		'NISN',
		'Status',
		'Catatan'
	]);
	for (const [tanggal, kode] of [
		['2026-08-04', 'sholat_zuhur'],
		['2026-08-04', 'sholat_subuh'],
		['2026-08-08', 'sholat_asar']
	])
		prayerSheet.addRow([
			tanggal,
			classA,
			'QA Akses A',
			prayers[kode],
			kode,
			'',
			students[1],
			'',
			'',
			'',
			'hadir',
			'Uji impor sholat'
		]);
	const importedPrayer = await request(
		'guru',
		'/administrasi/absensi/kegiatan/rekap?/importExcel',
		{
			kelasId: classA,
			semesterId: semester,
			file: new File([await prayerWorkbook.xlsx.writeBuffer()], 'qa-sholat.xlsx', {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			})
		}
	);
	assert.equal(importedPrayer.status, 200, importedPrayer.text);
	for (const [tanggal, kode, exists] of [
		['2026-08-04', 'sholat_zuhur', true],
		['2026-08-04', 'sholat_subuh', false],
		['2026-08-08', 'sholat_asar', false]
	]) {
		const record = await row(
			'SELECT id FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=? AND tanggal=?',
			[students[1], prayers[kode], tanggal]
		);
		assert.equal(Boolean(record), exists, kode + tanggal);
	}
	check(
		'Teacher import stores weekday Zuhur only; Subuh and weekend Asar rows skipped even with import permission'
	);
	for (const role of prayerRoles)
		await db.execute({
			sql: "UPDATE auth_user SET permissions='[]' WHERE id=?",
			args: [accounts[role].id]
		});
	assert.equal((await request('wali_asuh', '/catatan-wali-asrama')).status, 403);
	assert.equal((await request('wali_asrama', '/catatan-wali-asrama')).status, 200);
	assert.equal((await request('wali_asrama', '/rekap-nilai-asrama')).status, 200);
	for (const role of ['wali_asuh', 'wali_asrama']) {
		assert.equal((await request(role, '/cetak-raport')).status, 200);
		for (const docType of ['rapor', 'cover', 'biodata', 'piagam']) {
			assert.equal(
				(await request(role, '/api/pdf/token', { docType, muridId: students[0] }, true)).status,
				403
			);
			assert.equal(
				(await request(role, '/api/pdf/bulk', { docType, muridIds: [students[0]] }, true)).status,
				403
			);
		}
	}
	assert.equal((await request('guru', '/cetak-raport')).status, 403);
	assert.equal((await request('guru', '/cetak/rapor.pdf')).status, 403);
	assert.equal(
		(await request('guru', '/api/pdf/token', { docType: 'rapor', muridId: students[0] }, true))
			.status,
		403
	);
	assert.equal((await request('guru', '/murid/' + students[2])).status, 403);
	assert.equal((await request('wali_asuh', '/murid/' + students[1])).status, 403);
	check(
		'Report restrictions checked on pages, direct PDFs, token and bulk endpoints; student scope preserved'
	);
	const meal = {
		semesterId: semester,
		kelasId: classB,
		muridId: students[2],
		kegiatanId: kegiatan.makan,
		tanggal: today,
		status: 'hadir'
	};
	let saved = await request('tim_dapur', '/administrasi/absensi/kegiatan?/updateManual', meal);
	assert.equal(saved.status, 200, saved.text);
	assert.equal(
		(
			await request('tim_dapur', '/administrasi/absensi/kegiatan?/updateManual', {
				...meal,
				kegiatanId: kegiatan.sekolah
			})
		).status,
		403
	);
	assert.equal(
		(
			await request(
				'tim_dapur',
				'/api/administrasi/absensi/scan',
				{ token: qrTokens[0], mode: 'kegiatan', kegiatanId: kegiatan.asrama },
				true
			)
		).status,
		403
	);
	const scanned = await request(
		'tim_dapur',
		'/api/administrasi/absensi/scan',
		{ token: qrTokens[0], mode: 'kegiatan', kegiatanId: kegiatan.makan },
		true
	);
	assert.equal(scanned.status, 200, scanned.text);
	assert.equal(
		(
			await request(
				'tim_dapur',
				'/administrasi/absensi/kegiatan/rekap?kegiatan_id=' + kegiatan.sekolah
			)
		).status,
		403
	);
	await request('admin', '/administrasi/absensi/kegiatan?/updateManual', {
		...meal,
		kegiatanId: kegiatan.sekolah
	});
	const recap = await request(
		'tim_dapur',
		'/administrasi/absensi/kegiatan/rekap?kelas_id=' +
			classB +
			'&tanggal_awal=' +
			today +
			'&tanggal_akhir=' +
			today
	);
	assert.equal(recap.status, 200, recap.text);
	assert.ok(!recap.text.includes('QA sekolah'));
	const exported = await fetch(
		base +
			'/api/administrasi/absensi/kegiatan/rekap/export?kelas_id=' +
			classB +
			'&tanggal_awal=' +
			today +
			'&tanggal_akhir=' +
			today,
		{ headers: { cookie: accounts.tim_dapur.cookie } }
	);
	assert.equal(exported.status, 200);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()));
	const rows = JSON.stringify(workbook.worksheets.map((s) => s.getSheetValues()));
	assert.ok(rows.includes('QA makan'));
	assert.ok(!rows.includes('QA sekolah'));
	check(
		'Kitchen staff can scan meals across classes; non-meal scans, manual input and report data blocked'
	);
	for (const name of ['kepsek', 'wakakur'])
		assert.equal((await request(name, '/murid/form')).status, 200);
	for (const route of [
		'/administrasi/absensi/kegiatan/pengaturan',
		'/presensi-pegawai',
		'/surat-menyurat/arsip',
		'/buku-tamu'
	]) {
		const res = await request('humas', route);
		assert.equal(res.status, 200, route + res.text.slice(0, 500));
	}
	assert.equal((await request('humas', '/inventaris')).status, 403);
	assert.equal((await request('humas', '/pengguna')).status, 403);
	check(
		'Existing leadership access retained; Humas attendance and correspondence permissions work'
	);
	const profileBefore = await row('SELECT * FROM pegawai WHERE id=?', [pegawai.guru]);
	assert.equal(
		(
			await request('guru', '/pengaturan/profil', {
				id: pegawai.wali_asuh,
				jenis: 'kepala_sekolah',
				telepon: '0123'
			})
		).status,
		400
	);
	assert.equal(
		(
			await request('guru', '/pengaturan/profil', {
				updatedAt: profileBefore.updated_at,
				email: 'guru@example.test',
				telepon: '081234567890',
				alamat: 'Alamat QA'
			})
		).status,
		200
	);
	assert.equal(
		(await row('SELECT telepon FROM pegawai WHERE id=?', [pegawai.guru])).telepon,
		'081234567890'
	);
	assert.equal(
		(await row('SELECT jenis FROM pegawai WHERE id=?', [pegawai.guru])).jenis,
		profileBefore.jenis
	);
	assert.equal(
		(
			await request('guru', '/pengaturan/profil', {
				updatedAt: profileBefore.updated_at,
				telepon: '000'
			})
		).status,
		409
	);
	assert.equal((await request('guru', '/api/pegawai-photo/' + pegawai.wali_asuh)).status, 403);
	assert.ok(
		await row(
			"SELECT id FROM audit_log WHERE entity_type='pegawai' AND username_snapshot='qa-access-guru'"
		)
	);
	check('Self profile save audited; identity and job escalation rejected');
	const newEmployee = await insert(
		'pegawai',
		clone(employee, {
			nama: 'QA Dapur Baru',
			nip: 'QA-DAPUR-NEW',
			kode_pegawai: 'QA-DAPUR-NEW',
			nik: null,
			jenis: 'tim_dapur',
			status: 'aktif',
			foto: null
		})
	);
	const created = await request('admin', '/pengguna?/create_user', {
		type: 'tim_dapur',
		pegawaiId: newEmployee,
		username: 'qa-dapur-new',
		password: 'QaDapur2026!'
	});
	assert.equal(created.status, 200, created.text);
	const newAccount = await row("SELECT * FROM auth_user WHERE username='qa-dapur-new'");
	assert.equal(newAccount.type, 'tim_dapur');
	assert.equal(Number(newAccount.must_change_password), 1);
	check('Admin can create Kitchen role; mandatory first-login password retained');
	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		userDataDir: path.join(folder, 'browser')
	});
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	for (const role of ['guru', 'wali_asuh', 'wali_asrama', 'tim_dapur']) {
		await page.setCookie(
			{ name: 'rapkumer-session', value: accounts[role].token, url: base },
			{ name: 'active-sekolah-id', value: String(school), url: base },
			{ name: 'active-kelas-id', value: String(classA), url: base }
		);
		await page.setViewport({ width: 1366, height: 900 });
		await page.goto(base + '/administrasi/absensi/scan', { waitUntil: 'networkidle0' });
		const hrefs = await page.$$eval('.drawer-side a[href]', (els) =>
			els.map((el) => new URL(el.href).pathname)
		);
		assert.ok(hrefs.includes('/administrasi/absensi/scan'));
		assert.ok(hrefs.includes('/surat-menyurat/sppd'));
		assert.ok(!hrefs.includes('/sekolah'));
		assert.ok(!hrefs.includes('/pegawai'));
		if (role === 'tim_dapur') {
			const labels = await page.$eval('select[aria-label="Kegiatan absensi"]', (el) =>
				[...el.options].map((o) => o.textContent)
			);
			assert.ok(labels.includes('QA makan'));
			assert.ok(!labels.includes('QA sekolah'));
		}
		if (['guru', 'wali_asuh', 'wali_asrama'].includes(role)) {
			const ids = await page.$eval('select[aria-label="Kegiatan absensi"]', (el) =>
				[...el.options].map((o) => Number(o.value))
			);
			for (const kode of prayerCodes)
				assert.equal(
					ids.includes(prayers[kode]),
					role !== 'guru' || (isWeekday && ['sholat_zuhur', 'sholat_asar'].includes(kode)),
					role + kode
				);
		}
		await page.screenshot({ path: path.join(folder, role + '-desktop.png'), fullPage: true });
		await page.setViewport({ width: 390, height: 844 });
		await page.goto(base + '/pengaturan/profil', { waitUntil: 'networkidle0' });
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		await page.screenshot({
			path: path.join(folder, role + '-profile-mobile.png'),
			fullPage: true
		});
	}
	assert.deepEqual(errors, []);
	check('Desktop role navigation, kitchen dropdown and mobile profile verified');
	assert.equal(
		(
			await request('admin', '/pengguna?/update_user', {
				id: newAccount.id,
				username: 'qa-dapur-new',
				type: 'tim_dapur',
				jabatanAkses: 'waka_humas'
			})
		).status,
		400
	);
	await db.execute({
		sql: "UPDATE auth_user SET jabatan_akses='kepala_sekolah' WHERE id=?",
		args: [accounts.wali_asuh.id]
	});
	const legacyEdited = await request('admin', '/pengguna?/update_user', {
		id: accounts.wali_asuh.id,
		username: 'qa-access-wali_asuh',
		type: 'wali_asuh',
		jabatanAkses: 'kepala_sekolah'
	});
	assert.equal(legacyEdited.status, 200, legacyEdited.text);
	assert.equal(
		(await row('SELECT jabatan_akses FROM auth_user WHERE id=?', [accounts.wali_asuh.id]))
			.jabatan_akses,
		'kepala_sekolah'
	);
	const humasEdited = await request('admin', '/pengguna?/update_user', {
		id: accounts.guru.id,
		username: 'qa-access-guru',
		type: 'user',
		jabatanAkses: 'waka_humas',
		mataPelajaranIds: '[]',
		kelasIds: '[]'
	});
	assert.equal(humasEdited.status, 200, humasEdited.text);
	assert.equal(
		(await row('SELECT jabatan_akses FROM auth_user WHERE id=?', [accounts.guru.id])).jabatan_akses,
		'waka_humas'
	);
	check(
		'Editing users accepts Humas and preserves legacy positions, without kitchen position escalation'
	);
	await writeFile(path.join(folder, 'result.json'), JSON.stringify({ checks, database }, null, 2));
	console.log('QA_RESULT', folder);
} catch (error) {
	await writeFile(path.join(folder, 'server.log'), output);
	console.error('QA_FOLDER', folder);
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode == null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
	db.close();
}
