import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

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
		['dapur', 'tim_dapur', null],
		['kepsek', 'user', 'kepala_sekolah'],
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
				permissions: '[]',
				sekolah_id: school,
				kelas_id: ['guru', 'kepsek'].includes(name) ? classA : null,
				pegawai_id: guardians[name] ?? null,
				must_change_password: 0
			})
		);
		if (name === 'guru')
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
		} catch {}
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
		assert.equal(report.columns.length, tab === 'sholat' ? 5 : tab === 'makan' ? 3 : 1);
		if (tab === 'malam') assert.equal(report.rows[0].cells[0].time, '2026-10-04T17:05:00Z');
		if (tab === 'makan') assert.equal(report.rows[0].cells[0].status, 'belum');
	}
	check('School, five prayers, three meals and night roll-call remain independent');
	assert.equal((await request('guru')).total, 33);
	assert.equal((await request('tanpa_kelas')).total, 0);
	for (const role of ['wali_asuh', 'wali_asrama'])
		assert.equal((await request(role, 'tab=malam')).total, 1);
	await request('guru', `kelas_id=${classB}`, 403);
	assert.ok((await request('kepsek')).classes.some((item) => item.id === classB));
	check('Teacher class scope, individual guardian scope and leadership access');
	const meals = await request('dapur', `kelas_id=${classB}`);
	assert.equal(meals.tab, 'makan');
	assert.equal(meals.tabs.length, 1);
	assert.equal(meals.rows[0].cells[0].status, 'hadir');
	assert.ok(!JSON.stringify(meals).includes('apel_berangkat'));
	for (const tab of ['sekolah', 'sholat', 'malam']) await request('dapur', `tab=${tab}`, 403);
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
	for (const role of ['wali_asuh', 'wali_asrama'])
		assert.equal((await dashboard(role)).students.total, 1);
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
	const reportNav = 'nav[aria-label="Tampilan monitoring dan rekap"]';
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
			await page.$eval(`${reportNav} a[aria-current="page"]`, (el) => el.textContent.trim()),
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
			'Monitoring & Rekap Absensi'
		);
		assert.equal(
			sidebar.find((item) => item.path === '/administrasi/absensi/kegiatan').text,
			'Catat Absensi'
		);
		assert.ok(!sidebar.some((item) => item.path === '/administrasi/absensi/kegiatan/rekap'));
		await page.click(`${reportNav} a[href*="kegiatan/rekap"]`);
		await page.waitForNetworkIdle();
		let params = new URL(page.url()).searchParams;
		assert.equal(params.get('tanggal_awal'), date);
		assert.equal(params.get('tanggal_akhir'), date);
		assert.equal(params.get('kelas_id'), String(classA));
		assert.equal(params.get('kegiatan_id'), String(activityIds.apel_berangkat));
		assert.equal(
			await page.$eval(`${reportNav} a[aria-current="page"]`, (el) => el.textContent.trim()),
			'Rekap'
		);
		assert.equal(
			await page.$eval('.drawer-side a.menu-active', (el) => new URL(el.href).pathname),
			'/administrasi/absensi/monitoring'
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false
		);
		await page.screenshot({ path: path.join(folder, `report-recap-${width}.png`), fullPage: true });
		await page.reload({ waitUntil: 'networkidle0' });
		assert.equal(
			await page.$eval(`${reportNav} a[aria-current="page"]`, (el) => el.textContent.trim()),
			'Rekap'
		);
		await page.click(`${reportNav} a[href*="absensi/monitoring"]`);
		await page.waitForNetworkIdle();
		params = new URL(page.url()).searchParams;
		assert.equal(params.get('tanggal'), date);
		assert.equal(params.get('kelas_id'), String(classA));
		assert.equal(
			await page.$eval(`${reportNav} a[aria-current="page"]`, (el) => el.textContent.trim()),
			'Monitoring'
		);
		await page.goto(
			`${base}/administrasi/absensi/kegiatan?tanggal=${date}&kelas_id=${classA}&kegiatan_id=${activityIds.apel_berangkat}`,
			{ waitUntil: 'networkidle0' }
		);
		assert.equal(await page.$eval('h2', (el) => el.textContent.trim()), 'Catat Absensi');
	}
	page.off('request', recordTabRequest);
	check(
		'Combined menu: desktop/mobile tabs preserve date/class/activity; legacy recap reload and sidebar active state work; inactive recap is not loaded'
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
	for (const tab of ['sholat', 'makan', 'malam']) {
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
	await page.click('nav[aria-label="Jenis monitoring"] a[href*="tab=malam"]');
	await page.waitForFunction(() => new URL(location.href).searchParams.get('tab') === 'malam');
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
		4
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
