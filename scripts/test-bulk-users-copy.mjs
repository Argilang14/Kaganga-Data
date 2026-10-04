import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const project = process.cwd(),
	port = Number(process.env.BULK_USER_QA_PORT || 5159);
assert.ok(![5152, 1206].includes(port));
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'bulk-users-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
const checks = [];
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
function clone(original, overrides) {
	const values = { ...original, ...overrides };
	delete values.id;
	return values;
}
try {
	const original = await row('SELECT * FROM murid ORDER BY id LIMIT 1');
	assert.ok(original);
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
			nama: 'QA Bulk A',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const classB = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'QA Bulk B',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	const employees = {};
	for (const [key, jenis, nama] of [
		['alpha', 'guru', 'QA Bulk Alpha'],
		['beta', 'guru', 'QA Bulk Beta'],
		['old', 'guru', 'QA Bulk Lama'],
		['missing', 'guru', 'QA Bulk Kosong'],
		['review', 'guru', 'QA Bulk Rangkap'],
		['stale', 'guru', 'QA Bulk Berubah'],
		['ui', 'guru', 'QA Bulk UI'],
		['asuh', 'wali_asuh', 'QA Bulk Asuh'],
		['asrama', 'wali_asrama', 'QA Bulk Asrama'],
		['dupe1', 'wali_asuh', 'QA Bulk Nama Sama'],
		['dupe2', 'wali_asuh', 'QA Bulk Nama Sama'],
		['inactive', 'guru', 'QA Bulk Nonaktif']
	]) {
		employees[key] = await insert(
			'pegawai',
			clone(employee, {
				nama,
				jenis,
				status: key === 'inactive' ? 'nonaktif' : 'aktif',
				nip: `QA-BULK-${key}`,
				kode_pegawai: `QA-BULK-${key}`,
				nomor_induk_pppk: null,
				nik: null,
				nuptk: null,
				foto: null,
				dapodik_ptk_id: null
			})
		);
	}
	await db.execute({
		sql: 'UPDATE kelas SET wali_kelas_id=? WHERE id=?',
		args: [employees.review, classA]
	});
	const subject = await row('SELECT * FROM mata_pelajaran LIMIT 1');
	assert.ok(subject);
	const subjects = {};
	for (const key of ['alpha', 'beta', 'review', 'stale', 'ui'])
		subjects[key] = await insert(
			'mata_pelajaran',
			clone(subject, {
				nama: `QA Bulk Mapel ${key}`,
				kelas_id: classA,
				pengampu_id: employees[key],
				dapodik_pembelajaran_id: null,
				dapodik_mata_pelajaran_id: null,
				dapodik_induk_pembelajaran_id: null
			})
		);
	await insert(
		'mata_pelajaran',
		clone(subject, {
			nama: 'QA Bulk Mapel alpha B',
			kelas_id: classB,
			pengampu_id: employees.alpha,
			dapodik_pembelajaran_id: null,
			dapodik_mata_pelajaran_id: null,
			dapodik_induk_pembelajaran_id: null
		})
	);
	for (let i = 0; i < 2; i++)
		await insert(
			'murid',
			clone(original, {
				nama: `QA Bulk Anak ${i}`,
				nis: `QA-BULK-${i}`,
				nisn: `999880000${i}`,
				kelas_id: classA,
				wali_asuh_nama: i === 0 ? 'QA Bulk Asuh' : 'QA Bulk Nama Sama',
				wali_asrama_nama: i === 0 ? 'QA Bulk Asrama' : null,
				qr_token: `qa-bulk-${randomBytes(8).toString('hex')}`,
				dapodik_peserta_didik_id: null,
				dapodik_anggota_rombel_id: null
			})
		);
	const anotherSchool = await insert(
		'sekolah',
		clone(await row('SELECT * FROM sekolah WHERE id=?', [school]), {
			nama: 'QA Bulk Sekolah Lain',
			npsn: '99999999'
		})
	);
	const foreign = await insert(
		'pegawai',
		clone(employee, {
			nama: 'QA Bulk Lintas Sekolah',
			jenis: 'guru',
			sekolah_id: anotherSchool,
			nip: 'QA-BULK-FOREIGN',
			kode_pegawai: 'QA-BULK-FOREIGN',
			nomor_induk_pppk: null,
			nik: null,
			nuptk: null,
			foto: null,
			dapodik_ptk_id: null
		})
	);
	const now = new Date().toISOString(),
		admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const oldUserId = await insert(
		'auth_user',
		clone(admin, {
			username: 'guru.qa.bulk.alpha',
			username_normalized: 'guru.qa.bulk.alpha',
			type: 'user',
			jabatan_akses: null,
			sekolah_id: school,
			pegawai_id: employees.old,
			kelas_id: classA,
			mata_pelajaran_id: null,
			permissions: '[]',
			must_change_password: 0
		})
	);
	const oldSnapshot = JSON.stringify(await row('SELECT * FROM auth_user WHERE id=?', [oldUserId]));
	const accounts = {};
	for (const [name, type, position] of [
		['admin', 'admin', null],
		['kepsek', 'user', 'kepala_sekolah'],
		['guru', 'user', null]
	]) {
		const id = await insert(
			'auth_user',
			clone(admin, {
				username: `qa-bulk-${name}`,
				username_normalized: `qa-bulk-${name}`,
				type,
				jabatan_akses: position,
				sekolah_id: school,
				pegawai_id: null,
				kelas_id: null,
				mata_pelajaran_id: null,
				permissions: '[]',
				must_change_password: 0
			})
		);
		const token = randomBytes(32).toString('base64url');
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			user_agent: 'QA Bulk',
			ip_address: '127.0.0.1',
			expires_at: new Date(Date.now() + 1200000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts[name] = {
			cookie: `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${classA}`,
			token
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
			// The copied-database server may still be starting.
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	assert.ok(ready, 'QA server tidak siap');
	async function api(name, route, data) {
		const response = await fetch(base + route, {
			method: data ? 'POST' : 'GET',
			headers: {
				cookie: accounts[name].cookie,
				origin: base,
				...(data ? { 'content-type': 'application/json' } : {})
			},
			body: data ? JSON.stringify(data) : undefined,
			redirect: 'manual'
		});
		let body;
		try {
			body = await response.json();
		} catch {
			// Denied responses may use an HTML error body.
		}
		return { status: response.status, body, headers: response.headers };
	}
	const endpoint = '/api/pengguna/akun-massal';
	assert.equal(
		(
			await fetch(base + endpoint, {
				method: 'POST',
				headers: { cookie: accounts.admin.cookie, origin: base, 'content-type': 'text/plain' },
				body: '{}',
				redirect: 'manual'
			})
		).status,
		415
	);
	for (const name of ['kepsek', 'guru']) {
		assert.equal((await api(name, endpoint + '?role=user')).status, 403);
		assert.equal(
			(await api(name, endpoint, { role: 'user', selected: [], reviewedIds: [], confirm: true }))
				.status,
			403
		);
	}
	assert.equal((await api('admin', endpoint + '?role=admin')).status, 400);
	const teacherPreview = await api('admin', endpoint + '?role=user');
	assert.equal(teacherPreview.status, 200);
	assert.match(teacherPreview.headers.get('cache-control'), /no-store/);
	const find = (preview, key) =>
		preview.body.candidates.find((c) => c.pegawaiId === employees[key]);
	assert.equal(find(teacherPreview, 'old').status, 'existing');
	assert.equal(find(teacherPreview, 'missing').status, 'blocked');
	assert.equal(find(teacherPreview, 'review').status, 'review');
	assert.ok(!find(teacherPreview, 'inactive'));
	assert.ok(!teacherPreview.body.candidates.some((c) => c.pegawaiId === foreign));
	assert.deepEqual(
		find(teacherPreview, 'alpha').kelasIds.sort((a, b) => a - b),
		[classA, classB].sort((a, b) => a - b)
	);
	assert.notEqual(find(teacherPreview, 'alpha').username, 'guru.qa.bulk.alpha');
	const asuhPreview = await api('admin', endpoint + '?role=wali_asuh'),
		asramaPreview = await api('admin', endpoint + '?role=wali_asrama');
	assert.equal(find(asuhPreview, 'dupe1').status, 'blocked');
	assert.equal(find(asuhPreview, 'dupe2').status, 'blocked');
	check(
		'Pratinjau admin saja, penugasan aktif, nama ganda, tugas rangkap, akun lama dan collision username terdeteksi'
	);
	const selection = (preview, keys) =>
		keys.map((key) => {
			const c = find(preview, key);
			return { pegawaiId: c.pegawaiId, fingerprint: c.fingerprint };
		});
	const payload = (preview, keys, reviewedIds = []) => ({
		role: preview.body.role,
		selected: selection(preview, keys),
		reviewedIds,
		confirm: true
	});
	const before = Number((await row('SELECT count(*) n FROM auth_user')).n);
	assert.equal(
		(await api('admin', endpoint, payload(teacherPreview, ['alpha', 'missing']))).status,
		409
	);
	assert.equal(
		(await api('admin', endpoint, payload(teacherPreview, ['alpha', 'review']))).status,
		400
	);
	assert.equal(
		(
			await api('admin', endpoint, {
				...payload(teacherPreview, ['alpha']),
				selected: [
					...selection(teacherPreview, ['alpha']),
					{ pegawaiId: foreign, fingerprint: '0'.repeat(64) }
				]
			})
		).status,
		403
	);
	assert.equal(Number((await row('SELECT count(*) n FROM auth_user')).n), before);
	await db.execute({
		sql: 'UPDATE mata_pelajaran SET nama=? WHERE id=?',
		args: ['QA Bulk Penugasan Berubah', subjects.stale]
	});
	assert.equal((await api('admin', endpoint, payload(teacherPreview, ['stale']))).status, 409);
	check(
		'Pilihan campuran, lintas sekolah, rangkap tanpa konfirmasi, dan pratinjau usang dibatalkan tanpa akun parsial'
	);
	const created = await api(
		'admin',
		endpoint,
		payload(teacherPreview, ['alpha', 'review', 'old'], [employees.review])
	);
	assert.equal(created.status, 200);
	assert.equal(created.body.created.length, 2);
	assert.equal(created.body.skipped.length, 1);
	const credentials = [...created.body.created];
	for (const preview of [asuhPreview, asramaPreview]) {
		const next = await api(
			'admin',
			endpoint,
			payload(preview, [preview.body.role === 'wali_asuh' ? 'asuh' : 'asrama'])
		);
		assert.equal(next.status, 200);
		credentials.push(...next.body.created);
	}
	const repeated = await api(
		'admin',
		endpoint,
		payload(teacherPreview, ['alpha', 'review', 'old'], [employees.review])
	);
	assert.equal(repeated.status, 200);
	assert.equal(repeated.body.created.length, 0);
	assert.equal(repeated.body.skipped.length, 3);
	assert.equal(
		JSON.stringify(await row('SELECT * FROM auth_user WHERE id=?', [oldUserId])),
		oldSnapshot
	);
	assert.equal(new Set(credentials.map((c) => c.password)).size, credentials.length);
	for (const credential of credentials) {
		const user = await row('SELECT * FROM auth_user WHERE id=?', [credential.id]);
		assert.equal(user.must_change_password, 1);
		assert.equal(user.jabatan_akses, null);
		assert.notEqual(user.password_hash, credential.password);
		assert.equal(
			scryptSync(credential.password, user.password_salt, 64).toString('hex'),
			user.password_hash
		);
		assert.ok(!JSON.parse(user.permissions).includes('user_add'));
	}
	check(
		'Akun tiga role tersimpan, hash sandi berbeda, wajib ganti sandi, pengulangan melewati akun lama tanpa reset'
	);
	const betaPreview = await api('admin', endpoint + '?role=user');
	const simultaneous = await Promise.all(
		[0, 1].map(() => api('admin', endpoint, payload(betaPreview, ['beta'])))
	);
	assert.ok(simultaneous.every((r) => r.status === 200));
	assert.equal(
		simultaneous.reduce((n, r) => n + r.body.created.length, 0),
		1
	);
	assert.equal(
		Number((await row('SELECT count(*) n FROM auth_user WHERE pegawai_id=?', [employees.beta])).n),
		1
	);
	await db.execute(
		"CREATE TRIGGER qa_bulk_fail BEFORE INSERT ON audit_log WHEN NEW.entity_type='pengguna' BEGIN SELECT RAISE(ABORT,'qa audit failure'); END"
	);
	const fresh = await api('admin', endpoint + '?role=user');
	const failed = await api('admin', endpoint, payload(fresh, ['stale']));
	assert.equal(failed.status, 409);
	assert.equal(
		Number((await row('SELECT count(*) n FROM auth_user WHERE pegawai_id=?', [employees.stale])).n),
		0
	);
	await db.execute('DROP TRIGGER qa_bulk_fail');
	check('Permintaan bersamaan idempoten dan kegagalan audit mengembalikan seluruh transaksi');
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		userDataDir: path.join(folder, 'browser')
	});
	const page = await browser.newPage(),
		errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: accounts.admin.token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base }
	);
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(base + '/pengguna', { waitUntil: 'networkidle0' });
	await page.click('button[aria-label="Buat Akun Massal"]');
	await page.waitForSelector('#bulk-user-modal[open]');
	await page.waitForFunction(() => document.querySelector('input[aria-label="Pilih QA Bulk UI"]'));
	await page.click('input[aria-label="Pilih QA Bulk UI"]');
	await page.screenshot({ path: path.join(folder, 'bulk-desktop.png'), fullPage: true });
	await page.setViewport({ width: 390, height: 844 });
	await new Promise((r) => setTimeout(r, 350));
	assert.equal(
		await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
		false
	);
	await page.screenshot({ path: path.join(folder, 'bulk-mobile.png'), fullPage: true });
	await page.evaluate(() =>
		[...document.querySelectorAll('#bulk-user-modal button')]
			.find((b) => b.textContent.includes('Pratinjau ('))
			.click()
	);
	await page.screenshot({ path: path.join(folder, 'bulk-confirm-mobile.png'), fullPage: true });
	await page.click('#bulk-user-modal input[type="checkbox"]');
	const responsePromise = page.waitForResponse(
		(r) => r.url().endsWith(endpoint) && r.request().method() === 'POST'
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('#bulk-user-modal button')]
			.find((b) => b.textContent.includes('Buat 1 Akun'))
			.click()
	);
	const uiResponse = await responsePromise;
	assert.equal(uiResponse.status(), 200);
	credentials.push(...(await uiResponse.json()).created);
	await page.waitForFunction(() =>
		document.querySelector('#bulk-user-modal').innerText.includes('Hasil Pembuatan Akun')
	);
	assert.ok(
		!(await page.evaluate(() =>
			document.querySelector('#bulk-user-modal').innerText.includes('Kg9!')
		))
	);
	await page.screenshot({ path: path.join(folder, 'bulk-result-mobile.png'), fullPage: true });
	const cdp = await page.createCDPSession();
	await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' });
	await page.evaluate(() =>
		[...document.querySelectorAll('#bulk-user-modal button')]
			.find((b) => b.textContent.includes('Unduh Daftar Awal'))
			.click()
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll('#bulk-user-modal button')].some(
			(b) => b.disabled && b.textContent.includes('Daftar sudah diunduh')
		)
	);
	await page.evaluate(() =>
		[...document.querySelectorAll('#bulk-user-modal button')]
			.find((b) => b.textContent.trim() === 'Selesai')
			.click()
	);
	assert.ok(
		!(await page.evaluate(() =>
			document.querySelector('#bulk-user-modal').innerText.includes('Kg9!')
		))
	);
	check('Popup desktop/HP, pratinjau, konfirmasi, sandi tersembunyi dan unduh satu kali berfungsi');
	const first = credentials[0],
		loginForm = new FormData();
	loginForm.set('username', first.username);
	loginForm.set('password', first.password);
	const login = await fetch(base + '/login?/login', {
		method: 'POST',
		headers: { origin: base, 'x-sveltekit-action': 'true' },
		body: loginForm,
		redirect: 'manual'
	});
	assert.equal((await login.json()).status, 303);
	const sessionCookie = login.headers
		.getSetCookie()
		.find((v) => v.startsWith('rapkumer-session='))
		.split(';')[0];
	const restricted = await fetch(base + '/murid', {
		headers: { cookie: sessionCookie },
		redirect: 'manual'
	});
	assert.equal(restricted.status, 303);
	assert.match(restricted.headers.get('location'), /ganti_password=1/);
	await page.setCookie({ name: 'rapkumer-session', value: sessionCookie.split('=')[1], url: base });
	await page.goto(base + '/', { waitUntil: 'networkidle0' });
	await page.waitForSelector('input[name="currentPassword"]');
	const newPassword = `Qa9!${randomBytes(12).toString('hex')}`,
		changeForm = new FormData();
	for (const [key, value] of Object.entries({
		currentPassword: first.password,
		newPassword,
		confirmPassword: newPassword
	}))
		changeForm.set(key, value);
	const changed = await fetch(base + '/pengaturan?/change-password', {
		method: 'POST',
		headers: { origin: base, cookie: sessionCookie, 'x-sveltekit-action': 'true' },
		body: changeForm,
		redirect: 'manual'
	});
	assert.equal((await changed.json()).status, 200);
	assert.equal(
		(await row('SELECT must_change_password FROM auth_user WHERE id=?', [first.id]))
			.must_change_password,
		0
	);
	const updated = await row('SELECT password_hash,password_salt FROM auth_user WHERE id=?', [
		first.id
	]);
	assert.equal(
		scryptSync(newPassword, updated.password_salt, 64).toString('hex'),
		updated.password_hash
	);
	const staleSession = await fetch(base + '/administrasi/absensi', {
		headers: { cookie: sessionCookie },
		redirect: 'manual'
	});
	assert.equal(staleSession.status, 303);
	assert.match(staleSession.headers.get('location'), /login/);
	check('Login pertama memaksa pergantian sandi dan sesi sandi lama dicabut setelah diganti');
	async function editUser(values, account = 'admin') {
		const body = new FormData();
		for (const [key, value] of Object.entries(values)) body.set(key, String(value));
		const response = await fetch(base + '/pengguna?/update_user', {
			method: 'POST',
			headers: { origin: base, cookie: accounts[account].cookie, 'x-sveltekit-action': 'true' },
			body,
			redirect: 'manual'
		});
		const payload = await response.json().catch(() => ({}));
		return { status: payload.status ?? response.status, payload };
	}
	async function testSession(userId) {
		const token = randomBytes(32).toString('base64url');
		await insert('auth_session', {
			user_id: userId,
			token_hash: createHash('sha256').update(token).digest('hex'),
			expires_at: new Date(Date.now() + 1200000).toISOString(),
			created_at: now,
			updated_at: now
		});
		return `rapkumer-session=${token}; active-sekolah-id=${school}`;
	}
	const uiUser = await row('SELECT * FROM auth_user WHERE pegawai_id=?', [employees.ui]);
	const sameNameMapel = await insert(
		'mata_pelajaran',
		clone(await row('SELECT * FROM mata_pelajaran WHERE id=?', [subjects.ui]), { kelas_id: classB })
	);
	await db.execute({
		sql: 'UPDATE auth_user_mata_pelajaran SET mata_pelajaran_id=? WHERE auth_user_id=?',
		args: [sameNameMapel, uiUser.id]
	});
	await db.execute({
		sql: 'UPDATE auth_user SET mata_pelajaran_id=?,permissions=? WHERE id=?',
		args: [sameNameMapel, JSON.stringify(['absensi_koreksi_lama']), uiUser.id]
	});
	const userCount = (await row('SELECT COUNT(*) AS total FROM auth_user')).total;
	const credentialFields = [
		'password_hash',
		'password_salt',
		'password_updated_at',
		'must_change_password'
	];
	const baselineUser = await row('SELECT * FROM auth_user WHERE id=?', [uiUser.id]);
	const oldUiSession = await testSession(uiUser.id);
	await page.setCookie(
		{ name: 'rapkumer-session', value: accounts.admin.token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base }
	);
	async function openEdit(username) {
		await page.goto(base + '/pengguna?q=' + encodeURIComponent(username), {
			waitUntil: 'networkidle0'
		});
		await page.click('button[title="Edit pengguna"]');
		await page.waitForFunction(
			() =>
				document.querySelector('#user-pegawai option')?.textContent === 'Pilih pegawai' &&
				document.querySelectorAll('#user-pegawai option').length > 1
		);
	}
	async function saveEditPopup() {
		const response = page.waitForResponse(
			(r) => r.url().includes('/pengguna?/update_user') && r.request().method() === 'POST'
		);
		await page.evaluate(() =>
			[...document.querySelectorAll('#edit-user-modal button')]
				.find((b) => b.textContent.trim() === 'Simpan')
				.click()
		);
		assert.equal((await (await response).json()).status, 200);
		await page.waitForFunction(() => !document.querySelector('#edit-user-modal'));
	}
	await page.setViewport({ width: 1366, height: 900 });
	await openEdit(uiUser.username);
	await page.select('#user-jabatan-akses', 'waka_kurikulum');
	await page.click('#user-mapel-options summary');
	assert.equal(
		await page.$eval('input[aria-label="Mata pelajaran QA Bulk Mapel ui"]', (node) => node.checked),
		true
	);
	await page.click('input[aria-label="Mata pelajaran QA Bulk Mapel beta"]');
	await page.click('#user-kelas-options summary');
	await page.click(`input[aria-label="Kelas QA Bulk B ${classB}"]`);
	await page.screenshot({ path: path.join(folder, 'edit-user-desktop.png'), fullPage: true });
	await page.setViewport({ width: 390, height: 844 });
	assert.equal(
		await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
		false
	);
	await page.screenshot({ path: path.join(folder, 'edit-user-mobile.png'), fullPage: true });
	await saveEditPopup();
	let savedUi = await row('SELECT * FROM auth_user WHERE id=?', [uiUser.id]);
	assert.equal(savedUi.jabatan_akses, 'waka_kurikulum');
	for (const field of credentialFields) assert.equal(savedUi[field], baselineUser[field]);
	assert.equal((await row('SELECT COUNT(*) AS total FROM auth_user')).total, userCount);
	assert.deepEqual(
		(
			await db.execute({
				sql: 'SELECT kelas_id FROM auth_user_kelas WHERE auth_user_id=? ORDER BY kelas_id',
				args: [uiUser.id]
			})
		).rows.map((r) => Number(r.kelas_id)),
		[classA, classB]
	);
	assert.deepEqual(
		(
			await db.execute({
				sql: 'SELECT mata_pelajaran_id FROM auth_user_mata_pelajaran WHERE auth_user_id=? ORDER BY mata_pelajaran_id',
				args: [uiUser.id]
			})
		).rows.map((r) => Number(r.mata_pelajaran_id)),
		[subjects.beta, sameNameMapel].sort((a, b) => a - b)
	);
	assert.ok(JSON.parse(savedUi.permissions).includes('absensi_koreksi_lama'));
	assert.ok(JSON.parse(savedUi.permissions).includes('kelas_pindah'));
	assert.equal(
		(await fetch(base + '/murid', { headers: { cookie: oldUiSession }, redirect: 'manual' }))
			.status,
		303
	);
	await openEdit(uiUser.username);
	await page.select('#user-jabatan-akses', '');
	await page.click('#user-mapel-options summary');
	assert.equal(
		await page.$eval('input[aria-label="Mata pelajaran QA Bulk Mapel ui"]', (node) => node.checked),
		true
	);
	assert.equal(
		await page.$eval(
			'input[aria-label="Mata pelajaran QA Bulk Mapel beta"]',
			(node) => node.checked
		),
		true
	);
	await saveEditPopup();
	savedUi = await row('SELECT * FROM auth_user WHERE id=?', [uiUser.id]);
	assert.equal(savedUi.jabatan_akses, null);
	assert.equal(
		(await row('SELECT COUNT(*) AS total FROM auth_user_kelas WHERE auth_user_id=?', [uiUser.id]))
			.total,
		2
	);
	check(
		'Edit popup desktop/HP: dua kelas/mapel tersimpan, mapel nama sama tetap terpilih, perubahan jabatan tidak menghapus penugasan/sandi/izin khusus'
	);
	const editValues = {
		id: uiUser.id,
		username: uiUser.username,
		password: '',
		type: 'user',
		jabatanAkses: '',
		mataPelajaranIds: JSON.stringify([sameNameMapel, subjects.beta]),
		kelasIds: JSON.stringify([classA, classB])
	};
	assert.equal(
		(await editUser({ ...editValues, updatedAt: '1970-01-01T00:00:00.000Z' })).status,
		409
	);
	const foreignYear = await insert(
		'tahun_ajaran',
		clone(await row('SELECT * FROM tahun_ajaran WHERE id=?', [oldClass.tahun_ajaran_id]), {
			sekolah_id: anotherSchool
		})
	);
	const foreignSemester = await insert(
		'semester',
		clone(await row('SELECT * FROM semester WHERE id=?', [semester]), {
			tahun_ajaran_id: foreignYear
		})
	);
	const foreignClass = await insert(
		'kelas',
		clone(oldClass, {
			sekolah_id: anotherSchool,
			tahun_ajaran_id: foreignYear,
			semester_id: foreignSemester,
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const foreignMapel = await insert(
		'mata_pelajaran',
		clone(subject, { kelas_id: foreignClass, pengampu_id: foreign, dapodik_pembelajaran_id: null })
	);
	for (const invalid of [
		{ jabatanAkses: 'admin' },
		{ type: 'admin' },
		{ kelasIds: JSON.stringify([classA, foreignClass]) },
		{ mataPelajaranIds: JSON.stringify([sameNameMapel, foreignMapel]) }
	]) {
		assert.equal((await editUser({ ...editValues, ...invalid })).status, 400);
	}
	assert.ok([303, 403].includes((await editUser(editValues, 'guru')).status));
	assert.equal(
		JSON.stringify(await row('SELECT * FROM auth_user WHERE id=?', [uiUser.id])),
		JSON.stringify(savedUi)
	);
	const beforeRollbackSession = await testSession(uiUser.id);
	await db.execute(
		`CREATE TRIGGER qa_edit_audit_abort BEFORE INSERT ON audit_log WHEN NEW.entity_type='pengguna' AND NEW.action='update' BEGIN SELECT RAISE(ABORT,'QA edit audit rollback'); END`
	);
	assert.equal((await editUser({ ...editValues, jabatanAkses: 'operator' })).status, 500);
	await db.execute('DROP TRIGGER qa_edit_audit_abort');
	assert.equal(
		JSON.stringify(await row('SELECT * FROM auth_user WHERE id=?', [uiUser.id])),
		JSON.stringify(savedUi)
	);
	assert.ok(
		await row('SELECT id FROM auth_session WHERE token_hash=?', [
			createHash('sha256')
				.update(beforeRollbackSession.match(/rapkumer-session=([^;]+)/)[1])
				.digest('hex')
		])
	);
	assert.equal(
		(
			await row('SELECT COUNT(*) AS total FROM auth_user_mata_pelajaran WHERE auth_user_id=?', [
				uiUser.id
			])
		).total,
		2
	);
	check(
		'Edit tanpa izin/lintas sekolah/role-jabatan tidak valid ditolak; kegagalan audit mengembalikan akun, penugasan dan sesi'
	);
	const legacy = await row('SELECT * FROM auth_user WHERE pegawai_id=?', [employees.review]);
	await db.execute({
		sql: "UPDATE auth_user SET type='wali_kelas',kelas_id=?,permissions='[]',must_change_password=0 WHERE id=?",
		args: [classA, legacy.id]
	});
	assert.equal(
		(
			await editUser({
				...editValues,
				id: legacy.id,
				username: legacy.username,
				type: 'wali_kelas',
				kelasIds: JSON.stringify([classB])
			})
		).status,
		200
	);
	const legacySaved = await row('SELECT * FROM auth_user WHERE id=?', [legacy.id]);
	assert.equal(legacySaved.type, 'wali_kelas');
	assert.equal(Number(legacySaved.kelas_id), classA);
	assert.equal(
		Number((await row('SELECT wali_kelas_id FROM kelas WHERE id=?', [classA])).wali_kelas_id),
		employees.review
	);
	assert.equal(
		(await row('SELECT wali_kelas_id FROM kelas WHERE id=?', [classB])).wali_kelas_id,
		null
	);
	assert.equal(
		(
			await fetch(base + `/murid?kelas_id=${classB}`, {
				headers: { cookie: await testSession(legacy.id) },
				redirect: 'manual'
			})
		).status,
		200
	);
	const asuhAccount = await row('SELECT * FROM auth_user WHERE pegawai_id=?', [employees.asuh]);
	await db.execute({
		sql: 'UPDATE auth_user SET must_change_password=0 WHERE id=?',
		args: [asuhAccount.id]
	});
	const asuhEdit = {
		...editValues,
		id: asuhAccount.id,
		username: asuhAccount.username,
		type: 'wali_asuh',
		jabatanAkses: 'waka_keasramaan',
		kelasIds: '[]',
		mataPelajaranIds: '[]'
	};
	assert.equal((await editUser(asuhEdit)).status, 200);
	assert.equal(
		(
			await fetch(base + `/murid/${original.id}`, {
				headers: { cookie: await testSession(asuhAccount.id) },
				redirect: 'manual'
			})
		).status,
		200
	);
	assert.equal((await editUser({ ...asuhEdit, jabatanAkses: '' })).status, 200);
	assert.equal(
		(
			await fetch(base + `/murid/${original.id}`, {
				headers: { cookie: await testSession(asuhAccount.id) },
				redirect: 'manual'
			})
		).status,
		403
	);
	await page.setViewport({ width: 1366, height: 900 });
	await openEdit(legacy.username);
	assert.ok(await page.$('#user-jabatan-akses'));
	assert.ok(await page.$('#user-kelas-options'));
	await page.evaluate(() =>
		[...document.querySelectorAll('#edit-user-modal button')]
			.find((b) => b.textContent.includes('Batal'))
			.click()
	);
	await openEdit(asuhAccount.username);
	assert.equal(await page.$eval('#user-pegawai', (node) => Number(node.value)), employees.asuh);
	assert.ok(await page.$('#user-jabatan-akses'));
	assert.equal(await page.$('#user-kelas-options'), null);
	check(
		'Wali kelas lama dapat menambah penugasan tanpa memindahkan wali Data Kelas; jabatan wali asuh dapat diubah tanpa membuka binaan setelah dicabut'
	);
	const editAudit = JSON.stringify(
		(await db.execute("SELECT * FROM audit_log WHERE entity_type='pengguna' AND action='update'"))
			.rows
	);
	for (const credential of credentials) assert.ok(!editAudit.includes(credential.password));
	const audit = JSON.stringify(
		(await db.execute("SELECT * FROM audit_log WHERE summary LIKE 'Membuat akun massal %'")).rows
	);
	for (const credential of credentials) {
		assert.ok(!audit.includes(credential.password));
		assert.ok(!output.includes(credential.password));
	}
	const finalPreview = await api('admin', endpoint + '?role=user');
	assert.ok(!JSON.stringify(finalPreview.body).includes('passwordHash'));
	assert.ok(!JSON.stringify(finalPreview.body).includes('Kg9!'));
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	assert.deepEqual(errors, []);
	check('Audit tanpa sandi, pratinjau tidak membocorkan sandi, SQLite dan foreign key sehat');
	await writeFile(
		path.join(folder, 'result.json'),
		JSON.stringify(
			{
				checks,
				database,
				screenshots: [
					'bulk-desktop.png',
					'bulk-mobile.png',
					'bulk-confirm-mobile.png',
					'bulk-result-mobile.png',
					'edit-user-desktop.png',
					'edit-user-mobile.png'
				]
			},
			null,
			2
		)
	);
	console.log('QA_RESULT', folder);
} catch (cause) {
	await writeFile(path.join(folder, 'server.log'), output);
	throw cause;
} finally {
	if (browser) await browser.close();
	if (child && child.exitCode == null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
	db.close();
}
