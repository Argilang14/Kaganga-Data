import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { parse } = await import(
	pathToFileURL(
		require.resolve('devalue', {
			paths: [path.dirname(require.resolve('@sveltejs/kit/package.json'))]
		})
	).href
);

const project = process.cwd(),
	port = Number(process.env.MONITORING_QA_PORT || 5165);
assert.ok(Number.isSafeInteger(port) && port !== 1206);
assert.ok(
	port !== 5152 || process.env.MONITORING_QA_ALLOW_DEV_PORT === '1',
	'5152 requires an explicit isolated QA run and a free port.'
);
const occupied = await new Promise((resolve) => {
	const socket = net.connect(port, '127.0.0.1');
	socket.on('connect', () => {
		socket.destroy();
		resolve(true);
	});
	socket.on('error', () => {
		socket.destroy();
		resolve(false);
	});
});
assert.equal(occupied, false, 'QA port already in use; no existing process will be stopped.');
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'monitoring-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
const checks = [],
	errors = [];
let child,
	browser,
	output = '';
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
function clone(original, extra) {
	const result = { ...original, ...extra };
	delete result.id;
	return result;
}
try {
	await db.execute('PRAGMA foreign_keys=ON');
	const original = await row('SELECT * FROM murid ORDER BY id LIMIT 1');
	assert.ok(original);
	const school = Number(original.sekolah_id),
		semester = Number(original.semester_id);
	const originalClass = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [originalClass.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [semester, originalClass.tahun_ajaran_id]
	});
	const classA = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Monitoring A',
			fase: 'Fase E',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const classB = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Monitoring B',
			fase: 'Fase D',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	const guardians = {};
	for (const role of ['wali_asuh', 'wali_asrama'])
		guardians[role] = await insert(
			'pegawai',
			clone(employee, {
				nama: `QA Monitoring ${role}`,
				nip: `QA-MON-${role}`,
				nik: null,
				kode_pegawai: `QA-MON-${role}`,
				nuptk: null,
				dapodik_ptk_id: null
			})
		);
	const students = [];
	for (let i = 0; i < 34; i++)
		students.push(
			await insert(
				'murid',
				clone(original, {
					nama: `QA Monitoring Murid ${String(i + 1).padStart(2, '0')}`,
					nis: `QA-MON-${i}`,
					nisn: `999989${String(i).padStart(4, '0')}`,
					kelas_id: i === 33 ? classB : classA,
					wali_asuh_nama: i === 0 ? 'QA Monitoring wali_asuh' : null,
					wali_asrama_nama: i === 0 ? 'QA Monitoring wali_asrama' : null,
					qr_token: null,
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null
				})
			)
		);
	const date = '2026-10-04',
		now = new Date().toISOString();
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
	const slots = [
		['apel_berangkat', 'sekolah', '07:00'],
		['apel_pulang', 'sekolah', '15:00'],
		['apel_malam', 'asrama', '21:00'],
		['asrama_berangkat', 'asrama', '06:30'],
		['asrama_tiba', 'asrama', '15:30'],
		['makan_pagi', 'makan', '06:00'],
		['makan_siang', 'makan', '12:00'],
		['makan_malam', 'makan', '18:00'],
		['sholat_subuh', 'sholat', '04:30'],
		['sholat_zuhur', 'sholat', '12:30'],
		['sholat_asar', 'sholat', '15:30'],
		['sholat_magrib', 'sholat', '18:15'],
		['sholat_isya', 'sholat', '19:30']
	];
	const activityIds = {};
	for (const [code, category, time] of slots) {
		let existing = await row('SELECT id FROM kegiatan_absensi WHERE sekolah_id=? AND kode=?', [
			school,
			code
		]);
		if (!existing)
			existing = {
				id: await insert('kegiatan_absensi', {
					sekolah_id: school,
					kode: code,
					nama: `QA ${code}`,
					kategori: category,
					aktif: 1,
					jam_mulai: time,
					created_at: now,
					updated_at: now
				})
			};
		const id = Number(existing.id);
		await db.execute({
			sql: 'UPDATE kegiatan_absensi SET aktif=1, kategori=?, jam_mulai=?, akses_edit=?, auto_alfa=0 WHERE id=?',
			args: [
				category,
				time,
				category === 'sekolah' ? 'sekolah' : category === 'makan' ? 'semua' : 'asrama',
				id
			]
		});
		activityIds[code] = id;
	}
	async function attendance(student, code, status, time = null) {
		return insert('absensi_kegiatan', {
			sekolah_id: school,
			semester_id: semester,
			kelas_id: student === students[33] ? classB : classA,
			murid_id: student,
			kegiatan_id: activityIds[code],
			tanggal: date,
			status,
			waktu_scan: time,
			metode: time ? 'qr' : 'manual',
			created_at: now,
			updated_at: now
		});
	}
	await attendance(students[0], 'apel_berangkat', 'hadir', '2026-10-04T00:00:00Z');
	await attendance(students[1], 'apel_berangkat', 'sakit');
	await attendance(students[2], 'apel_berangkat', 'izin');
	await attendance(students[3], 'apel_berangkat', 'alfa');
	await attendance(students[0], 'apel_pulang', 'pulang');
	await attendance(students[0], 'apel_malam', 'hadir', '2026-10-04T17:05:00Z');
	await attendance(students[33], 'makan_pagi', 'hadir');
	await insert('absensi_harian', {
		sekolah_id: school,
		semester_id: semester,
		kelas_id: classA,
		murid_id: students[0],
		tanggal: date,
		status: 'sakit',
		metode: 'manual',
		created_at: now
	});
	await insert('izin_pulang_murid', {
		sekolah_id: school,
		semester_id: semester,
		tahun_ajaran_id: originalClass.tahun_ajaran_id,
		kelas_id: classA,
		murid_id: students[4],
		nis_snapshot: 'QA',
		nama_snapshot: 'QA',
		kelas_snapshot: 'QA',
		tanggal_keluar: '2026-10-03',
		waktu_keluar: '12:00',
		alasan: 'PRIVATE REASON MUST NOT LEAK',
		rencana_kembali: '2026-10-05',
		status: 'sedang_izin',
		created_at: now
	});
	await insert('izin_pulang_murid', {
		sekolah_id: school,
		semester_id: semester,
		tahun_ajaran_id: originalClass.tahun_ajaran_id,
		kelas_id: classA,
		murid_id: students[5],
		nis_snapshot: 'QA',
		nama_snapshot: 'QA',
		kelas_snapshot: 'QA',
		tanggal_keluar: date,
		waktu_keluar: '12:00',
		tanggal_kembali: date,
		waktu_kembali: '20:00',
		alasan: 'QA partial day',
		rencana_kembali: date,
		status: 'sudah_kembali',
		created_at: now
	});
	const seed = await row('SELECT * FROM auth_user LIMIT 1');
	const accounts = {};
	for (const [name, type, position] of [
		['admin', 'admin', null],
		['guru', 'user', null],
		['wali_asuh', 'wali_asuh', null],
		['wali_asrama', 'wali_asrama', null],
		['asrama_tanpa_tugas', 'wali_asrama', null],
		['dapur', 'tim_dapur', null],
		['kepsek', 'user', 'kepala_sekolah'],
		['scoped_leader', 'user', null],
		['tanpa_kelas', 'user', null]
	]) {
		const token = randomBytes(32).toString('base64url');
		const id = await insert(
			'auth_user',
			clone(seed, {
				username: `qa-monitor-${name}`,
				username_normalized: `qa-monitor-${name}`,
				type,
				jabatan_akses: position,
				permissions:
					name === 'scoped_leader'
						? JSON.stringify(['pimpinan_lihat', 'administrasi_absensi', 'absensi_lihat'])
						: '[]',
				sekolah_id: school,
				kelas_id: ['guru', 'kepsek', 'scoped_leader'].includes(name) ? classA : null,
				pegawai_id: guardians[name] ?? null,
				must_change_password: 0
			})
		);
		if (['guru', 'scoped_leader'].includes(name))
			await insert('auth_user_kelas', { auth_user_id: id, kelas_id: classA, created_at: now });
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			expires_at: new Date(Date.now() + 3600000).toISOString(),
			created_at: now
		});
		accounts[name] = {
			id,
			token,
			cookie: `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${classA}`
		};
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
			photo: `file:${path.join(folder, 'data', 'uploads')}`,
			NODE_ENV: 'production'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stdout.on('data', (data) => (output += data));
	child.stderr.on('data', (data) => (output += data));
	let ready = false;
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(base + '/login', { signal: AbortSignal.timeout(5000) })).status === 200) {
				ready = true;
				break;
			}
		} catch {
			// Retry while the isolated server starts.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, output.slice(-4000));
	async function request(role, params = '', expected = 200) {
		const query = new URLSearchParams(params);
		if (!query.has('tanggal')) query.set('tanggal', date);
		const response = await fetch(`${base}/api/administrasi/absensi/monitoring?${query}`, {
			headers: { cookie: accounts[role].cookie },
			redirect: 'manual'
		});
		const text = await response.text();
		assert.equal(response.status, expected, text.slice(0, 1200));
		return expected === 200 ? JSON.parse(text) : text;
	}
	const before = await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id');
	const schoolReport = await request('admin', `kelas_id=${classA}`);
	assert.equal(schoolReport.total, 33);
	assert.deepEqual(
		Object.fromEntries(
			['hadir', 'sakit', 'izin', 'alfa', 'izin_pulang', 'belum'].map((key) => [
				key,
				schoolReport.summaries[0].counts[key]
			])
		),
		{ hadir: 1, sakit: 1, izin: 1, alfa: 1, izin_pulang: 1, belum: 28 }
	);
	assert.equal(schoolReport.rows[5].cells[0].status, 'belum');
	assert.equal(schoolReport.rows[5].cells[1].status, 'izin_pulang');
	assert.ok(!JSON.stringify(schoolReport).includes('PRIVATE REASON'));
	assert.equal((await request('admin', `kelas_id=${classA}&page=2`)).rows.length, 3);
	assert.equal((await request('admin', `kelas_id=${classA}&status=sakit`)).matched, 1);
	assert.equal((await request('admin', `kelas_id=${classA}&q=Murid%2002`)).matched, 1);
	assert.equal(
		(await request('admin', `kelas_id=${classA}&sumber_masuk=harian`)).rows[0].cells[0].status,
		'sakit'
	);
	check('Unique counts, search, status filtering, pagination, permits and explicit daily source');
	for (const tab of ['sholat', 'makan', 'malam']) {
		const report = await request('admin', `kelas_id=${classA}&tab=${tab}`);
		assert.equal(report.columns.length, tab === 'sholat' ? 5 : tab === 'makan' ? 3 : 3);
		if (tab === 'malam') assert.equal(report.rows[0].cells[2].time, '2026-10-04T17:05:00Z');
		if (tab === 'makan') assert.equal(report.rows[0].cells[0].status, 'belum');
	}
	check('School, five prayers, three meals and night roll-call remain independent');
	assert.equal((await request('guru')).total, 33);
	assert.equal((await request('tanpa_kelas')).total, 0);
	assert.equal((await request('wali_asuh', 'tab=malam')).total, 1);
	for (const role of ['wali_asrama', 'asrama_tanpa_tugas']) {
		assert.equal((await request(role, 'tab=asrama')).total, (await request('admin')).total);
		assert.equal((await request(role, `tab=asrama&kelas_id=${classB}`)).total, 1);
	}
	await request('guru', `kelas_id=${classB}`, 403);
	assert.ok((await request('kepsek')).classes.some((item) => item.id === classB));
	check('Teacher class scope, individual guardian scope and leadership access');
	const meals = await request('dapur', `kelas_id=${classB}`);
	assert.equal(meals.tab, 'makan');
	assert.equal(meals.tabs.length, 1);
	assert.equal(meals.rows[0].cells[0].status, 'hadir');
	assert.ok(!JSON.stringify(meals).includes('apel_berangkat'));
	for (const tab of ['sekolah', 'sholat', 'malam', 'asrama'])
		await request('dapur', `tab=${tab}`, 403);
	await request('dapur', `sumber_pagi=${activityIds.apel_berangkat}`, 400);
	check('Kitchen meal-only data enforced against forged URL parameters');
	await request('admin', 'tanggal=2026-02-30', 400);
	await request('admin', 'status=__proto__', 400);
	await request('admin', 'sumber_masuk=99999999', 400);
	await request('admin', `kelas_id=${classB}&jenjang=sma`, 400);
	check('Invalid filters and unauthorized sources fail closed');
	assert.deepEqual(
		(await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id')).rows,
		before.rows
	);
	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	check('Monitoring does not change attendance; SQLite integrity and foreign keys clean');
	async function dashboard(role, params = '') {
		const response = await fetch(`${base}/api/dashboard/daily?${params}`, {
			headers: { cookie: accounts[role].cookie },
			redirect: 'manual'
		});
		assert.equal(response.status, 200, await response.clone().text());
		assert.match(response.headers.get('cache-control'), /no-store/);
		return response.json();
	}
	async function mutation(
		role,
		action,
		student,
		status,
		day = today,
		activityId = activityIds.apel_berangkat,
		note = 'QA monitoring correction'
	) {
		const response = await fetch(`${base}/administrasi/absensi/kegiatan?/${action}`, {
			method: 'POST',
			headers: {
				cookie: accounts[role].cookie,
				origin: base,
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			body: new URLSearchParams({
				semesterId: String(semester),
				kelasId: String(classA),
				kegiatanId: String(activityId),
				muridId: String(student),
				tanggal: day,
				status: status ?? '',
				catatan: note
			})
		});
		const result = await response.json();
		return result;
	}
	assert.equal((await mutation('guru', 'updateManual', students[0], 'sakit')).type, 'success');
	let current = await request('guru', `tanggal=${today}`);
	assert.equal(current.rows[0].cells[0].status, 'sakit');
	let daily = await dashboard('guru');
	assert.equal(daily.students.total, current.total);
	assert.equal(daily.studentSource.source, current.columns[0].source);
	assert.equal(daily.absences.find((item) => item.status === 'sakit').students[0].id, students[0]);
	assert.equal(
		daily.students.rows.find((item) => item.status === 'sakit').count,
		current.summaries[0].counts.sakit
	);
	assert.equal((await mutation('guru', 'updateManual', students[0], 'izin')).type, 'success');
	assert.equal((await request('guru', `tanggal=${today}`)).rows[0].cells[0].status, 'izin');
	assert.equal((await mutation('guru', 'clearStatus', students[0], null)).type, 'success');
	assert.equal((await request('guru', `tanggal=${today}`)).rows[0].cells[0].status, 'belum');
	assert.notEqual(
		(await mutation('guru', 'updateManual', students[0], 'hadir', date)).type,
		'success'
	);
	const qrToken = `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
	await insert('qr_murid', {
		murid_id: students[0],
		token_hash: createHash('sha256').update(qrToken).digest('hex'),
		token_version: 1,
		issued_at: now,
		created_at: now,
		updated_at: now
	});
	const scan = await fetch(`${base}/api/administrasi/absensi/scan`, {
		method: 'POST',
		headers: { cookie: accounts.guru.cookie, origin: base, 'content-type': 'application/json' },
		body: JSON.stringify({
			mode: 'kegiatan',
			kegiatanId: activityIds.apel_berangkat,
			token: qrToken,
			status: 'hadir'
		})
	});
	assert.equal(scan.status, 200, await scan.clone().text());
	current = await request('guru', `tanggal=${today}`);
	assert.equal(current.rows[0].cells[0].status, 'hadir');
	assert.equal(current.rows[0].cells[0].method, 'qr');
	assert.equal(current.rows[0].cells[1].status, 'belum');
	assert.equal(
		(await dashboard('guru')).students.rows.find((item) => item.status === 'hadir').count,
		1
	);
	assert.equal((await dashboard('dapur')).students, null);
	assert.equal(
		(await request('guru', `tanggal=${today}`)).columns[0].entryPath,
		'/administrasi/absensi/kegiatan'
	);
	assert.equal((await request('guru', `tanggal=${date}`)).columns[0].entryPath, null);
	assert.equal((await request('guru', `tab=malam&tanggal=${today}`)).columns[0].entryPath, null);
	assert.ok((await request('wali_asuh', `tab=malam&tanggal=${today}`)).columns[0].entryPath);
	check(
		'Manual save, correction, deletion, QR scan, entry without exit, old-date guard and shared dashboard source'
	);
	const alternate = await row('SELECT id FROM semester WHERE tahun_ajaran_id=? AND id<>?', [
		originalClass.tahun_ajaran_id,
		semester
	]);
	const oldSemester = alternate
		? Number(alternate.id)
		: await insert(
				'semester',
				clone(await row('SELECT * FROM semester WHERE id=?', [semester]), {
					tipe: 'genap',
					is_aktif: 0
				})
			);
	await insert('absensi_kegiatan', {
		sekolah_id: school,
		semester_id: oldSemester,
		kelas_id: classA,
		murid_id: students[1],
		kegiatan_id: activityIds.apel_berangkat,
		tanggal: today,
		status: 'alfa',
		metode: 'manual',
		created_at: now
	});
	assert.equal((await request('guru', `tanggal=${today}`)).rows[1].cells[0].status, 'belum');
	const otherSchool = await insert(
		'sekolah',
		clone(await row('SELECT * FROM sekolah WHERE id=?', [school]), {
			nama: 'QA OTHER SCHOOL',
			npsn: '99998888'
		})
	);
	await insert('absensi_kegiatan', {
		sekolah_id: otherSchool,
		semester_id: semester,
		kelas_id: classA,
		murid_id: students[2],
		kegiatan_id: activityIds.apel_berangkat,
		tanggal: today,
		status: 'sakit',
		metode: 'manual',
		created_at: now
	});
	assert.equal((await request('guru', `tanggal=${today}`)).rows[2].cells[0].status, 'belum');
	assert.equal((await dashboard('wali_asuh')).students.total, 1);
	for (const role of ['wali_asrama', 'asrama_tanpa_tugas'])
		assert.equal((await dashboard(role)).students.total, (await dashboard('admin')).students.total);
	assert.equal((await dashboard('tanpa_kelas')).students.total, 0);
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [oldSemester, originalClass.tahun_ajaran_id]
	});
	assert.equal((await request('guru', `tanggal=${today}`)).total, 0);
	assert.equal((await dashboard('guru')).students.total, 0);
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [semester, originalClass.tahun_ajaran_id]
	});
	const alternateYear = await insert(
		'tahun_ajaran',
		clone(await row('SELECT * FROM tahun_ajaran WHERE id=?', [originalClass.tahun_ajaran_id]), {
			nama: 'QA Monitoring Year',
			is_aktif: 0
		})
	);
	await insert(
		'semester',
		clone(await row('SELECT * FROM semester WHERE id=?', [semester]), {
			tahun_ajaran_id: alternateYear,
			is_aktif: 1
		})
	);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [alternateYear, school]
	});
	assert.equal((await request('guru', `tanggal=${today}`)).total, 0);
	assert.equal((await dashboard('guru')).students.total, 0);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [originalClass.tahun_ajaran_id, school]
	});
	check(
		'Cross-school, year and active-semester isolation; guardian and unassigned dashboard scope'
	);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		userDataDir: path.join(folder, 'browser')
	});
	const page = await browser.newPage();
	await page.evaluateOnNewDocument(() => {
		const interval = window.setInterval.bind(window),
			clear = window.clearInterval.bind(window);
		const callbacks = new Map();
		let next = 900000;
		window.setInterval = (callback, delay, ...args) => {
			if (delay !== 60000) return interval(callback, delay, ...args);
			const id = next++;
			callbacks.set(id, () => callback(...args));
			return id;
		};
		window.clearInterval = (id) => {
			callbacks.delete(id);
			clear(id);
		};
		window.__attendanceTick = () => callbacks.forEach((callback) => callback());
		window.__monitoringHidden = false;
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			get: () => window.__monitoringHidden
		});
	});
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: accounts.admin.token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base },
		{ name: 'active-kelas-id', value: String(classA), url: base }
	);
	const reportNav = '.drawer-side';
	async function openReport(view) {
		const target =
			view === 'monitoring'
				? '/administrasi/absensi/monitoring'
				: '/administrasi/absensi/kegiatan/rekap';
		const selector = `${reportNav} a[href*="${target}"]`;
		await page.$eval('#my-drawer-2', (drawer) => {
			drawer.checked = true;
		});
		await page.waitForFunction(
			(selector) => {
				const link = document.querySelector(selector);
				if (!link) return false;
				const rect = link.getBoundingClientRect();
				const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
				return hit === link || link.contains(hit);
			},
			{},
			selector
		);
		await page.click(selector);
		await page.waitForFunction((target) => location.pathname === target, {}, target);
		await page.waitForNetworkIdle();
		if (await page.evaluate(() => innerWidth < 1024))
			assert.equal(await page.$eval('#my-drawer-2', (drawer) => drawer.checked), false);
	}
	async function recap(role, classValue, expected = 200) {
		const response = await fetch(
			`${base}/administrasi/absensi/kegiatan/rekap/__data.json?tanggal_awal=${date}&tanggal_akhir=${date}&kelas_id=${classValue}`,
			{ headers: { cookie: accounts[role].cookie } }
		);
		assert.equal(response.status, expected);
		if (expected !== 200) return null;
		const result = await response.json();
		assert.ok(!result.nodes.some((node) => node?.type === 'error'), JSON.stringify(result));
		return parse(JSON.stringify(result.nodes.findLast((node) => node?.type === 'data').data));
	}
	const recapA = await recap('admin', classA);
	const recapB = await recap('admin', classB);
	const recapAll = await recap('admin', 'all');
	assert.equal(recapAll.kelasId, null);
	assert.equal(recapAll.allKelas, true);
	for (const student of students) assert.ok(recapAll.rows.some((item) => item.id === student));
	for (const single of [recapA, recapB]) {
		for (const item of single.rows) {
			const combined = recapAll.rows.find((candidate) => candidate.id === item.id);
			assert.deepEqual(combined.counts, item.counts);
			assert.ok(combined.kelasNama.startsWith('QA Monitoring'));
		}
	}
	const allowedRows = (
		await db.execute({
			sql: 'SELECT id FROM murid WHERE sekolah_id=? AND semester_id=?',
			args: [school, semester]
		})
	).rows
		.map((item) => Number(item.id))
		.sort((a, b) => a - b);
	assert.deepEqual(
		recapAll.rows.map((item) => item.id).sort((a, b) => a - b),
		allowedRows
	);
	for (const status of Object.keys(recapAll.summary)) {
		assert.equal(
			recapAll.summary[status],
			recapAll.rows.reduce((sum, item) => sum + item.counts[status], 0)
		);
		assert.equal(
			recapAll.summary[status],
			recapAll.detailRows.reduce((sum, item) => sum + item.counts[status], 0)
		);
	}
	for (const role of ['guru', 'scoped_leader']) {
		assert.deepEqual(
			(await recap(role, 'all')).rows.map((item) => item.id),
			recapA.rows.map((item) => item.id)
		);
		await recap(role, classB, 403);
	}
	for (const role of ['wali_asuh']) {
		assert.deepEqual(
			(await recap(role, 'all')).rows.map((item) => item.id),
			[students[0]]
		);
	}
	for (const role of ['wali_asrama', 'asrama_tanpa_tugas']) {
		assert.deepEqual(
			(await recap(role, 'all')).rows.map((item) => item.id),
			recapAll.rows.map((item) => item.id)
		);
	}
	assert.equal((await recap('tanpa_kelas', 'all')).rows.length, 0);
	await insert('auth_user_kelas', {
		auth_user_id: accounts.guru.id,
		kelas_id: classB,
		created_at: now
	});
	assert.equal((await recap('guru', 'all')).rows.length, 34);
	await db.execute({
		sql: 'DELETE FROM auth_user_kelas WHERE auth_user_id=? AND kelas_id=?',
		args: [accounts.guru.id, classB]
	});
	for (const role of [
		'admin',
		'guru',
		'wali_asuh',
		'wali_asrama',
		'asrama_tanpa_tugas',
		'dapur',
		'tanpa_kelas'
	]) {
		const response = await fetch(
			`${base}/api/administrasi/absensi/kegiatan/rekap/export?tanggal_awal=${date}&tanggal_akhir=${date}&kelas_id=all`,
			{ headers: { cookie: accounts[role].cookie } }
		);
		assert.equal(response.status, role === 'tanpa_kelas' ? 400 : 200);
		if (role === 'tanpa_kelas') continue;
		assert.ok(response.headers.get('content-disposition').includes('semua-kelas'));
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
		const sheet = workbook.getWorksheet('Rekap Per Siswa');
		assert.equal(sheet.getRow(7).getCell(5).value, 'Kelas');
		assert.equal(sheet.rowCount - 7, (await recap(role, 'all')).rows.length);
		const names = [];
		sheet.eachRow((row, index) => {
			if (index > 7) names.push(row.getCell(2).value);
		});
		assert.equal(
			names.includes('QA Monitoring Murid 34'),
			['admin', 'wali_asrama', 'asrama_tanpa_tugas', 'dapur'].includes(role)
		);
		if (role === 'dapur') {
			workbook.getWorksheet('Data Scan').eachRow((row, index) => {
				if (index > 1) assert.ok(String(row.getCell(2).value).toLowerCase().includes('makan'));
			});
		}
	}
	check(
		'All-class recap and Excel aggregate authorized students only; totals, multi-class teacher, guardians, kitchen and empty assignments remain scoped'
	);
	for (const width of [1366, 390]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(
			`${base}/administrasi/absensi/kegiatan/rekap?tanggal_awal=${date}&tanggal_akhir=${date}&kelas_id=${classA}`,
			{ waitUntil: 'networkidle0' }
		);
		await page.select('select[aria-label="Kelas rekap"]', 'all');
		await page.waitForNetworkIdle();
		assert.equal(new URL(page.url()).searchParams.get('kelas_id'), 'all');
		assert.equal(
			await page.$eval('select[aria-label="Kelas rekap"]', (select) => select.value),
			'all'
		);
		assert.ok(
			(await page.$eval('body', (el) => el.textContent)).includes('QA Monitoring Murid 34')
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		await page.screenshot({
			path: path.join(folder, `recap-all-classes-${width}.png`),
			fullPage: true
		});
		await page.reload({ waitUntil: 'networkidle0' });
		assert.equal(
			await page.$eval('select[aria-label="Kelas rekap"]', (select) => select.value),
			'all'
		);
		await openReport('monitoring');
		assert.equal(new URL(page.url()).searchParams.has('kelas_id'), false);
		await openReport('rekap');
		assert.equal(
			await page.$eval('select[aria-label="Kelas rekap"]', (select) => select.value),
			'all'
		);
		await page.select('select[aria-label="Kelas rekap"]', String(classB));
		await page.waitForNetworkIdle();
		assert.equal(
			await page.$eval('select[aria-label="Kelas rekap"]', (select) => select.value),
			String(classB)
		);
	}
	check(
		'All-class selection survives reload and dropdown navigation; single-class switching and desktop/mobile layout work'
	);
	const tabRequests = [];
	const recordTabRequest = (request) => tabRequests.push(request.url());
	page.on('request', recordTabRequest);
	for (const width of [1366, 390]) {
		await page.setViewport({ width, height: 900 });
		tabRequests.length = 0;
		await page.goto(`${base}/administrasi/absensi/monitoring?tanggal=${date}&kelas_id=${classA}`, {
			waitUntil: 'networkidle0'
		});
		assert.equal(
			await page.$eval(`${reportNav} a.menu-active`, (el) => el.textContent.trim()),
			'Monitoring'
		);
		assert.ok(!tabRequests.some((url) => url.includes('/kegiatan/rekap')));
		const sidebar = await page.$$eval('.drawer-side a[href]', (links) =>
			links.map((link) => ({ path: new URL(link.href).pathname, text: link.textContent.trim() }))
		);
		assert.equal(
			sidebar.filter((item) => item.path === '/administrasi/absensi/monitoring').length,
			1
		);
		assert.equal(
			sidebar.find((item) => item.path === '/administrasi/absensi/monitoring').text,
			'Monitoring'
		);
		assert.equal(
			sidebar.find((item) => item.path === '/administrasi/absensi/kegiatan').text,
			'Catat Absensi'
		);
		assert.equal(
			sidebar.find((item) => item.path === '/administrasi/absensi/kegiatan/rekap').text,
			'Rekap Absensi'
		);
		assert.equal(await page.$('nav[aria-label="Tampilan monitoring dan rekap"]'), null);
		assert.ok(
			await page.$$eval('.drawer-side summary', (items) =>
				items.some((item) => item.textContent.trim() === 'Monitoring dan Rekap')
			)
		);
		await openReport('rekap');
		let params = new URL(page.url()).searchParams;
		assert.equal(params.get('tanggal_awal'), date);
		assert.equal(params.get('tanggal_akhir'), date);
		assert.equal(params.get('kelas_id'), String(classA));
		assert.equal(params.get('kegiatan_id'), String(activityIds.apel_berangkat));
		assert.equal(
			await page.$eval(`${reportNav} a.menu-active`, (el) => el.textContent.trim()),
			'Rekap Absensi'
		);
		assert.equal(
			await page.$eval('.drawer-side a.menu-active', (el) => new URL(el.href).pathname),
			'/administrasi/absensi/kegiatan/rekap'
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		await page.screenshot({ path: path.join(folder, `report-recap-${width}.png`), fullPage: true });
		await page.reload({ waitUntil: 'networkidle0' });
		assert.equal(
			await page.$eval(`${reportNav} a.menu-active`, (el) => el.textContent.trim()),
			'Rekap Absensi'
		);
		await openReport('monitoring');
		params = new URL(page.url()).searchParams;
		assert.equal(params.get('tanggal'), date);
		assert.equal(params.get('kelas_id'), String(classA));
		assert.equal(
			await page.$eval(`${reportNav} a.menu-active`, (el) => el.textContent.trim()),
			'Monitoring'
		);
		for (const [tab, slot, code] of [
			['sholat', 'zuhur', 'sholat_zuhur'],
			['makan', 'siang', 'makan_siang']
		]) {
			await page.goto(
				`${base}/administrasi/absensi/monitoring?tanggal=${date}&kelas_id=${classA}&tab=${tab}&kolom=${slot}`,
				{ waitUntil: 'networkidle0' }
			);
			await openReport('rekap');
			assert.equal(new URL(page.url()).searchParams.get('kegiatan_id'), String(activityIds[code]));
			await openReport('monitoring');
			const params = new URL(page.url()).searchParams;
			assert.equal(params.get('tab'), tab);
			assert.equal(params.get('kolom'), slot);
			assert.equal(params.get(`sumber_${slot}`), String(activityIds[code]));
		}
		await page.goto(
			`${base}/administrasi/absensi/kegiatan?tanggal=${date}&kelas_id=${classA}&kegiatan_id=${activityIds.apel_berangkat}`,
			{ waitUntil: 'networkidle0' }
		);
		assert.equal(await page.$eval('h2', (el) => el.textContent.trim()), 'Catat Absensi');
	}
	page.off('request', recordTabRequest);
	check(
		'Separate Monitoring and Recap dropdown pages preserve date/class/activity; reload, active leaf and mobile drawer work without shared tabs'
	);
	for (const [width, height, label] of [
		[1366, 900, 'desktop'],
		[1024, 768, 'laptop-small'],
		[768, 1024, 'tablet'],
		[390, 844, 'mobile'],
		[320, 740, 'mobile-small']
	]) {
		await page.setViewport({ width, height });
		await page.goto(`${base}/administrasi/absensi/monitoring?tanggal=${date}&kelas_id=${classA}`, {
			waitUntil: 'networkidle0'
		});
		assert.ok(await page.$('table[aria-label="Daftar monitoring absensi"]'));
		assert.equal(await page.$('nav[aria-label="Tampilan monitoring dan rekap"]'), null);
		assert.equal(await page.$eval('.monitoring h1', (el) => el.textContent), 'Monitoring Absensi');
		assert.equal(
			await page.$eval('.monitoring-header', (el) => getComputedStyle(el).backgroundColor),
			'rgb(11, 110, 98)'
		);
		assert.equal(
			await page.$$eval(
				'.monitoring-metrics .monitoring-metric',
				(items) => new Set(items.map((el) => getComputedStyle(el).borderTopColor)).size
			),
			4
		);
		assert.equal(
			await page.$eval(
				'[data-source-key="masuk"]',
				(select) => select.selectedOptions[0]?.textContent
			),
			schoolReport.columns[0].sourceLabel
		);
		assert.equal(
			await page.$eval(
				'.monitoring-table-wrap',
				(element) => getComputedStyle(element).display !== 'none'
			),
			width >= 1024
		);
		assert.equal(
			await page.$eval(
				'.monitoring-mobile-list',
				(element) => getComputedStyle(element).display !== 'none'
			),
			width < 1024
		);
		assert.equal(
			await page.$eval('[data-count="present"]', (element) => element.textContent.trim()),
			'1'
		);
		assert.equal(
			await page.$eval('[data-count="absent"]', (element) => element.textContent.trim()),
			'4'
		);
		assert.equal(
			await page.$eval('[data-count="pending"]', (element) => element.textContent.trim()),
			'28'
		);
		await page.click('button[aria-controls="monitoring-extra-filters"]');
		assert.equal(await page.$eval('#monitoring-extra-filters', (element) => element.hidden), false);
		await page.click('button[aria-controls="monitoring-extra-filters"]');
		assert.equal(await page.$eval('#monitoring-extra-filters', (element) => element.hidden), true);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		assert.equal(
			await page.$eval('.monitoring', (element) => element.scrollWidth > element.clientWidth + 1),
			false
		);
		await page.screenshot({ path: path.join(folder, `${label}.png`), fullPage: true });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		await page.waitForFunction(
			() =>
				getComputedStyle(document.querySelector('.monitoring-tab-active')).color ===
				'rgb(96, 165, 250)'
		);
		assert.equal(
			await page.$eval(
				'.monitoring-metric-total .monitoring-number',
				(el) => getComputedStyle(el).color
			),
			'rgb(96, 165, 250)'
		);
		assert.equal(
			await page.$eval('.monitoring-metric-total svg', (el) => {
				const style = getComputedStyle(el);
				return style.fill === 'none' ? style.stroke : style.fill;
			}),
			'rgb(96, 165, 250)'
		);
		assert.equal(
			await page.$eval('.monitoring-tab-active', (el) => getComputedStyle(el).color),
			'rgb(96, 165, 250)'
		);
		await page.screenshot({ path: path.join(folder, `${label}-dark.png`), fullPage: true });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
		if (width < 1024) {
			await page.$eval('.monitoring-list-heading', (element) =>
				element.scrollIntoView({ block: 'start' })
			);
			await page.screenshot({ path: path.join(folder, `${label}-list.png`), fullPage: true });
		}
	}
	await page.click('nav[aria-label="Jenis monitoring"] a[href*="tab=sholat"]');
	await page.waitForNetworkIdle();
	assert.equal(
		await page.$eval('.monitoring-student-cells', (element) => element.children.length),
		2
	);
	await page.click('.monitoring-student-details summary');
	assert.equal(await page.$eval('.monitoring-student-details', (element) => element.open), true);
	assert.equal(
		await page.$eval('.monitoring-student-details dl', (element) => element.children.length),
		3
	);
	await page.click('button[aria-label="Muat ulang absensi"]');
	await page.waitForNetworkIdle();
	assert.equal(await page.$eval('.monitoring-student-details', (element) => element.open), true);
	await page.screenshot({ path: path.join(folder, 'mobile-prayers-expanded.png'), fullPage: true });
	await page.select('#monitoring-focus', 'isya');
	await page.waitForNetworkIdle();
	assert.equal(
		await page.$eval('[data-count="pending"]', (element) => element.textContent.trim()),
		'31'
	);
	await page.click('nav[aria-label="Jenis monitoring"] a[href*="tab=sekolah"]');
	await page.waitForNetworkIdle();
	await page.click('a[aria-label="Halaman berikutnya"]');
	await page.waitForNetworkIdle();
	assert.equal(await page.$$eval('.monitoring-mobile-list article', (items) => items.length), 3);
	await page.click('a[aria-label="Halaman sebelumnya"]');
	await page.waitForNetworkIdle();
	await page.select('select[aria-label="Filter status monitoring"]', 'sakit');
	await page.waitForNetworkIdle();
	assert.equal(await page.$$eval('.monitoring-mobile-list article', (items) => items.length), 1);
	assert.equal(
		await page.$eval('[data-count="pending"]', (element) => element.textContent.trim()),
		'28'
	);
	await page.select('select[aria-label="Filter status monitoring"]', '');
	await page.waitForNetworkIdle();
	await page.type('#monitoring-search', 'Murid 02');
	await page.click('button[aria-label="Cari murid"]');
	await page.waitForNetworkIdle();
	assert.equal(await page.$$eval('.monitoring-mobile-list article', (items) => items.length), 1);
	await page.screenshot({ path: path.join(folder, 'mobile-search.png'), fullPage: true });
	await page.goto(
		`${base}/administrasi/absensi/monitoring?tanggal=${date}&kelas_id=${classA}&sumber_masuk=`,
		{ waitUntil: 'networkidle0' }
	);
	assert.equal(
		await page.$eval('[data-count="pending"]', (element) => element.textContent.trim()),
		'33'
	);
	assert.equal(await page.$eval('progress', (element) => element.value), 0);
	await page.click('.monitoring .alert button');
	assert.equal(await page.$eval('#monitoring-extra-filters', (element) => element.hidden), false);
	await page.select('[data-source-key="masuk"]', 'harian');
	await page.waitForNetworkIdle();
	assert.equal(await page.$eval('[data-source-key="masuk"]', (element) => element.value), 'harian');
	await page.goto(
		`${base}/administrasi/absensi/monitoring?tanggal=${date}&kelas_id=${classB}&q=QA-NO-MATCH`,
		{
			waitUntil: 'networkidle0'
		}
	);
	assert.equal(await page.$$eval('.monitoring-mobile-list article', (items) => items.length), 0);
	assert.equal(await page.$eval('progress', (element) => element.value), 0);
	await page.screenshot({ path: path.join(folder, 'mobile-empty.png'), fullPage: true });
	check(
		'Responsive table/list, overview, mobile details, pagination, filters, missing source and empty states'
	);
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(`${base}/administrasi/absensi/monitoring?tanggal=${date}&kelas_id=${classA}`, {
		waitUntil: 'networkidle0'
	});
	for (const tab of ['sholat', 'makan', 'asrama']) {
		await page.click(`nav[aria-label="Jenis monitoring"] a[href*="tab=${tab}"]`);
		await page.waitForFunction(
			(tab) => new URL(location.href).searchParams.get('tab') === tab,
			{},
			tab
		);
		await page.waitForNetworkIdle();
		await page.screenshot({ path: path.join(folder, `${tab}.png`), fullPage: true });
	}
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await new Promise((resolve) => setTimeout(resolve, 300));
	await page.screenshot({ path: path.join(folder, 'monitoring-dark.png'), fullPage: true });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	await page.goto(`${base}/administrasi/absensi/monitoring?tanggal=${today}&kelas_id=${classA}`, {
		waitUntil: 'networkidle0'
	});
	const firstCell = () =>
		page.$eval(
			'table[aria-label="Daftar monitoring absensi"] tbody tr td:nth-child(4)',
			(cell) => cell.textContent
		);
	assert.match(await firstCell(), /Hadir/);
	assert.equal((await mutation('guru', 'updateManual', students[0], 'sakit')).type, 'success');
	await page.click('button[aria-label="Muat ulang absensi"]');
	await page.waitForFunction(() =>
		document
			.querySelector('table[aria-label="Daftar monitoring absensi"] tbody tr td:nth-child(4)')
			.textContent.includes('Sakit')
	);
	assert.equal((await mutation('guru', 'updateManual', students[0], 'izin')).type, 'success');
	await page.evaluate(() => {
		window.__monitoringHidden = true;
		window.__attendanceTick();
	});
	await new Promise((resolve) => setTimeout(resolve, 300));
	assert.match(await firstCell(), /Sakit/);
	await page.evaluate(() => {
		window.__monitoringHidden = false;
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.waitForFunction(() =>
		document
			.querySelector('table[aria-label="Daftar monitoring absensi"] tbody tr td:nth-child(4)')
			.textContent.includes('Izin')
	);
	assert.equal((await mutation('guru', 'clearStatus', students[0], null)).type, 'success');
	await page.evaluate(() => window.__attendanceTick());
	await page.waitForFunction(() =>
		document
			.querySelector('table[aria-label="Daftar monitoring absensi"] tbody tr td:nth-child(4)')
			.textContent.includes('Belum')
	);
	await page.setOfflineMode(true);
	await page.waitForFunction(() =>
		document.body.textContent.includes('Offline. Tampilan memakai data sebelumnya.')
	);
	assert.match(await firstCell(), /Belum/);
	await page.setOfflineMode(false);
	await page.waitForNetworkIdle();
	check(
		'Second-client changes visible on manual/polling refresh; hidden page pauses; offline retains data'
	);
	await page.setRequestInterception(true);
	let pending = null;
	const intercept = (request) => {
		if (request.url().includes('/api/administrasi/absensi/monitoring')) pending = request;
		else void request.continue();
	};
	page.on('request', intercept);
	await page.click('button[aria-label="Muat ulang absensi"]');
	for (let i = 0; i < 30 && !pending; i++) await new Promise((resolve) => setTimeout(resolve, 50));
	assert.ok(pending);
	await page.click('nav[aria-label="Jenis monitoring"] a[href*="tab=asrama"]');
	await page.waitForFunction(() => new URL(location.href).searchParams.get('tab') === 'asrama');
	await pending
		.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(current) })
		.catch(() => {});
	page.off('request', intercept);
	await page.setRequestInterception(false);
	await page.waitForNetworkIdle();
	assert.equal(
		await page.$$eval(
			'table[aria-label="Daftar monitoring absensi"] thead th',
			(items) => items.length
		),
		7
	);
	check('Canceled old-tab response cannot overwrite current monitoring tab');
	for (const [width, height, label] of [
		[1366, 900, 'dashboard-desktop'],
		[390, 844, 'dashboard-mobile']
	]) {
		await page.setViewport({ width, height });
		await page.goto(base + '/', { waitUntil: 'networkidle0' });
		assert.ok(await page.$('#absensi-hari-ini'));
		assert.equal(
			await page.$eval(
				'select[aria-label="Sumber masuk sekolah"]',
				(select) => select.selectedOptions[0]?.textContent
			),
			schoolReport.columns[0].sourceLabel
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		await page.screenshot({ path: path.join(folder, `${label}.png`), fullPage: true });
		await page.$eval('#absensi-hari-ini', (element) => element.scrollIntoView({ block: 'start' }));
		await page.screenshot({ path: path.join(folder, `${label}-attendance.png`), fullPage: true });
	}
	await page.select('select[aria-label="Sumber masuk sekolah"]', 'harian');
	await page.waitForFunction(
		() => new URL(location.href).searchParams.get('sumber_masuk') === 'harian'
	);
	await page.waitForNetworkIdle();
	assert.equal(
		await page.$eval('select[aria-label="Sumber masuk sekolah"]', (select) => select.value),
		'harian'
	);
	const dailySource = await dashboard('guru', 'sumber_masuk=harian');
	assert.equal(dailySource.studentSource.source, 'harian');
	assert.equal(
		dailySource.students.recorded,
		(await request('guru', `tanggal=${today}&sumber_masuk=harian`)).summaries[0].counts.izin_pulang
	);
	for (const role of ['guru', 'wali_asuh', 'wali_asrama', 'dapur', 'tanpa_kelas']) {
		assert.equal((await dashboard(role, `kelas_id=${classB}`)).leadership, null);
		const response = await fetch(base + '/', { headers: { cookie: accounts[role].cookie } });
		assert.equal(response.status, 200);
		assert.ok(!(await response.text()).includes('aria-label="Ringkasan pengawasan penilaian"'));
	}
	const currentSubject = await insert('mata_pelajaran', {
		kelas_id: classA,
		nama: 'QA Dashboard Current',
		jenis: 'wajib',
		created_at: now
	});
	const historicClass = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Dashboard Historic',
			semester_id: oldSemester,
			dapodik_rombongan_belajar_id: null
		})
	);
	const historicSubject = await insert('mata_pelajaran', {
		kelas_id: historicClass,
		nama: 'QA Dashboard Historic',
		jenis: 'wajib',
		created_at: now
	});
	await insert('asesmen_sumatif', {
		murid_id: students[0],
		mata_pelajaran_id: currentSubject,
		nilai_akhir: 75,
		created_at: now
	});
	await insert('asesmen_sumatif', {
		murid_id: students[1],
		mata_pelajaran_id: historicSubject,
		nilai_akhir: 75,
		created_at: now
	});
	await insert('asesmen_sumatif', {
		murid_id: students[2],
		mata_pelajaran_id: currentSubject,
		created_at: now
	});
	for (const role of ['admin', 'kepsek']) {
		const daily = await dashboard(role, `kelas_id=${classA}`);
		assert.equal(daily.students.total, 33);
		assert.equal(daily.leadership.classSummary.length, 1);
		assert.equal(daily.leadership.classSummary[0].total, daily.students.total);
		assert.equal(daily.leadership.classSummary[0].recorded, daily.students.recorded);
		assert.equal((await dashboard(role, `jenjang=smp&kelas_id=${classB}`)).students.total, 1);
		const invalid = await fetch(`${base}/api/dashboard/daily?kelas_id=${historicClass}`, {
			headers: { cookie: accounts[role].cookie }
		});
		assert.equal(invalid.status, 403);
		const mismatch = await fetch(`${base}/api/dashboard/daily?jenjang=sd&kelas_id=${classA}`, {
			headers: { cookie: accounts[role].cookie }
		});
		assert.equal(mismatch.status, 400);
		const legacy = await fetch(`${base}/dashboard-pimpinan?jenjang=srma&kelas=${classA}`, {
			headers: { cookie: accounts[role].cookie },
			redirect: 'manual'
		});
		assert.equal(legacy.status, 303);
		assert.equal(
			legacy.headers.get('location'),
			`/?jenjang=sma&kelas_id=${classA}#pengawasan-kelas`
		);
	}
	check(
		'Merged dashboard enforces role/class/semester boundaries and preserves old leadership URLs'
	);
	const scopedLeadership = await dashboard('scoped_leader');
	assert.deepEqual(
		scopedLeadership.leadership.classes.map((item) => item.id),
		[classA]
	);
	const forbiddenLeadership = await fetch(`${base}/api/dashboard/daily?kelas_id=${classB}`, {
		headers: { cookie: accounts.scoped_leader.cookie }
	});
	assert.equal(forbiddenLeadership.status, 403);
	const allLeadership = await dashboard('admin');
	if (allLeadership.leadership.pagination.pageCount > 1) {
		const next = await dashboard('admin', 'kelas_page=2');
		assert.ok(next.leadership.classSummary.length <= 12);
		assert.ok(
			next.leadership.classSummary.every(
				(item) => !allLeadership.leadership.classSummary.some((first) => first.id === item.id)
			)
		);
	}
	await page.setCookie({ name: 'rapkumer-session', value: accounts.admin.token, url: base });
	for (const [width, height] of [
		[1366, 900],
		[1024, 900],
		[768, 1024],
		[390, 844],
		[320, 800]
	]) {
		await page.setViewport({ width, height });
		await page.goto(`${base}/?kelas_id=${classA}`, { waitUntil: 'networkidle0' });
		assert.ok(await page.$('[aria-label="Filter pengawasan"]'));
		assert.ok(await page.$('#pengawasan-kelas'));
		assert.ok(await page.$('[aria-label="Ringkasan pengawasan penilaian"]'));
		assert.equal(await page.$$eval('a[href="/dashboard-pimpinan"]', (items) => items.length), 0);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		const body = await page.$eval(
			'[aria-label="Ringkasan pengawasan penilaian"]',
			(element) => element.textContent
		);
		assert.match(body, /1\s*\/\s*33/);
		assert.match(
			await page.$eval('#progress-akademik + p', (element) => element.textContent),
			/1 dari 33/
		);
		const tops = await page.$$eval('[aria-label="Statistik sekolah"] .tabular-nums', (elements) =>
			elements.map((element) => element.getBoundingClientRect().top)
		);
		const sameRow = width < 640 ? tops.slice(0, 2) : tops;
		assert.ok(
			Math.max(...sameRow) - Math.min(...sameRow) <= 2,
			`Statistic values stay aligned at viewport ${width}: ${tops.join(', ')}`
		);
		assert.equal(
			await page.$eval('.dashboard-header h1', (element) => element.textContent),
			'Dashboard Kaganga'
		);
		assert.equal(
			await page.$eval('.dashboard-header', (element) => getComputedStyle(element).backgroundColor),
			'rgb(11, 110, 98)'
		);
		const colors = await page.$$eval(
			'[aria-label="Statistik sekolah"] .dashboard-stat',
			(elements) => elements.map((element) => getComputedStyle(element).backgroundColor)
		);
		assert.equal(new Set(colors).size, 3);
		assert.ok(colors.every((color) => !['rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'].includes(color)));
		assert.ok(
			(
				await page.$eval(
					'[aria-label="Ringkasan pengawasan penilaian"]',
					(element) => element.textContent
				)
			).includes('Kelas QA Monitoring A')
		);
		const missingBeforeActions = await page.evaluate(() =>
			Boolean(
				document
					.querySelector('[aria-label="Data belum lengkap"]')
					.compareDocumentPosition(document.querySelector('.dashboard-actions')) &
				Node.DOCUMENT_POSITION_FOLLOWING
			)
		);
		assert.equal(missingBeforeActions, true);
		assert.equal(
			await page.$('dialog[aria-labelledby="dashboard-absence-dialog-title"][open]'),
			null
		);
		await page.$eval('#absensi-hari-ini .dashboard-status-chip', (element) => element.click());
		assert.ok(await page.$('dialog[aria-labelledby="dashboard-absence-dialog-title"][open]'));
		await page.$eval('[aria-label="Tutup daftar ketidakhadiran"]', (element) => element.click());
		assert.equal(
			await page.$('dialog[aria-labelledby="dashboard-absence-dialog-title"][open]'),
			null
		);
		await page.screenshot({
			path: path.join(folder, `dashboard-merged-${width}.png`),
			fullPage: true
		});
		await page.$eval('#absensi-hari-ini', (element) => element.scrollIntoView({ block: 'start' }));
		await page.screenshot({
			path: path.join(folder, `dashboard-colored-${width}-attendance.png`),
			fullPage: true
		});
		await page.$eval('#pengawasan-kelas', (element) => element.scrollIntoView({ block: 'start' }));
		await page.screenshot({
			path: path.join(folder, `dashboard-merged-${width}-classes.png`),
			fullPage: true
		});
	}
	await page.select('select[aria-label="Jenjang pengawasan"]', 'smp');
	await page.waitForNetworkIdle();
	assert.equal(
		await page.$eval('select[aria-label="Kelas pengawasan"]', (element) => element.value),
		''
	);
	await page.select('select[aria-label="Kelas pengawasan"]', String(classB));
	await page.waitForNetworkIdle();
	assert.equal(new URL(page.url()).searchParams.get('kelas_id'), String(classB));
	await page.reload({ waitUntil: 'networkidle0' });
	assert.equal(
		await page.$eval('select[aria-label="Kelas pengawasan"]', (element) => element.value),
		String(classB)
	);
	await page.goto(`${base}/?kelas_id=${classA}`, { waitUntil: 'networkidle0' });
	await mutation('guru', 'save', students[3], 'sakit');
	await page.evaluate(() => window.__attendanceTick());
	await page.waitForNetworkIdle();
	const refreshed = await dashboard('admin', `kelas_id=${classA}`);
	assert.equal(
		refreshed.leadership.classSummary[0].tidakHadir,
		refreshed.students.rows
			.filter((item) => ['sakit', 'izin', 'alfa', 'izin_pulang'].includes(item.status))
			.reduce((sum, item) => sum + item.count, 0)
	);
	const visibleCounts = await page.$$eval(
		'table[aria-label="Ringkasan kehadiran per kelas"] tbody tr:first-child td',
		(cells) => cells.map((cell) => cell.textContent.trim())
	);
	assert.equal(Number(visibleCounts[3]), refreshed.leadership.classSummary[0].tidakHadir);
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.$eval('.dashboard-header', (element) => element.scrollIntoView({ block: 'start' }));
	await page.screenshot({ path: path.join(folder, 'dashboard-merged-dark.png'), fullPage: true });
	await page.$eval('#absensi-hari-ini', (element) => element.scrollIntoView({ block: 'start' }));
	await page.screenshot({
		path: path.join(folder, 'dashboard-colored-dark-attendance.png'),
		fullPage: true
	});
	check(
		'Colored dashboard header/stat backgrounds, scoped grade labels, compact expandable absence lists and missing-data/action order'
	);
	check(
		'Merged dashboard responsive at 320/390/768/1024/1366, grade semantics, filter/reload and shared live refresh'
	);
	async function dashboardPage(role, params = '') {
		const response = await fetch(`${base}/__data.json?${params}`, {
			headers: { cookie: accounts[role].cookie }
		});
		assert.equal(response.status, 200);
		const result = await response.json();
		assert.ok(!result.nodes.some((node) => node?.type === 'error'), JSON.stringify(result));
		return parse(JSON.stringify(result.nodes.findLast((node) => node?.type === 'data').data));
	}
	const incompleteGrades = await dashboardPage('guru');
	assert.equal(
		incompleteGrades.achievements.academic.classes.find((item) => item.id === classA).complete,
		false
	);
	assert.equal(
		incompleteGrades.achievements.academic.classes.find((item) => item.id === classA).rows.length,
		0
	);
	for (const role of ['wali_asuh', 'wali_asrama']) {
		const result = await dashboardPage(role);
		assert.equal(result.achievements.academic, null);
		assert.ok(result.achievements.monthly.rows.every((item) => item.id === students[0]));
	}
	assert.equal((await dashboardPage('dapur')).achievements, null);
	for (const tab of ['sholat', 'makan']) {
		const result = await dashboard('guru', `absensi_tab=${tab}`);
		assert.equal(result.activityTab, tab);
		assert.equal(result.activitySummaries.length, tab === 'sholat' ? 5 : 3);
		assert.ok(result.activitySummaries.every((item) => item.total === 33));
		assert.ok(
			result.activitySummaries.every((item) =>
				item.groups.every((group) => group.students.length <= 20)
			)
		);
	}
	assert.deepEqual(
		(await dashboard('dapur')).activityTabs.map((item) => item.key),
		['makan']
	);
	assert.equal(
		(
			await fetch(`${base}/api/dashboard/daily?absensi_tab=sholat`, {
				headers: { cookie: accounts.dapur.cookie }
			})
		).status,
		403
	);
	await insert(
		'pegawai',
		clone(employee, {
			nama: 'QA Inactive employee',
			nip: 'QA-INACTIVE',
			kode_pegawai: 'QA-INACTIVE',
			nik: null,
			nuptk: null,
			dapodik_ptk_id: null,
			status: 'nonaktif'
		})
	);
	const employees = Number(
		(
			await row("SELECT count(*) AS total FROM pegawai WHERE sekolah_id=? AND status='aktif'", [
				school
			])
		).total
	);
	assert.equal((await dashboardPage('admin')).statistikDashboard.pegawai.total, employees);
	check(
		'Active employee count, kitchen meal-only tabs, academic permission and incomplete-grade safety'
	);
	for (let i = 0; i < 33; i++) {
		await db.execute({
			sql: 'INSERT INTO asesmen_sumatif (murid_id,mata_pelajaran_id,nilai_akhir,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(murid_id,mata_pelajaran_id) DO UPDATE SET nilai_akhir=excluded.nilai_akhir',
			args: [
				students[i],
				currentSubject,
				i < 2 ? 99 : i === 2 ? 98 : i === 3 ? 98 : i === 32 ? 0 : 50,
				now,
				now
			]
		});
	}
	const completeGrades = await dashboardPage('guru');
	const rankedClass = completeGrades.achievements.academic.classes.find(
		(item) => item.id === classA
	);
	assert.equal(rankedClass.complete, true);
	assert.deepEqual(
		rankedClass.rows.map((item) => item.peringkat),
		[1, 1, 3, 3]
	);
	assert.ok(rankedClass.rows.every((item) => students.slice(0, 4).includes(item.id)));
	assert.ok(completeGrades.achievements.academic.classes.every((item) => item.id !== classB));
	const highlight = completeGrades.achievements.academic.highlights;
	assert.equal(highlight.length, 1);
	assert.equal(highlight[0].jenjang, 'sma');
	assert.equal(highlight[0].student.id, students[0]);
	assert.equal(highlight[0].tied, 2);
	assert.deepEqual(
		(await dashboardPage('guru', 'prestasi_page=2')).achievements.academic.highlights,
		highlight
	);
	assert.deepEqual(
		(await dashboardPage('admin', 'prestasi_page=2')).achievements.academic.highlights,
		(await dashboardPage('admin')).achievements.academic.highlights
	);
	check('Semester-only full-class rankings, valid zero grades and tied third places');
	let identity = await row('SELECT identity_uid FROM murid_identity_link WHERE murid_id=?', [
		students[0]
	]);
	if (!identity) {
		identity = { identity_uid: 'qa-dashboard-archived' };
		await insert('murid_identity_link', {
			murid_id: students[0],
			sekolah_id: school,
			semester_id: semester,
			identity_uid: identity.identity_uid
		});
	}
	await db.execute({
		sql: 'INSERT INTO murid_lifecycle (sekolah_id,identity_key,nis,nama_snapshot,status,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sekolah_id,identity_key) DO UPDATE SET status=excluded.status',
		args: [school, `uid:${identity.identity_uid}`, 'QA-ARCHIVED', 'QA Archived', 'keluar', now]
	});
	const archivedGrades = (await dashboardPage('guru')).achievements.academic.classes.find(
		(item) => item.id === classA
	);
	assert.ok(!archivedGrades.rows.some((item) => item.id === students[0]));
	assert.equal(archivedGrades.rows[0].id, students[1]);
	await db.execute({
		sql: "UPDATE murid_lifecycle SET status='aktif' WHERE sekolah_id=? AND identity_key=?",
		args: [school, `uid:${identity.identity_uid}`]
	});
	check(
		'Inactive students are excluded from dashboard semester rankings without altering historical reports'
	);
	const monthStart = `${today.slice(0, 8)}01`;
	await db.execute({
		sql: 'UPDATE semester SET tanggal_mulai=?,tanggal_selesai=? WHERE id=?',
		args: [monthStart, `${today.slice(0, 4)}-12-31`, semester]
	});
	await db.execute({
		sql: 'UPDATE murid SET tanggal_masuk=? WHERE kelas_id=?',
		args: [monthStart, classA]
	});
	const config = await row(
		'SELECT id FROM presensi_settings WHERE sekolah_id=? AND tahun_ajaran_id=?',
		[school, originalClass.tahun_ajaran_id]
	);
	if (config)
		await db.execute({
			sql: "UPDATE presensi_settings SET hari_sekolah=7,libur_nasional='[]',libur_semester='[]' WHERE id=?",
			args: [config.id]
		});
	else
		await insert('presensi_settings', {
			sekolah_id: school,
			tahun_ajaran_id: originalClass.tahun_ajaran_id,
			hari_sekolah: 7,
			libur_nasional: '[]',
			libur_semester: '[]',
			created_at: now
		});
	await db.execute({
		sql: "DELETE FROM kalender_pendidikan WHERE sekolah_id=? AND tahun_ajaran_id=? AND jenis IN ('libur_nasional','libur_sekolah')",
		args: [school, originalClass.tahun_ajaran_id]
	});
	const monthDays = [];
	for (
		let cursor = new Date(`${monthStart}T12:00:00Z`);
		cursor.toISOString().slice(0, 10) <= today;
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	)
		monthDays.push(cursor.toISOString().slice(0, 10));
	const holiday = monthDays.length > 2 ? monthDays[1] : null;
	if (holiday)
		await insert('kalender_pendidikan', {
			sekolah_id: school,
			tahun_ajaran_id: originalClass.tahun_ajaran_id,
			semester_id: semester,
			kelas_id: classA,
			jenjang: 'srma',
			jenis: 'libur_sekolah',
			judul: 'QA Class holiday',
			tanggal_mulai: holiday,
			tanggal_selesai: holiday,
			created_at: now
		});
	const expectedDays = monthDays.filter((date) => date !== holiday);
	for (const student of [students[8], students[9], students[10]])
		for (const day of expectedDays) {
			await db.execute({
				sql: 'INSERT INTO absensi_kegiatan (sekolah_id,semester_id,kelas_id,murid_id,kegiatan_id,tanggal,status,metode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(murid_id,kegiatan_id,tanggal) DO UPDATE SET status=excluded.status',
				args: [
					school,
					semester,
					classA,
					student,
					activityIds.apel_berangkat,
					day,
					student === students[10] && day === expectedDays[0] ? 'izin' : 'hadir',
					'manual',
					now,
					now
				]
			});
		}
	if (expectedDays.length > 1)
		await db.execute({
			sql: 'UPDATE murid SET tanggal_masuk=? WHERE id=?',
			args: [today, students[9]]
		});
	const monthlyBefore = (await dashboardPage('guru')).achievements.monthly;
	assert.equal(monthlyBefore.available, true);
	assert.ok(
		monthlyBefore.rows.some((item) => item.id === students[8] && item.days === expectedDays.length)
	);
	assert.ok(!monthlyBefore.rows.some((item) => item.id === students[10]));
	assert.ok(monthlyBefore.incomplete > 0);
	if (expectedDays.length > 1) {
		assert.ok(monthlyBefore.partial > 0);
		assert.ok(!monthlyBefore.rows.some((item) => item.id === students[9]));
	}
	await insert('absensi_kegiatan', {
		sekolah_id: school,
		semester_id: semester,
		kelas_id: classA,
		murid_id: students[8],
		kegiatan_id: activityIds.sholat_subuh,
		tanggal: today,
		status: 'izin',
		metode: 'manual',
		created_at: now
	});
	await insert('absensi_kegiatan', {
		sekolah_id: school,
		semester_id: semester,
		kelas_id: classA,
		murid_id: students[8],
		kegiatan_id: activityIds.makan_siang,
		tanggal: today,
		status: 'alfa',
		metode: 'manual',
		created_at: now
	});
	assert.deepEqual(
		(await dashboardPage('guru', 'absensi_tab=sholat')).achievements.monthly,
		monthlyBefore
	);
	const dailyMonthly = (await dashboardPage('guru', 'sumber_masuk=harian')).achievements.monthly;
	assert.ok(!dailyMonthly.rows.some((item) => item.id === students[8]));
	await db.execute({
		sql: 'DELETE FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=? AND tanggal=?',
		args: [students[8], activityIds.apel_berangkat, expectedDays[0]]
	});
	assert.ok(
		!(await dashboardPage('guru')).achievements.monthly.rows.some((item) => item.id === students[8])
	);
	assert.equal(
		(await dashboardPage('guru', 'sumber_masuk=')).achievements.monthly.available,
		false
	);
	await db.execute({
		sql: 'UPDATE semester SET tanggal_selesai=? WHERE id=?',
		args: [monthStart.slice(0, 8) + '00', semester]
	});
	assert.equal((await dashboardPage('guru')).achievements.monthly.available, false);
	await db.execute({
		sql: 'UPDATE semester SET tanggal_selesai=? WHERE id=?',
		args: [`${today.slice(0, 4)}-12-31`, semester]
	});
	await db.execute({
		sql: 'INSERT INTO absensi_kegiatan (sekolah_id,semester_id,kelas_id,murid_id,kegiatan_id,tanggal,status,metode,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
		args: [
			school,
			semester,
			classA,
			students[8],
			activityIds.apel_berangkat,
			expectedDays[0],
			'hadir',
			'manual',
			now
		]
	});
	check(
		'Monthly entrance source, class holidays, new-student eligibility, missing days and no prayer/meal achievement scoring'
	);
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	for (const [width, height] of [
		[1366, 900],
		[768, 1024],
		[390, 844],
		[320, 800]
	]) {
		await page.setViewport({ width, height });
		await page.goto(`${base}/?kelas_id=${classA}`, { waitUntil: 'networkidle0' });
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		assert.ok(await page.$('[aria-label="Prestasi murid"]'));
		assert.match(
			await page.$eval('[aria-label="Statistik sekolah"]', (item) => item.textContent),
			/Pegawai Aktif/
		);
		const widths = await page.evaluate(() => [
			document.querySelector('.dashboard-shell').getBoundingClientRect().width,
			document.querySelector('#absensi-hari-ini').getBoundingClientRect().width
		]);
		assert.ok(Math.abs(widths[0] - widths[1]) <= 2);
		const positions = await page.evaluate(() => {
			const a = document.querySelector('#pengawasan-kelas').getBoundingClientRect();
			const b = document.querySelector('#prestasi-murid').getBoundingClientRect();
			return {
				sameRow: Math.abs(a.top - b.top) <= 2,
				below: b.top >= a.bottom,
				leftW: a.width,
				rightW: b.width
			};
		});
		if (width >= 1280) {
			assert.equal(positions.sameRow, true);
			assert.ok(positions.leftW > positions.rightW);
		} else assert.equal(positions.below, true);
		assert.equal(await page.$$eval('#prestasi-murid .dashboard-level', (items) => items.length), 1);
		await page.$eval('[aria-label="Jenis prestasi murid"]', (element) =>
			[...element.querySelectorAll('button')]
				.find((item) => item.textContent.includes('Kehadiran Konsisten'))
				.click()
		);
		await page.$eval('#prestasi-murid button', (element) => element.focus());
		assert.match(
			await page.$eval('#dashboard-achievement-tab', (item) => item.textContent),
			/murid konsisten/
		);
		await page.$eval('#prestasi-murid .btn', (element) => element.click());
		assert.ok(await page.$('dialog[aria-labelledby="dashboard-consistency-dialog-title"][open]'));
		assert.match(
			await page.$eval(
				'dialog[aria-labelledby="dashboard-consistency-dialog-title"]',
				(item) => item.textContent
			),
			/QA Monitoring/
		);
		await page.$eval('[aria-label="Tutup daftar kehadiran konsisten"]', (element) =>
			element.click()
		);
		await page.$eval('[aria-label="Jenis prestasi murid"]', (element) =>
			[...element.querySelectorAll('button')]
				.find((item) => item.textContent.trim() === 'Akademik')
				.click()
		);
		await page.$eval('#prestasi-murid', (element) => element.scrollIntoView({ block: 'start' }));
		await page.screenshot({
			path: path.join(folder, `dashboard-achievements-${width}.png`),
			fullPage: true
		});
		for (const tab of ['sholat', 'makan']) {
			await page.$eval(
				'[role="tablist"][aria-label="Jenis absensi hari ini"]',
				(element, text) =>
					[...element.querySelectorAll('button')]
						.find((item) => item.textContent.trim().toLowerCase() === text)
						.click(),
				tab
			);
			await page.waitForNetworkIdle();
			assert.equal(new URL(page.url()).searchParams.get('absensi_tab'), tab);
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false
			);
			await page.reload({ waitUntil: 'networkidle0' });
			assert.equal(
				await page.$$eval(
					'#absensi-hari-ini a',
					(items) => items.filter((item) => item.textContent.trim() === 'Monitoring').length
				),
				1
			);
			assert.equal(
				await page.$$eval('.dashboard-activity-stat', (items) => items.length),
				tab === 'sholat' ? 5 : 3
			);
			if (width >= 1280) {
				const tops = await page.$$eval('.dashboard-activity-stat', (items) =>
					items.map((item) => item.getBoundingClientRect().top)
				);
				assert.ok(Math.max(...tops) - Math.min(...tops) <= 2);
				assert.ok(
					await page.$eval('#absensi-hari-ini', (item) => item.getBoundingClientRect().height < 380)
				);
			}
			await page.$eval('.dashboard-activity-stat .dashboard-status-chip', (element) =>
				element.click()
			);
			assert.ok(await page.$('dialog[aria-labelledby="dashboard-activity-dialog-title"][open]'));
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false
			);
			await page.keyboard.press('Escape');
			assert.equal(
				await page.$('dialog[aria-labelledby="dashboard-activity-dialog-title"][open]'),
				null
			);
			assert.equal(
				await page.$eval(
					'[aria-label="Jenis absensi hari ini"] [aria-selected="true"]',
					(element) => element.textContent.trim().toLowerCase()
				),
				tab
			);
			await page.$eval('#absensi-hari-ini', (element) =>
				element.scrollIntoView({ block: 'start' })
			);
			await page.screenshot({
				path: path.join(folder, `dashboard-${tab}-${width}.png`),
				fullPage: true
			});
		}
	}
	check(
		'Full-width attendance, semester achievement panels and prayer/meal tabs at desktop/tablet/mobile sizes'
	);
	const classC = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Monitoring SD',
			fase: 'Fase B',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const sdStudent = await insert(
		'murid',
		clone(original, {
			nama: 'QA Sorotan SD',
			nis: 'QA-SOROTAN-SD',
			nisn: '9999880001',
			kelas_id: classC,
			qr_token: null,
			dapodik_peserta_didik_id: null,
			dapodik_anggota_rombel_id: null
		})
	);
	for (const [kelas, student] of [
		[classC, sdStudent],
		[classB, students[33]]
	]) {
		const subject = await insert('mata_pelajaran', {
			kelas_id: kelas,
			nama: 'QA Sorotan',
			jenis: 'wajib',
			created_at: now
		});
		await insert('asesmen_sumatif', {
			murid_id: student,
			mata_pelajaran_id: subject,
			nilai_akhir: 100,
			created_at: now
		});
	}
	const allHighlights = (await dashboardPage('admin')).achievements.academic.highlights;
	assert.deepEqual(
		allHighlights.map((item) => item.jenjang),
		['sd', 'smp', 'sma']
	);
	assert.ok(allHighlights.every((item) => item.student));
	assert.equal((await dashboardPage('guru')).achievements.academic.highlights.length, 1);
	for (const [width, height] of [
		[1366, 900],
		[390, 844]
	]) {
		await page.setViewport({ width, height });
		await page.goto(`${base}/?absensi_tab=sholat`, { waitUntil: 'networkidle0' });
		assert.equal(await page.$$eval('#prestasi-murid .dashboard-level', (items) => items.length), 3);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		const expand = await page.$('#pengawasan-kelas button[aria-expanded]');
		if (expand) {
			assert.equal(await expand.evaluate((item) => item.getAttribute('aria-expanded')), 'false');
			await expand.evaluate((item) => item.click());
			assert.equal(
				await page.$eval(
					'#pengawasan-kelas .dashboard-class-list',
					(item) => getComputedStyle(item).maxHeight
				),
				'none'
			);
			await expand.evaluate((item) => item.click());
			assert.equal(await expand.evaluate((item) => item.getAttribute('aria-expanded')), 'false');
		}
		await page.$eval('#pengawasan-kelas', (item) => item.scrollIntoView({ block: 'start' }));
		await page.screenshot({
			path: path.join(folder, `dashboard-three-levels-${width}.png`),
			fullPage: true
		});
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		assert.equal(
			await page.$eval('.dashboard-activity-value', (item) => getComputedStyle(item).color),
			'rgb(96, 165, 250)'
		);
		assert.equal(
			await page.$eval('.dashboard-activity-icon svg', (item) => getComputedStyle(item).fill),
			'rgb(96, 165, 250)'
		);
		await page.$eval('#absensi-hari-ini', (item) => item.scrollIntoView({ block: 'start' }));
		await page.screenshot({
			path: path.join(folder, `dashboard-sholat-dark-${width}.png`),
			fullPage: true
		});
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	}
	check(
		'Three academic level highlights, collapsed/expanded classes and prayer summary render in light/dark desktop/mobile'
	);

	// A separate date keeps the historical dashboard/recap assertions above unchanged.
	const journeyDate = '2026-10-03';
	const journeyAttendance = async (student, code, status, time = null) =>
		insert('absensi_kegiatan', {
			sekolah_id: school,
			semester_id: semester,
			kelas_id: classA,
			murid_id: student,
			kegiatan_id: activityIds[code],
			tanggal: journeyDate,
			status,
			waktu_scan: time,
			metode: time ? 'qr' : 'manual',
			created_at: now,
			updated_at: now
		});
	await journeyAttendance(students[0], 'asrama_berangkat', 'hadir', '2026-10-02T23:30:00Z');
	await journeyAttendance(students[1], 'asrama_berangkat', 'sakit');
	await journeyAttendance(students[2], 'apel_pulang', 'pulang');
	await journeyAttendance(students[3], 'asrama_berangkat', 'sakit');
	await journeyAttendance(students[3], 'apel_berangkat', 'hadir');
	await journeyAttendance(students[6], 'asrama_berangkat', 'izin');
	const integrationBefore = (await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id')).rows;
	const jquery = `tanggal=${journeyDate}&kelas_id=${classA}&q=QA%20Monitoring`;
	let journeySchool = await request('admin', `tab=sekolah&${jquery}`);
	const journeyDorm = await request('admin', `tab=asrama&${jquery}`);
	const pupil = (report, id) => report.rows.find((item) => item.id === id);
	assert.deepEqual(journeySchool.connection, { toSchool: 1, toDorm: 1, review: 1 });
	assert.deepEqual(journeySchool.connection, journeyDorm.connection);
	assert.deepEqual(
		pupil(journeySchool, students[0]).journeys,
		pupil(journeyDorm, students[0]).journeys
	);
	assert.equal(pupil(journeySchool, students[0]).cells[0].status, 'belum');
	assert.equal(pupil(journeyDorm, students[0]).cells[2].status, 'belum');
	assert.equal(pupil(journeySchool, students[1]).cells[0].status, 'sakit');
	assert.equal(pupil(journeySchool, students[1]).cells[0].source, 'terhubung');
	assert.ok(pupil(journeySchool, students[1]).cells[0].linkedFrom);
	assert.equal(pupil(journeySchool, students[6]).cells[0].status, 'izin');
	assert.equal(pupil(journeySchool, students[3]).cells[0].status, 'hadir');
	assert.equal(pupil(journeyDorm, students[3]).cells[0].status, 'sakit');
	for (const [filter, id] of [
		['menunggu_sekolah', students[0]],
		['menunggu_asrama', students[2]],
		['periksa', students[3]]
	]) {
		const filtered = await request('admin', `${jquery}&perjalanan=${filter}`);
		assert.equal(filtered.matched, 1);
		assert.equal(filtered.rows[0].id, id);
	}
	assert.equal((await request('admin', `tab=malam&${jquery}`)).tab, 'asrama');
	await request('admin', 'tab=sholat&perjalanan=periksa', 400);
	await request('admin', `${jquery}&perjalanan=palsu`, 400);
	await request('admin', `${jquery}&sumber_asrama_berangkat=99999999`, 400);
	await request('dapur', `tab=asrama&${jquery}`, 403);
	assert.equal((await request('wali_asuh', `tab=asrama&tanggal=${journeyDate}`)).total, 1);
	assert.equal((await request('guru', `tab=asrama&tanggal=${today}`)).columns[0].entryPath, null);
	assert.deepEqual(
		(await db.execute('SELECT * FROM absensi_kegiatan ORDER BY id')).rows,
		integrationBefore
	);
	check(
		'School/dorm source trace, two independent journeys, illness/permission, conflict and role-scoped travel filters; no attendance writes'
	);
	const defaultsBefore = await row(
		'SELECT COUNT(*) AS n FROM kegiatan_absensi WHERE sekolah_id=?',
		[school]
	);
	await request('admin', `tab=asrama&${jquery}`);
	const defaultsAfter = await row('SELECT COUNT(*) AS n FROM kegiatan_absensi WHERE sekolah_id=?', [
		school
	]);
	assert.equal(defaultsBefore.n, defaultsAfter.n);
	await db.execute({
		sql: 'UPDATE absensi_kegiatan SET status=?, updated_at=? WHERE murid_id=? AND kegiatan_id=? AND tanggal=?',
		args: [
			'hadir',
			new Date().toISOString(),
			students[1],
			activityIds.asrama_berangkat,
			journeyDate
		]
	});
	journeySchool = await request('admin', jquery);
	assert.equal(pupil(journeySchool, students[1]).cells[0].status, 'belum');
	assert.equal(pupil(journeySchool, students[1]).journeys[0].status, 'menunggu');
	await journeyAttendance(students[0], 'apel_berangkat', 'hadir', '2026-10-03T00:00:00Z');
	journeySchool = await request('admin', jquery);
	assert.equal(pupil(journeySchool, students[0]).journeys[0].status, 'tiba');
	check(
		'Default initialization idempotent; correction and later arrival recompute journey without stale linked illness'
	);
	for (const [width, height] of [
		[1366, 900],
		[768, 1024],
		[390, 844],
		[320, 740]
	]) {
		await page.setViewport({ width, height });
		await page.goto(`${base}/administrasi/absensi/monitoring?tab=asrama&${jquery}`, {
			waitUntil: 'networkidle0'
		});
		assert.equal(await page.$$eval('.monitoring-connection-card', (items) => items.length), 3);
		const layout = await page.evaluate(() => {
			const box = (el) => {
				const rect = el.getBoundingClientRect();
				return {
					top: rect.top,
					bottom: rect.bottom,
					left: rect.left,
					right: rect.right,
					height: rect.height
				};
			};
			return {
				cards: [...document.querySelectorAll('.monitoring-connection-card')].map(box),
				controls: [...document.querySelectorAll('.monitoring-list-controls select')].map(box),
				colors: [
					...document.querySelectorAll('.monitoring-connection-card .monitoring-number')
				].map((el) => getComputedStyle(el).color)
			};
		});
		assert.equal(new Set(layout.colors).size, 3);
		for (const item of [...layout.cards, ...layout.controls]) {
			assert.ok(item.left >= 0 && item.right <= width + 1);
		}
		if (width >= 768) {
			assert.ok(
				Math.max(...layout.cards.map((item) => item.top)) -
					Math.min(...layout.cards.map((item) => item.top)) <=
					1
			);
			assert.ok(
				Math.max(...layout.controls.map((item) => item.top)) -
					Math.min(...layout.controls.map((item) => item.top)) <=
					1
			);
		} else {
			for (let i = 1; i < layout.controls.length; i++)
				assert.ok(layout.controls[i].top >= layout.controls[i - 1].bottom);
		}
		assert.ok(
			(
				await page.$eval(
					'section[aria-label="Hubungan Sekolah dan Asrama"]',
					(el) => el.textContent
				)
			).includes('Belum tiba di sekolah')
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		await page.screenshot({
			path: path.join(folder, `monitoring-journey-overview-${width}.png`),
			fullPage: true
		});
		for (const [card, travel] of [
			['school', 'menunggu_sekolah'],
			['dorm', 'menunggu_asrama']
		]) {
			await page.click(`.monitoring-connection-${card}`);
			await page.waitForFunction(
				(travel) => new URL(location.href).searchParams.get('perjalanan') === travel,
				{},
				travel
			);
			await page.waitForFunction(() =>
				document
					.querySelector('.monitoring-list-heading')
					.textContent.includes('1 murid sesuai filter')
			);
			assert.equal(
				await page.$eval(`.monitoring-connection-${card}`, (el) => el.getAttribute('aria-current')),
				'true'
			);
		}
		await page.click('.monitoring-connection-review');
		await page.waitForFunction(
			() => new URL(location.href).searchParams.get('perjalanan') === 'periksa'
		);
		await page.waitForFunction(() =>
			document
				.querySelector('.monitoring-list-heading')
				.textContent.includes('1 murid sesuai filter')
		);
		assert.equal(
			await page.$eval('.monitoring-connection-review', (el) => el.getAttribute('aria-current')),
			'true'
		);
		assert.equal(new URL(page.url()).searchParams.get('kelas_id'), String(classA));
		assert.equal(new URL(page.url()).searchParams.get('tanggal'), journeyDate);
		await page.screenshot({
			path: path.join(folder, `asrama-connected-${width}.png`),
			fullPage: true
		});
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		await page.screenshot({
			path: path.join(folder, `asrama-connected-dark-${width}.png`),
			fullPage: true
		});
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
		await page.click('nav[aria-label="Jenis monitoring"] a[href*="tab=makan"]');
		await page.waitForFunction(() => new URL(location.href).searchParams.get('tab') === 'makan');
		assert.equal(new URL(page.url()).searchParams.has('perjalanan'), false);
	}
	check(
		'Asrama journey desktop/tablet/mobile/dark layouts; travel filter clears when switching to meals'
	);
	for (const code of ['asrama_berangkat', 'asrama_tiba']) {
		assert.equal(
			(await mutation('wali_asuh', 'updateManual', students[0], 'hadir', today, activityIds[code]))
				.type,
			'success'
		);
		assert.notEqual(
			(await mutation('guru', 'updateManual', students[0], 'hadir', today, activityIds[code])).type,
			'success'
		);
		assert.notEqual(
			(await mutation('dapur', 'updateManual', students[0], 'hadir', today, activityIds[code]))
				.type,
			'success'
		);
		assert.notEqual(
			(await mutation('wali_asuh', 'updateManual', students[1], 'hadir', today, activityIds[code]))
				.type,
			'success'
		);
	}
	// Only attendance reads/writes expand; generic student and photo mutations stay assigned.
	const photoFolder = path.join(folder, 'data', 'uploads');
	await mkdir(photoFolder, { recursive: true });
	const photoName = 'qa-attendance-scope.png';
	await writeFile(
		path.join(photoFolder, photoName),
		Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=',
			'base64'
		)
	);
	await db.execute({ sql: 'UPDATE murid SET foto=? WHERE id=?', args: [photoName, students[33]] });
	const oldPupil = await insert(
		'murid',
		clone(original, {
			kelas_id: classA,
			semester_id: oldSemester,
			nis: 'QA-SCOPE-OLD',
			nisn: '9999871111',
			wali_asuh_nama: null,
			wali_asrama_nama: null,
			foto: photoName,
			dapodik_peserta_didik_id: null,
			dapodik_anggota_rombel_id: null
		})
	);
	const foreignPupil = await insert(
		'murid',
		clone(original, {
			sekolah_id: otherSchool,
			kelas_id: classA,
			nis: 'QA-SCOPE-FOREIGN',
			nisn: '9999872222',
			wali_asuh_nama: null,
			wali_asrama_nama: null,
			foto: photoName,
			dapodik_peserta_didik_id: null,
			dapodik_anggota_rombel_id: null
		})
	);
	const dormToken = `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
	await insert('qr_murid', {
		murid_id: students[33],
		token_hash: createHash('sha256').update(dormToken).digest('hex'),
		token_version: 1,
		issued_at: now,
		created_at: now,
		updated_at: now
	});
	for (const role of ['wali_asrama', 'asrama_tanpa_tugas']) {
		for (const code of ['asrama_berangkat', 'asrama_tiba']) {
			assert.equal(
				(await mutation(role, 'updateManual', students[1], 'hadir', today, activityIds[code])).type,
				'success'
			);
		}
		const bulk = await fetch(`${base}/administrasi/absensi/kegiatan?/bulkUpdateManual`, {
			method: 'POST',
			headers: {
				cookie: accounts[role].cookie,
				origin: base,
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			body: new URLSearchParams({
				semesterId: String(semester),
				kelasId: String(classB),
				kegiatanId: String(activityIds.asrama_berangkat),
				tanggal: today,
				status: 'hadir'
			})
		});
		assert.equal((await bulk.json()).type, 'success');
		const dormScan = await fetch(`${base}/api/administrasi/absensi/scan`, {
			method: 'POST',
			headers: { cookie: accounts[role].cookie, origin: base, 'content-type': 'application/json' },
			body: JSON.stringify({
				mode: 'kegiatan',
				kegiatanId: activityIds.asrama_tiba,
				token: dormToken,
				status: 'hadir'
			})
		});
		assert.equal(dormScan.status, 200, await dormScan.clone().text());
		const dormRow = (await request(role, `tab=asrama&tanggal=${today}&kelas_id=${classB}`)).rows[0];
		assert.equal(dormRow.cells[0].status, 'hadir');
		assert.equal(dormRow.cells[1].status, 'hadir');
		assert.equal(dormRow.cells[1].method, 'qr');
		for (const query of ['', '?thumbnail=1']) {
			const photo = await fetch(`${base}/api/murid-photo/${students[33]}${query}`, {
				headers: { cookie: accounts[role].cookie }
			});
			assert.equal(photo.status, 200, await photo.clone().text());
			assert.equal(photo.headers.get('content-type'), 'image/png');
		}
		for (const id of [oldPupil, foreignPupil]) {
			assert.equal(
				(
					await fetch(`${base}/api/murid-photo/${id}`, {
						headers: { cookie: accounts[role].cookie }
					})
				).status,
				403
			);
			assert.notEqual(
				(await mutation(role, 'updateManual', id, 'hadir', today, activityIds.asrama_berangkat))
					.type,
				'success'
			);
		}
		for (const method of ['POST', 'DELETE']) {
			assert.equal(
				(
					await fetch(`${base}/api/murid-photo/${students[33]}`, {
						method,
						headers: { cookie: accounts[role].cookie, origin: base }
					})
				).status,
				403
			);
		}
		assert.equal(
			(
				await fetch(`${base}/murid/form/${students[33]}`, {
					headers: { cookie: accounts[role].cookie }
				})
			).status,
			403
		);
		assert.equal(
			(
				await fetch(`${base}/administrasi/absensi/pengaturan`, {
					headers: { cookie: accounts[role].cookie }
				})
			).status,
			403
		);
		assert.notEqual(
			(
				await mutation(
					role,
					'updateManual',
					students[1],
					'hadir',
					today,
					activityIds.apel_berangkat
				)
			).type,
			'success'
		);
		assert.notEqual(
			(
				await mutation(
					role,
					'updateManual',
					students[1],
					'hadir',
					date,
					activityIds.asrama_berangkat
				)
			).type,
			'success'
		);
	}
	assert.equal(
		(
			await fetch(`${base}/api/murid-photo/${students[33]}`, {
				headers: { cookie: accounts.wali_asuh.cookie }
			})
		).status,
		403
	);
	const archivedScope = await row('SELECT identity_uid FROM murid_identity_link WHERE murid_id=?', [
		students[0]
	]);
	await db.execute({
		sql: "UPDATE murid_lifecycle SET status='keluar' WHERE sekolah_id=? AND identity_key=?",
		args: [school, `uid:${archivedScope.identity_uid}`]
	});
	assert.equal(
		(
			await fetch(`${base}/api/murid-photo/${students[0]}`, {
				headers: { cookie: accounts.wali_asrama.cookie }
			})
		).status,
		403
	);
	assert.notEqual(
		(
			await mutation(
				'wali_asrama',
				'updateManual',
				students[0],
				'hadir',
				today,
				activityIds.asrama_berangkat
			)
		).type,
		'success'
	);
	await db.execute({
		sql: "UPDATE murid_lifecycle SET status='aktif' WHERE sekolah_id=? AND identity_key=?",
		args: [school, `uid:${archivedScope.identity_uid}`]
	});
	check(
		'Wali Asrama with/without assignments can enter, bulk save, QR scan and read photos school-wide; active semester/school, photo writes, data and risky permissions remain protected'
	);
	const freshCookie = accounts.admin.cookie.replace(
		`active-sekolah-id=${school}`,
		`active-sekolah-id=${otherSchool}`
	);
	const freshResponse = await fetch(
		`${base}/api/administrasi/absensi/monitoring?tab=asrama&tanggal=${today}`,
		{ headers: { cookie: freshCookie } }
	);
	assert.equal(freshResponse.status, 200, await freshResponse.clone().text());
	const createdDefaults = (
		await db.execute({
			sql: "SELECT kode,akses_edit,auto_alfa,masuk_rapor FROM kegiatan_absensi WHERE sekolah_id=? AND kode IN ('asrama_berangkat','asrama_tiba')",
			args: [otherSchool]
		})
	).rows;
	assert.equal(createdDefaults.length, 2);
	assert.equal(
		(
			await row(
				"SELECT count(*) n FROM kegiatan_absensi WHERE sekolah_id=? AND kode NOT IN ('asrama_berangkat','asrama_tiba')",
				[otherSchool]
			)
		).n,
		0
	);
	const freshSchool = await fetch(
		`${base}/api/administrasi/absensi/monitoring?tab=sekolah&tanggal=${today}`,
		{ headers: { cookie: freshCookie } }
	);
	assert.equal(freshSchool.status, 200);
	assert.equal((await freshSchool.json()).columns[0].source, 'harian');
	assert.ok(
		createdDefaults.every(
			(item) => item.akses_edit === 'asrama' && item.auto_alfa === 0 && item.masuk_rapor === 0
		)
	);
	await fetch(`${base}/api/administrasi/absensi/monitoring?tab=asrama&tanggal=${today}`, {
		headers: { cookie: freshCookie }
	});
	assert.equal(
		(
			await row(
				"SELECT count(*) n FROM kegiatan_absensi WHERE sekolah_id=? AND kode IN ('asrama_berangkat','asrama_tiba')",
				[otherSchool]
			)
		).n,
		2
	);
	check(
		'New dorm activities initialize without auto-alfa/report sync or duplicates; write endpoints enforce guardian/student and teacher/kitchen boundaries'
	);
	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	check(
		'Dashboard desktop/mobile visual layout and explicit source selection; final database checks'
	);
	assert.deepEqual(errors, []);
	check('Desktop/tablet/mobile render without page overflow; tab navigation works');
	await writeFile(
		path.join(folder, 'result.json'),
		JSON.stringify({ checks, errors, folder, database }, null, 2)
	);
	console.log(folder);
} catch (error) {
	if (browser) {
		const page = (await browser.pages()).at(-1);
		if (page) {
			await page.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true });
			console.error('Failed page:', page.url());
		}
	}
	throw error;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const stopped = once(child, 'exit');
		child.kill();
		await stopped;
	}
	db.close();
	await writeFile(path.join(folder, 'server.log'), output);
	console.log('QA artifacts:', folder);
}
