import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';
import { travelLocalTime } from '../src/lib/attendance-travel.ts';

const project = process.cwd(), port = Number(process.env.TRAVEL_QA_PORT || 5181);
assert.ok(![1206, 5152].includes(port));
const base = `http://127.0.0.1:${port}`;
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'attendance-travel-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
const db = createClient({ url: `file:${database}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const count = async (table, where, args = []) => Number((await row(`SELECT count(*) n FROM ${table} WHERE ${where}`, args)).n);
async function insert(table, values) {
	const keys = Object.keys(values);
	return Number((await db.execute({ sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, args: Object.values(values) })).lastInsertRowid);
}
function clone(original, changes) { const next = { ...original, ...changes }; delete next.id; return next; }
const now = new Date().toISOString(), today = travelLocalTime().date;
const yesterday = travelLocalTime(new Date(Date.now() - 86400000)).date;
const tomorrow = travelLocalTime(new Date(Date.now() + 86400000)).date;
const checks = [], errors = [];
const pass = (name) => { checks.push(name); console.log('PASS', name); };
let child, browser, output = '';
try {
	await db.execute('PRAGMA busy_timeout=10000');
	const original = await row('SELECT * FROM murid LIMIT 1');
	assert.ok(original);
	const school = Number(original.sekolah_id), semester = Number(original.semester_id);
	const kelas = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	await db.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?', args: [kelas.tahun_ajaran_id, school] });
	await db.execute({ sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?', args: [semester, kelas.tahun_ajaran_id] });
	const classId = await insert('kelas', clone(kelas, { nama: 'QA Perjalanan', wali_kelas_id: null, wali_asuh_id: null, wali_asrama_id: null, dapodik_rombongan_belajar_id: null }));
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	const employeeId = await insert('pegawai', clone(employee, { nama: 'QA Keamanan', jenis: 'keamanan', status: 'aktif', nip: 'QA-TRAVEL', kode_pegawai: 'QA-TRAVEL', nik: null, nuptk: null, nomor_induk_pppk: null, dapodik_ptk_id: null, foto: null }));
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const accounts = {};
	for (const [name, type] of [['admin', 'admin'], ['security', 'tim_keamanan'], ['guru', 'user'], ['guru2', 'user'], ['dapur', 'tim_dapur'], ['wali', 'wali_asrama']]) {
		const staffId = ['guru', 'guru2', 'wali'].includes(name) ? await insert('pegawai', clone(employee, { nama: `QA ${name === 'guru' ? 'Guru A' : name === 'guru2' ? 'Guru B' : 'Wali Asrama'}`, jenis: type === 'user' ? 'guru' : 'wali_asrama', status: 'aktif', nip: `QA-TRAVEL-${name}`, kode_pegawai: `QA-TRAVEL-${name}`, nik: null, nuptk: null, nomor_induk_pppk: null, dapodik_ptk_id: null, foto: null })) : name === 'security' ? employeeId : null;
		const id = await insert('auth_user', clone(admin, { username: `qa-travel-${name}`, username_normalized: `qa-travel-${name}`, type, sekolah_id: school, jabatan_akses: null, pegawai_id: staffId, kelas_id: type === 'user' ? classId : null, mata_pelajaran_id: null, permissions: '[]', must_change_password: 0 }));
		const token = randomBytes(32).toString('base64url');
		await insert('auth_session', { user_id: id, token_hash: createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + 1800000).toISOString(), created_at: now, updated_at: now });
		accounts[name] = { id, token, cookie: `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${classId}` };
	}
	const students = [], tokens = [];
	for (let i = 0; i < 7; i++) {
		const id = await insert('murid', clone(original, { nama: `QA Perjalanan Murid ${i}`, nis: `QA-TRAVEL-${i}`, nisn: `QA-TRAVEL-${i}`, kelas_id: classId, qr_token: randomBytes(16).toString('hex'), dapodik_peserta_didik_id: null, dapodik_anggota_rombel_id: null }));
		// Keep the camera QR mask reproducible; API and concurrency fixtures still use random tokens.
		const token = i === 5 ? 'rapkumer-absensi:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno12'
			: i === 6 ? 'rapkumer-absensi:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno13'
			: `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
		await insert('qr_murid', { murid_id: id, token_hash: createHash('sha256').update(token).digest('hex'), token_version: 1, issued_at: now, created_at: now, updated_at: now });
		students.push(id); tokens.push(token);
	}
	child = spawn(process.execPath, ['build/index.js'], { cwd: project, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ORIGIN: base, DB_URL: `file:${database}`, KAGANGA_DATA_DIR: path.join(folder, 'data'), NODE_ENV: 'production' } });
	child.stdout.on('data', (v) => output += v); child.stderr.on('data', (v) => output += v);
	let ready = false;
	for (let i = 0; i < 120; i++) { try { if ((await fetch(base + '/login')).status === 200) { ready = true; break; } } catch { /* startup */ } await new Promise((r) => setTimeout(r, 500)); }
	assert.ok(ready, output);
	const journeyBaseline = await count('perjalanan_murid', '1=1');
	const api = async (body, name = 'security', route = '/api/administrasi/absensi/scan/perjalanan') => {
		const response = await fetch(base + route, { method: 'POST', headers: { cookie: accounts[name].cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual' });
		return { status: response.status, body: await response.json().catch(() => ({})) };
	};
	const permitAction = async (action, values) => {
		const form = new FormData();
		for (const [key, value] of Object.entries(values)) form.set(key, String(value));
		const response = await fetch(`${base}/administrasi/absensi/kegiatan/rekap?/${action}`, { method: 'POST', headers: { origin: base, cookie: accounts.admin.cookie, 'x-sveltekit-action': 'true' }, body: form });
		const body = await response.json();
		return { status: body.status ?? response.status, body };
	};
	const preview = (i, operation = 'pulang_ke_rumah', name = 'security') => api({ token: tokens[i], operation }, name);
	const confirm = (i, v, extra = {}) => api({ token: tokens[i], operation: v.operation, confirm: true, permitId: v.id, revision: v.revision, pickupVerified: true, ...extra });
	const permit = (i, extra = {}) => insert('izin_pulang_murid', { sekolah_id: school, tahun_ajaran_id: kelas.tahun_ajaran_id, semester_id: semester, kelas_id: classId, murid_id: students[i], nis_snapshot: `QA-TRAVEL-${i}`, nama_snapshot: `QA Perjalanan Murid ${i}`, kelas_snapshot: 'QA Perjalanan', tanggal_keluar: today, waktu_keluar: '00:00', alasan: 'QA izin terotorisasi', penjemput_nama: 'QA Penjemput Sah', penjemput_hubungan: 'Ibu', rencana_kembali: tomorrow, status: 'sedang_izin', nomor_dokumen: `QA/${i}`, petugas_keluar_user_id: accounts.admin.id, created_at: now, updated_at: now, ...extra });
	for (const name of ['guru', 'dapur', 'wali']) assert.equal((await preview(0, 'pulang_ke_rumah', name)).status, 403, name);
	assert.equal((await api({ token: tokens[0], mode: 'kegiatan', kegiatanId: 1 }, 'security', '/api/administrasi/absensi/scan')).status, 403);
	assert.equal((await api({ token: tokens[0], operation: 'pulang_ke_rumah', capturedAt: now })).status, 400);
	assert.equal((await api({ token: 'invalid', operation: 'pulang_ke_rumah' })).status, 404);
	assert.equal((await preview(0)).status, 409);
	assert.equal(await count('perjalanan_murid', '1=1'), journeyBaseline);
	pass('Izin perjalanan terpisah dari scan kegiatan; QR tidak valid, tanpa izin, dan waktu offline ditolak');
	const form = new FormData(); form.set('muridId', String(students[0]));
	assert.equal((await fetch(base + '/administrasi/absensi/kegiatan/rekap?/saveIzinPulang', { method: 'POST', headers: { origin: base, cookie: accounts.security.cookie }, body: form, redirect: 'manual' })).status, 403);
	for (const route of ['/murid', '/administrasi/absensi/monitoring', `/api/murid-photo/${students[0]}`])
		assert.equal((await fetch(base + route, { headers: { cookie: accounts.security.cookie }, redirect: 'manual' })).status, 403, route);
	pass('Tim Keamanan tidak dapat menerbitkan izin, membuka daftar murid, foto massal atau monitoring umum');
	for (const name of ['guru', 'wali', 'dapur']) assert.equal((await fetch(base + '/administrasi/absensi/konfirmasi-pulang', { headers: { cookie: accounts[name].cookie }, redirect: 'manual' })).status, 403);
	const oldPickup = await permit(6, { penjemput_nama: null, penjemput_hubungan: null, penjemput_kontak: 'SECRET-CONTACT', alasan: 'SECRET-HEALTH' });
	const pickupV = (await preview(6)).body.verification;
	assert.equal(pickupV.izin.penjemputNama, null);
	assert.equal((await confirm(6, pickupV)).status, 409);
	assert.equal(await count('perjalanan_murid', 'izin_id=?', [oldPickup]), 0);
	assert.equal((await permitAction('saveIzinPulang', { muridId: students[6], kelasId: classId, tanggalKeluar: today, rencanaKembali: tomorrow, alasan: 'QA tanpa penjemput' })).status, 400);
	const repair = await permitAction('updatePenjemput', { id: oldPickup, revision: now, penjemputNama: 'QA Ibu Baru', penjemputHubungan: 'Ibu kandung' });
	assert.equal(repair.status, 200, JSON.stringify(repair));
	assert.equal((await confirm(6, pickupV)).status, 409, 'Pickup correction invalidates preview');
	const repairedV = (await preview(6)).body.verification;
	assert.equal((await confirm(6, repairedV, { pickupVerified: false })).status, 400);
	assert.equal((await confirm(6, repairedV, { pickupVerified: 'true' })).status, 400);
	assert.equal(await count('perjalanan_murid', 'izin_id=?', [oldPickup]), 0);
	const blockedRepairForm = new FormData(); blockedRepairForm.set('id', String(oldPickup));
	assert.equal((await fetch(base + '/administrasi/absensi/kegiatan/rekap?/updatePenjemput', { method: 'POST', headers: { origin: base, cookie: accounts.security.cookie }, body: blockedRepairForm, redirect: 'manual' })).status, 403);
	const deskResponse = await fetch(base + '/administrasi/absensi/konfirmasi-pulang/__data.json?q=QA%20Perjalanan', { headers: { cookie: accounts.security.cookie } });
	assert.equal(deskResponse.status, 200); const deskText = await deskResponse.text();
	assert.ok(deskText.includes('QA Ibu Baru')); assert.ok(!deskText.includes('SECRET-CONTACT')); assert.ok(!deskText.includes('SECRET-HEALTH'));
	assert.match(deskResponse.headers.get('cache-control'), /no-store/);
	assert.equal((await permitAction('cancelIzinPulang', { id: oldPickup })).status, 200);
	pass('Halaman keamanan terpisah; penjemput wajib, perbaikan izin lama terbatas dan basi ditolak; konfirmasi wajib cocok tanpa membocorkan kontak/alasan');
	await permit(1, { tanggal_keluar: tomorrow });
	await permit(2, { status: 'dibatalkan' });
	const overdue = await permit(3, { tanggal_keluar: yesterday, rencana_kembali: yesterday });
	assert.equal((await preview(1)).status, 409); assert.equal((await preview(2)).status, 409);
	assert.equal((await preview(3)).status, 409);
	const legacy = (await preview(3, 'kembali_ke_sekolah')).body.verification;
	assert.ok(legacy.terlambat);
	assert.equal((await confirm(3, legacy)).status, 200);
	assert.equal((await row('SELECT tanggal_kembali FROM izin_pulang_murid WHERE id=?', [overdue])).tanggal_kembali, today);
	assert.equal((await row('SELECT keluar_pada FROM perjalanan_murid WHERE izin_id=?', [overdue])).keluar_pada, null);
	pass('Izin mendatang/batal ditolak; murid terlambat dan izin manual lama tetap bisa dicatat kembali tanpa mengarang scan keluar');
	const foreignSchool = await row('SELECT id FROM sekolah WHERE id<>? LIMIT 1', [school]);
	const otherSchoolId = foreignSchool?.id ?? await insert('sekolah', clone(await row('SELECT * FROM sekolah WHERE id=?', [school]), { nama: 'QA Sekolah Lain', npsn: '99999881' }));
	await db.execute({ sql: 'UPDATE murid SET sekolah_id=? WHERE id=?', args: [otherSchoolId, students[6]] });
	assert.equal((await preview(6)).status, 404);
	await db.execute({ sql: 'UPDATE murid SET sekolah_id=? WHERE id=?', args: [school, students[6]] });
	const oldSemester = await row('SELECT id FROM semester WHERE id<>? LIMIT 1', [semester]);
	assert.ok(oldSemester);
	await db.execute({ sql: 'UPDATE murid SET semester_id=? WHERE id=?', args: [oldSemester.id, students[6]] });
	assert.equal((await preview(6)).status, 404);
	await db.execute({ sql: 'UPDATE murid SET semester_id=? WHERE id=?', args: [semester, students[6]] });
	pass('QR sekolah lain dan murid bukan semester aktif ditolak tanpa membuka identitas');
	const mainPermit = await permit(0);
	let v = (await preview(0)).body.verification;
	assert.equal(v.murid.id, students[0]);
	assert.deepEqual(Object.keys(v.murid).sort(), ['id', 'kelas', 'nama']);
	assert.equal(await count('perjalanan_murid', 'izin_id=?', [mainPermit]), 0);
	assert.equal((await confirm(0, v, { permitId: mainPermit + 1 })).status, 409);
	await db.execute({ sql: 'UPDATE izin_pulang_murid SET updated_at=? WHERE id=?', args: ['changed-after-preview', mainPermit] });
	assert.equal((await confirm(0, v)).status, 409);
	v = (await preview(0)).body.verification;
	const departures = await Promise.all(Array.from({ length: 4 }, () => confirm(0, v)));
	assert.equal(departures.filter((r) => r.status === 200).length, 1, JSON.stringify(departures));
	assert.ok(departures.every((r) => [200, 409].includes(r.status)), JSON.stringify(departures));
	assert.equal(await count('perjalanan_murid', 'izin_id=?', [mainPermit]), 1);
	assert.equal(await count('audit_log', "entity_type='izin_pulang_perjalanan' AND entity_id=?", [String(mainPermit)]), 1);
	assert.equal((await preview(0)).status, 409);
	const duplicateOut = await preview(0);
	assert.equal(duplicateOut.body.code, 'already_present');
	assert.match(duplicateOut.body.message, /QA Keamanan/);
	const pickupLog = await row("SELECT after_data FROM audit_log WHERE entity_type='izin_pulang_perjalanan' AND entity_id=? ORDER BY id DESC LIMIT 1", [String(mainPermit)]);
	assert.ok(JSON.stringify(pickupLog).includes('QA Penjemput Sah'));
	assert.equal((await permitAction('updatePenjemput', { id: mainPermit, revision: v.revision, penjemputNama: 'Penjemput Berbeda', penjemputHubungan: 'Paman' })).status, 409);
	pass('Preview tidak menulis data; konfirmasi stale/izin lain ditolak; empat scan serentak hanya satu keberangkatan dan audit');
	assert.equal((await permitAction('cancelIzinPulang', { id: mainPermit })).status, 409);
	assert.equal((await permitAction('markIzinReturned', { id: mainPermit, tanggalKembali: yesterday })).status, 400);
	pass('Izin yang telah dipakai berangkat tidak dapat dibatalkan atau ditutup mundur sebelum waktu keberangkatan');
	// Move actual departure back within this disposable DB so all today's configured events fall inside leave.
	await db.execute({ sql: 'UPDATE perjalanan_murid SET keluar_pada=? WHERE izin_id=?', args: [`${today}T00:00:00+07:00`, mainPermit] });
	const activities = {};
	for (const [category, code, name] of [['sekolah', 'apel_berangkat', 'Sekolah'], ['asrama', 'apel_malam', 'Asrama'], ['sholat', 'sholat_zuhur', 'Sholat'], ['makan', 'makan_pagi', 'Makan']]) {
		const activity = await row('SELECT * FROM kegiatan_absensi WHERE sekolah_id=? AND kode=?', [school, code]);
		assert.ok(activity);
		await db.execute({ sql: 'UPDATE kegiatan_absensi SET jam_mulai=?, jam_selesai=?, auto_alfa=1 WHERE id=?', args: ['00:00', '00:01', activity.id] });
		activities[category] = Number(activity.id);
		const report = await fetch(`${base}/api/administrasi/absensi/monitoring?tab=${category}&tanggal=${today}&kelas_id=${classId}`, { headers: { cookie: accounts.admin.cookie } });
		assert.equal(report.status, 200);
		const data = await report.json();
		assert.ok(data.rows.find((r) => r.id === students[0]).cells.some((cell) => cell.status === 'izin_pulang'), `${name}: ${JSON.stringify(data.rows)}`);
	}
	assert.equal(await count('absensi_kegiatan', 'murid_id=?', [students[0]]), 0);
	const catat = await fetch(`${base}/administrasi/absensi/kegiatan/__data.json?kelas_id=${classId}&kegiatan_id=${activities.makan}&tanggal=${today}`, { headers: { cookie: accounts.admin.cookie } });
	assert.equal(catat.status, 200); assert.ok((await catat.text()).includes('Izin pulang terhubung'));
	assert.equal(await count('absensi_kegiatan', 'murid_id=?', [students[0]]), 0, 'Auto alfa must skip permit');
	const recap = await fetch(`${base}/administrasi/absensi/kegiatan/rekap/__data.json?kelas_id=${classId}&kegiatan_id=${activities.makan}&tanggal_awal=${today}&tanggal_akhir=${today}`, { headers: { cookie: accounts.admin.cookie } });
	assert.equal(recap.status, 200);
	const summary = await fetch(`${base}/api/administrasi/absensi/kegiatan/ringkasan?cakupan=kelas&kelas_id=${classId}&kegiatan_id=${activities.makan}&tanggal=${today}`, { headers: { cookie: accounts.admin.cookie } });
	assert.equal(summary.status, 200); assert.ok((await summary.text()).includes('QA Perjalanan Murid 0'));
	const excelResponse = await fetch(`${base}/api/administrasi/absensi/kegiatan/rekap/export?kelas_id=${classId}&kegiatan_id=${activities.makan}&tanggal_awal=${today}&tanggal_akhir=${today}`, { headers: { cookie: accounts.admin.cookie } });
	assert.equal(excelResponse.status, 200);
	const ExcelJS = (await import('exceljs')).default;
	const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await excelResponse.arrayBuffer()));
	assert.ok(JSON.stringify(workbook.model).includes('Izin pulang terhubung'));
	const scanned = await api({ token: tokens[0], mode: 'kegiatan', kegiatanId: activities.makan, scanGroup: 'makan' }, 'admin', '/api/administrasi/absensi/scan');
	assert.equal(scanned.status, 200); assert.equal(scanned.body.status, 'pulang');
	assert.equal(await count('absensi_kegiatan', 'murid_id=?', [students[0]]), 0);
	pass('Izin terhubung di empat monitoring, Catat Absensi, rekap/ringkasan; auto alfa dan scan kegiatan tidak menimpa izin');
	const returnV = (await preview(0, 'kembali_ke_sekolah')).body.verification;
	const returns = await Promise.all(Array.from({ length: 4 }, () => confirm(0, returnV)));
	assert.equal(returns.filter((r) => r.status === 200).length, 1, JSON.stringify(returns));
	assert.ok(returns.every((r) => [200, 409].includes(r.status)), JSON.stringify(returns));
	assert.equal(await count('audit_log', "entity_type='izin_pulang_perjalanan' AND entity_id=?", [String(mainPermit)]), 2);
	assert.equal(await count('absensi_kegiatan', 'murid_id=?', [students[0]]), 0);
	assert.equal((await preview(0, 'kembali_ke_sekolah')).status, 409);
	const beforeReturn = await row('SELECT * FROM perjalanan_murid WHERE izin_id=?', [mainPermit]);
	assert.ok(beforeReturn.keluar_pada && beforeReturn.kembali_pada);
	pass('Kembali serentak hanya sekali, menutup izin tanpa mengisi hadir otomatis dan tetap menyimpan jejak perjalanan');
	const next = await permitAction('saveIzinPulang', { muridId: students[0], kelasId: classId, tanggalKeluar: today, waktuKeluar: '00:00', rencanaKembali: tomorrow, alasan: 'QA izin berikutnya', penjemputNama: 'QA Ibu', penjemputHubungan: 'Ibu' });
	assert.equal(next.status, 200, JSON.stringify(next));
	const nextPermit = await row('SELECT id FROM izin_pulang_murid WHERE murid_id=? AND tanggal_kembali IS NULL ORDER BY id DESC LIMIT 1', [students[0]]);
	assert.ok(nextPermit && Number(nextPermit.id) !== mainPermit);
	assert.equal((await permitAction('cancelIzinPulang', { id: nextPermit.id })).status, 200);
	pass('Izin yang sudah kembali tidak menghalangi penerbitan izin berikutnya; izin belum berangkat masih bisa dibatalkan');
	const rotatePermit = await permit(4);
	const rotateV = (await preview(4)).body.verification;
	await db.execute({ sql: 'UPDATE qr_murid SET revoked_at=? WHERE murid_id=?', args: [now, students[4]] });
	assert.equal((await confirm(4, rotateV)).status, 404);
	assert.equal(await count('perjalanan_murid', 'izin_id=?', [rotatePermit]), 0);
	await db.execute({ sql: "UPDATE pegawai SET status='nonaktif' WHERE id=?", args: [employeeId] });
	assert.equal((await preview(5)).status, 403);
	await db.execute({ sql: "UPDATE pegawai SET status='aktif' WHERE id=?", args: [employeeId] });
	pass('QR dicabut saat konfirmasi dan pegawai keamanan nonaktif ditolak');
	const uiPermit = await permit(5);
	assert.equal((await preview(5)).status, 200);
	const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
	browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(e.message));
	const cameraEvents = [];
	page.on('console', (message) => { if (message.text().includes('[scan qr]')) cameraEvents.push(message.text()); });
	await page.setCookie({ name: 'rapkumer-session', value: accounts.security.token, url: base }, { name: 'active-sekolah-id', value: String(school), url: base });
	const imageUrl = await QRCode.toDataURL(tokens[5], { margin: 4, scale: 12 });
	await page.evaluateOnNewDocument((src) => {
		window.QA_TRACKS = [];
		navigator.mediaDevices.getUserMedia = async () => {
			const image = new Image(); image.src = window.QA_CAMERA_SOURCE ?? src; await image.decode();
			const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
			const context = canvas.getContext('2d'), stream = canvas.captureStream(15);
			context.imageSmoothingEnabled = false;
			window.QA_TRACKS.push(...stream.getTracks());
			const draw = () => { context.fillStyle = '#fff'; context.fillRect(0, 0, 720, 720); context.drawImage(image, Math.floor((720 - image.width) / 2), Math.floor((720 - image.height) / 2)); if (stream.getTracks().some((t) => t.readyState === 'live')) requestAnimationFrame(draw); };
			draw(); return stream;
		};
	}, imageUrl);
	const click = async (text) => { for (const button of await page.$$('button')) if ((await button.evaluate((el) => el.textContent.trim())).includes(text)) { await button.click(); return; } throw new Error('Missing button ' + text); };
	for (const width of [1440, 1280, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(base + '/administrasi/absensi/scan', { waitUntil: 'networkidle0' });
		if (width === 1440) {
			await page.addScriptTag({ path: path.join(project, 'node_modules/@zxing/browser/umd/zxing-browser.min.js') });
			const decoded = await page.evaluate(async (src) => {
				const image = new Image(); image.src = src; await image.decode();
				return (await new ZXingBrowser.BrowserQRCodeReader().decodeFromImageElement(image)).getText();
			}, imageUrl);
			assert.equal(decoded, tokens[5]);
		}
		await page.select('select[aria-label="Mode scan"]', 'pulang');
		await page.select('select[aria-label="Kegiatan absensi"]', 'pulang_ke_rumah');
		await click('Mulai Scan');
		try { await page.waitForSelector('[data-testid="travel-verification"]', { timeout: 30000 }); }
		catch (error) { await page.screenshot({ path: path.join(folder, `travel-failed-${width}.png`), fullPage: true }); console.error('BROWSER_FAILURE', await page.$eval('main', (el) => el.innerText).catch(() => ''), errors, cameraEvents.slice(0, 8)); throw error; }
		assert.equal(await count('perjalanan_murid', 'izin_id=?', [uiPermit]), 0);
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
		await page.$eval('[data-testid="travel-verification"]', (el) => el.scrollIntoView({ block: 'center' }));
		await page.screenshot({ path: path.join(folder, `travel-confirm-${width}.png`), fullPage: true });
		await page.waitForFunction(() => window.QA_TRACKS.length > 0 && window.QA_TRACKS.every((t) => t.readyState === 'ended'));
		if (width !== 320) await click('Batal');
	}
	assert.equal(await page.$$eval('button', (buttons) => buttons.find((b) => b.textContent.includes('Konfirmasi Keluar')).disabled), true);
	await page.click('[data-testid="travel-verification"] input[type="checkbox"]');
	await page.setOfflineMode(true);
	await page.waitForFunction(() => !navigator.onLine && [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Konfirmasi Keluar') && b.disabled));
	assert.equal(await page.$$eval('button', (buttons) => buttons.find((b) => b.textContent.includes('Konfirmasi Keluar')).disabled), true);
	assert.equal(await page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('kaganga-absensi-offline-v1:') && JSON.parse(value).length)), false);
	await page.setOfflineMode(false);
	await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Konfirmasi Keluar') && !b.disabled));
	await click('Konfirmasi Keluar');
	await page.waitForFunction(() => document.body.textContent.includes('Keberangkatan ke rumah tercatat.'));
	assert.equal(await count('perjalanan_murid', 'izin_id=?', [uiPermit]), 1);
	assert.equal(await page.$('[data-testid="travel-verification"]'), null);
	assert.deepEqual(errors, []);
	pass('Kamera ZXing membaca QR: verifikasi/batal/konfirmasi responsif 320-1440, kamera berhenti, offline tidak mengantrekan perjalanan');
	const day = new Date(`${today}T00:00:00Z`).getUTCDay();
	const weekday = day >= 1 && day <= 5;
	const duplicateActivity = weekday ? 'sholat_zuhur' : 'apel_berangkat';
	const activity = await row('SELECT id FROM kegiatan_absensi WHERE sekolah_id=? AND kode=?', [school, duplicateActivity]);
	const scanBody = { token: tokens[6], mode: 'kegiatan', kegiatanId: Number(activity.id), scanGroup: 'sekolah' };
	const repeated = await Promise.all(Array.from({ length: 4 }, (_, i) => api({ ...scanBody, scanGroup: i % 2 && weekday ? 'asrama' : 'sekolah' }, i % 2 ? weekday ? 'wali' : 'guru2' : 'guru', '/api/administrasi/absensi/scan')));
	assert.ok(repeated.every((r) => r.status === 200), JSON.stringify(repeated));
	assert.equal(repeated.filter((r) => r.body.code === 'success').length, 1, JSON.stringify(repeated));
	assert.equal(repeated.filter((r) => r.body.code === 'already_present').length, 3);
	const firstReceipt = repeated.find((r) => r.body.code === 'success').body;
	for (const other of repeated.filter((r) => r.body.code === 'already_present')) { assert.equal(other.body.waktuScan, firstReceipt.waktuScan); assert.deepEqual(other.body.petugas, firstReceipt.petugas); }
	assert.match(firstReceipt.petugas.nama, /QA (Guru A|Guru B|Wali Asrama)/);
	assert.equal(await count('absensi_kegiatan', 'murid_id=? AND kegiatan_id=? AND tanggal=?', [students[6], activity.id, today]), 1);
	const secondActivity = await row("SELECT id FROM kegiatan_absensi WHERE sekolah_id=? AND kode='apel_pulang'", [school]);
	const differentActivity = await api({ ...scanBody, kegiatanId: secondActivity.id }, 'guru', '/api/administrasi/absensi/scan');
	assert.equal(differentActivity.status, 200); assert.equal(differentActivity.body.code, 'success');
	await insert('absensi_kegiatan', { sekolah_id: school, semester_id: semester, kelas_id: classId, kegiatan_id: activity.id, murid_id: students[2], tanggal: today, status: 'sakit', metode: 'manual', petugas_user_id: accounts.guru.id, created_at: now, updated_at: now });
	const manualReceipt = await api({ ...scanBody, token: tokens[2] }, 'guru', '/api/administrasi/absensi/scan');
	assert.equal(manualReceipt.status, 200); assert.equal(manualReceipt.body.code, 'already_present');
	assert.match(manualReceipt.body.message, /Sudah tercatat oleh QA Guru A/);
	assert.equal(manualReceipt.body.status, 'sakit'); assert.equal(manualReceipt.body.waktuScan, null);
	pass(`Scan bersamaan ${weekday ? 'guru dan wali' : 'dua guru (akhir pekan)'}: satu pemenang, tiga scan ulang membawa nama/role/waktu pertama`);
	pass('Kegiatan berbeda tetap dapat dipindai; catatan manual sakit tidak ditimpa atau diberi waktu palsu');
	// UI stress fixtures are confined to the disposable database after domain assertions.
	await db.execute({ sql: 'UPDATE izin_pulang_murid SET nama_snapshot=?, penjemput_nama=?, penjemput_hubungan=? WHERE id=?', args: ['QA Perjalanan Muhammad Abdurrahman Pratama Wiranegara', 'QA Penjemput Siti Nurhaliza Kusumawardhani', 'Wali yang mendapat persetujuan orang tua', rotatePermit] });
	await permit(6, { tanggal_keluar: yesterday, rencana_kembali: yesterday, penjemput_nama: null, penjemput_hubungan: null });
	for (const width of [1440, 1280, 768, 390, 320]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(base + '/administrasi/absensi/konfirmasi-pulang?q=QA%20Perjalanan', { waitUntil: 'networkidle0' });
		await page.waitForSelector('[data-testid="travel-desk"]');
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `desk overflow ${width}`);
		const searchSize = await page.$eval('input[name="q"]', (el) => ({
			input: el.closest('.input').getBoundingClientRect().width,
			column: el.closest('label').getBoundingClientRect().width
		}));
		assert.ok(searchSize.input >= Math.min(searchSize.column - 2, 300), `search fills column at ${width}: ${JSON.stringify(searchSize)}`);
		assert.equal(await page.$$eval('[data-testid="travel-desk"] a, [data-testid="travel-desk"] input, [data-testid="travel-desk"] button', (elements) => elements.some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > innerWidth + 1); })), false, `controls overflow ${width}`);
		await page.screenshot({ path: path.join(folder, `travel-desk-${width}.png`), fullPage: true });
		await page.$eval(width >= 1280 ? '[data-testid="travel-desk"] tbody tr' : '[data-testid="travel-desk"] li', (el) => el.scrollIntoView({ block: 'center' }));
		await page.screenshot({ path: path.join(folder, `travel-desk-rows-${width}.png`), fullPage: true });
	}
	for (const [name, query, expected] of [
		['away', 'tab=pulang&q=QA%20Perjalanan', 'Sudah keluar'],
		['late', 'terlambat=1&q=QA%20Perjalanan', 'Terlambat kembali'],
		['history', 'tab=riwayat&q=QA%20Perjalanan', 'Sudah kembali'],
		['empty', 'q=QA-NOT-FOUND-12345', 'Tidak ada izin yang sesuai filter.']
	]) {
		await page.goto(`${base}/administrasi/absensi/konfirmasi-pulang?${query}`, { waitUntil: 'networkidle0' });
		assert.ok(await page.$eval('[data-testid="travel-desk"]', (el, text) => el.textContent.includes(text), expected), name);
		await page.screenshot({ path: path.join(folder, `travel-desk-${name}-320.png`), fullPage: true });
	}
	const searchNavigation = page.waitForNavigation({ waitUntil: 'networkidle0' });
	await page.$eval('[data-testid="travel-desk"] form', (el) => { el.querySelector('input[name="q"]').value = 'QA Perjalanan'; el.requestSubmit(); });
	await searchNavigation;
	assert.equal(new URL(page.url()).searchParams.get('q'), 'QA Perjalanan');
	await page.click('[data-testid="travel-desk"] a.link');
	await page.waitForFunction(() => !new URL(location.href).searchParams.has('q'));
	for (const width of [1440, 320]) {
		await page.setViewport({ width, height: 900 });
		await page.goto(base + '/administrasi/absensi/konfirmasi-pulang?q=QA%20Perjalanan', { waitUntil: 'networkidle0' });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		await page.evaluate(async () => { await new Promise(requestAnimationFrame); await Promise.allSettled(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished)); });
		await page.screenshot({ path: path.join(folder, `travel-desk-dark-${width}.png`), fullPage: true });
	}
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	pass('UI Konfirmasi Pulang: nama panjang, penjemput belum lengkap, terlambat, sedang pulang, riwayat, filter kosong, serta tema gelap');
	await page.goto(`${base}/administrasi/absensi/scan?mode=pulang&kegiatan=pulang_ke_rumah&izin=${uiPermit}`, { waitUntil: 'networkidle0' });
	assert.equal(await page.$eval('select[aria-label="Mode scan"]', (el) => el.value), 'pulang');
	await click('Mulai Scan');
	await page.waitForSelector('[data-testid="scan-result"].alert-error', { timeout: 30000 });
	assert.match(await page.$eval('[data-testid="scan-result"]', (el) => el.textContent), /QA Keamanan/);
	await page.screenshot({ path: path.join(folder, 'travel-duplicate-red.png'), fullPage: true });
	await page.setCookie({ name: 'rapkumer-session', value: accounts.guru.token, url: base });
	await page.goto(base + '/administrasi/absensi/scan', { waitUntil: 'networkidle0' });
	await page.evaluate((src) => { window.QA_CAMERA_SOURCE = src; }, await QRCode.toDataURL(tokens[6], { margin: 4, scale: 12 }));
	await page.select('select[aria-label="Mode scan"]', 'sekolah');
	await page.select('select[aria-label="Kegiatan absensi"]', duplicateActivity);
	await click('Mulai Scan');
	await page.waitForSelector('[data-testid="scan-result"].alert-error', { timeout: 30000 });
	assert.match(await page.$eval('[data-testid="scan-result"]', (el) => el.textContent), /Sudah dipindai oleh QA (Guru A|Guru B|Wali Asrama)/);
	await page.waitForFunction(() => { const rect = document.querySelector('[data-testid="scan-result"]').getBoundingClientRect(); return rect.top >= 55 && rect.bottom <= innerHeight; });
	await page.screenshot({ path: path.join(folder, 'teacher-duplicate-red.png'), fullPage: true });
	assert.deepEqual(errors, []);
	pass('Halaman keamanan responsif 320-1440 dan tautan scan berfungsi; scan ulang tampil merah dengan petugas pertama');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	pass('SQLite dan foreign key salinan sehat');
	await writeFile(path.join(folder, 'result.json'), JSON.stringify({ checks, database }, null, 2));
	console.log('QA_RESULT', folder);
} catch (error) { await writeFile(path.join(folder, 'server.log'), output); console.error('QA_FOLDER', folder); throw error; }
finally {
	if (browser) await browser.close();
	if (child && child.exitCode == null) { const done = once(child, 'exit'); child.kill(); await done; }
	db.close();
}
