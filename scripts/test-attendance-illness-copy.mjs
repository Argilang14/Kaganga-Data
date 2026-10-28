import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { illnessDate, illnessEndDate } from '../src/lib/attendance-illness.ts';

const root = process.cwd();
await mkdir(path.join(root, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(root, 'tmp/attendance-illness-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
const client = createClient({ url: process.env.DB_URL });
const row = async (sql, args = []) => (await client.execute({ sql, args })).rows[0];
const insert = async (table, values) => {
	const keys = Object.keys(values);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
				args: Object.values(values)
			})
		).lastInsertRowid
	);
};
const clone = (original, changes) => {
	const result = { ...original, ...changes };
	delete result.id;
	return result;
};
let vite, close, child, browser;
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
try {
	vite = await createServer({
		configFile: false,
		resolve: { alias: { $lib: path.join(root, 'src/lib') } },
		plugins: [
			{
				name: 'illness-qa-env',
				resolveId(id) {
					if (id === '$env/dynamic/private') return '\0illness-env';
				},
				load(id) {
					if (id === '\0illness-env') return 'export const env = process.env;';
				}
			}
		],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		appType: 'custom',
		logLevel: 'error'
	});
	const connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	close = connection.closeDbClient;
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const { ensureAttendanceIllnessSchema } = await vite.ssrLoadModule(
		'/src/lib/server/db/ensure-attendance-illness.ts'
	);
	await ensureAttendanceIllnessSchema();
	await ensureAttendanceIllnessSchema();
	assert.equal(Number((await row('SELECT count(*) AS n FROM absensi_masa_sakit')).n), 0);
	pass('Additive migration is idempotent, no historical sickness backfill');
	const { saveAttendance } = await vite.ssrLoadModule('/src/lib/server/attendance-mutation.ts');
	const { projectPermitAttendance } = await vite.ssrLoadModule(
		'/src/lib/server/attendance-permits.ts'
	);
	const { applyAutoAlfaKegiatan } = await vite.ssrLoadModule('/src/lib/server/absensi-kegiatan.ts');
	const { loadAttendanceIllness } = await vite.ssrLoadModule(
		'/src/lib/server/attendance-illness.ts'
	);
	const { resolveSekolahAcademicContext } = await vite.ssrLoadModule(
		'/src/lib/server/db/academic.ts'
	);
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const original = await row('SELECT * FROM murid LIMIT 1');
	const school = Number(original.sekolah_id);
	const academic = await resolveSekolahAcademicContext(school);
	const semester = academic.activeSemesterId;
	const cls = await row('SELECT * FROM kelas WHERE semester_id=? AND sekolah_id=? LIMIT 1', [
		semester,
		school
	]);
	const student = await insert(
		'murid',
		clone(original, {
			nama: 'QA Masa Sakit',
			nis: `QA-SICK-${Date.now()}`,
			nisn: '9999900011',
			kelas_id: cls.id,
			semester_id: semester,
			qr_token: null
		})
	);
	const now = new Date(),
		today = illnessDate(now),
		past = new Date(now.getTime() - 86400000 * 2),
		day1 = illnessDate(past);
	const activity = async (code, category, time = '07:00') => {
		const found = await row('SELECT * FROM kegiatan_absensi WHERE sekolah_id=? AND kode=?', [
			school,
			code
		]);
		if (found) return { ...found, id: Number(found.id), jamMulai: found.jam_mulai };
		const id = await insert('kegiatan_absensi', {
			sekolah_id: school,
			kode: code,
			nama: code,
			kategori: category,
			akses_edit: category === 'asrama' ? 'asrama' : 'sekolah',
			aktif: 1,
			auto_alfa: 0,
			masuk_rapor: 0,
			urutan: 1,
			jam_mulai: time
		});
		return { id, jamMulai: time };
	};
	const entry = await activity('apel_berangkat', 'sekolah');
	const dorm = await activity('asrama_berangkat', 'asrama', '06:00');
	const meal = await activity('makan_siang', 'makan', '12:00');
	const prayer = await activity('sholat_zuhur', 'sholat', '12:00');
	const locals = {
		sekolah: { id: school },
		user: { id: Number(admin.id), type: 'admin', username: 'QA sakit', permissions: [] }
	};
	const request = new Request('http://localhost/qa-illness', { method: 'POST' });
	const save = (changes) =>
		saveAttendance({
			locals,
			request,
			semesterId: semester,
			kelasId: Number(cls.id),
			muridIds: [student],
			tanggal: today,
			kegiatanId: entry.id,
			status: 'sakit',
			...changes
		});
	const projection = (date, activities = [entry, dorm, meal, prayer]) =>
		projectPermitAttendance({
			schoolId: school,
			semesterId: semester,
			studentIds: [student],
			dates: [date],
			activities,
			rows: []
		});
	await save({ tanggal: day1, kegiatanId: dorm.id });
	let period = await row(
		'SELECT * FROM absensi_masa_sakit WHERE murid_id=? ORDER BY id DESC LIMIT 1',
		[student]
	);
	assert.equal(period.tanggal_selesai, illnessEndDate(day1));
	assert.equal((await projection(today)).length, 4);
	assert.equal((await projection(illnessEndDate(today))).length, 0);
	pass(
		'Manual dorm sickness starts one three-calendar-day period shared across activities; expiry needs no cron'
	);
	const stale = new Date(Date.parse(period.created_at) - 1000).toISOString();
	assert.equal((await save({ status: 'hadir', metode: 'qr', waktuScan: stale })).skipped, 1);
	assert.equal(
		(await row('SELECT kembali_pada FROM absensi_masa_sakit WHERE id=?', [period.id])).kembali_pada,
		null
	);
	for (const item of [meal, prayer])
		assert.equal(
			(
				await save({
					kegiatanId: item.id,
					status: 'hadir',
					metode: 'qr',
					waktuScan: new Date().toISOString()
				})
			).skipped,
			1
		);
	pass('Stale offline scans, meals and prayers cannot end sickness');
	await save({ catatan: 'Masih sakit hari ketiga' });
	assert.equal(
		Number(
			(await row('SELECT count(*) AS n FROM absensi_masa_sakit WHERE murid_id=?', [student])).n
		),
		1
	);
	await assert.rejects(
		save({ perpanjangSakit: true, catatan: '' }),
		(cause) => cause.status === 400
	);
	await save({ perpanjangSakit: true, catatan: 'Perlu tiga hari tambahan' });
	assert.equal(
		(await save({ perpanjangSakit: true, catatan: 'Perlu tiga hari tambahan' })).skipped,
		1
	);
	period = await row('SELECT * FROM absensi_masa_sakit WHERE murid_id=? ORDER BY id DESC LIMIT 1', [
		student
	]);
	assert.equal(period.tanggal_selesai, illnessEndDate(today));
	const permit = await insert('izin_pulang_murid', {
		sekolah_id: school,
		tahun_ajaran_id: Number(cls.tahun_ajaran_id),
		semester_id: semester,
		kelas_id: Number(cls.id),
		murid_id: student,
		nis_snapshot: 'QA',
		nama_snapshot: 'QA Sakit',
		kelas_snapshot: cls.nama,
		tanggal_keluar: day1,
		waktu_keluar: '00:00',
		alasan: 'QA pulang',
		rencana_kembali: today,
		status: 'sedang_izin'
	});
	assert.equal(
		(await save({ status: 'hadir', metode: 'qr', waktuScan: new Date().toISOString() })).records[0]
			.status,
		'pulang'
	);
	assert.equal(
		(await row('SELECT kembali_pada FROM absensi_masa_sakit WHERE id=?', [period.id])).kembali_pada,
		null
	);
	assert.equal((await projection(today))[0].status, 'pulang');
	await client.execute({
		sql: "UPDATE izin_pulang_murid SET status='dibatalkan' WHERE id=?",
		args: [permit]
	});
	pass('Home-leave protection wins over sickness and cannot be ended by ordinary attendance scan');
	const resumed = new Date().toISOString();
	assert.equal((await save({ status: 'hadir', metode: 'qr', waktuScan: resumed })).affected, 1);
	assert.equal(
		(await row('SELECT kembali_pada FROM absensi_masa_sakit WHERE id=?', [period.id])).kembali_pada,
		resumed
	);
	assert.equal(
		(
			await row(
				'SELECT status FROM absensi_kegiatan WHERE murid_id=? AND tanggal=? AND kegiatan_id=?',
				[student, day1, dorm.id]
			)
		).status,
		'sakit'
	);
	assert.equal(
		(await save({ status: 'hadir', metode: 'qr', waktuScan: new Date().toISOString() })).skipped,
		1
	);
	assert.equal(
		(
			await row(
				'SELECT petugas_user_id FROM absensi_kegiatan WHERE murid_id=? AND tanggal=? AND kegiatan_id=?',
				[student, today, entry.id]
			)
		).petugas_user_id,
		admin.id
	);
	pass(
		'School-entry scan replaces same-day sickness once, preserves earlier records and duplicate receipt'
	);
	await save({ kegiatanId: dorm.id, status: 'sakit', catatan: 'Kondisi sakit baru' });
	await assert.rejects(
		save({ kegiatanId: dorm.id, perpanjangSakit: true, catatan: '' }),
		(cause) => cause.status === 400
	);
	await save({ kegiatanId: dorm.id, perpanjangSakit: true, catatan: 'Perpanjangan oleh petugas' });
	assert.equal(
		Number(
			(await row('SELECT count(*) AS n FROM absensi_masa_sakit WHERE murid_id=?', [student])).n
		),
		3
	);
	assert.equal(
		(await loadAttendanceIllness(school + 999999, semester, [student], today)).length,
		0
	);
	await assert.rejects(
		save({
			locals: { sekolah: { id: school + 999999 }, user: { ...locals.user, type: 'tim_dapur' } }
		}),
		(cause) => cause.status === 403
	);
	pass(
		'Extension requires reason, keeps prior periods, school and role boundaries remain enforced'
	);
	const newPeriod = await row(
		'SELECT * FROM absensi_masa_sakit WHERE murid_id=? ORDER BY id DESC LIMIT 1',
		[student]
	);
	assert.equal(
		(
			await save({
				kegiatanId: dorm.id,
				status: 'hadir',
				metode: 'qr',
				waktuScan: new Date().toISOString()
			})
		).skipped,
		1
	);
	assert.equal(
		(await row('SELECT kembali_pada FROM absensi_masa_sakit WHERE id=?', [newPeriod.id]))
			.kembali_pada,
		null
	);
	await client.execute({
		sql: 'UPDATE kegiatan_absensi SET auto_alfa=1, jam_selesai=? WHERE id=?',
		args: ['00:01', meal.id]
	});
	const day4 = illnessDate(new Date(`${today}T12:00:00+07:00`).getTime() + 3 * 86400000);
	await applyAutoAlfaKegiatan({
		sekolahId: school,
		semesterId: semester,
		kelasId: Number(cls.id),
		tanggal: day4,
		kegiatanIds: [meal.id],
		now: new Date(`${day4}T12:00:00+07:00`)
	});
	assert.equal(
		Number(
			(
				await row(
					'SELECT count(*) AS n FROM absensi_kegiatan WHERE murid_id=? AND tanggal=? AND kegiatan_id=?',
					[student, day4, meal.id]
				)
			).n
		),
		0
	);
	pass('Dorm scan cannot end sickness; expired unresolved illness never triggers automatic alfa');
	assert.ok(
		Number(
			(await row("SELECT count(*) AS n FROM audit_log WHERE entity_type='absensi_masa_sakit'")).n
		) >= 4
	);
	assert.equal((await row('PRAGMA quick_check')).quick_check, 'ok');
	pass('Illness transitions have audit records and copied database passes quick_check');
	if (process.env.QA_ILLNESS_UI === '1') {
		await client.execute({ sql: 'UPDATE auth_user SET sekolah_id=? WHERE id=?', args: [school, admin.id] });
		const token = randomBytes(32).toString('base64url');
		await insert('auth_session', {
			user_id: admin.id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			expires_at: new Date(Date.now() + 3600000).toISOString(),
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});
		const secondToken = randomBytes(32).toString('base64url');
		const secondId = await insert('auth_user', clone(admin, {
			username: `qa-sick-second-${Date.now()}`, username_normalized: `qa-sick-second-${Date.now()}`,
			sekolah_id: school, pegawai_id: null, must_change_password: 0
		}));
		await insert('auth_session', { user_id: secondId, token_hash: createHash('sha256').update(secondToken).digest('hex'),
			expires_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
		const base = 'http://127.0.0.1:5193';
		let output = '';
		child = spawn(process.execPath, ['build/index.js'], {
			cwd: root,
			env: { ...process.env, PORT: '5193', HOST: '127.0.0.1', ORIGIN: base, BODY_SIZE_LIMIT: '6M' },
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		child.stdout.on('data', (data) => {
			output += data;
		});
		child.stderr.on('data', (data) => {
			output += data;
		});
		let ready = false;
		for (let i = 0; i < 90; i++) {
			try {
				const response = await fetch(`${base}/login`);
				if (response.ok) {
					ready = true;
					break;
				}
			} catch {
				// The isolated QA server may still be starting up.
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		assert.ok(ready, output);
		const qr = `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
		await insert('qr_murid', {
			murid_id: student,
			token_hash: createHash('sha256').update(qr).digest('hex'),
			token_version: 1,
			issued_at: new Date().toISOString(),
			created_at: new Date().toISOString()
		});
		// Test the HTTP endpoint, not just the shared mutation service.
		await save({ status: 'sakit', catatan: 'Konfirmasi sakit sebelum uji scan bersamaan' });
		const cookie = `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${cls.id}`;
		const scan = async (sessionToken) => {
			const response = await fetch(`${base}/api/administrasi/absensi/scan`, {
				method: 'POST',
				headers: { cookie: cookie.replace(token, sessionToken), origin: base, 'content-type': 'application/json' },
				body: JSON.stringify({
					token: qr,
					mode: 'kegiatan',
					scanGroup: 'sekolah',
					kegiatanId: entry.id
				})
			});
			assert.equal(response.status, 200);
			return response.json();
		};
		const simultaneous = await Promise.all([scan(token), scan(secondToken)]);
		assert.deepEqual(simultaneous.map((r) => r.code).sort(), ['already_present', 'success']);
		assert.equal(simultaneous[0].petugas.id, simultaneous[1].petugas.id);
		assert.equal(simultaneous[0].waktuScan, simultaneous[1].waktuScan);
		assert.ok(
			(await row('SELECT kembali_pada FROM absensi_masa_sakit WHERE id=?', [newPeriod.id]))
				.kembali_pada
		);
		pass('Concurrent HTTP QR requests accept one arrival, duplicate preserves first staff/time');
		browser = await puppeteer.launch({
			executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
			headless: true,
			args: ['--no-sandbox']
		});
		const page = await browser.newPage();
		await page.setCookie(
			{ name: 'rapkumer-session', value: token, url: base },
			{ name: 'active-sekolah-id', value: String(school), url: base },
			{ name: 'active-kelas-id', value: String(cls.id), url: base }
		);
		for (const width of [1440, 768, 390]) {
			await page.setViewport({ width, height: 1000 });
			await page.goto(
				`${base}/administrasi/absensi/kegiatan?kelas_id=${cls.id}&kegiatan_id=${dorm.id}&tanggal=${today}`,
				{ waitUntil: 'networkidle0' }
			);
			const match = await page.evaluateHandle(() =>
				[...document.querySelectorAll('tbody tr')].find((r) =>
					r.textContent.includes('QA Masa Sakit')
				)
			);
			const element = match.asElement();
			assert.ok(element, await page.title());
			await element.scrollIntoView();
			assert.match(await element.evaluate((e) => e.textContent), /Sudah kembali hadir/);
			assert.ok(await element.$('input[name="perpanjangSakit"]'));
			await element.screenshot({ path: path.join(folder, `illness-row-${width}.png`) });
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
			assert.ok(overflow <= 1, `Unexpected page overflow at ${width}: ${overflow}`);
			await page.screenshot({ path: path.join(folder, `illness-page-${width}.png`) });
		}
		pass(
			'Catat Absensi status and extension controls render at desktop, tablet and mobile without page overflow'
		);
		await page.setViewport({ width: 1440, height: 1000 });
		await page.goto(
			`${base}/administrasi/absensi/monitoring?tab=asrama&kelas_id=${cls.id}&tanggal=${today}`,
			{ waitUntil: 'networkidle0' }
		);
		assert.match(await page.$eval('body', (e) => e.textContent), /Sudah kembali hadir/);
		await page.screenshot({ path: path.join(folder, 'illness-monitoring.png') });
		pass('Monitoring displays recovery metadata without changing earlier dorm attendance');
	}
	console.log(JSON.stringify({ checks: checks.length, folder }));
} finally {
	if (browser) await browser.close();
	if (child) {
		child.kill();
		await new Promise((resolve) => child.once('exit', resolve));
	}
	if (close) await close();
	client.close();
	if (vite) await vite.close();
}
