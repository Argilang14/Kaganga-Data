import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createClient } from '@libsql/client';
import puppeteer from 'puppeteer-core';
import { travelLocalTime } from '../src/lib/attendance-travel.ts';

const root = process.cwd(),
	port = 5183,
	base = `http://127.0.0.1:${port}`;
await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
const folder = await fs.mkdtemp(path.join(root, 'tmp/attendance-completion-qa-'));
const database = path.join(folder, 'database.sqlite3');
await fs.copyFile(
	path.join(root, 'dist/backups/attendance-finish-2026-10-24T16-58-45-087Z/database.sqlite3'),
	database
);
const db = createClient({ url: `file:${database}` });
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
function clone(original, values) {
	const next = { ...original, ...values };
	delete next.id;
	return next;
}
const now = new Date().toISOString(),
	today = travelLocalTime().date,
	yesterday = travelLocalTime(new Date(Date.now() - 86400000)).date,
	tomorrow = travelLocalTime(new Date(Date.now() + 86400000)).date;
let child,
	browser,
	output = '';
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
try {
	await db.execute('PRAGMA busy_timeout=10000');
	const original = await row('SELECT * FROM murid LIMIT 1');
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
			nama: 'X.QA Konfirmasi',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const classB = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'XI.QA Luar',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const accounts = {};
	for (const [name, type] of [
		['admin', 'admin'],
		['guru', 'user'],
		['guru2', 'user'],
		['wali', 'wali_asrama'],
		['asuh', 'wali_asuh'],
		['dapur', 'tim_dapur'],
		['security', 'tim_keamanan']
	]) {
		const staff = await insert(
			'pegawai',
			clone(employee, {
				nama: `QA ${name}`,
				nip: `QA-FIN-${name}`,
				kode_pegawai: `QA-FIN-${name}`,
				nik: null,
				nuptk: null,
				nomor_induk_pppk: null,
				dapodik_ptk_id: null,
				foto: null
			})
		);
		const id = await insert(
			'auth_user',
			clone(admin, {
				username: `qa-finish-${name}`,
				username_normalized: `qa-finish-${name}`,
				type,
				jabatan_akses: null,
				sekolah_id: school,
				kelas_id: classA,
				pegawai_id: staff,
				mata_pelajaran_id: null,
				permissions: '[]',
				must_change_password: 0
			})
		);
		const token = randomBytes(32).toString('base64url');
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			expires_at: new Date(Date.now() + 3600000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts[name] = {
			id,
			token,
			cookie: `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${classA}`
		};
	}
	const students = [],
		tokens = [];
	for (let i = 0; i < 11; i++) {
		students.push(
			await insert(
				'murid',
				clone(original, {
					nama: `QA Murid ${String(i).padStart(2, '0')}`,
					nis: `QA-FIN-${i}`,
					nisn: `99997000${String(i).padStart(2, '0')}`,
					kelas_id: i === 10 ? classB : classA,
					wali_asuh_nama: i === 0 ? 'QA asuh' : 'QA Lain',
					wali_asrama_nama: 'QA wali',
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null,
					qr_token: randomBytes(16).toString('hex')
				})
			)
		);
		const token = `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
		tokens.push(token);
		await insert('qr_murid', {
			murid_id: students[i],
			token_hash: createHash('sha256').update(token).digest('hex'),
			token_version: 1,
			issued_at: now,
			created_at: now,
			updated_at: now
		});
	}
	const activities = {};
	for (const [kode, kategori, akses] of [
		['apel_berangkat', 'sekolah', 'sekolah'],
		['asrama_berangkat', 'asrama', 'asrama'],
		['makan_pagi', 'makan', 'asrama']
	]) {
		let existing = await row(
			'SELECT * FROM kegiatan_absensi WHERE sekolah_id=? AND kode=? ORDER BY id LIMIT 1',
			[school, kode]
		);
		if (!existing) {
			const id = await insert('kegiatan_absensi', {
				sekolah_id: school,
				kode,
				nama: kode,
				kategori,
				akses_edit: akses,
				aktif: 1,
				urutan: 10,
				created_at: now,
				updated_at: now
			});
			existing = await row('SELECT * FROM kegiatan_absensi WHERE id=?', [id]);
		}
		activities[kode] = Number(existing.id);
		await db.execute({
			sql: 'UPDATE kegiatan_absensi SET aktif=1,jam_mulai=?,auto_alfa=0 WHERE id=?',
			args: ['00:00', existing.id]
		});
	}
	const activity = activities.apel_berangkat;
	const attendance = async (i, status, act = activity, actor = accounts.guru.id) =>
		insert('absensi_kegiatan', {
			sekolah_id: school,
			semester_id: semester,
			kelas_id: classA,
			murid_id: students[i],
			kegiatan_id: act,
			tanggal: today,
			status,
			metode: 'manual',
			petugas_user_id: actor,
			catatan: 'QA bukti',
			created_at: now,
			updated_at: now
		});
	await attendance(6, 'sakit', activities.asrama_berangkat, accounts.wali.id);
	await insert('izin_pulang_murid', {
		sekolah_id: school,
		tahun_ajaran_id: oldClass.tahun_ajaran_id,
		semester_id: semester,
		kelas_id: classA,
		murid_id: students[4],
		nis_snapshot: 'QA-FIN-4',
		nama_snapshot: 'QA Murid 04',
		kelas_snapshot: 'X.QA Konfirmasi',
		tanggal_keluar: yesterday,
		waktu_keluar: '00:00',
		alasan: 'QA izin',
		penjemput_nama: 'QA Ibu',
		penjemput_hubungan: 'Ibu',
		rencana_kembali: tomorrow,
		status: 'sedang_izin',
		nomor_dokumen: 'QA-FIN/4',
		petugas_keluar_user_id: accounts.admin.id,
		created_at: now,
		updated_at: now
	});
	child = spawn(process.execPath, ['build/index.js'], {
		cwd: root,
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: path.join(folder, 'data'),
			photo: path.join(folder, 'uploads'),
			HOST: '127.0.0.1',
			PORT: String(port),
			ORIGIN: base,
			NODE_ENV: 'production'
		}
	});
	child.stdout.on('data', (v) => (output += v));
	child.stderr.on('data', (v) => (output += v));
	let ready = false;
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(base + '/login', { signal: AbortSignal.timeout(3000) })).ok) {
				ready = true;
				break;
			}
		} catch {
			/* Wait for the isolated server to bind. */
		}
		if (child.exitCode !== null) break;
		await new Promise((r) => setTimeout(r, 500));
	}
	assert.ok(ready, output);
	const params = new URLSearchParams({
		tanggal: today,
		kegiatan_id: String(activity),
		cakupan: 'kelas',
		kelas_id: String(classA)
	});
	const get = async (name = 'guru', query = params) => {
		const r = await fetch(base + '/api/administrasi/absensi/kegiatan/ringkasan?' + query, {
			headers: { cookie: accounts[name].cookie }
		});
		assert.equal(r.status, 200, await r.clone().text());
		return r.json();
	};
	const save = async (entries, name = 'guru', query = params) => {
		const r = await fetch(base + '/api/administrasi/absensi/kegiatan/ringkasan/catat?' + query, {
			method: 'POST',
			headers: { cookie: accounts[name].cookie, origin: base, 'content-type': 'application/json' },
			body: JSON.stringify({ entries })
		});
		return { status: r.status, body: await r.json() };
	};
	const entry = (i, status) => ({ muridId: students[i], status, catatan: 'Konfirmasi QA wali' });
	for (const invalid of [
		[],
		[entry(5, 'hadir'), entry(5, 'sakit')],
		[entry(5, '')],
		[entry(5, 'invalid')]
	]) {
		assert.equal((await save(invalid)).status, 400);
	}
	pass('Endpoint menolak daftar kosong, murid ganda, dan status tidak valid');
	let report = await get();
	assert.equal(report.totals.jumlah, 10);
	assert.equal(report.totals.belum, 8);
	assert.ok(!report.missingStudents.some((s) => [students[4], students[6]].includes(s.id)));
	pass('Ringkasan memperhitungkan izin pulang dan sakit terhubung asrama tanpa menulis salinan');
	const saved = await save([
		entry(0, 'hadir'),
		entry(1, 'sakit'),
		entry(2, 'izin'),
		entry(3, 'alfa')
	]);
	assert.equal(saved.status, 200, JSON.stringify(saved));
	assert.ok(saved.body.results.every((r) => r.code === 'saved'));
	assert.equal(saved.body.report.totals.belum, 4);
	pass('Empat status manual tersimpan; murid lain tetap belum tercatat');
	const old = await row('SELECT * FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?', [
		students[0],
		activity
	]);
	const repeat = await save([entry(0, 'alfa')], 'guru2');
	assert.equal(repeat.status, 200);
	assert.match(repeat.body.results[0].message, /QA guru/);
	assert.deepEqual(await row('SELECT * FROM absensi_kegiatan WHERE id=?', [old.id]), old);
	pass('Percobaan menimpa menampilkan petugas pertama tanpa mengubah catatan');
	assert.equal((await save([entry(5, 'pulang')])).body.results[0].code, 'failed');
	assert.equal((await get()).totals.belum, 4);
	const yesterdayParams = new URLSearchParams(params);
	yesterdayParams.set('tanggal', yesterday);
	const oldDate = await save([entry(5, 'sakit')], 'guru', yesterdayParams);
	assert.ok(
		oldDate.status === 200 ? oldDate.body.results[0].code === 'forbidden' : oldDate.status === 403
	);
	pass('Pulang tanpa izin dan pencatatan tanggal lama tidak lolos');
	const all = new URLSearchParams(params);
	all.set('cakupan', 'semua');
	all.delete('kelas_id');
	const wide = await get('guru', all);
	assert.equal(wide.missingStudents.find((s) => s.id === students[10]).canEdit, false);
	assert.equal((await save([entry(10, 'hadir')], 'guru', all)).body.results[0].code, 'forbidden');
	const dorm = new URLSearchParams(params);
	dorm.set('kegiatan_id', String(activities.asrama_berangkat));
	assert.equal((await save([entry(5, 'hadir')], 'guru', dorm)).body.results[0].code, 'forbidden');
	const own = await get('asuh', dorm);
	assert.equal(own.missingStudents.find((s) => s.id === students[0]).canEdit, true);
	assert.equal(own.missingStudents.find((s) => s.id === students[5]).canEdit, false);
	assert.equal((await save([entry(5, 'sakit')], 'asuh', dorm)).body.results[0].code, 'forbidden');
	assert.equal((await save([entry(0, 'hadir')], 'wali', dorm)).body.results[0].code, 'saved');
	assert.equal((await save([entry(5, 'hadir')], 'security')).status, 403);
	assert.equal((await save([entry(5, 'hadir')], 'dapur')).status, 403);
	const meal = new URLSearchParams(params);
	meal.set('kegiatan_id', String(activities.makan_pagi));
	assert.equal((await save([entry(0, 'hadir')], 'dapur', meal)).body.results[0].code, 'saved');
	pass('Ringkasan lintas kelas tidak memperluas input; kegiatan dibatasi sesuai role');
	const concurrent = await Promise.all([
		save([entry(7, 'sakit')], 'guru'),
		save([entry(7, 'izin')], 'guru2')
	]);
	assert.ok(
		concurrent.every((r) => r.status === 200),
		JSON.stringify(concurrent)
	);
	assert.equal(
		concurrent.flatMap((r) => r.body.results).filter((r) => r.code === 'saved').length,
		1
	);
	assert.equal(
		Number(
			(
				await row('SELECT count(*) n FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?', [
					students[7],
					activity
				])
			).n
		),
		1
	);
	pass('Dua akun serentak hanya menghasilkan satu catatan');
	const qr = await fetch(base + '/api/administrasi/absensi/scan', {
		method: 'POST',
		headers: { cookie: accounts.guru2.cookie, origin: base, 'content-type': 'application/json' },
		body: JSON.stringify({
			token: tokens[8],
			mode: 'kegiatan',
			scanGroup: 'sekolah',
			kegiatanId: activity
		})
	});
	assert.equal(qr.status, 200, await qr.clone().text());
	assert.match((await save([entry(8, 'alfa')])).body.results[0].message, /QA guru2/);
	pass('Scan QR petugas lain juga melindungi data dari input manual terlambat');
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: accounts.guru.token, domain: '127.0.0.1', path: '/' },
		{ name: 'active-sekolah-id', value: String(school), domain: '127.0.0.1', path: '/' },
		{ name: 'active-kelas-id', value: String(classA), domain: '127.0.0.1', path: '/' }
	);
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(base + '/administrasi/absensi/scan', { waitUntil: 'networkidle0' });
	await page.select('select[aria-label="Mode scan"]', 'sekolah');
	await page.select('select[aria-label="Kegiatan absensi"]', String(activity));
	async function click(text) {
		await page.evaluate((text) => {
			const b = [...document.querySelectorAll('button')].find(
				(n) => n.textContent.trim() === text && n.getBoundingClientRect().width > 0
			);
			if (!b) throw Error('Button missing ' + text);
			b.click();
		}, text);
	}
	async function screenshot(name) {
		await page.evaluate(async () => {
			const animations = document.querySelector('dialog[open]').getAnimations({ subtree: true });
			await Promise.all(
				animations
					.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
					.map((animation) => animation.finished.catch(() => undefined))
			);
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		});
		await page.screenshot({ path: path.join(folder, name) });
	}
	await click('Selesai & Ringkasan');
	await page.waitForSelector('dialog[open] button[aria-expanded]');
	await page.click('dialog[open] button[aria-expanded]');
	for (const [label, width, height] of [
		['desktop', 1440, 1000],
		['tablet', 768, 1024],
		['mobile', 390, 844]
	]) {
		await page.setViewport({ width, height });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		assert.ok(
			await page.$eval('dialog[open] .modal-box', (box) => box.scrollWidth <= box.clientWidth + 1)
		);
		await screenshot(`popup-${label}.png`);
	}
	await page.$eval('select[aria-label="Status QA Murid 09"]', (node) => {
		node.scrollIntoView({ block: 'center' });
		node.focus();
	});
	await screenshot('popup-mobile-edit.png');
	for (let i = 0; i < 20; i++) {
		await page.keyboard.press('Tab');
		const focus = await page.$eval('dialog[open]', (dialog) => ({
			inside: dialog.contains(document.activeElement),
			tag: document.activeElement?.tagName,
			label: document.activeElement?.getAttribute('aria-label')
		}));
		// Native dialogs may yield Tab to browser chrome, but never to the underlying page.
		assert.ok(focus.inside || focus.tag === 'BODY', JSON.stringify(focus));
	}
	await page.select('select[aria-label="Status QA Murid 09"]', 'sakit');
	await page.setOfflineMode(true);
	await page.waitForFunction(() =>
		document.body.innerText.includes('Koneksi terputus. Sambungkan')
	);
	assert.equal(await page.$eval('dialog[open] button.btn-success', (node) => node.disabled), true);
	assert.equal(
		await page.$eval('select[aria-label="Status QA Murid 09"]', (node) => node.disabled),
		true
	);
	await page.setOfflineMode(false);
	await page.waitForFunction(
		() => !document.querySelector('select[aria-label="Status QA Murid 09"]').disabled
	);
	pass('Koneksi putus menghalangi input dan selesai tanpa membuang pilihan');
	await page.keyboard.press('Escape');
	assert.ok(await page.$('dialog[open]'));
	await page.waitForFunction(() => document.body.innerText.includes('Pilihan belum disimpan'));
	await click('Tetap periksa');
	assert.equal(
		await page.$eval('select[aria-label="Status QA Murid 09"]', (n) => n.value),
		'sakit'
	);
	await page.setRequestInterception(true);
	let rejectManual = true;
	let rejectScan = false;
	page.on('request', (request) => {
		const target = new URL(request.url());
		if (
			(rejectManual && target.pathname.endsWith('/ringkasan/catat')) ||
			(rejectScan && target.pathname === '/api/administrasi/absensi/scan')
		) {
			void request.respond({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'QA koneksi terputus' })
			});
		} else void request.continue();
	});
	await click('Simpan & Perbarui');
	await page.waitForFunction(() => document.body.innerText.includes('Pilihan belum dibuang'));
	assert.equal(
		await page.$eval('select[aria-label="Status QA Murid 09"]', (n) => n.value),
		'sakit'
	);
	assert.equal(
		await row('SELECT id FROM absensi_kegiatan WHERE murid_id=? AND kegiatan_id=?', [
			students[9],
			activity
		]),
		undefined
	);
	await page.$eval('dialog[open] .alert-error', (node) => node.scrollIntoView({ block: 'center' }));
	await screenshot('popup-save-error-mobile.png');
	rejectManual = false;
	await click('Simpan & Perbarui');
	await page.waitForFunction(
		() => !document.querySelector('select[aria-label="Status QA Murid 09"]')
	);
	assert.equal((await get()).totals.belum, 1);
	pass('Gagal simpan mempertahankan pilihan; percobaan ulang tersimpan tanpa duplikasi');
	await click('Konfirmasi Selesai');
	await page.waitForFunction(() => document.body.innerText.includes('Selesai di Perangkat Ini'));
	await click('Selesai di Perangkat Ini');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.equal((await get()).totals.belum, 1);
	assert.equal(errors.length, 0, errors.join('\n'));
	pass(
		'UI HP menyimpan sakit, menjaga pilihan saat Escape dan selesai tanpa mengubah murid belum tercatat'
	);
	await click('Selesai & Ringkasan');
	await page.waitForSelector('dialog[open] button[aria-expanded]');
	await click('Konfirmasi Selesai');
	await page.waitForFunction(() => document.body.innerText.includes('Selesai di Perangkat Ini'));
	assert.equal((await save([entry(5, 'izin')], 'guru2')).body.results[0].code, 'saved');
	await click('Selesai di Perangkat Ini');
	await page.waitForFunction(
		() =>
			document.querySelector('dialog[open]') &&
			document.body.innerText.includes('Seluruh murid dalam cakupan ini sudah tercatat.')
	);
	await page.click('dialog[open] button[aria-expanded]');
	await page.waitForFunction(() =>
		document.body.innerText.includes('Tidak ada murid yang belum tercatat.')
	);
	await screenshot('popup-empty-mobile.png');
	await click('Konfirmasi Selesai');
	await page.waitForFunction(() => document.body.innerText.includes('Selesai di Perangkat Ini'));
	await click('Selesai di Perangkat Ini');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	pass(
		'Perubahan guru lain saat konfirmasi meminta pemeriksaan ulang; selesai lokal tidak mengunci petugas lain'
	);
	rejectScan = true;
	await page.evaluate((queue) => localStorage.setItem(queue.key, JSON.stringify([queue.item])), {
		key: `kaganga-absensi-offline-v1:${school}:${accounts.guru.id}`,
		item: {
			id: 'qa-pending',
			token: tokens[5],
			mode: 'kegiatan',
			scanGroup: 'sekolah',
			kegiatanId: activity,
			capturedAt: new Date().toISOString()
		}
	});
	await page.reload({ waitUntil: 'networkidle0' });
	await page.select('select[aria-label="Mode scan"]', 'sekolah');
	await page.select('select[aria-label="Kegiatan absensi"]', String(activity));
	await click('Selesai & Ringkasan');
	await page.waitForFunction(() =>
		document.body.innerText.includes('scan masih menunggu sinkronisasi')
	);
	assert.equal(await page.$eval('dialog[open] button.btn-success', (n) => n.disabled), true);
	await screenshot('popup-pending-mobile.png');
	await click('Tutup');
	await page.evaluate(() => localStorage.clear());
	rejectScan = false;
	pass('Antrean scan belum terkirim menghalangi konfirmasi selesai');
	assert.equal(errors.length, 0, errors.join('\n'));
	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	await fs.writeFile(
		path.join(folder, 'result.json'),
		JSON.stringify({ checks, errors, database }, null, 2)
	);
	console.log('QA_RESULT', folder);
} catch (e) {
	console.error('QA_FOLDER', folder);
	throw e;
} finally {
	await fs.writeFile(path.join(folder, 'server.log'), output);
	if (browser) await browser.close();
	if (child && child.exitCode === null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
	db.close();
}
