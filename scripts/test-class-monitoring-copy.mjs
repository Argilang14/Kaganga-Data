import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createClient } from '@libsql/client';

const project = process.cwd();
const port = Number(process.env.CLASS_MONITORING_QA_PORT || 5179);
assert.ok(Number.isSafeInteger(port) && port > 0 && port < 65536, 'Port QA tidak valid.');
assert.ok(![5152, 1206].includes(port), 'QA tidak boleh menggunakan port produksi 5152/1206.');

const sourcePath = path.resolve(project, 'data/database.sqlite3');
const buildEntry = path.resolve(project, 'build/index.js');
await access(buildEntry).catch(() => {
	throw new Error('build/index.js belum tersedia. Jalankan pnpm build sebelum QA ini.');
});
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'class-monitoring-qa-'));
const database = path.join(folder, 'database.sqlite3');
const base = `http://127.0.0.1:${port}`;
const apiPath = '/api/administrasi/absensi/monitoring-kelas';
const pagePath = '/administrasi/absensi/monitoring-kelas';
const checks = [];
let server;
let browser;
let output = '';

const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const jakarta = (date = new Date()) => {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Jakarta',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			weekday: 'long',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(date)
			.map((part) => [part.type, part.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		weekday: parts.weekday,
		time: `${parts.hour}:${parts.minute}:${parts.second}`
	};
};
const dayName = {
	Monday: 'senin',
	Tuesday: 'selasa',
	Wednesday: 'rabu',
	Thursday: 'kamis',
	Friday: 'jumat',
	Saturday: 'sabtu',
	Sunday: 'minggu'
};
const shiftDate = (date, days) => {
	const value = new Date(`${date}T12:00:00+07:00`);
	value.setUTCDate(value.getUTCDate() + days);
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(value);
};
const isPortFree = (candidate) =>
	new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.unref();
		probe.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(false) : reject(error)));
		probe.listen(candidate, '127.0.0.1', () => probe.close(() => resolve(true)));
	});
const hasExited = (child) => !child || child.exitCode !== null || child.signalCode !== null;
const stopServer = async () => {
	if (hasExited(server)) return;
	server.kill('SIGTERM');
	await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
	if (!hasExited(server)) {
		server.kill('SIGKILL');
		await once(server, 'exit');
	}
};

assert.equal(await isPortFree(port), true, `Port QA ${port} sedang dipakai.`);

const source = createClient({ url: `file:${sourcePath}` });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
assert.notEqual(path.resolve(database), sourcePath);
const db = createClient({ url: `file:${database}` });

const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const insert = async (table, values) => {
	const entries = Object.entries(values).filter(([, value]) => value !== undefined);
	const result = await db.execute({
		sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
		args: entries.map(([, value]) => value)
	});
	return Number(result.lastInsertRowid);
};
const clone = (value, overrides) => {
	const result = { ...value, ...overrides };
	delete result.id;
	return result;
};
const count = async (table, where = '1=1', args = []) =>
	Number((await row(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, args)).n);
const today = jakarta();
const hari = dayName[today.weekday];
assert.ok(hari, `Hari Jakarta tidak dikenali: ${today.weekday}`);

const accounts = {};
const fixture = { classes: [], scheduleIds: [] };

async function makeRequest(accountName, method, payload, query = '') {
	const account = accounts[accountName];
	const response = await fetch(base + apiPath + query, {
		method,
		headers: {
			accept: 'application/json',
			...(account ? { cookie: account.cookie } : {}),
			...(method === 'POST' ? { 'content-type': 'application/json', origin: base } : {})
		},
		body: method === 'POST' ? JSON.stringify(payload) : undefined,
		redirect: 'manual'
	});
	const text = await response.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = null;
	}
	return { status: response.status, body, text, headers: response.headers };
}
const expectStatus = (result, expected, label) =>
	assert.ok(
		(Array.isArray(expected) ? expected : [expected]).includes(result.status),
		`${label}: expected ${expected}, received ${result.status}: ${result.text.slice(0, 1000)}`
	);
const modelOf = (body) => body?.data ?? body?.monitoring ?? body;
const meetingsOf = (body) => {
	const model = modelOf(body);
	if (Array.isArray(model?.meetings)) return model.meetings;
	return (model?.rows ?? []).flatMap((item) => item.meetings ?? []);
};
const classesOf = (body) =>
	modelOf(body)?.kelasList ?? modelOf(body)?.classes ?? modelOf(body)?.kelas ?? [];
const cardArray = (body) => body?.cards ?? body?.data?.cards ?? [];

try {
	await db.execute('PRAGMA busy_timeout=10000');
	await db.execute('PRAGMA foreign_keys=ON');
	const schoolTemplate = await row('SELECT * FROM sekolah ORDER BY id LIMIT 1');
	const yearTemplate = await row('SELECT * FROM tahun_ajaran ORDER BY id LIMIT 1');
	const semesterTemplate = await row('SELECT * FROM semester ORDER BY id LIMIT 1');
	const classTemplate = await row('SELECT * FROM kelas ORDER BY id LIMIT 1');
	const studentTemplate = await row('SELECT * FROM murid ORDER BY id LIMIT 1');
	const employeeTemplate = await row('SELECT * FROM pegawai ORDER BY id LIMIT 1');
	const userTemplate = await row('SELECT * FROM auth_user ORDER BY id LIMIT 1');
	for (const [name, value] of Object.entries({
		schoolTemplate,
		yearTemplate,
		semesterTemplate,
		classTemplate,
		studentTemplate,
		employeeTemplate,
		userTemplate
	}))
		assert.ok(value, `Template ${name} diperlukan di snapshot.`);

	const now = new Date().toISOString();
	const school = await insert(
		'sekolah',
		clone(schoolTemplate, {
			nama: 'QA Monitoring Sekolah <script>window.QA_INJECTED=1</script>',
			npsn: `QA${Date.now()}`.slice(-8),
			email: `qa-monitoring-${Date.now()}@invalid.test`,
			created_at: now,
			updated_at: now
		})
	);
	const foreignSchool = await insert(
		'sekolah',
		clone(schoolTemplate, {
			nama: 'QA Monitoring Sekolah Asing',
			npsn: `QF${Date.now()}`.slice(-8),
			email: `qa-monitoring-foreign-${Date.now()}@invalid.test`,
			created_at: now,
			updated_at: now
		})
	);
	const year = await insert(
		'tahun_ajaran',
		clone(yearTemplate, {
			sekolah_id: school,
			nama: 'QA Monitoring 2026/2027',
			tanggal_mulai: shiftDate(today.date, -30),
			tanggal_selesai: shiftDate(today.date, 30),
			is_aktif: 1,
			created_at: now,
			updated_at: now
		})
	);
	const foreignYear = await insert(
		'tahun_ajaran',
		clone(yearTemplate, {
			sekolah_id: foreignSchool,
			nama: 'QA Monitoring Foreign',
			tanggal_mulai: shiftDate(today.date, -30),
			tanggal_selesai: shiftDate(today.date, 30),
			is_aktif: 1,
			created_at: now,
			updated_at: now
		})
	);
	const semester = await insert(
		'semester',
		clone(semesterTemplate, {
			tahun_ajaran_id: year,
			tipe: 'ganjil',
			nama: 'QA Monitoring Ganjil',
			tanggal_mulai: shiftDate(today.date, -30),
			tanggal_selesai: shiftDate(today.date, 30),
			is_aktif: 1,
			created_at: now,
			updated_at: now
		})
	);
	const foreignSemester = await insert(
		'semester',
		clone(semesterTemplate, {
			tahun_ajaran_id: foreignYear,
			tipe: 'ganjil',
			nama: 'QA Monitoring Foreign',
			tanggal_mulai: shiftDate(today.date, -30),
			tanggal_selesai: shiftDate(today.date, 30),
			is_aktif: 1,
			created_at: now,
			updated_at: now
		})
	);

	const employees = {};
	for (const name of ['P1', 'P2', 'P3'])
		employees[name] = await insert(
			'pegawai',
			clone(employeeTemplate, {
				sekolah_id: school,
				nama: `QA Monitoring Guru ${name}`,
				nip: `QA-MON-${name}-${Date.now()}`,
				kode_pegawai: `QAM${name}${Date.now()}`,
				nik: null,
				nuptk: null,
				nomor_induk_pppk: null,
				dapodik_ptk_id: null,
				foto: null,
				status: 'aktif',
				created_at: now,
				updated_at: now
			})
		);
	const foreignEmployee = await insert(
		'pegawai',
		clone(employeeTemplate, {
			sekolah_id: foreignSchool,
			nama: 'QA Monitoring Guru Asing',
			nip: `QA-MON-F-${Date.now()}`,
			kode_pegawai: `QAMF${Date.now()}`,
			nik: null,
			nuptk: null,
			nomor_induk_pppk: null,
			dapodik_ptk_id: null,
			foto: null,
			created_at: now,
			updated_at: now
		})
	);

	for (let index = 1; index <= 3; index++)
		fixture.classes.push(
			await insert(
				'kelas',
				clone(classTemplate, {
					sekolah_id: school,
					tahun_ajaran_id: year,
					semester_id: semester,
					nama: `QA Monitoring ${index}${index === 3 ? ' <img src=x onerror=window.QA_INJECTED=1>' : ''}`,
					wali_kelas_id: null,
					wali_asrama_id: null,
					wali_asuh_id: null,
					dapodik_rombongan_belajar_id: null,
					created_at: now,
					updated_at: now
				})
			)
		);
	const foreignClass = await insert(
		'kelas',
		clone(classTemplate, {
			sekolah_id: foreignSchool,
			tahun_ajaran_id: foreignYear,
			semester_id: foreignSemester,
			nama: 'QA Monitoring Foreign Class',
			wali_kelas_id: null,
			wali_asrama_id: null,
			wali_asuh_id: null,
			dapodik_rombongan_belajar_id: null,
			created_at: now,
			updated_at: now
		})
	);
	for (let index = 0; index < fixture.classes.length; index++) {
		for (let student = 1; student <= 2; student++)
			await insert(
				'murid',
				clone(studentTemplate, {
					sekolah_id: school,
					semester_id: semester,
					kelas_id: fixture.classes[index],
					nama: `QA Monitoring Murid ${index + 1}.${student}${student === 2 ? ' <b>aman</b>' : ''}`,
					nis: `QAM${index}${student}${Date.now()}`,
					nisn: `${Date.now()}${index}${student}`.slice(-10),
					qr_token: null,
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null,
					nik: null,
					created_at: now,
					updated_at: now
				})
			);
	}

	const template = await insert('jadwal_template', {
		sekolah_id: school,
		tahun_ajaran_id: year,
		semester_id: semester,
		jenis: 'ganjil',
		nama: 'QA Monitoring Full Day',
		jenjang: 'semua',
		aktif: 1,
		created_at: now,
		updated_at: now
	});
	const foreignTemplate = await insert('jadwal_template', {
		sekolah_id: foreignSchool,
		tahun_ajaran_id: foreignYear,
		semester_id: foreignSemester,
		jenis: 'ganjil',
		nama: 'QA Monitoring Foreign',
		jenjang: 'semua',
		aktif: 1,
		created_at: now,
		updated_at: now
	});
	const slots = [];
	for (let jamKe = 1; jamKe <= 2; jamKe++)
		slots.push(
			await insert('jadwal_jam', {
				sekolah_id: school,
				template_id: template,
				jenjang: 'srma',
				hari,
				jam_ke: jamKe,
				label: `QA JP ${jamKe}`,
				pukul_mulai: jamKe === 1 ? '00:00' : '12:00',
				pukul_selesai: jamKe === 1 ? '12:00' : '23:59',
				tipe: 'pelajaran',
				urutan: jamKe,
				aktif: 1,
				created_at: now,
				updated_at: now
			})
		);
	const mapels = [];
	for (let index = 0; index < 3; index++)
		mapels.push(
			await insert('jadwal_mata_pelajaran', {
				sekolah_id: school,
				kode: `QAM${index + 1}`,
				nama: `QA Monitoring Mapel ${index + 1}`,
				jenjang: 'semua',
				kategori: 'akademik',
				guru_pegawai_id: index === 1 ? employees.P2 : employees.P1,
				jp_per_minggu: 2,
				aktif: 1,
				created_at: now,
				updated_at: now
			})
		);
	for (let classIndex = 0; classIndex < fixture.classes.length; classIndex++) {
		for (let slotIndex = 0; slotIndex < 2; slotIndex++)
			fixture.scheduleIds.push(
				await insert('jadwal_pelajaran', {
					sekolah_id: school,
					hari,
					jam_ke: slotIndex + 1,
					kode_kegiatan: `QAM${classIndex + 1}`,
					kelas_id: fixture.classes[classIndex],
					semester_id: semester,
					jam_id: slots[slotIndex],
					tipe: 'pelajaran',
					jadwal_mapel_id: mapels[classIndex],
					// Class 3 deliberately exercises the jadwal_mata_pelajaran teacher fallback.
					guru_pegawai_id: classIndex === 2 ? null : classIndex === 1 ? employees.P2 : employees.P1,
					template_id: template,
					created_at: now,
					updated_at: now
				})
			);
	}
	const foreignSlot = await insert('jadwal_jam', {
		sekolah_id: foreignSchool,
		template_id: foreignTemplate,
		jenjang: 'srma',
		hari,
		jam_ke: 1,
		label: 'QA Foreign JP',
		pukul_mulai: '00:00',
		pukul_selesai: '23:59',
		tipe: 'pelajaran',
		urutan: 1,
		aktif: 1,
		created_at: now,
		updated_at: now
	});
	const foreignMapel = await insert('jadwal_mata_pelajaran', {
		sekolah_id: foreignSchool,
		kode: 'QAF',
		nama: 'QA Monitoring Foreign Mapel',
		jenjang: 'semua',
		kategori: 'akademik',
		guru_pegawai_id: foreignEmployee,
		jp_per_minggu: 1,
		aktif: 1,
		created_at: now,
		updated_at: now
	});
	await insert('jadwal_pelajaran', {
		sekolah_id: foreignSchool,
		hari,
		jam_ke: 1,
		kode_kegiatan: 'QAF',
		kelas_id: foreignClass,
		semester_id: foreignSemester,
		jam_id: foreignSlot,
		tipe: 'pelajaran',
		jadwal_mapel_id: foreignMapel,
		guru_pegawai_id: foreignEmployee,
		template_id: foreignTemplate,
		created_at: now,
		updated_at: now
	});

	const roles = [
		['admin', 'admin', null, null, ['class_monitoring_manage']],
		['kepsek', 'user', 'kepala_sekolah', null, []],
		['wakakur', 'user', 'waka_kurikulum', null, []],
		['dapur', 'tim_dapur', null, null, []],
		['waliasrama', 'wali_asrama', null, null, []],
		[
			'teacherP1',
			'user',
			null,
			employees.P1,
			['class_monitoring_lihat', 'class_monitoring_scan', 'menu_jurnal']
		],
		[
			'teacherP2',
			'user',
			null,
			employees.P2,
			['class_monitoring_lihat', 'class_monitoring_scan', 'menu_jurnal']
		],
		['waliKelas', 'wali_kelas', null, employees.P1, []],
		[
			'substituteP3',
			'user',
			null,
			employees.P3,
			['class_monitoring_lihat', 'class_monitoring_scan', 'menu_jurnal']
		]
	];
	for (const [name, type, position, employeeId, permissions] of roles) {
		const token = randomBytes(32).toString('base64url');
		const id = await insert(
			'auth_user',
			clone(userTemplate, {
				username: `qa-monitoring-${name}-${Date.now()}`,
				username_normalized: `qa-monitoring-${name}-${Date.now()}`,
				type,
				jabatan_akses: position,
				sekolah_id: school,
				pegawai_id: employeeId,
				kelas_id: null,
				mata_pelajaran_id: null,
				permissions: JSON.stringify(permissions),
				must_change_password: 0,
				created_at: now,
				updated_at: now
			})
		);
		await insert('auth_session', {
			user_id: id,
			token_hash: hash(token),
			user_agent: 'QA class monitoring',
			ip_address: '127.0.0.1',
			expires_at: new Date(Date.now() + 3600000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts[name] = {
			id,
			token,
			cookie: `rapkumer-session=${token}; active-sekolah-id=${school}`
		};
	}

	fixture.school = school;
	fixture.foreignSchool = foreignSchool;
	fixture.foreignClass = foreignClass;
	fixture.year = year;
	fixture.semester = semester;
	fixture.template = template;
	fixture.mapels = mapels;
	fixture.students = await rows(
		'SELECT id FROM murid WHERE sekolah_id=? AND kelas_id IN (?,?,?) ORDER BY id',
		[school, ...fixture.classes]
	);
	fixture.absensiBefore = await count(
		'absensi',
		`murid_id IN (${fixture.students.map(() => '?').join(',')})`,
		fixture.students.map((item) => item.id)
	);
	assert.equal(
		await count('auth_user_kelas', 'auth_user_id IN (?,?,?,?)', [
			accounts.teacherP1.id,
			accounts.teacherP2.id,
			accounts.waliKelas.id,
			accounts.substituteP3.id
		]),
		0,
		'scheduled and substitute teachers must not rely on auth_user_kelas grants'
	);
	fixture.existingJournal = await insert('jurnal_mengajar', {
		sekolah_id: school,
		auth_user_id: accounts.teacherP1.id,
		kelas_id: fixture.classes[2],
		mata_pelajaran_id: null,
		jadwal_mapel_id: mapels[2],
		tahun_ajaran_id: year,
		semester_id: semester,
		jenis_jadwal: 'ganjil',
		jadwal_template_id: template,
		jadwal_pelajaran_ids: JSON.stringify(fixture.scheduleIds.slice(4, 6)),
		tanggal: today.date,
		jam_pelajaran: '1-2',
		pukul: '00:00-23:59',
		lingkup_materi: 'QA jurnal yang sudah ada',
		created_at: now,
		updated_at: now
	});
	fixture.originalTeacherJournal = await insert('jurnal_mengajar', {
		sekolah_id: school,
		auth_user_id: accounts.teacherP2.id,
		kelas_id: fixture.classes[1],
		mata_pelajaran_id: null,
		jadwal_mapel_id: mapels[1],
		tahun_ajaran_id: year,
		semester_id: semester,
		jenis_jadwal: 'ganjil',
		jadwal_template_id: template,
		jadwal_pelajaran_ids: JSON.stringify(fixture.scheduleIds.slice(2, 4)),
		tanggal: today.date,
		jam_pelajaran: '1-2',
		pukul: '00:00-23:59',
		lingkup_materi: 'QA jurnal guru sebelum digantikan',
		created_at: now,
		updated_at: now
	});
	fixture.journalCountBefore = await count('jurnal_mengajar', 'sekolah_id=? AND tanggal=?', [
		school,
		today.date
	]);

	server = spawn(process.execPath, ['build/index.js'], {
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
	server.stdout.on('data', (chunk) => (output += chunk));
	server.stderr.on('data', (chunk) => (output += chunk));
	let ready = false;
	for (let attempt = 0; attempt < 120; attempt++) {
		if (hasExited(server)) break;
		try {
			if ((await fetch(base + '/login')).status === 200) {
				ready = true;
				break;
			}
		} catch {
			// The isolated server may not be listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, `Server QA gagal siap:\n${output.slice(-5000)}`);
	pass(`server isolated on ${port}`);

	const holidayId = await insert('kalender_pendidikan', {
		sekolah_id: school,
		tahun_ajaran_id: year,
		semester_id: semester,
		kelas_id: fixture.classes[2],
		tanggal_mulai: today.date,
		tanggal_selesai: today.date,
		judul: 'QA Monitoring Libur Kelas',
		jenis: 'libur_sekolah',
		jenjang: 'semua',
		created_at: now,
		updated_at: now
	});
	const holidayProbe = await makeRequest(
		'admin',
		'GET',
		null,
		`?tanggal=${today.date}&jenis=ganjil`
	);
	expectStatus(holidayProbe, 200, 'holiday probe');
	const holidayRow = (modelOf(holidayProbe.body).rows ?? []).find(
		(item) => Number(item.id) === fixture.classes[2]
	);
	assert.equal(holidayRow?.holidayLabel, 'QA Monitoring Libur Kelas');
	assert.equal(
		holidayRow?.meetings?.length,
		0,
		'holiday class must not expose a scannable meeting'
	);
	await db.execute({ sql: 'DELETE FROM kalender_pendidikan WHERE id=?', args: [holidayId] });
	pass('class holiday suppresses meetings on the Jakarta date');

	const initial = await makeRequest('admin', 'GET', null, `?tanggal=${today.date}&jenis=ganjil`);
	expectStatus(initial, 200, 'admin GET');
	const adminModel = modelOf(initial.body);
	assert.equal(adminModel.capabilities?.canManage ?? adminModel.canManage, true);
	assert.ok(Array.isArray(meetingsOf(initial.body)) && meetingsOf(initial.body).length >= 3);
	assert.deepEqual(
		classesOf(initial.body)
			.map((item) => item.id)
			.sort((a, b) => a - b),
		[...fixture.classes].sort((a, b) => a - b)
	);
	assert.ok(
		meetingsOf(initial.body).every((meeting) =>
			fixture.classes.includes(Number(meeting.kelasId ?? meeting.classId))
		)
	);
	assert.ok(meetingsOf(initial.body).every((meeting) => 'key' in meeting && 'canScan' in meeting));
	pass('admin load model and seeded-class isolation');

	for (const role of ['kepsek', 'wakakur']) {
		const result = await makeRequest(role, 'GET', null, `?tanggal=${today.date}&jenis=ganjil`);
		expectStatus(result, 200, `${role} GET`);
		assert.equal(
			modelOf(result.body).capabilities?.canManage ?? modelOf(result.body).canManage,
			true,
			`${role} must manage`
		);
	}
	for (const role of ['dapur', 'waliasrama'])
		expectStatus(
			await makeRequest(role, 'GET', null, `?tanggal=${today.date}&jenis=ganjil`),
			403,
			`${role} denied`
		);
	for (const role of ['teacherP1', 'teacherP2', 'waliKelas', 'substituteP3']) {
		const result = await makeRequest(role, 'GET', null, `?tanggal=${today.date}&jenis=ganjil`);
		expectStatus(result, 200, `${role} GET`);
		assert.equal(
			modelOf(result.body).capabilities?.canManage ?? modelOf(result.body).canManage,
			false
		);
	}
	const waliView = await makeRequest(
		'waliKelas',
		'GET',
		null,
		`?tanggal=${today.date}&jenis=ganjil`
	);
	assert.equal(
		meetingsOf(waliView.body).find((meeting) => Number(meeting.kelasId) === fixture.classes[0])
			?.canScan,
		true
	);
	for (const [label, date, expectedState] of [
		['past', shiftDate(today.date, -7), 'ended'],
		['future', shiftDate(today.date, 7), 'forthcoming']
	]) {
		const bounded = await makeRequest('teacherP1', 'GET', null, `?tanggal=${date}&jenis=ganjil`);
		expectStatus(bounded, 200, `${label} time-bound view`);
		const owned = meetingsOf(bounded.body).filter(
			(meeting) => Number(meeting.guruPegawaiId) === employees.P1
		);
		assert.ok(owned.length > 0);
		assert.ok(owned.every((meeting) => meeting.canScan === false));
		assert.ok(owned.every((meeting) => meeting.state === expectedState));
	}
	pass('role capabilities');

	const cardsResult = await makeRequest('admin', 'POST', {
		action: 'qr',
		kelasIds: fixture.classes
	});
	expectStatus(cardsResult, 200, 'admin QR creation');
	const cards = cardArray(cardsResult.body);
	assert.equal(cards.length, 3);
	for (const card of cards) {
		assert.ok(fixture.classes.includes(Number(card.kelasId)));
		assert.equal(typeof card.nama, 'string');
		assert.ok(card.token && card.payload);
	}
	for (const role of ['kepsek', 'wakakur'])
		expectStatus(
			await makeRequest(role, 'POST', { action: 'qr', kelasIds: [fixture.classes[0]] }),
			200,
			`${role} QR allowed`
		);
	for (const role of ['teacherP1', 'teacherP2', 'waliKelas', 'substituteP3', 'dapur', 'waliasrama'])
		expectStatus(
			await makeRequest(role, 'POST', { action: 'qr', kelasIds: [fixture.classes[0]] }),
			403,
			`${role} QR denied`
		);
	expectStatus(
		await makeRequest('teacherP1', 'POST', { action: 'resetQr', kelasId: fixture.classes[0] }),
		403,
		'teacher QR reset denied'
	);
	expectStatus(
		await makeRequest('admin', 'POST', { action: 'qr', kelasIds: [foreignClass] }),
		403,
		'foreign class QR denied'
	);
	pass('QR authorization and school isolation');

	const p1View = await makeRequest('teacherP1', 'GET', null, `?tanggal=${today.date}&jenis=ganjil`);
	const p2View = await makeRequest('teacherP2', 'GET', null, `?tanggal=${today.date}&jenis=ganjil`);
	const p1Meeting = meetingsOf(p1View.body).find(
		(meeting) => Number(meeting.kelasId) === fixture.classes[0]
	);
	const fallbackMeeting = meetingsOf(p1View.body).find(
		(meeting) => Number(meeting.kelasId) === fixture.classes[2]
	);
	const p2Meeting = meetingsOf(p2View.body).find(
		(meeting) => Number(meeting.kelasId) === fixture.classes[1]
	);
	assert.ok(p1Meeting?.canScan && p2Meeting?.canScan);
	assert.equal(fallbackMeeting?.canScan, true, 'mapel teacher fallback must own class 3 meeting');
	assert.equal(Number(fallbackMeeting?.guruPegawaiId), employees.P1);
	assert.deepEqual(
		(p1Meeting.jadwalIds ?? p1Meeting.scheduleIds).map(Number).sort((a, b) => a - b),
		fixture.scheduleIds.slice(0, 2).sort((a, b) => a - b)
	);
	expectStatus(
		await makeRequest('teacherP1', 'POST', {
			action: 'absence',
			key: p2Meeting.key,
			tanggal: today.date,
			jenis: 'ganjil',
			reason: 'izin'
		}),
		403,
		'teacher manage denied'
	);
	const scanPayload = {
		action: 'scan',
		key: p1Meeting.key,
		qr: cards.find((card) => Number(card.kelasId) === fixture.classes[0]).token,
		tanggal: today.date,
		jenis: 'ganjil'
	};
	expectStatus(
		await makeRequest('teacherP2', 'POST', { action: 'scan', ...scanPayload }),
		403,
		'wrong teacher scan'
	);
	expectStatus(
		await makeRequest('teacherP1', 'POST', {
			action: 'scan',
			...scanPayload,
			qr: cards.find((card) => Number(card.kelasId) === fixture.classes[1]).token
		}),
		403,
		'forged class QR scan'
	);
	expectStatus(
		await makeRequest('teacherP1', 'POST', {
			action: 'scan',
			...scanPayload,
			tanggal: shiftDate(today.date, -1)
		}),
		400,
		'old date scan'
	);
	expectStatus(
		await makeRequest('teacherP1', 'POST', {
			action: 'scan',
			...scanPayload,
			tanggal: shiftDate(today.date, 1)
		}),
		400,
		'future date scan'
	);
	expectStatus(
		await makeRequest('teacherP1', 'POST', {
			action: 'scan',
			...scanPayload,
			key: '999999:999999:999999'
		}),
		[400, 404],
		'missing schedule scan'
	);
	const concurrentScans = await Promise.all(
		Array.from({ length: 6 }, () => makeRequest('teacherP1', 'POST', scanPayload))
	);
	assert.equal(
		concurrentScans.filter((result) => result.status === 200).length,
		1,
		'exactly one concurrent scan must win'
	);
	concurrentScans
		.filter((result) => result.status !== 200)
		.forEach((result) => expectStatus(result, 409, 'duplicate scan conflict'));
	expectStatus(await makeRequest('teacherP1', 'POST', scanPayload), 409, 'repeat scan conflict');
	assert.equal(
		await count('class_monitoring', 'sekolah_id=? AND meeting_key=? AND tanggal=?', [
			school,
			p1Meeting.key,
			today.date
		]),
		1
	);
	assert.equal(
		await count('jurnal_mengajar', 'sekolah_id=? AND tanggal=?', [school, today.date]),
		fixture.journalCountBefore,
		'scan must not auto-create journal'
	);
	pass('teacher ownership, date checks, 2-JP grouping, and scan idempotency');

	const absencePayload = {
		action: 'absence',
		key: p2Meeting.key,
		tanggal: today.date,
		jenis: 'ganjil',
		reason: 'sakit',
		note: 'QA sakit'
	};
	const concurrentAbsences = await Promise.all(
		Array.from({ length: 4 }, () => makeRequest('admin', 'POST', absencePayload))
	);
	concurrentAbsences.forEach((result) => expectStatus(result, [200, 409], 'concurrent absence'));
	assert.ok(concurrentAbsences.some((result) => result.status === 200));
	assert.equal(
		await count('class_monitoring', 'sekolah_id=? AND meeting_key=? AND tanggal=?', [
			school,
			p2Meeting.key,
			today.date
		]),
		1
	);
	expectStatus(
		await makeRequest('admin', 'POST', {
			...absencePayload,
			reason: 'izin',
			substitutePegawaiId: employees.P3,
			note: '<script>window.QA_INJECTED=1</script>'
		}),
		200,
		'substitution'
	);
	const substituteView = await makeRequest(
		'substituteP3',
		'GET',
		null,
		`?tanggal=${today.date}&jenis=ganjil`
	);
	const substituteMeeting = meetingsOf(substituteView.body).find(
		(meeting) => meeting.key === p2Meeting.key
	);
	assert.ok(substituteMeeting?.canScan, 'substitute must be able to scan');
	const substituteScan = {
		action: 'scan',
		key: p2Meeting.key,
		qr: cards.find((card) => Number(card.kelasId) === fixture.classes[1]).token,
		tanggal: today.date,
		jenis: 'ganjil'
	};
	expectStatus(
		await makeRequest('substituteP3', 'POST', { action: 'scan', ...substituteScan }),
		200,
		'substitute scan'
	);
	pass('absence update and substitute scan');

	const afterScan = await makeRequest(
		'substituteP3',
		'GET',
		null,
		`?tanggal=${today.date}&jenis=ganjil`
	);
	const journalMeeting = meetingsOf(afterScan.body).find(
		(meeting) => meeting.key === p2Meeting.key
	);
	assert.ok(
		journalMeeting?.journal?.url ||
			journalMeeting?.journal?.href ||
			journalMeeting?.journalHref ||
			journalMeeting?.journalContext ||
			journalMeeting?.monitoringKey,
		'substitute scan must expose scoped journal flow'
	);
	const href =
		journalMeeting?.journal?.url ?? journalMeeting?.journal?.href ?? journalMeeting?.journalHref;
	if (href) {
		const parsed = new URL(href, base);
		assert.equal(parsed.pathname, '/jurnal-mengajar');
		assert.ok(
			parsed.searchParams.get('monitoringKey') ?? parsed.searchParams.get('monitoring_key')
		);
	}
	pass('scoped substitute journal handoff');
	const journalForm = {
		monitoringKey: p2Meeting.key,
		kelasId: String(fixture.classes[1]),
		jadwalMapelId: String(mapels[1]),
		mataPelajaranId: '',
		jadwalIds: fixture.scheduleIds.slice(2, 4).join(','),
		tanggal: today.date,
		jenisJadwal: 'ganjil',
		lingkupMateri: 'Materi QA guru pengganti',
		tujuanPembelajaranManual: 'Memahami materi pertemuan QA'
	};
	const saveJournal = async (accountName, overrides = {}) => {
		const response = await fetch(base + '/jurnal-mengajar?/save', {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie: accounts[accountName].cookie,
				origin: base,
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			body: new URLSearchParams({ ...journalForm, ...overrides })
		});
		const text = await response.text();
		let status = response.status;
		try {
			const action = JSON.parse(text);
			if (action.type === 'failure' || action.type === 'error') status = action.status ?? status;
		} catch {
			// Redirect responses need not contain a JSON action result.
		}
		return { status, text };
	};
	expectStatus(await saveJournal('teacherP1'), 403, 'unrelated teacher journal denied');
	expectStatus(
		await saveJournal('substituteP3', { kelasId: String(fixture.classes[0]) }),
		403,
		'forged journal class denied'
	);
	const journalPage = await fetch(new URL(href, base), {
		headers: { cookie: accounts.substituteP3.cookie },
		redirect: 'manual'
	});
	assert.equal(journalPage.status, 200, 'substitute journal deep link');
	const savedJournal = await saveJournal('substituteP3');
	expectStatus(savedJournal, 200, 'substitute journal saved');
	const persistedJournal = await row(
		'SELECT * FROM jurnal_mengajar WHERE sekolah_id=? AND kelas_id=? AND auth_user_id=?',
		[school, fixture.classes[1], accounts.substituteP3.id]
	);
	assert.equal(persistedJournal?.lingkup_materi, journalForm.lingkupMateri);
	assert.equal(
		(
			await row('SELECT lingkup_materi FROM jurnal_mengajar WHERE id=?', [
				fixture.originalTeacherJournal
			])
		).lingkup_materi,
		'QA jurnal guru sebelum digantikan',
		'journal of the original teacher is retained without blocking the substitute'
	);
	assert.deepEqual(
		JSON.parse(persistedJournal.jadwal_pelajaran_ids),
		fixture.scheduleIds.slice(2, 4)
	);
	expectStatus(await saveJournal('substituteP3'), 409, 'duplicate journal denied');
	pass('substitute journal saved with exact meeting scope');

	await db.execute({
		sql: 'UPDATE jadwal_mata_pelajaran SET nama=? WHERE id=?',
		args: ['QA Monitoring Mapel Edited', mapels[0]]
	});
	await db.execute({
		sql: 'DELETE FROM jadwal_pelajaran WHERE id IN (?,?)',
		args: fixture.scheduleIds.slice(0, 2)
	});
	const snapshot = await row(
		'SELECT * FROM class_monitoring WHERE sekolah_id=? AND meeting_key=?',
		[school, p1Meeting.key]
	);
	assert.equal(snapshot.mapel_nama_snapshot, 'QA Monitoring Mapel 1');
	assert.equal(snapshot.kelas_nama_snapshot, 'QA Monitoring 1');
	assert.deepEqual(
		JSON.parse(snapshot.jadwal_pelajaran_ids_snapshot)
			.map(Number)
			.sort((a, b) => a - b),
		fixture.scheduleIds.slice(0, 2).sort((a, b) => a - b)
	);
	pass('meeting snapshots survive schedule edits/deletes');

	const oldCard = cards.find((card) => Number(card.kelasId) === fixture.classes[2]);
	const regenerated = await makeRequest('admin', 'POST', {
		action: 'resetQr',
		kelasId: fixture.classes[2]
	});
	expectStatus(regenerated, 200, 'QR regeneration');
	const newCard = cardArray(regenerated.body)[0];
	assert.notEqual(newCard.token, oldCard.token);
	const class3Meeting = meetingsOf(initial.body).find(
		(meeting) => Number(meeting.kelasId) === fixture.classes[2]
	);
	assert.equal(
		class3Meeting.journal?.id,
		fixture.existingJournal,
		'existing journal must be linked, not recreated'
	);
	expectStatus(
		await makeRequest('teacherP1', 'POST', {
			action: 'scan',
			key: class3Meeting.key,
			qr: oldCard.token,
			tanggal: today.date,
			jenis: 'ganjil'
		}),
		[400, 403],
		'old QR invalid'
	);
	expectStatus(
		await makeRequest('teacherP1', 'POST', {
			action: 'scan',
			key: class3Meeting.key,
			qr: newCard.token,
			tanggal: today.date,
			jenis: 'ganjil'
		}),
		200,
		'new QR valid'
	);
	pass('QR regeneration invalidates old token');

	const beforeReadRows = await count('class_monitoring', 'sekolah_id=?', [school]);
	for (let index = 0; index < 3; index++)
		expectStatus(
			await makeRequest('admin', 'GET', null, `?tanggal=${today.date}&jenis=ganjil`),
			200,
			'read-only GET'
		);
	assert.equal(await count('class_monitoring', 'sekolah_id=?', [school]), beforeReadRows);
	assert.equal(
		await count(
			'absensi',
			`murid_id IN (${fixture.students.map(() => '?').join(',')})`,
			fixture.students.map((item) => item.id)
		),
		fixture.absensiBefore
	);
	pass('GET and monitoring mutations do not write student attendance');
	// Add visual-only cases after the behavioral assertions have completed.
	await db.execute({
		sql: 'UPDATE pegawai SET nama=? WHERE id=?',
		args: [
			'QA Guru Pendidikan Pancasila dengan Nama Lengkap dan Gelar Akademik, S.Pd., M.Pd.',
			employees.P2
		]
	});
	const visualMapel = await insert('jadwal_mata_pelajaran', {
		sekolah_id: school,
		kode: 'QA_VISUAL',
		nama: 'QA Pendidikan Pancasila dan Kewarganegaraan dengan Nama Mata Pelajaran Panjang',
		jenjang: 'semua',
		kategori: 'akademik',
		guru_pegawai_id: employees.P2,
		jp_per_minggu: 3,
		aktif: 1,
		created_at: now,
		updated_at: now
	});
	for (const [jamKe, start, end] of [
		[3, '05:00', '05:45'],
		[5, '23:00', '23:30'],
		[7, '10:00', '11:00']
	]) {
		const slot = await insert('jadwal_jam', {
			sekolah_id: school,
			template_id: template,
			jenjang: 'srma',
			hari,
			jam_ke: jamKe,
			label: `QA Visual ${jamKe}`,
			pukul_mulai: start,
			pukul_selesai: end,
			tipe: 'pelajaran',
			urutan: jamKe,
			aktif: 1,
			created_at: now,
			updated_at: now
		});
		await insert('jadwal_pelajaran', {
			sekolah_id: school,
			hari,
			jam_ke: jamKe,
			kode_kegiatan: 'QA_VISUAL',
			kelas_id: fixture.classes[0],
			semester_id: semester,
			jam_id: slot,
			tipe: 'pelajaran',
			jadwal_mapel_id: visualMapel,
			guru_pegawai_id: employees.P2,
			template_id: template,
			created_at: now,
			updated_at: now
		});
	}
	const visualModel = await makeRequest(
		'admin',
		'GET',
		null,
		`?tanggal=${today.date}&jenis=ganjil`
	);
	const visualMeetings = meetingsOf(visualModel.body);
	assert.equal(visualMeetings.length, 6);
	const excusedVisual = visualMeetings.find(
		(meeting) => meeting.mapelNama.includes('Kewarganegaraan') && meeting.jamPelajaran.includes(7)
	);
	assert.ok(excusedVisual);
	expectStatus(
		await makeRequest('admin', 'POST', {
			action: 'absence',
			key: excusedVisual.key,
			tanggal: today.date,
			jenis: 'ganjil',
			reason: 'izin',
			note: 'QA pemeriksaan tampilan izin'
		}),
		200,
		'visual absence'
	);

	const chrome = [
		process.env.CHROME_PATH,
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
	]
		.filter(Boolean)
		.find((candidate) => existsSync(candidate));
	assert.ok(chrome, 'Chrome/Edge executable tidak ditemukan.');
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: ['--no-sandbox']
	});
	const page = await browser.newPage();
	const browserErrors = [];
	page.on('pageerror', (error) => browserErrors.push(error.message));
	const settle = async () =>
		page.evaluate(async () => {
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			await Promise.all(
				document
					.getAnimations()
					.filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
					.map((animation) => animation.finished.catch(() => {}))
			);
		});
	await page.setCookie(
		{ name: 'rapkumer-session', value: accounts.admin.token, domain: '127.0.0.1', path: '/' },
		{ name: 'active-sekolah-id', value: String(school), domain: '127.0.0.1', path: '/' }
	);
	for (const [label, width, height] of [
		['desktop', 1440, 1000],
		['laptop', 1280, 800],
		['tablet', 768, 1024],
		['mobile', 390, 844],
		['small-mobile', 320, 740]
	]) {
		await page.setViewport({ width, height });
		const response = await page.goto(`${base}${pagePath}?tanggal=${today.date}&jenis=ganjil`, {
			waitUntil: 'networkidle0'
		});
		assert.equal(response.status(), 200);
		assert.equal(
			await page.$eval('.class-monitoring', (element) => element.dataset.uiRevision),
			'kaganga-ui-class-monitoring-2'
		);
		await page.$eval('#my-drawer-2', (element) => {
			element.checked = false;
			element.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await settle();
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
			true,
			`${label} horizontal overflow`
		);
		assert.equal(
			await page.$eval(
				'.class-monitoring',
				(element) => element.scrollWidth <= element.clientWidth + 1
			),
			true,
			`${label} monitoring content overflow`
		);
		if (width < 1024)
			assert.equal(
				await page.$eval('.matrix-scroll', (element) => getComputedStyle(element).display),
				'none'
			);
		assert.equal(
			await page.evaluate(() => window.QA_INJECTED === 1),
			false,
			`${label} injected markup executed`
		);
		if (width < 640) {
			assert.equal(
				await page.evaluate(() => {
					const mobile = document.querySelector('.mobile-classes');
					const cards = [...mobile.querySelectorAll('[data-testid="meeting-card"]')];
					return (
						cards.length === 6 &&
						cards.every((card) => card.getBoundingClientRect().width >= window.innerWidth - 60)
					);
				}),
				true,
				`${label} meeting cards must fill the available width`
			);
		}
		assert.equal(
			await page.evaluate(() => {
				const cards = [...document.querySelectorAll('[data-testid="meeting-card"]')].filter(
					(card) => card.getBoundingClientRect().width > 0
				);
				return cards.every((card) => {
					const title = card.querySelector('.meeting-subject').getBoundingClientRect();
					const status = card.querySelector('.meeting-status').getBoundingClientRect();
					return (
						title.bottom <= status.top + 1 ||
						status.bottom <= title.top + 1 ||
						title.right <= status.left + 1
					);
				});
			}),
			true,
			`${label} subject and status must not overlap`
		);
		await page.screenshot({
			path: path.join(folder, `class-monitoring-${label}.png`),
			fullPage: true
		});
		if (width < 640) {
			await page.$eval('.mobile-classes', (element) => element.scrollIntoView({ block: 'start' }));
			await page.screenshot({
				path: path.join(folder, `class-monitoring-${label}-meetings.png`),
				fullPage: true
			});
		}
		await page.evaluate(() =>
			[...document.querySelectorAll('button[title="Catat sakit atau izin"]')]
				.find((element) => element.getClientRects().length)
				.click()
		);
		await page.waitForSelector('#class-monitoring-absence[open]');
		await settle();
		assert.equal(
			await page.$eval('dialog[open]', (element) => element.contains(document.activeElement)),
			true,
			`${label} modal focus`
		);
		assert.equal(
			await page.$eval(
				'dialog[open] .modal-box',
				(element) =>
					element.scrollWidth <= element.clientWidth + 1 &&
					element.getBoundingClientRect().height <= innerHeight
			),
			true,
			`${label} absence dialog bounds`
		);
		assert.equal(
			await page.$eval(
				'dialog[open] .modal-action',
				(element) => element.getBoundingClientRect().bottom <= innerHeight
			),
			true,
			`${label} save action is reachable`
		);
		await page.screenshot({ path: path.join(folder, `class-monitoring-${label}-absence.png`) });
		await page.keyboard.press('Escape');
		await page.waitForSelector('dialog[open]', { hidden: true });
		await settle();
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find((element) => element.textContent.trim() === 'Kelola QR')
				.click()
		);
		await page.waitForSelector('#class-monitoring-qr[open]');
		await settle();
		assert.equal(
			await page.$eval(
				'dialog[open] .modal-box',
				(element) =>
					element.scrollWidth <= element.clientWidth + 1 &&
					element.getBoundingClientRect().height <= innerHeight
			),
			true,
			`${label} QR dialog bounds`
		);
		await page.screenshot({ path: path.join(folder, `class-monitoring-${label}-qr.png`) });
		await page.keyboard.press('Escape');
		await page.waitForSelector('dialog[open]', { hidden: true });
		await settle();
	}
	pass('responsive seeded-only screenshots and HTML escaping');
	const clickButton = async (targetPage, text, scope = 'button') =>
		targetPage.evaluate(
			(text, scope) => {
				const button = [...document.querySelectorAll(scope)].find(
					(button) => button.textContent.trim() === text
				);
				if (!button) throw new Error(`Button missing: ${text}`);
				button.click();
			},
			text,
			scope
		);
	await page.setViewport({ width: 1440, height: 1000 });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.$eval('.class-monitoring', (element) => element.scrollIntoView({ block: 'start' }));
	await settle();
	await page.screenshot({ path: path.join(folder, 'class-monitoring-dark.png'), fullPage: true });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	await page.evaluate(() =>
		document.querySelector('button[title="Catat sakit atau izin"]').click()
	);
	await page.waitForSelector('dialog[open]');
	await settle();
	assert.equal(
		await page.$eval('dialog[open] select', (select) => select.getBoundingClientRect().width > 200),
		true
	);
	await page.screenshot({
		path: path.join(folder, 'class-monitoring-absence.png'),
		fullPage: true
	});
	await clickButton(page, 'Batal', 'dialog[open] button');
	const earlierDate = shiftDate(today.date, -7);
	await page.$eval(
		'form[aria-label="Filter monitoring kelas"] input[type="date"]',
		(input, date) => {
			input.value = date;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		},
		earlierDate
	);
	await clickButton(page, 'Terapkan');
	await page.waitForFunction((date) => location.search.includes(date), {}, earlierDate);
	await page.waitForFunction(() =>
		document.querySelector('[data-status="elapsed"][data-testid="meeting-card"]')
	);
	await page.$eval('.class-matrix', (element) => element.scrollIntoView({ block: 'start' }));
	await page.screenshot({
		path: path.join(folder, 'class-monitoring-elapsed.png'),
		fullPage: true
	});
	await page.goto(`${base}${pagePath}?tanggal=${today.date}&jenis=ganjil`, {
		waitUntil: 'networkidle0'
	});
	pass('monitoring filters, readable status layout, dark theme and absence dialog');
	await clickButton(page, 'Kelola QR');
	await page.waitForSelector('dialog[open]');
	await clickButton(page, 'Tampilkan QR', 'dialog[open] button');
	await page.waitForFunction(() =>
		[...document.querySelectorAll('dialog[open] button')].some(
			(button) => button.textContent.trim() === 'Cetak' && !button.disabled
		)
	);
	await page.evaluate(() => {
		const open = window.open.bind(window);
		window.open = (...args) => {
			const popup = open(...args);
			if (popup) popup.print = () => {};
			return popup;
		};
	});
	const popupReady = new Promise((resolve) => page.once('popup', resolve));
	await clickButton(page, 'Cetak', 'dialog[open] button');
	const printPage = await Promise.race([
		popupReady,
		new Promise((_, reject) => setTimeout(() => reject(new Error('QR print popup missing')), 10000))
	]);
	await printPage.waitForFunction(
		() =>
			document.querySelectorAll('article img').length === 3 &&
			[...document.images].every((image) => image.complete && image.naturalWidth > 0)
	);
	assert.equal(await printPage.evaluate(() => window.opener === null), true);
	assert.equal(await printPage.evaluate(() => window.QA_INJECTED === 1), false);
	await printPage.screenshot({ path: path.join(folder, 'class-qr-print.png'), fullPage: true });
	await printPage.close();
	pass('QR printing opens an isolated popup with rendered cards');
	const teacherPage = await browser.newPage();
	await teacherPage.setCookie(
		{
			name: 'rapkumer-session',
			value: accounts.substituteP3.token,
			domain: '127.0.0.1',
			path: '/'
		},
		{ name: 'active-sekolah-id', value: String(school), domain: '127.0.0.1', path: '/' }
	);
	await teacherPage.goto(new URL(href, base).href, { waitUntil: 'networkidle0' });
	await teacherPage.waitForSelector('input[name="monitoringKey"]', { timeout: 10000 });
	assert.equal(
		await teacherPage.$eval('input[name="monitoringKey"]', (input) => input.value),
		p2Meeting.key
	);
	await teacherPage.screenshot({
		path: path.join(folder, 'substitute-journal.png'),
		fullPage: true
	});
	pass('journal modal prefilled for designated substitute');
	await db.execute({
		sql: 'DELETE FROM class_monitoring WHERE sekolah_id=? AND meeting_key=?',
		args: [school, class3Meeting.key]
	});
	const cameraPage = await browser.newPage();
	await cameraPage.setCookie(
		{ name: 'rapkumer-session', value: accounts.teacherP1.token, domain: '127.0.0.1', path: '/' },
		{ name: 'active-sekolah-id', value: String(school), domain: '127.0.0.1', path: '/' }
	);
	await cameraPage.evaluateOnNewDocument(() => {
		navigator.mediaDevices.getUserMedia = async () => {
			const canvas = document.createElement('canvas');
			canvas.width = 320;
			canvas.height = 240;
			canvas.getContext('2d').fillRect(0, 0, 320, 240);
			const stream = canvas.captureStream(5);
			window.QA_CAMERA_TRACK = stream.getTracks()[0];
			await new Promise((resolve) => setTimeout(resolve, 800));
			return stream;
		};
	});
	await cameraPage.goto(`${base}${pagePath}?tanggal=${today.date}&jenis=ganjil`, {
		waitUntil: 'networkidle0'
	});
	await cameraPage.setViewport({ width: 390, height: 844 });
	const scanButtons = await cameraPage.$$('button[title="Scan kehadiran guru"]');
	let visibleScanButton;
	for (const button of scanButtons)
		if (await button.boundingBox()) {
			visibleScanButton = button;
			break;
		}
	assert.ok(visibleScanButton, 'Visible scan button must exist on mobile');
	await visibleScanButton.click();
	await clickButton(cameraPage, 'Aktifkan Kamera', 'dialog[open] button');
	await cameraPage.waitForFunction(() => !!window.QA_CAMERA_TRACK, { timeout: 10000 });
	await cameraPage.click('dialog[open] button[title="Tutup"]');
	await cameraPage.waitForFunction(() => window.QA_CAMERA_TRACK?.readyState === 'ended', {
		timeout: 10000
	});
	assert.equal(await cameraPage.evaluate(() => !!document.querySelector('dialog[open]')), false);
	pass('closing camera during startup stops the late media stream');

	const qrPage = await browser.newPage();
	await qrPage.setContent(`<img id="qr" alt="QA physical QR">`);
	const qrDataUrl = await (
		await import('qrcode')
	).default.toDataURL(newCard.payload, { errorCorrectionLevel: 'M', margin: 4, scale: 12 });
	await qrPage.$eval(
		'#qr',
		(image, src) =>
			new Promise((resolve, reject) => {
				image.onload = resolve;
				image.onerror = reject;
				image.src = src;
			}),
		qrDataUrl
	);
	await qrPage.addScriptTag({
		path: path.join(project, 'node_modules/@zxing/browser/umd/zxing-browser.min.js')
	});
	const decoded = await qrPage.evaluate(async () =>
		(
			await new ZXingBrowser.BrowserQRCodeReader().decodeFromImageElement(
				document.querySelector('#qr')
			)
		).getText()
	);
	assert.equal(decoded, newCard.payload);
	await qrPage.screenshot({ path: path.join(folder, 'physical-qr-decoded.png'), fullPage: true });
	pass('physical QR rendered by qrcode and decoded by ZXing');
	assert.deepEqual(browserErrors, [], 'Monitoring page must not have browser errors');

	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	pass('foreign keys and SQLite integrity');
	console.log(
		JSON.stringify(
			{
				result: 'PASS',
				checks: checks.length,
				date: today.date,
				weekday: hari,
				database,
				screenshots: [
					'class-monitoring-desktop.png',
					'class-monitoring-mobile.png',
					'physical-qr-decoded.png'
				].map((name) => path.join(folder, name))
			},
			null,
			2
		)
	);
} catch (error) {
	console.error(output.slice(-5000));
	console.error('QA evidence directory:', folder);
	throw error;
} finally {
	if (browser) await browser.close().catch(() => undefined);
	await stopServer();
	db.close();
	assert.equal(hasExited(server), true, 'Server QA masih berjalan setelah cleanup.');
}
