import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const project = process.cwd();
const port = Number(process.env.USER_ROLE_QA_PORT || 5166);
assert.ok(![5152, 1206].includes(port));
const base = `http://127.0.0.1:${port}`;
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'user-roles-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const now = new Date().toISOString();
const checks = [];
let child,
	browser,
	output = '';
const check = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
function clone(original, overrides) {
	const values = { ...original, ...overrides };
	delete values.id;
	return values;
}
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
async function session(id, school) {
	const token = randomBytes(32).toString('base64url');
	await insert('auth_session', {
		user_id: id,
		token_hash: createHash('sha256').update(token).digest('hex'),
		expires_at: new Date(Date.now() + 1200000).toISOString(),
		created_at: now,
		updated_at: now
	});
	return { token, cookie: `rapkumer-session=${token}; active-sekolah-id=${school}` };
}
try {
	const employee = await row('SELECT * FROM pegawai LIMIT 1');
	assert.ok(employee);
	const school = Number(employee.sekolah_id);
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	assert.ok(admin);
	const adminId = await insert(
		'auth_user',
		clone(admin, {
			username: 'qa-roles-admin',
			username_normalized: 'qa-roles-admin',
			sekolah_id: school,
			pegawai_id: null,
			kelas_id: null,
			mata_pelajaran_id: null,
			jabatan_akses: null,
			must_change_password: 0
		})
	);
	const auth = await session(adminId, school);
	const employees = {};
	for (const key of ['operator', 'tim_dapur', 'tim_keamanan', 'operator_bulk', 'tim_dapur_bulk', 'tim_keamanan_bulk']) {
		employees[key] = await insert(
			'pegawai',
			clone(employee, {
				nama: `QA Role ${key}`,
				jenis: key.startsWith('operator') ? 'operator' : key.startsWith('tim_keamanan') ? 'keamanan' : 'tim_dapur',
				status: 'aktif',
				nip: `QA-ROLE-${key}`,
				kode_pegawai: `QA-ROLE-${key}`,
				nomor_induk_pppk: null,
				nik: null,
				nuptk: null,
				foto: null,
				dapodik_ptk_id: null
			})
		);
	}
	child = spawn(process.execPath, ['build/index.js'], {
		cwd: project,
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: path.join(folder, 'data'),
			NODE_ENV: 'production'
		}
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
			/* Server startup. */
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, 'QA server belum siap');
	async function action(name, values, cookie = auth.cookie) {
		const form = new FormData();
		for (const [key, value] of Object.entries(values)) form.set(key, String(value));
		const response = await fetch(`${base}/pengguna?/${name}`, {
			method: 'POST',
			headers: { origin: base, cookie, 'x-sveltekit-action': 'true' },
			body: form,
			redirect: 'manual'
		});
		const body = await response.json().catch(() => ({}));
		return { status: body.status ?? response.status, body };
	}
	const accountValues = (key) => ({
		username: `qa-role-${key}`,
		password: `Qa9!${randomBytes(12).toString('hex')}`,
		type: key,
		pegawaiId: employees[key],
		jabatanAkses: '',
		mataPelajaranIds: '[]',
		kelasIds: '[]'
	});
	for (const role of ['operator', 'tim_dapur', 'tim_keamanan']) {
		assert.equal((await action('create_user', accountValues(role))).status, 200);
		const user = await row('SELECT * FROM auth_user WHERE pegawai_id=?', [employees[role]]);
		assert.equal(user.type, role === 'operator' ? 'user' : role);
		assert.equal(user.jabatan_akses, role === 'operator' ? 'operator' : null);
		assert.equal(user.must_change_password, 1);
		assert.equal(user.mata_pelajaran_id, null);
	}
	check('Akun Operator, Tim Dapur dan Tim Keamanan tersimpan tanpa mapel, wajib ganti sandi');
	assert.equal((await action('create_user', {
		...accountValues('tim_keamanan_bulk'), type: 'tim_keamanan', jabatanAkses: 'kepala_sekolah'
	})).status, 400);
	assert.equal((await action('create_user', {
		...accountValues('tim_dapur_bulk'), type: 'tim_keamanan'
	})).status, 400);
	check('Tim Keamanan tidak bisa menyisipkan jabatan pimpinan atau memakai pegawai dapur');
	const invalid = accountValues('operator_bulk');
	assert.equal(
		(await action('create_user', { ...invalid, type: 'operator', jabatanAkses: 'kepala_sekolah' }))
			.status,
		400
	);
	assert.equal((await action('create_user', { ...invalid, type: 'admin' })).status, 400);
	assert.equal((await action('create_user', accountValues('operator'))).status, 400);
	check('Role tidak valid, jabatan Operator palsu dan akun pegawai ganda ditolak');
	const operator = await row('SELECT * FROM auth_user WHERE pegawai_id=?', [employees.operator]);
	await db.execute({
		sql: 'UPDATE auth_user SET must_change_password=0 WHERE id=?',
		args: [operator.id]
	});
	const oldSession = await session(operator.id, school);
	assert.equal(
		(
			await action('update_user', {
				id: operator.id,
				username: operator.username,
				type: 'operator',
				password: '',
				jabatanAkses: '',
				kelasIds: '[]',
				mataPelajaranIds: '[]',
				updatedAt: operator.updated_at
			})
		).status,
		200
	);
	const edited = await row('SELECT * FROM auth_user WHERE id=?', [operator.id]);
	assert.equal(edited.jabatan_akses, 'operator');
	assert.equal(edited.password_hash, operator.password_hash);
	assert.equal(
		(await row('SELECT COUNT(*) n FROM auth_session WHERE user_id=?', [operator.id])).n,
		0
	);
	assert.equal(
		(await fetch(base + '/murid', { headers: { cookie: oldSession.cookie }, redirect: 'manual' }))
			.status,
		303
	);
	check('Edit Operator mempertahankan sandi dan mencabut sesi lama');
	const operatorAuth = await session(operator.id, school);
	assert.equal(
		(await fetch(base + '/murid', { headers: { cookie: operatorAuth.cookie }, redirect: 'manual' }))
			.status,
		200
	);
	for (const route of ['/pengguna', '/api/pengguna/akun-massal?role=operator']) {
		const denied = await fetch(base + route, { headers: { cookie: operatorAuth.cookie }, redirect: 'manual' });
		assert.ok([303, 403].includes(denied.status));
		if (denied.status === 303) assert.match(denied.headers.get('location'), /^\/forbidden\?/);
	}
	check('Operator bisa operasional sekolah tetapi tidak mengelola pengguna');
	for (const role of ['operator', 'tim_dapur', 'tim_keamanan']) {
		const response = await fetch(`${base}/api/pengguna/akun-massal?role=${role}`, {
			headers: { cookie: auth.cookie }
		});
		assert.equal(response.status, 200);
		const preview = await response.json();
		const candidate = preview.candidates.find((c) => c.pegawaiId === employees[`${role}_bulk`]);
		assert.ok(candidate);
		assert.equal(candidate.status, 'ready');
		assert.deepEqual(candidate.studentIds, []);
		assert.deepEqual(candidate.mataPelajaranIds, []);
		const created = await fetch(base + '/api/pengguna/akun-massal', {
			method: 'POST',
			headers: { cookie: auth.cookie, origin: base, 'content-type': 'application/json' },
			body: JSON.stringify({
				role,
				selected: [{ pegawaiId: candidate.pegawaiId, fingerprint: candidate.fingerprint }],
				reviewedIds: [],
				confirm: true
			})
		});
		assert.equal(created.status, 200);
		const results = await created.json();
		assert.equal(results.created[0].role, role);
		const user = await row('SELECT * FROM auth_user WHERE pegawai_id=?', [candidate.pegawaiId]);
		assert.equal(user.type, role === 'operator' ? 'user' : role);
		assert.equal(user.jabatan_akses, role === 'operator' ? 'operator' : null);
		assert.equal(user.must_change_password, 1);
		const audit = JSON.stringify(
			(
				await db.execute({
					sql: "SELECT * FROM audit_log WHERE entity_type='pengguna' AND entity_id=?",
					args: [String(user.id)]
				})
			).rows
		);
		assert.ok(!audit.includes(results.created[0].password));
	}
	check(
		'Akun massal Operator/Tim Dapur/Tim Keamanan berhasil tanpa binaan; sandi tidak masuk audit'
	);
	const security = await row('SELECT * FROM auth_user WHERE pegawai_id=?', [employees.tim_keamanan]);
	await db.execute({ sql: 'UPDATE auth_user SET must_change_password=0 WHERE id=?', args: [security.id] });
	const securityAuth = await session(security.id, school);
	for (const route of ['/administrasi/absensi/scan', '/pengaturan/profil']) {
		assert.equal((await fetch(base + route, { headers: { cookie: securityAuth.cookie }, redirect: 'manual' })).status, 200, route);
	}
	const scannerData = await fetch(base + '/administrasi/absensi/scan/__data.json', { headers: { cookie: securityAuth.cookie } });
	assert.equal(scannerData.status, 200);
	const scannerText = await scannerData.text();
	assert.ok(scannerText.includes('pulang_ke_rumah'));
	assert.ok(scannerText.includes('kembali_ke_sekolah'));
	assert.ok(scannerText.includes('available'));
	assert.ok(!scannerText.includes('makan_pagi'));
	for (const route of ['/murid', '/pengguna', '/cetak', '/administrasi/absensi/kegiatan', '/administrasi/absensi/monitoring', '/administrasi/absensi/monitoring-kelas', '/api/murid-photo/1', '/api/administrasi/absensi/kegiatan/rekap/export']) {
		const denied = await fetch(base + route, { headers: { cookie: securityAuth.cookie }, redirect: 'manual' });
		assert.ok([303, 403].includes(denied.status), `${route}: ${denied.status}`);
		if (denied.status === 303) assert.match(denied.headers.get('location'), /^\/forbidden\?/);
	}
	const originalCounts = await row('SELECT (SELECT count(*) FROM absensi_kegiatan) activities, (SELECT count(*) FROM absensi_harian) daily, (SELECT count(*) FROM izin_pulang_murid) permits');
	for (const mode of ['sekolah', 'kegiatan', 'pulang']) {
		const denied = await fetch(base + '/api/administrasi/absensi/scan', {
			method: 'POST', headers: { cookie: securityAuth.cookie, origin: base, 'content-type': 'application/json' },
			body: JSON.stringify({ mode, token: 'qa-forged-token', kegiatanId: 1 })
		});
		assert.equal(denied.status, 403, mode);
	}
	const forbiddenPermit = new FormData();
	forbiddenPermit.set('muridId', '1');
	const deniedPermit = await fetch(base + '/administrasi/absensi/kegiatan/rekap?/saveIzinPulang', {
		method: 'POST', headers: { cookie: securityAuth.cookie, origin: base }, body: forbiddenPermit, redirect: 'manual'
	});
	assert.ok([303, 403].includes(deniedPermit.status));
	assert.deepEqual(await row('SELECT (SELECT count(*) FROM absensi_kegiatan) activities, (SELECT count(*) FROM absensi_harian) daily, (SELECT count(*) FROM izin_pulang_murid) permits'), originalCounts);
	check('Akun keamanan hanya mendapat persiapan perjalanan dan profil sendiri; API kegiatan dan pengelolaan izin ditolak tanpa perubahan data');
	for (const mode of ['pegawai', 'makan', 'asrama', 'pulang', 'unknown']) {
		const denied = await fetch(base + '/api/administrasi/absensi/scan', {
			method: 'POST', headers: { cookie: auth.cookie, origin: base, 'content-type': 'application/json' },
			body: JSON.stringify({ mode, token: 'qa-forged-token' })
		});
		assert.equal(denied.status, 400, mode);
	}
	check('Endpoint lama menolak mode baru yang belum aktif, tanpa mengalihkannya ke absensi harian');
	assert.equal((await action('update_user', {
		id: security.id, username: security.username, type: 'tim_keamanan', password: '',
		jabatanAkses: '', kelasIds: '[]', mataPelajaranIds: '[]', updatedAt: security.updated_at
	})).status, 200);
	check('Role keamanan dapat diedit tanpa penugasan akademik');
	const adminScanner = await fetch(base + '/administrasi/absensi/scan', { headers: { cookie: auth.cookie } });
	assert.equal(adminScanner.status, 200);
	const canonicalPrayer = await row("SELECT * FROM kegiatan_absensi WHERE sekolah_id=? AND kode='sholat_zuhur'", [school]);
	const aliasPrayer = await row("SELECT * FROM kegiatan_absensi WHERE sekolah_id=? AND kode='sholat_dzuhur'", [school]);
	assert.ok(canonicalPrayer || aliasPrayer);
	if (canonicalPrayer && !aliasPrayer) {
		await db.execute({ sql: "UPDATE kegiatan_absensi SET kode='sholat_dzuhur' WHERE id=?", args: [canonicalPrayer.id] });
		const qrBefore = await row('SELECT count(*) n FROM qr_murid');
		assert.equal((await fetch(base + '/administrasi/absensi/scan', { headers: { cookie: auth.cookie } })).status, 200);
		assert.equal((await row("SELECT count(*) n FROM kegiatan_absensi WHERE sekolah_id=? AND kode IN ('sholat_zuhur','sholat_dzuhur')", [school])).n, 1);
		assert.equal((await row("SELECT id FROM kegiatan_absensi WHERE sekolah_id=? AND kode='sholat_dzuhur'", [school])).id, canonicalPrayer.id);
		assert.deepEqual(await row('SELECT count(*) n FROM qr_murid'), qrBefore);
		await db.execute({ sql: "UPDATE kegiatan_absensi SET kode='sholat_zuhur' WHERE id=?", args: [canonicalPrayer.id] });
		check('Seeder mengenali alias Zuhur tanpa ID kegiatan baru atau perubahan QR');
	}
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (err) => errors.push(err.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: auth.token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base }
	);
	await page.setViewport({ width: 1366, height: 900 });
	await page.goto(base + '/pengguna?role=operator&q=qa-role-operator', {
		waitUntil: 'networkidle0'
	});
	assert.ok((await page.$eval('table', (table) => table.innerText)).includes('Operator'));
	assert.ok(!(await page.$eval('table', (table) => table.innerText)).includes('qa-role-tim_dapur'));
	await page.click('button[title="Edit pengguna"]');
	await page.waitForFunction(
		() => document.querySelector('#user-jabatan-akses')?.value === 'operator'
	);
	assert.equal(await page.$eval('#edit-user-modal select', (node) => node.value), 'operator');
	assert.equal(await page.$eval('#user-jabatan-akses', (node) => node.disabled), true);
	await page.screenshot({ path: path.join(folder, 'operator-desktop.png'), fullPage: true });
	await page.setViewport({ width: 390, height: 844 });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	await page.screenshot({ path: path.join(folder, 'operator-mobile.png'), fullPage: true });
	await page.select('#edit-user-modal select', 'user');
	assert.equal(await page.$eval('#user-jabatan-akses', (node) => node.value), '');
	await page.select('#edit-user-modal select', 'operator');
	assert.equal(await page.$eval('#user-jabatan-akses', (node) => node.value), 'operator');
	await page.goto(base + '/pengguna?role=tim_dapur&q=qa-role-tim_dapur', {
		waitUntil: 'networkidle0'
	});
	assert.ok((await page.$eval('table', (table) => table.innerText)).includes('Tim Dapur'));
	check('Filter dan edit menampilkan role benar; pergantian role dan desktop/HP berfungsi');
	await page.goto(base + '/pengguna?role=tim_keamanan&q=qa-role-tim_keamanan', { waitUntil: 'networkidle0' });
	assert.ok((await page.$eval('table', (table) => table.innerText)).includes('Tim Keamanan'));
	assert.ok(!(await page.$eval('table', (table) => table.innerText)).includes('qa-role-tim_dapur'));
	await page.click('button[title="Edit pengguna"]');
	await page.waitForFunction(() => document.querySelector('#edit-user-modal select')?.value === 'tim_keamanan');
	assert.equal(await page.$('#user-jabatan-akses'), null);
	assert.equal(await page.$('#user-kelas-options'), null);
	assert.equal(await page.$('#user-mapel-options'), null);
	for (const width of [1440, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	}
	await page.screenshot({ path: path.join(folder, 'keamanan-mobile.png'), fullPage: true });
	await page.setViewport({ width: 1440, height: 900 });
	await page.screenshot({ path: path.join(folder, 'keamanan-desktop.png'), fullPage: true });
	check('Filter dan modal role Tim Keamanan benar di desktop, tablet dan HP tanpa kolom mapel/kelas/jabatan');
	const securityUiAuth = await session(security.id, school);
	await page.setCookie({ name: 'rapkumer-session', value: securityUiAuth.token, url: base });
	await page.goto(base + '/administrasi/absensi/scan', { waitUntil: 'networkidle0' });
	assert.deepEqual(await page.$eval('select[aria-label="Mode scan"]', (el) => [...el.options].filter((option) => option.value).map((option) => option.value)), ['pulang']);
	await page.select('select[aria-label="Mode scan"]', 'pulang');
	assert.equal(await page.$eval('select[aria-label="Kegiatan absensi"]', (el) => el.disabled), false);
	assert.equal(await page.$$eval('button', (buttons) => buttons.find((button) => button.textContent.includes('Mulai Scan')).disabled), true);
	assert.equal(await page.$eval('body', (el) => el.textContent.includes('Scan pulang dan kembali belum tersedia.')), false);
	assert.equal(await page.$('a[href="/administrasi/absensi/kegiatan"]'), null);
	assert.equal((await fetch(base + '/api/administrasi/absensi/scan/kelas', { headers: { cookie: securityUiAuth.cookie } })).status, 403);
	await page.setViewport({ width: 390, height: 844 });
	await page.screenshot({ path: path.join(folder, 'keamanan-scan-available.png'), fullPage: true });
	check('Tim Keamanan hanya melihat mode Pulang dan tidak mendapat akses scan kelas');
	assert.deepEqual(errors, []);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	check('Tidak ada error browser; SQLite dan foreign key sehat');
	await writeFile(path.join(folder, 'result.json'), JSON.stringify({ checks, database }, null, 2));
	console.log('QA_RESULT', folder);
} finally {
	await writeFile(path.join(folder, 'server.log'), output);
	if (browser) await browser.close();
	if (child && child.exitCode == null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
	db.close();
}
