import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const project = process.cwd();
const port = Number(process.env.ATTENDANCE_FILTER_QA_PORT || 5167);
assert.ok(![5152, 1206].includes(port));
const base = `http://127.0.0.1:${port}`;
const route = '/administrasi/absensi/kegiatan';
const date = '2026-08-03';
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'attendance-filters-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const checks = [];
let child,
	browser,
	page,
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
try {
	const original = await row('SELECT * FROM murid LIMIT 1');
	assert.ok(original);
	const school = Number(original.sekolah_id);
	const semester = Number(original.semester_id);
	const oldClass = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [oldClass.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [semester, oldClass.tahun_ajaran_id]
	});
	const classIds = [];
	for (const name of ['QA Filter X.A', 'QA Filter X.B']) {
		classIds.push(
			await insert(
				'kelas',
				clone(oldClass, {
					nama: name,
					wali_kelas_id: null,
					wali_asuh_id: null,
					wali_asrama_id: null,
					dapodik_rombongan_belajar_id: null
				})
			)
		);
	}
	const students = [];
	for (let i = 0; i < 2; i++) {
		students.push(
			await insert(
				'murid',
				clone(original, {
					nama: `QA Filter Murid ${i + 1}`,
					kelas_id: classIds[1],
					nis: `QA-FILTER-${i}`,
					nisn: `999770000${i}`,
					qr_token: `qa-filter-${randomBytes(8).toString('hex')}`,
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null
				})
			)
		);
	}
	const now = new Date().toISOString();
	const activity = await insert('kegiatan_absensi', {
		sekolah_id: school,
		kode: 'qa_filter_sekolah',
		nama: 'QA Filter Masuk Sekolah',
		kategori: 'sekolah',
		akses_edit: 'sekolah',
		aktif: 1,
		auto_alfa: 0,
		masuk_rapor: 0,
		urutan: 999,
		created_at: now,
		updated_at: now
	});
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const adminId = await insert(
		'auth_user',
		clone(admin, {
			username: 'qa-filter-admin',
			username_normalized: 'qa-filter-admin',
			sekolah_id: school,
			pegawai_id: null,
			kelas_id: null,
			mata_pelajaran_id: null,
			jabatan_akses: null,
			must_change_password: 0
		})
	);
	const token = randomBytes(32).toString('base64url');
	await insert('auth_session', {
		user_id: adminId,
		token_hash: createHash('sha256').update(token).digest('hex'),
		expires_at: new Date(Date.now() + 1200000).toISOString(),
		created_at: now,
		updated_at: now
	});
	const expected = `${route}?tanggal=${date}&kelas_id=${classIds[1]}&kegiatan_id=${activity}`;
	const cookie = `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${classIds[0]}`;
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
	assert.ok(ready);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewport({ width: 1366, height: 900 });
	await page.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base },
		{ name: 'active-kelas-id', value: String(classIds[0]), url: base }
	);
	await page.goto(base + expected, { waitUntil: 'networkidle0' });
	async function assertFilters() {
		const url = new URL(page.url());
		assert.equal(url.searchParams.get('tanggal'), date);
		assert.equal(url.searchParams.get('kelas_id'), String(classIds[1]));
		assert.equal(url.searchParams.get('kegiatan_id'), String(activity));
		assert.equal(
			await page.$eval('input[aria-label="Tanggal absensi kegiatan"]', (el) => el.value),
			date
		);
		assert.equal(
			await page.$eval('select[aria-label="Kelas absensi kegiatan"]', (el) => el.value),
			String(classIds[1])
		);
		assert.equal(
			await page.$eval('select[aria-label="Kegiatan absensi"]', (el) => el.value),
			String(activity)
		);
	}
	const attendance = (muridId) =>
		row('SELECT * FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=? AND tanggal=?', [
			muridId,
			activity,
			date
		]);
	async function waitStatus(muridId, status) {
		await page.waitForFunction(
			(id, text) => {
				const form = document.getElementById(`manual-kegiatan-${id}`);
				return form?.closest('tr')?.querySelector('.badge')?.textContent.trim() === text;
			},
			{},
			muridId,
			status
		);
	}
	await assertFilters();
	await page.select(`#manual-kegiatan-${students[0]} select[name="status"]`, 'sakit');
	await page.type(`input[form="manual-kegiatan-${students[0]}"]`, 'QA sakit tanggal lama');
	const saved = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/updateManual')
	);
	await page.click(`button[type="submit"][form="manual-kegiatan-${students[0]}"]`);
	assert.equal((await (await saved).json()).status, 200);
	await waitStatus(students[0], 'Sakit');
	await assertFilters();
	assert.equal((await attendance(students[0])).kelas_id, classIds[1]);
	assert.equal((await attendance(students[0])).tanggal, date);
	check(
		'Simpan satu murid tetap pada tanggal 3 Agustus dan kelas/kegiatan pilihan, bukan kelas cookie'
	);
	await page.select('form[action*="bulkUpdateManual"] select[name="status"]', 'hadir');
	const bulk = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().includes('/bulkUpdateManual')
	);
	await page.click('form[action*="bulkUpdateManual"] button[type="submit"]');
	assert.equal((await (await bulk).json()).status, 200);
	await waitStatus(students[1], 'Hadir');
	await assertFilters();
	assert.equal((await attendance(students[0])).status, 'sakit');
	assert.equal((await attendance(students[1])).status, 'hadir');
	check('Simpan massal mempertahankan filter dan hanya mengisi yang belum tercatat');
	await page.reload({ waitUntil: 'networkidle0' });
	await assertFilters();
	await waitStatus(students[0], 'Sakit');
	await waitStatus(students[1], 'Hadir');
	check('Reload mempertahankan pilihan dan hasil tersimpan');
	await page.evaluate((id) => {
		document
			.getElementById(`manual-kegiatan-${id}`)
			.closest('tr')
			.querySelector('button[title="Hapus status absensi"]')
			.click();
	}, students[0]);
	await page.waitForSelector('dialog[open] textarea');
	await page.type('dialog[open] textarea', 'QA koreksi tanggal lama');
	const cleared = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/clearStatus')
	);
	await page.click('dialog[open] button[type="submit"]');
	assert.equal((await (await cleared).json()).status, 200);
	await waitStatus(students[0], 'Belum absen');
	await assertFilters();
	assert.equal(await attendance(students[0]), undefined);
	check('Hapus status hanya menghapus murid pilihan dan filter tetap');
	await page.screenshot({ path: path.join(folder, 'after-save-desktop.png'), fullPage: true });
	await page.setViewport({ width: 390, height: 844 });
	await page.$eval('#my-drawer-2', (el) => {
		el.checked = false;
		el.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await page.waitForFunction(
		() => getComputedStyle(document.querySelector('.drawer-side')).visibility === 'hidden'
	);
	await page.screenshot({ path: path.join(folder, 'after-save-mobile.png'), fullPage: true });
	const native = await browser.newPage();
	await native.setJavaScriptEnabled(false);
	await native.goto(base + expected, { waitUntil: 'networkidle0' });
	await native.select(`#manual-kegiatan-${students[0]} select[name="status"]`, 'izin');
	await Promise.all([
		native.waitForNavigation({ waitUntil: 'networkidle0' }),
		native.click(`button[type="submit"][form="manual-kegiatan-${students[0]}"]`)
	]);
	const nativeUrl = new URL(native.url());
	assert.equal(nativeUrl.searchParams.get('tanggal'), date);
	assert.equal(nativeUrl.searchParams.get('kelas_id'), String(classIds[1]));
	assert.equal(nativeUrl.searchParams.get('kegiatan_id'), String(activity));
	assert.equal(
		await native.$eval('input[aria-label="Tanggal absensi kegiatan"]', (el) => el.value),
		date
	);
	assert.equal((await attendance(students[0])).status, 'izin');
	check('Tanpa JavaScript, simpan native juga tidak kembali ke tanggal/kelas default');
	const invalid = new FormData();
	for (const [key, value] of Object.entries({
		tanggal: date,
		kelasId: classIds[0],
		semesterId: semester,
		kegiatanId: activity,
		muridId: students[0],
		status: 'alfa'
	}))
		invalid.set(key, String(value));
	const denied = await fetch(
		base + route + '?/updateManual&' + new URL(base + expected).searchParams,
		{
			method: 'POST',
			headers: { origin: base, cookie, 'x-sveltekit-action': 'true' },
			body: invalid
		}
	);
	assert.equal((await denied.json()).status, 404);
	assert.equal((await attendance(students[0])).status, 'izin');
	assert.deepEqual(errors, []);
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	check('Murid beda kelas ditolak; browser dan SQLite sehat');
	await writeFile(path.join(folder, 'result.json'), JSON.stringify({ checks, database }, null, 2));
	console.log('QA_RESULT', folder);
} catch (cause) {
	if (page) {
		await page.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true });
		await writeFile(path.join(folder, 'failure.html'), await page.content());
	}
	console.log('QA_FAILED', folder);
	throw cause;
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
