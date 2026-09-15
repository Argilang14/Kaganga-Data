import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const port = 5153;
const base = `http://127.0.0.1:${port}`;
const occupied = await new Promise(resolve => {
	const socket = net.connect(port, '127.0.0.1');
	socket.once('connect', () => { socket.destroy(); resolve(true); });
	socket.once('error', () => { socket.destroy(); resolve(false); });
});
assert.equal(occupied, false, 'QA port occupied; existing servers will not be stopped.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-print-navigation-'));
const databasePath = path.join(directory, 'runtime.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try { await source.execute(`VACUUM INTO '${databasePath.replaceAll('\\', '/').replaceAll("'", "''")}'`); }
finally { source.close(); }
console.log('Database copy:', databasePath);
const db = createClient({ url: `file:${databasePath}` });
const first = (await db.execute('SELECT k.* FROM kelas k JOIN semester s ON s.id=k.semester_id JOIN tahun_ajaran t ON t.id=k.tahun_ajaran_id WHERE s.is_aktif=1 AND t.is_aktif=1 ORDER BY k.id LIMIT 1')).rows[0];
assert.ok(first, 'Requires an existing active class.');
const seed = (await db.execute('SELECT * FROM auth_user LIMIT 1')).rows[0];
const columns = (await db.execute('PRAGMA table_info(auth_user)')).rows.map(row => String(row.name));
async function account(type, permissions) {
	const username = `qa-print-${randomBytes(8).toString('hex')}`;
	const values = { ...seed, id: null, username, username_normalized: username, type, permissions: JSON.stringify(permissions), sekolah_id: first.sekolah_id, kelas_id: first.id, must_change_password: 0 };
	const inserted = await db.execute({ sql: `INSERT INTO auth_user (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, args: columns.map(c => values[c] ?? null) });
	const token = randomBytes(32).toString('base64url');
	await db.execute({ sql: 'INSERT INTO auth_session (user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?)', args: [Number(inserted.lastInsertRowid), createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), new Date().toISOString()] });
	return `rapkumer-session=${token}; active-sekolah-id=${first.sekolah_id}; active-kelas-id=${first.id}`;
}
const cookie = await account('admin', []);
const denied = await account('user', []);
let log = '';
const server = spawn(process.execPath, ['build/index.js'], { windowsHide: true, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ORIGIN: base, DB_URL: `file:${databasePath}`, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', chunk => { log += chunk; });
server.stderr.on('data', chunk => { log += chunk; });
const request = (endpoint, session = cookie, body) => fetch(base + endpoint, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { Origin: base, Cookie: session, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
let browser;
try {
	let ready = false;
	for (let i = 0; i < 120; i++) {
		try { ready = (await fetch(base + '/login')).status === 200; } catch {}
		if (ready) break;
		await new Promise(resolve => setTimeout(resolve, 250));
	}
	assert.ok(ready, log);
	browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
	const page = await browser.newPage();
	await page.setExtraHTTPHeaders({ Cookie: cookie });
	const errors = [];
	page.on('pageerror', e => errors.push(String(e)));
	const student = (await db.execute({ sql: 'SELECT id FROM murid WHERE kelas_id=? LIMIT 1', args: [first.id] })).rows[0];
	assert.ok(student, 'Requires a student for PDF regression tests.');
	for (const format of ['sr', 'default']) {
		await db.execute({ sql: 'UPDATE sekolah SET jenjang_pendidikan=?,jenjang_variant=? WHERE id=?', args: [format === 'sr' ? 'srt' : 'sd', format === 'sr' ? 'srt' : null, first.sekolah_id] });
		await page.goto(base + '/cetak-raport', { waitUntil: 'networkidle0' });
		const options = await page.$$eval('option', rows => rows.map(row => row.textContent));
		assert.ok(options.includes('Rapor'), `Rapor option ${format}`);
		assert.equal(options.includes('Masa Persiapan - STTM'), format === 'sr');
		assert.equal(options.includes('Jadwal Pelajaran'), false);
		const tokenResponse = await request('/api/pdf/token', cookie, { docType: 'cover', muridId: Number(student.id), kelasId: Number(first.id), pdfVariant: format === 'sr' ? 'default' : 'sr' });
		assert.equal(tokenResponse.status, 200);
		const { token, slug } = await tokenResponse.json();
		const singlePdf = await request(`/cetak/pdf/${slug}/${token}`);
		assert.equal(singlePdf.status, 200, await singlePdf.clone().text());
		assert.ok(singlePdf.headers.get('content-disposition').includes('Cover Raport'));
		await writeFile(path.join(directory, `cover-${format}.pdf`), Buffer.from(await singlePdf.arrayBuffer()));
		const bulkPdf = await request('/api/pdf/bulk', cookie, { docType: 'cover', muridIds: [Number(student.id)], kelasId: Number(first.id), pdfVariant: format === 'sr' ? 'default' : 'sr' });
		assert.equal(bulkPdf.status, 200, await bulkPdf.clone().text());
		await writeFile(path.join(directory, `cover-bulk-${format}.pdf`), Buffer.from(await bulkPdf.arrayBuffer()));
		await page.screenshot({ path: path.join(directory, `raport-${format}.png`), fullPage: true });
		await page.goto(base + '/cetak', { waitUntil: 'networkidle0' });
		const general = await page.$$eval('option', rows => rows.map(row => row.textContent));
		for (const label of ['Kartu Absensi Murid', 'Jadwal Pelajaran', 'Kalender Pendidikan', 'Jurnal Mengajar']) assert.ok(general.includes(label), `${format}: ${label}`);
		assert.equal(general.includes('Rapor'), false);
		for (const width of [1440, 390]) {
			await page.setViewport({ width, height: 1000 });
			await page.screenshot({ path: path.join(directory, `dokumen-${format}-${width}.png`), fullPage: true });
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Overflow ${format} ${width}`);
		}
	}
	await db.execute({ sql: 'UPDATE sekolah SET jenjang_pendidikan=?,jenjang_variant=? WHERE id=?', args: ['unknown', null, first.sekolah_id] });
	assert.equal((await request('/api/pdf/token', cookie, { docType: 'cover', muridId: Number(student.id) })).status, 400);
	await page.goto(base + '/cetak-raport', { waitUntil: 'networkidle0' });
	assert.ok((await page.$eval('body', el => el.textContent)).includes('Jenis sekolah belum dikenali'));
	await db.execute({ sql: 'UPDATE sekolah SET jenjang_pendidikan=?,jenjang_variant=? WHERE id=?', args: ['srt', 'srt', first.sekolah_id] });
	const legacy = await request('/cetak-sr?sr=1');
	assert.equal(legacy.status, 303);
	assert.equal(legacy.headers.get('location'), '/cetak-raport');
	const generalLegacy = await request('/cetak-sr?dokumen=jadwal-pelajaran');
	assert.equal(generalLegacy.headers.get('location'), '/cetak?dokumen=jadwal-pelajaran');
	await page.goto(base + '/cetak?dokumen=jadwal-pelajaran', { waitUntil: 'networkidle0' });
	assert.ok((await page.$eval('body', el => el.textContent)).includes('Orientasi A4'));
	const guestPath = '/cetak/buku-tamu?tanggal_mulai=2026-09-01&tanggal_selesai=2026-09-12&q=QA';
	await page.goto(base + guestPath, { waitUntil: 'networkidle0' });
	assert.equal(await page.$eval('select', el => el.value), 'buku-tamu');
	assert.equal(await page.$eval('input[type="date"]', el => el.value), '2026-09-01');
	const tabsBefore = (await browser.pages()).length;
	await page.click('form button');
	await page.waitForSelector('iframe[title="Preview PDF Buku Tamu Digital"]');
	assert.equal((await browser.pages()).length, tabsBefore);
	const guestFilename = await page.$eval('a[download]', el => el.download);
	assert.equal(guestFilename, 'Buku Tamu Digital - 2026-09-01 - 2026-09-12.pdf');
	const downloadSession = await page.createCDPSession();
	await downloadSession.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
	await page.click('a[download]');
	let downloaded;
	for (let i = 0; i < 40; i++) {
		try { downloaded = await readFile(path.join(directory, guestFilename)); break; } catch {}
		await new Promise(resolve => setTimeout(resolve, 250));
	}
	assert.ok(downloaded?.subarray(0, 5).toString() === '%PDF-', 'Named browser download is a valid PDF.');
	const pdfHref = '/api/buku-tamu/print?tanggal_mulai=2026-09-01&tanggal_selesai=2026-09-12&q=QA';
	await page.screenshot({ path: path.join(directory, 'guest-mobile.png'), fullPage: true });
	assert.ok([303, 403].includes((await request(guestPath, denied)).status));
	const pdf = await request(pdfHref);
	assert.equal(pdf.status, 200, await pdf.clone().text());
	assert.ok(pdf.headers.get('content-type')?.includes('application/pdf'));
	await writeFile(path.join(directory, 'guest.pdf'), Buffer.from(await pdf.arrayBuffer()));
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(base + '/pegawai', { waitUntil: 'networkidle0' });
	await page.click('summary[aria-label="Menu data Excel pegawai"]');
	await page.waitForSelector('details[open] a[href="/api/pegawai/template"]', { visible: true });
	await page.screenshot({ path: path.join(directory, 'pegawai-dropdown-desktop.png'), fullPage: true });
	await page.click('details[open] button');
	assert.equal(await page.$eval('details.dropdown', el => el.open), false);
	assert.equal(await page.$$eval('dialog[open]', els => els.some(el => el.textContent.includes('Import Data Pegawai'))), true);
	await page.$$eval('dialog[open]', els => els.forEach(el => el.close()));
	const add = await page.$$('button');
	for (const button of add) {
		if ((await button.evaluate(el => el.textContent)).trim() === 'Tambah Pegawai') { await button.click(); break; }
	}
	assert.equal(await page.$$eval('dialog[open]', els => els.some(el => el.textContent.includes('Formulir Tambah Pegawai Manual'))), true);
	await page.$$eval('dialog[open]', els => els.forEach(el => el.close()));
	await page.setViewport({ width: 390, height: 1000 });
	await page.click('summary[aria-label="Menu data Excel pegawai"]');
	await page.waitForSelector('details[open] a[href="/api/pegawai/export"]', { visible: true });
	await page.screenshot({ path: path.join(directory, 'pegawai-dropdown-mobile.png'), fullPage: true });
	const bounds = await page.$eval('details[open] ul', el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right }));
	assert.ok(bounds.left >= 0 && bounds.right <= 390, 'Dropdown fits mobile viewport.');
	for (const endpoint of ['/api/pegawai/template', '/api/pegawai/export']) {
		const excel = await request(endpoint);
		assert.equal(excel.status, 200);
		assert.ok(excel.headers.get('content-type')?.includes('spreadsheet'));
		await excel.arrayBuffer();
	}
	const employee = (await db.execute({ sql: "SELECT id FROM pegawai WHERE sekolah_id=? AND status='aktif' LIMIT 1", args: [first.sekolah_id] })).rows[0];
	assert.ok(employee);
	await db.execute({ sql: 'UPDATE pegawai SET jenis=? WHERE id=?', args: ['kebersihan', employee.id] });
	await request('/presensi-pegawai');
	await db.execute({ sql: 'UPDATE presensi_settings SET presensi_pegawai_enabled=1 WHERE sekolah_id=?', args: [first.sekolah_id] });
	const attendancePath = '/presensi-pegawai?mode=harian&tanggal=2026-09-14&jenis=kebersihan';
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(base + attendancePath, { waitUntil: 'networkidle0' });
	const categories = await page.$$eval('tbody tr td:nth-child(3)', els => els.map(el => el.textContent));
	assert.ok(categories.length && categories.every(value => value === 'Kebersihan'));
	await page.screenshot({ path: path.join(directory, 'presensi-harian-desktop.png'), fullPage: true });
	const attendanceForm = `presensi-${employee.id}`;
	await page.$eval(`input[form="${attendanceForm}"][name="waktuMasuk"]`, el => { el.value = '07:15'; el.dispatchEvent(new Event('input', { bubbles: true })); });
	await page.$eval(`input[form="${attendanceForm}"][name="waktuPulang"]`, el => { el.value = '15:30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
	await page.$eval(`input[form="${attendanceForm}"][name="keterangan"]`, el => { el.value = 'QA attendance'; el.dispatchEvent(new Event('input', { bubbles: true })); });
	await page.click(`button[form="${attendanceForm}"][title="Simpan presensi"]`);
	await page.waitForFunction(() => document.body.textContent.includes('Presensi pegawai berhasil disimpan.'));
	const saved = (await db.execute({ sql: 'SELECT * FROM presensi_pegawai WHERE sekolah_id=? AND pegawai_id=? AND tanggal=?', args: [first.sekolah_id, employee.id, '2026-09-14'] })).rows[0];
	assert.equal(saved.waktu_masuk, '07:15');
	assert.equal(saved.waktu_pulang, '15:30');
	assert.equal(saved.keterangan, 'QA attendance');
	assert.ok(page.url().includes('jenis=kebersihan'));
	await page.reload({ waitUntil: 'networkidle0' });
	assert.equal(await page.$eval(`input[form="${attendanceForm}"][name="waktuMasuk"]`, el => el.value), '07:15');
	await page.setViewport({ width: 390, height: 1000 });
	await new Promise(resolve => setTimeout(resolve, 500));
	await page.screenshot({ path: path.join(directory, 'presensi-harian-mobile.png'), fullPage: true });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
	await page.click(`button[form="${attendanceForm}"][title="Kosongkan presensi"]`);
	await page.waitForFunction(() => document.body.textContent.includes('Data presensi dikosongkan.'));
	assert.equal((await db.execute({ sql: 'SELECT id FROM presensi_pegawai WHERE pegawai_id=? AND tanggal=?', args: [employee.id, '2026-09-14'] })).rows.length, 0);
	await page.goto(base + '/presensi-pegawai?mode=bulanan&bulan=9&tahun=2026&jenis=kebersihan', { waitUntil: 'networkidle0' });
	assert.equal(await page.$eval('select[name="jenis"]', el => el.value), 'kebersihan');
	assert.ok((await page.$eval('body', el => el.textContent)).includes('Jenis Pegawai'));
	await page.screenshot({ path: path.join(directory, 'presensi-bulanan-mobile.png'), fullPage: true });
	for (const params of ['tanggal=2026-09-14', 'bulan=9&tahun=2026']) {
		const attendancePdf = await request(`/api/pdf/presensi-pegawai?${params}&jenis=kebersihan`);
		assert.equal(attendancePdf.status, 200, await attendancePdf.clone().text());
		await attendancePdf.arrayBuffer();
	}
	assert.equal(errors.length, 0, errors.join('\n'));
	assert.equal((await db.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	console.log('PASS: print navigation, employee toolbar, attendance filter/save/reload/delete/PDF, desktop/mobile, SQLite.');
} finally {
	await browser?.close();
	if (server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
	db.close();
	await writeFile(path.join(directory, 'server.log'), log);
	console.log('QA artifacts:', directory);
}
