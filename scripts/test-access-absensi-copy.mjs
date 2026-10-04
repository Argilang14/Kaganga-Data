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
	port = Number(process.env.ACCESS_QA_PORT || 5158);
assert.ok(![5152, 1206].includes(port));
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'access-absensi-qa-'));
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
	for (const role of ['guru', 'wali_kelas', 'wali_asuh', 'wali_asrama'])
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
	for (const scope of ['sekolah', 'asrama'])
		kegiatan[scope] = await insert('kegiatan_absensi', {
			sekolah_id: school,
			kode: `qa_access_${scope}`,
			nama: `QA ${scope}`,
			kategori: scope,
			akses_edit: scope,
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
		['tanpa_kelas', 'user', null]
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
				for (const [k, v] of Object.entries(data)) body.append(k, String(v));
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
	const form = {
		semesterId: semester,
		kelasId: classA,
		muridId: students[0],
		tanggal: today,
		status: 'hadir'
	};
	for (const name of ['kepsek', 'wakakur', 'kepsek_asrama', 'kepsek_kelas', 'kepsek_asuh']) {
		const result = await request(name, '/murid/form');
		assert.equal(result.status, 200, result.text.slice(-1000));
		const added = await request(name, '/murid/form?/save', {
			nis: `QA-NEW-${name}`,
			nisn: '',
			nama: `QA Baru ${name}`,
			kelasId: classB,
			tempatLahir: original.tempat_lahir,
			tanggalLahir: original.tanggal_lahir,
			jenisKelamin: original.jenis_kelamin,
			agama: original.agama,
			pendidikanSebelumnya: original.pendidikan_sebelumnya,
			tanggalMasuk: original.tanggal_masuk,
			'alamat.jalan': 'Alamat QA',
			'alamat.desa': 'Desa QA',
			'alamat.kecamatan': 'Kecamatan QA',
			'alamat.kabupaten': 'Kabupaten QA'
		});
		assert.equal(added.status, 200, added.text);
		assert.ok(
			await row('SELECT id FROM murid WHERE nis=? AND kelas_id=?', [`QA-NEW-${name}`, classB])
		);
		const otherClass = await request(name, `/murid?kelas_id=${classB}`);
		assert.equal(otherClass.status, 200, otherClass.text);
		assert.ok(otherClass.text.includes('QA Akses Murid 3'));
		assert.equal((await request(name, '/pengguna')).status, 303);
		assert.equal((await request(name, '/api/database/backup')).status, 403);
	}
	check(
		'Kepsek/Waka berhasil menyimpan murid baru termasuk peran dasar wali asrama, tanpa manajemen pengguna/backup'
	);
	assert.equal((await request('guru', '/murid/form')).status, 303);
	assert.equal((await request('guru', `/murid/${students[2]}`)).status, 403);
	assert.equal((await request('wali_asuh', `/murid/${students[1]}`)).status, 403);
	assert.equal((await request('wali_asrama', `/murid/${students[0]}`)).status, 200);
	assert.equal(
		(
			await request('wali_asuh', '/administrasi/absensi/kartu-qr?/previewOne', {
				muridId: students[1],
				kelasId: classA
			})
		).status,
		403
	);
	assert.equal(
		(
			await request('wali_asuh', '/administrasi/absensi/kartu-qr?/previewOne', {
				muridId: students[0],
				kelasId: classA
			})
		).status,
		200
	);
	const savedCookie = accounts.guru.cookie;
	accounts.guru.cookie = savedCookie.replace(
		`active-sekolah-id=${school}`,
		'active-sekolah-id=999999'
	);
	assert.equal((await request('guru', `/murid/${students[0]}`)).status, 200);
	accounts.guru.cookie = savedCookie;
	assert.equal((await request('tanpa_kelas', `/murid/${students[0]}`)).status, 403);
	check('URL detail/edit murid dibatasi penugasan, termasuk anak lain dalam kelas yang sama');
	for (const name of ['guru', 'wali_kelas', 'wali_asuh', 'wali_asrama']) {
		assert.equal((await request(name, '/administrasi/absensi/kegiatan/pengaturan')).status, 403);
		assert.equal(
			(
				await request(name, '/administrasi/absensi/kartu-qr?/generateOne', {
					muridId: students[0],
					kelasId: classA
				})
			).status,
			403
		);
		assert.equal(
			(
				await request(name, '/administrasi/absensi/kegiatan/rekap?/importExcel', {
					semesterId: semester
				})
			).status,
			403
		);
		assert.equal(
			(
				await request(name, '/administrasi/absensi?/syncRapor', {
					semesterId: semester,
					kelasId: classA
				})
			).status,
			403
		);
	}
	check('Izin dasar tidak membuka pengaturan, impor, reset QR, atau sinkron raport');
	assert.equal((await request('guru', '/administrasi/absensi?/updateManual', form)).status, 200);
	assert.equal(
		(await request('guru', '/administrasi/absensi?/updateManual', { ...form, status: 'sakit' }))
			.status,
		400
	);
	assert.equal(
		(
			await request('guru', '/administrasi/absensi?/updateManual', {
				...form,
				status: 'sakit',
				catatan: 'QA koreksi terverifikasi'
			})
		).status,
		200
	);
	assert.equal(
		(await request('guru', '/administrasi/absensi?/updateManual', { ...form, tanggal: yesterday }))
			.status,
		403
	);
	assert.equal(
		(
			await request('guru', '/administrasi/absensi?/updateManual', {
				...form,
				kelasId: classB,
				muridId: students[2]
			})
		).status,
		403
	);
	check('Input hari ini berjalan; koreksi tanpa alasan/tanggal lama/lintas kelas ditolak');
	const attendanceBeforeEmptyActivity = (
		await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id')
	).rows;
	for (const role of ['guru', 'wali_kelas', 'wali_asuh', 'wali_asrama']) {
		for (const kegiatanId of [undefined, '', null, 0, '1invalid', 1.5]) {
			const rejected = await request(
				role,
				'/api/administrasi/absensi/scan',
				{ token: qrTokens[0], mode: 'kegiatan', kegiatanId },
				true
			);
			assert.equal(rejected.status, 400, `${role}: ${rejected.text}`);
			assert.equal(rejected.parsed.code, 'invalid_activity');
		}
	}
	assert.deepEqual(
		(await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id')).rows,
		attendanceBeforeEmptyActivity
	);
	check('Guru dan wali wajib memilih kegiatan valid; permintaan kosong tidak mengubah absensi');
	const scan1 = await request(
		'guru',
		'/api/administrasi/absensi/scan',
		{ token: qrTokens[1] },
		true
	);
	assert.equal(scan1.status, 200, scan1.text);
	const scan2 = await request(
		'guru',
		'/api/administrasi/absensi/scan',
		{ token: qrTokens[1] },
		true
	);
	assert.equal(scan2.parsed.code, 'already_present');
	assert.equal(
		Number(
			(
				await row('SELECT count(*) n FROM absensi_harian WHERE murid_id=? AND tanggal=?', [
					students[1],
					today
				])
			).n
		),
		1
	);
	assert.equal(
		(await request('guru', '/api/administrasi/absensi/scan', { token: qrTokens[2] }, true)).status,
		403
	);
	assert.equal(
		(
			await request(
				'wali_asuh',
				'/api/administrasi/absensi/scan',
				{ token: qrTokens[1], mode: 'kegiatan', kegiatanId: kegiatan.asrama },
				true
			)
		).status,
		403
	);
	check('Scan ulang tidak menggandakan; scan lintas kelas/anak binaan ditolak');
	assert.equal(
		(
			await request('guru', '/administrasi/absensi/kegiatan?/updateManual', {
				...form,
				kegiatanId: kegiatan.asrama
			})
		).status,
		403
	);
	assert.equal(
		(
			await request('wali_asuh', '/administrasi/absensi/kegiatan?/updateManual', {
				...form,
				kegiatanId: kegiatan.sekolah
			})
		).status,
		403
	);
	assert.equal(
		(
			await request('wali_asuh', '/administrasi/absensi/kegiatan?/bulkUpdateManual', {
				semesterId: semester,
				kelasId: classA,
				tanggal: today,
				kegiatanId: kegiatan.asrama,
				status: 'hadir',
				onlyEmpty: 'on'
			})
		).status,
		200
	);
	assert.equal(
		Number(
			(await row('SELECT count(*) n FROM absensi_kegiatan WHERE kegiatan_id=?', [kegiatan.asrama]))
				.n
		),
		1
	);
	check('Kegiatan sekolah/asrama terpisah dan input massal wali hanya menyentuh anak binaan');
	const recap = await request(
		'wali_asuh',
		`/administrasi/absensi/kegiatan/rekap?kelas_id=${classA}`
	);
	assert.equal(recap.status, 200, recap.text.slice(-1000));
	assert.ok(recap.text.includes('QA Akses Murid 1'));
	assert.ok(!recap.text.includes('QA Akses Murid 2'));
	const exportResult = await request(
		'wali_asuh',
		`/api/administrasi/absensi/kegiatan/rekap/export?kelas_id=${classB}`
	);
	assert.equal(exportResult.status, 403);
	const ownExport = await fetch(
		`${base}/api/administrasi/absensi/kegiatan/rekap/export?kelas_id=${classA}&tanggal_awal=${today}&tanggal_akhir=${today}`,
		{ headers: { cookie: accounts.wali_asuh.cookie } }
	);
	assert.equal(ownExport.status, 200);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(Buffer.from(await ownExport.arrayBuffer()));
	const exportedRows = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
	assert.ok(exportedRows.includes('QA Akses Murid 1'));
	assert.ok(!exportedRows.includes('QA Akses Murid 2'));
	check('Rekap wali dan ekspor tetap dalam cakupan binaan');
	assert.equal(
		Number(
			(
				await row(
					"SELECT count(*) n FROM audit_log WHERE entity_type IN ('absensi_harian','absensi_kegiatan') AND username_snapshot LIKE 'qa-access-%'"
				)
			).n
		),
		4
	);
	const audit = await row(
		"SELECT before_data,after_data FROM audit_log WHERE username_snapshot='qa-access-guru' AND action='update' AND entity_type='absensi_harian' ORDER BY id DESC LIMIT 1"
	);
	assert.ok(audit.before_data && audit.after_data);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	check('Audit sebelum/sesudah tersimpan; SQLite dan foreign key sehat');
	assert.equal(
		(await request('wali_asuh', '/api/administrasi/absensi/scan', { token: qrTokens[0] }, true))
			.status,
		403
	);
	const simultaneous = await Promise.all(
		[0, 1].map(() =>
			request(
				'guru',
				'/api/administrasi/absensi/scan',
				{ token: qrTokens[1], mode: 'kegiatan', kegiatanId: kegiatan.sekolah },
				true
			)
		)
	);
	for (const result of simultaneous) assert.equal(result.status, 200, result.text);
	assert.equal(
		Number(
			(
				await row('SELECT count(*) n FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?', [
					students[1],
					kegiatan.sekolah
				])
			).n
		),
		1
	);
	check('Scan bersamaan tidak menggandakan dan wali tidak dapat memindai absensi harian sekolah');
	await db.execute({
		sql: 'UPDATE auth_user SET permissions=? WHERE id=?',
		args: [JSON.stringify(['absensi_koreksi_lama', 'absensi_qr_manage']), accounts.guru.id]
	});
	assert.equal(
		(await request('guru', '/administrasi/absensi?/updateManual', { ...form, tanggal: yesterday }))
			.status,
		200
	);
	assert.equal(
		(
			await request('guru', '/administrasi/absensi?/updateManual', {
				...form,
				tanggal: yesterday,
				kelasId: classB,
				muridId: students[2]
			})
		).status,
		403
	);
	assert.equal(
		(
			await request('guru', '/administrasi/absensi/kartu-qr?/generateOne', {
				muridId: students[0],
				kelasId: classA
			})
		).status,
		200
	);
	assert.equal(
		(
			await request('guru', '/administrasi/absensi/kartu-qr?/generateOne', {
				muridId: students[2],
				kelasId: classB
			})
		).status,
		403
	);
	assert.ok(
		await row(
			"SELECT id FROM audit_log WHERE entity_type='qr_murid' AND username_snapshot='qa-access-guru'"
		)
	);
	const qrBeforeMixed = (await db.execute('SELECT * FROM qr_murid ORDER BY id')).rows;
	assert.equal(
		(
			await request(
				'guru',
				'/api/absensi/kartu-qr',
				{
					action: 'generate-missing',
					muridIds: [students[0], students[2]]
				},
				true
			)
		).status,
		403
	);
	await db.execute({
		sql: 'UPDATE auth_user SET permissions=? WHERE id=?',
		args: [JSON.stringify(['absensi_qr_manage']), accounts.wali_asuh.id]
	});
	assert.equal(
		(
			await request(
				'wali_asuh',
				'/api/absensi/kartu-qr',
				{
					action: 'generate-missing',
					muridIds: [students[0], students[1]]
				},
				true
			)
		).status,
		403
	);
	assert.deepEqual((await db.execute('SELECT * FROM qr_murid ORDER BY id')).rows, qrBeforeMixed);
	check('Permintaan QR massal campuran anak berizin dan di luar cakupan ditolak tanpa perubahan');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	check('Izin khusus admin bekerja tanpa memperluas cakupan kelas, dan perubahan QR diaudit');
	await db.execute({
		sql: "UPDATE sekolah SET jenjang_pendidikan='srt' WHERE id=?",
		args: [school]
	});
	await db.execute({ sql: "UPDATE kelas SET fase='Fase E' WHERE id=?", args: [classA] });
	await db.execute({ sql: "UPDATE kelas SET fase='Fase D' WHERE id=?", args: [classB] });
	const summarySdClass = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'QA Ringkasan SD',
			fase: 'Fase A',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const summaryUnknownClass = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'QA Ringkasan Tanpa Jenjang',
			fase: null,
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const summaryActivity = await insert('kegiatan_absensi', {
		sekolah_id: school,
		kode: 'qa_summary',
		nama: 'QA Ringkasan Sekolah',
		kategori: 'sekolah',
		akses_edit: 'sekolah',
		aktif: 1,
		auto_alfa: 1,
		jam_selesai: '00:00',
		masuk_rapor: 0,
		urutan: 1000,
		created_at: now,
		updated_at: now
	});
	const summaryStudents = [];
	for (let i = 0; i < 5; i++)
		summaryStudents.push(
			await insert(
				'murid',
				clone(original, {
					nama: [
						'QA Ringkasan Izin',
						'QA Ringkasan Alfa',
						'QA Ringkasan Izin Pulang',
						'QA Ringkasan Belum',
						'QA Ringkasan Murid SD'
					][i],
					nis: `QA-SUMMARY-${i}`,
					nisn: `998810000${i}`,
					kelas_id: i === 4 ? summarySdClass : classA,
					wali_asuh_nama: null,
					wali_asrama_nama: null,
					qr_token: null,
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null
				})
			)
		);
	for (const [muridId, kelasId, status] of [
		[students[0], classA, 'sakit'],
		[students[1], classA, 'terlambat'],
		[summaryStudents[0], classA, 'izin'],
		[summaryStudents[1], classA, 'alfa'],
		[summaryStudents[2], classA, 'pulang'],
		[students[2], classB, 'hadir']
	])
		await insert('absensi_kegiatan', {
			sekolah_id: school,
			semester_id: semester,
			kelas_id: kelasId,
			murid_id: muridId,
			kegiatan_id: summaryActivity,
			tanggal: today,
			status,
			metode: 'manual',
			auto_alfa: 0,
			created_at: now,
			updated_at: now
		});
	await insert('izin_pulang_murid', {
		sekolah_id: school,
		tahun_ajaran_id: oldClass.tahun_ajaran_id,
		semester_id: semester,
		kelas_id: classA,
		murid_id: summaryStudents[2],
		nis_snapshot: 'QA-SUMMARY-2',
		nama_snapshot: 'QA Ringkasan Izin Pulang',
		kelas_snapshot: 'QA Akses A',
		tanggal_keluar: yesterday,
		rencana_kembali: today,
		alasan: 'QA izin',
		status: 'sedang_izin',
		created_at: now,
		updated_at: now
	});
	const summaryUrl = '/api/administrasi/absensi/kegiatan/ringkasan';
	const summaryParams = `tanggal=${today}&kegiatan_id=${summaryActivity}`;
	const summaryBefore = (await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id')).rows;
	const summaryClass = await request(
		'guru',
		`${summaryUrl}?${summaryParams}&cakupan=kelas&kelas_id=${classA}`
	);
	assert.equal(summaryClass.status, 200, summaryClass.text);
	assert.deepEqual(summaryClass.parsed.totals, { jumlah: 6, hadir: 1, tidakHadir: 4, belum: 1 });
	assert.match(summaryClass.parsed.text, /QA Ringkasan Izin \(i\)/);
	assert.match(summaryClass.parsed.text, /QA Ringkasan Izin Pulang \(p\)/);
	assert.ok(!summaryClass.text.includes('nisn'));
	assert.ok(!summaryClass.text.includes('token'));
	assert.match(summaryClass.headers.get('cache-control'), /no-store/);
	assert.equal((await request('guru', `${summaryUrl}?${summaryParams}&cakupan=semua`)).status, 403);
	assert.equal(
		(await request('guru', `${summaryUrl}?${summaryParams}&cakupan=jenjang&jenjang=sma`)).status,
		403
	);
	assert.equal(
		(await request('guru', `${summaryUrl}?${summaryParams}&cakupan=kelas&kelas_id=${classB}`))
			.status,
		403
	);
	assert.equal(
		(
			await request(
				'guru',
				`${summaryUrl}?tanggal=${today}&kegiatan_id=&cakupan=kelas&kelas_id=${classA}`
			)
		).status,
		400
	);
	assert.equal(
		(
			await request(
				'admin',
				`${summaryUrl}?tanggal=2099-01-01&kegiatan_id=${summaryActivity}&cakupan=semua`
			)
		).status,
		400
	);
	const summarySmp = await request(
		'kepsek',
		`${summaryUrl}?${summaryParams}&cakupan=jenjang&jenjang=smp`
	);
	assert.equal(summarySmp.status, 200, summarySmp.text);
	assert.ok(summarySmp.parsed.classes.some((item) => item.id === classB));
	assert.ok(summarySmp.parsed.classes.every((item) => item.jenjang === 'smp'));
	assert.ok(!summarySmp.parsed.classes.some((item) => [classA, summarySdClass].includes(item.id)));
	assert.ok(summarySmp.parsed.totals.jumlah >= 1);
	const summarySd = await request(
		'kepsek',
		`${summaryUrl}?${summaryParams}&cakupan=jenjang&jenjang=sd`
	);
	assert.ok(summarySd.parsed.classes.some((item) => item.id === summarySdClass));
	assert.ok(summarySd.parsed.warnings.some((item) => item.includes('QA Ringkasan Tanpa Jenjang')));
	const summaryAll = await request('kepsek', `${summaryUrl}?${summaryParams}&cakupan=semua`);
	assert.equal(summaryAll.status, 200, summaryAll.text);
	assert.ok(summaryAll.parsed.classes.some((item) => item.id === summaryUnknownClass));
	assert.ok(summaryAll.parsed.text.includes('Jenjang belum ditentukan'));
	const summaryWali = await request(
		'wali_asuh',
		`${summaryUrl}?tanggal=${today}&kegiatan_id=${kegiatan.asrama}&cakupan=kelas&kelas_id=${classA}`
	);
	assert.equal(summaryWali.status, 200, summaryWali.text);
	assert.equal(summaryWali.parsed.totals.jumlah, 1);
	assert.ok(!summaryWali.text.includes('QA Ringkasan Izin Pulang'));
	assert.match(summaryWali.parsed.text, /anak binaan sesuai penugasan/);
	assert.equal(
		(await request('wali_asuh', `${summaryUrl}?${summaryParams}&cakupan=kelas&kelas_id=${classA}`))
			.status,
		403
	);
	assert.deepEqual(
		(await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id')).rows,
		summaryBefore
	);
	check(
		'Ringkasan kelas/jenjang/semua menghitung sekali per murid, menjaga cakupan guru/wali dan tidak memicu Auto Alfa'
	);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		userDataDir: path.join(folder, 'browser')
	});
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	async function login(name) {
		await page.setCookie(
			{ name: 'rapkumer-session', value: accounts[name].token, url: base },
			{ name: 'active-sekolah-id', value: String(school), url: base },
			{ name: 'active-kelas-id', value: String(classA), url: base }
		);
	}
	for (const role of ['guru', 'wali_kelas', 'wali_asuh', 'wali_asrama']) {
		await login(role);
		await page.setViewport({ width: role === 'guru' ? 1366 : 390, height: 900 });
		await page.goto(`${base}/administrasi/absensi/scan`, { waitUntil: 'networkidle0' });
		const scanButton = 'button[title="Pilih kegiatan terlebih dahulu"]';
		assert.deepEqual(
			await page.$eval('select[aria-label="Kegiatan absensi"]', (el) => ({
				value: el.value,
				label: el.selectedOptions[0]?.textContent.trim()
			})),
			{ value: '', label: 'Pilih kegiatan' }
		);
		assert.equal(await page.$eval(scanButton, (el) => el.disabled), true);
		assert.equal(
			await page.evaluate(() => document.body.innerText.includes('Kegiatan aktif:')),
			false
		);
		await page.evaluate(() => {
			window.qaCameraRequests = 0;
			navigator.mediaDevices.getUserMedia = async () => {
				window.qaCameraRequests++;
				throw new Error('QA: kamera tidak digunakan');
			};
		});
		await page.$eval(scanButton, (el) => el.click());
		assert.equal(await page.evaluate(() => window.qaCameraRequests), 0);
		if (role === 'guru' || role === 'wali_asuh')
			await page.screenshot({
				path: path.join(folder, `scan-${role}-pilih-kegiatan.png`),
				fullPage: true
			});
		await page.select(
			'select[aria-label="Kegiatan absensi"]',
			String(kegiatan[['guru', 'wali_kelas'].includes(role) ? 'sekolah' : 'asrama'])
		);
		assert.equal(await page.$eval('button[title="Mulai scan QR"]', (el) => el.disabled), false);
		await page.click('button[title="Mulai scan QR"]');
		await page.waitForFunction(() => window.qaCameraRequests === 1);
		await page.waitForFunction(
			() => !document.querySelector('button[title="Mulai scan QR"]').disabled
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
			false
		);
		await page.reload({ waitUntil: 'networkidle0' });
		assert.equal(await page.$eval('select[aria-label="Kegiatan absensi"]', (el) => el.value), '');
		assert.equal(await page.$eval(scanButton, (el) => el.disabled), true);
	}
	check(
		'Dropdown Pilih kegiatan terlihat; kamera terkunci sampai dipilih dan pilihan reset saat reload untuk guru/wali'
	);
	await login('kepsek');
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(`${base}/administrasi/absensi/scan`, { waitUntil: 'networkidle0' });
	await page.select('select[aria-label="Kegiatan absensi"]', String(summaryActivity));
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((el) => el.textContent.includes('Selesai & Ringkasan'))
			.click()
	);
	await page.waitForFunction(
		() =>
			document.querySelector('dialog[open] select[aria-label="Cakupan ringkasan"]')?.disabled ===
			false
	);
	await page.select('dialog[open] select[aria-label="Cakupan ringkasan"]', 'jenjang');
	await page.select('dialog[open] select[aria-label="Jenjang ringkasan"]', 'sma');
	await page.evaluate(() =>
		[...document.querySelectorAll('dialog[open] button')]
			.find((el) => el.textContent.trim() === 'Pratinjau')
			.click()
	);
	await page.waitForSelector('dialog[open] textarea[aria-label="Pratinjau pesan WhatsApp"]');
	assert.match(
		await page.$eval('dialog[open] textarea', (el) => el.value),
		/Rekap kehadiran jenjang SMA/
	);
	await page.screenshot({ path: path.join(folder, 'summary-desktop.png'), fullPage: true });
	await page.setViewport({ width: 768, height: 1024 });
	await page.screenshot({ path: path.join(folder, 'summary-tablet.png'), fullPage: true });
	await page.setViewport({ width: 390, height: 844 });
	await page.screenshot({ path: path.join(folder, 'summary-mobile.png'), fullPage: true });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	assert.equal(
		await page.$eval('dialog[open] .modal-box', (el) => el.scrollWidth > el.clientWidth),
		false
	);
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text) => {
					window.qaCopied = text;
				}
			}
		});
		window.open = () => ({
			opener: null,
			close() {},
			location: {
				replace(url) {
					window.qaWhatsAppUrl = url;
				}
			}
		});
	});
	await insert('absensi_kegiatan', {
		sekolah_id: school,
		semester_id: semester,
		kelas_id: classA,
		murid_id: summaryStudents[3],
		kegiatan_id: summaryActivity,
		tanggal: today,
		status: 'sakit',
		metode: 'manual',
		auto_alfa: 0,
		created_at: now,
		updated_at: now
	});
	await page.evaluate(() =>
		[...document.querySelectorAll('dialog[open] button')]
			.find((el) => el.textContent.includes('Salin Ringkasan'))
			.click()
	);
	await page.waitForFunction(() => window.qaCopied?.includes('QA Ringkasan Belum (s)'));
	await page.evaluate(() =>
		[...document.querySelectorAll('dialog[open] button')]
			.find((el) => el.textContent.includes('Bagikan ke WhatsApp'))
			.click()
	);
	await page.waitForFunction(() => window.qaWhatsAppUrl?.startsWith('https://wa.me/?text='));
	assert.match(
		await page.evaluate(() => new URL(window.qaWhatsAppUrl).searchParams.get('text')),
		/QA Ringkasan Belum \(s\)/
	);
	await page.select('dialog[open] select[aria-label="Cakupan ringkasan"]', 'semua');
	assert.equal(await page.$('dialog[open] textarea'), null);
	await page.evaluate(() =>
		[...document.querySelectorAll('dialog[open] button')]
			.find((el) => el.textContent.trim() === 'Tutup')
			.click()
	);
	await login('wali_asuh');
	await page.goto(
		`${base}/administrasi/absensi/kegiatan?kelas_id=${classA}&kegiatan_id=${kegiatan.asrama}`,
		{ waitUntil: 'networkidle0' }
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((el) => el.textContent.trim() === 'Ringkasan WhatsApp')
			.click()
	);
	await page.waitForFunction(
		() =>
			document.querySelector('dialog[open] select[aria-label="Cakupan ringkasan"]')?.disabled ===
			false
	);
	assert.deepEqual(
		await page.$eval('dialog[open] select[aria-label="Cakupan ringkasan"]', (el) =>
			[...el.options].map((item) => item.value)
		),
		['kelas']
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('dialog[open] button')]
			.find((el) => el.textContent.trim() === 'Pratinjau')
			.click()
	);
	await page.waitForSelector('dialog[open] textarea');
	assert.ok(
		!(await page.$eval('dialog[open] textarea', (el) => el.value)).includes('QA Ringkasan Belum')
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('dialog[open] button')]
			.find((el) => el.textContent.trim() === 'Tutup')
			.click()
	);
	check(
		'Pratinjau desktop/tablet/HP rapi; Salin/Bagikan memakai status manual terbaru tanpa mengirim WhatsApp otomatis'
	);
	await login('kepsek');
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(`${base}/murid?kelas_id=${classA}`, { waitUntil: 'networkidle0' });
	const add = await page.$eval('a[href*="/murid/form"]', (el) => ({
		disabled: getComputedStyle(el).pointerEvents === 'none',
		readonly: !!el.closest('.is-readonly')
	}));
	assert.equal(add.disabled, false);
	assert.equal(add.readonly, false);
	await page.screenshot({ path: path.join(folder, 'kepsek-murid-desktop.png'), fullPage: true });
	await page.setViewport({ width: 768, height: 1024 });
	await new Promise((resolve) => setTimeout(resolve, 350));
	await page.screenshot({ path: path.join(folder, 'kepsek-murid-tablet.png'), fullPage: true });
	assert.equal(
		await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
		false
	);
	await login('wali_asuh');
	await page.setViewport({ width: 390, height: 844 });
	await page.goto(
		`${base}/administrasi/absensi/kegiatan?kelas_id=${classA}&kegiatan_id=${kegiatan.asrama}`,
		{ waitUntil: 'networkidle0' }
	);
	assert.equal(
		await page.evaluate(() => document.body.innerText.includes('QA Akses Murid 2')),
		false
	);
	await page.screenshot({
		path: path.join(folder, 'wali-asuh-absensi-mobile.png'),
		fullPage: true
	});
	await page.evaluate(() => {
		const viewport = document.querySelector('.app-page-viewport');
		if (viewport) viewport.scrollTop = viewport.scrollHeight;
	});
	await page.screenshot({
		path: path.join(folder, 'wali-asuh-absensi-mobile-rows.png'),
		fullPage: true
	});
	await page.click('button[aria-label="Hapus status absensi QA Akses Murid 1"]');
	await page.waitForSelector('dialog[open] textarea[name="catatan"]');
	await page.type('dialog[open] textarea[name="catatan"]', 'QA penghapusan terverifikasi');
	await page.click('dialog[open] button[type="submit"]');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.equal(
		Number(
			(
				await row('SELECT count(*) n FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?', [
					students[0],
					kegiatan.asrama
				])
			).n
		),
		0
	);
	assert.ok(
		await row(
			"SELECT id FROM audit_log WHERE action='delete' AND entity_type='absensi_kegiatan' AND username_snapshot='qa-access-wali_asuh'"
		)
	);
	check(
		'Popup penghapusan memerlukan alasan dan menyimpan audit; tampilan desktop/tablet/mobile tidak melebar'
	);
	assert.deepEqual(errors, []);
	check('Tombol tambah murid pimpinan aktif dan tampilan mobile wali hanya berisi binaan');
	await writeFile(
		path.join(folder, 'result.json'),
		JSON.stringify(
			{
				checks,
				database,
				screenshots: [
					'summary-desktop.png',
					'summary-tablet.png',
					'summary-mobile.png',
					'scan-guru-pilih-kegiatan.png',
					'scan-wali_asuh-pilih-kegiatan.png',
					'kepsek-murid-desktop.png',
					'kepsek-murid-tablet.png',
					'wali-asuh-absensi-mobile.png',
					'wali-asuh-absensi-mobile-rows.png'
				]
			},
			null,
			2
		)
	);
	console.log('QA_RESULT', folder);
} catch (error) {
	await writeFile(path.join(folder, 'server.log'), output);
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
