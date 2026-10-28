import { createClient } from '@libsql/client';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import net from 'node:net';

const dir = path.resolve('tmp', `pengasuhan-qa-${Date.now()}`);
await mkdir(dir, { recursive: true });
const database = path.join(dir, 'database.sqlite3');
const source = createClient({ url: process.env.QA_SOURCE_DB || 'file:./data/database.sqlite3' });
await source.execute(`VACUUM INTO '${database.replaceAll("'", "''")}'`);
source.close();
const db = createClient({ url: `file:${database}` });
const port = Number(process.env.QA_PORT || 5186),
	base = `http://127.0.0.1:${port}`;
// Never connect this test to a server using the school's real database.
const probe = net.createServer();
await new Promise((resolve, reject) =>
	probe.once('error', reject).listen(port, '127.0.0.1', resolve)
);
await new Promise((resolve) => probe.close(resolve));
const child = spawn(process.execPath, ['build/index.js'], {
	windowsHide: true,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		DB_URL: `file:${database}`,
		PORT: String(port),
		HOST: '127.0.0.1',
		ORIGIN: base,
		NODE_ENV: 'production',
		KAGANGA_DATA_DIR: dir
	}
});
let output = '',
	browser;
child.stdout.on('data', (b) => (output += b));
child.stderr.on('data', (b) => (output += b));
const results = [];
const pass = (name) => {
	results.push(name);
	console.log(`PASS ${name}`);
};
const exec = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const today = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Jakarta',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
}).format(new Date());
try {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) break;
		} catch {
			// The isolated server may still be opening its copied database.
		}
		if (i === 99) throw new Error(`Server QA tidak siap: ${output.slice(-3000)}`);
		await new Promise((r) => setTimeout(r, 500));
	}
	const [admin] = await exec("SELECT * FROM auth_user WHERE type='admin' ORDER BY id LIMIT 1");
	assert.ok(admin);
	const school =
		admin.sekolah_id ?? (await exec('SELECT id FROM sekolah ORDER BY id LIMIT 1'))[0].id;
	const academic = (
		await exec(
			'SELECT s.id FROM semester s JOIN tahun_ajaran t ON s.tahun_ajaran_id=t.id WHERE t.sekolah_id=? ORDER BY t.is_aktif DESC,t.id DESC,s.is_aktif DESC,s.id DESC LIMIT 1',
			[school]
		)
	)[0];
	assert.ok(academic);
	const students = await exec(
		`SELECT m.id,mi.identity_uid,m.kelas_id FROM murid m JOIN murid_identity_link mi ON mi.murid_id=m.id WHERE m.sekolah_id=? AND m.semester_id=? AND NOT EXISTS(SELECT 1 FROM murid_lifecycle l WHERE l.sekolah_id=m.sekolah_id AND l.identity_key='uid:'||mi.identity_uid AND (l.status<>'aktif' OR l.needs_identity_review=1)) ORDER BY m.id LIMIT 2`,
		[school, academic.id]
	);
	assert.equal(students.length, 2);
	const cookies = new Map();
	async function session(id, label) {
		const token = randomBytes(32).toString('base64url');
		await exec(
			'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)',
			[
				id,
				createHash('sha256').update(token).digest('hex'),
				new Date(Date.now() + 3600000).toISOString(),
				new Date().toISOString()
			]
		);
		cookies.set(label, `rapkumer-session=${token}; active-sekolah-id=${school}`);
	}
	await session(admin.id, 'admin');
	async function user(label, type, name = null, position = null) {
		let employee = null;
		if (name)
			employee = (
				await exec(
					"INSERT INTO pegawai(sekolah_id,nama,nip,jenis,status,created_at) VALUES(?,?,?,'wali_asuh','aktif',?) RETURNING id",
					[school, name, `QA-${label}`, new Date().toISOString()]
				)
			)[0].id;
		const id = (
			await exec(
				'INSERT INTO auth_user(username,username_normalized,password_hash,password_salt,type,sekolah_id,pegawai_id,jabatan_akses,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,0,?) RETURNING id',
				[
					`qa-care-${label}`,
					`qa-care-${label}`,
					'qa-not-login',
					'qa-not-login',
					type,
					school,
					employee,
					position,
					new Date().toISOString()
				]
			)
		)[0].id;
		await session(id, label);
		return { id, employee };
	}
	const guardian = await user('asuh', 'wali_asuh', 'QA Asuh A', 'kepala_sekolah');
	await user('other', 'wali_asuh', 'QA Asuh B');
	await user('asrama', 'wali_asrama', 'QA Asrama A');
	for (const type of ['user', 'tim_dapur', 'tim_keamanan', 'wali_murid'])
		await user(type, type, null, 'operator');
	await exec('UPDATE murid SET wali_asuh_nama=?,wali_asrama_nama=?,nama=? WHERE id=?', [
		'QA Asuh A',
		'QA Asrama A',
		'Murid Uji A',
		students[0].id
	]);
	await exec('UPDATE murid SET wali_asuh_nama=?,wali_asrama_nama=?,nama=? WHERE id=?', [
		'QA Asuh B',
		'QA Asrama B',
		'Murid Uji B',
		students[1].id
	]);
	async function get(route, who = 'admin') {
		return fetch(`${base}${route}`, { headers: { cookie: cookies.get(who) }, redirect: 'manual' });
	}
	async function post(action, values, who = 'asuh') {
		const response = await fetch(`${base}/pengasuhan/kejadian?/${action}`, {
			method: 'POST',
			headers: {
				cookie: cookies.get(who),
				origin: base,
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			body: new URLSearchParams(values),
			redirect: 'manual'
		});
		return { response, result: await response.json() };
	}
	for (const route of ['ringkasan', 'piket', 'kejadian', 'perkembangan', 'sakit'])
		assert.equal((await get(`/pengasuhan/${route}`)).status, 200);
	pass('lima halaman admin tersedia');
	for (const type of ['user', 'tim_dapur', 'tim_keamanan', 'wali_murid']) {
		assert.notEqual((await get('/pengasuhan/sakit', type)).status, 200);
		assert.notEqual((await get('/api/pengasuhan/catatan/1', type)).status, 200);
	}
	pass('role lain ditolak meski mempunyai jabatan operator');
	const before = await exec(
		"SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%absen%' OR name LIKE '%asesmen%' OR name='catatan_wali_asrama')"
	);
	const snapshots = new Map();
	for (const { name } of before)
		snapshots.set(name, JSON.stringify(await exec(`SELECT * FROM "${name}" ORDER BY rowid`)));
	const values = {
		muridId: String(students[0].id),
		jenis: 'kejadian',
		tanggal: today,
		waktu: '08:00',
		judul: 'Kejadian uji QA',
		uraian: 'NARASI-PRIVAT-QA-123',
		requestKey: randomUUID()
	};
	let result = await post('create', values);
	assert.equal(result.result.type, 'success', JSON.stringify(result.result));
	const [record] = await exec('SELECT * FROM pengasuhan_catatan WHERE request_key=?', [
		values.requestKey
	]);
	assert.ok(record);
	assert.equal((await post('create', values)).result.type, 'success');
	assert.equal(
		(
			await exec('SELECT count(*) AS n FROM pengasuhan_catatan WHERE request_key=?', [
				values.requestKey
			])
		)[0].n,
		1
	);
	assert.equal((await post('create', { ...values, judul: 'Berubah' })).result.type, 'failure');
	assert.equal(
		(await post('create', { ...values, muridId: String(students[1].id), requestKey: randomUUID() }))
			.result.type,
		'failure'
	);
	pass('simpan, idempotensi, dan tolak murid di luar penugasan');
	assert.equal((await get(`/api/pengasuhan/catatan/${record.id}`, 'other')).status, 404);
	assert.equal((await get(`/api/pengasuhan/catatan/${record.id}`, 'asrama')).status, 200);
	assert.equal(
		(await get(`/api/pengasuhan/catatan/${record.id}`, 'admin')).headers.get('cache-control'),
		'private, no-store'
	);
	assert.ok(
		!(await (await get('/pengasuhan/kejadian', 'other')).text()).includes('NARASI-PRIVAT-QA-123')
	);
	pass('IDOR ditolak; Wali Asrama penugasan dan admin dapat mengawasi');
	const follow = {
		id: String(record.id),
		revisi: '0',
		status: 'diproses',
		uraian: 'Tindak lanjut privat QA',
		requestKey: randomUUID()
	};
	assert.equal((await post('followup', follow)).result.type, 'success');
	assert.equal((await post('followup', follow)).result.type, 'success');
	assert.equal(
		(await post('followup', { ...follow, requestKey: randomUUID() })).result.type,
		'failure'
	);
	assert.equal(
		(await post('followup', { ...follow, revisi: '1', status: 'baru', requestKey: randomUUID() }))
			.result.type,
		'failure'
	);
	assert.equal(
		(
			await post('followup', {
				...follow,
				revisi: '1',
				status: 'selesai',
				requestKey: randomUUID()
			})
		).result.type,
		'success'
	);
	pass('riwayat tindak lanjut, replay, revisi basi, dan transisi status');
	const concurrent = await Promise.all(
		[1, 2].map((i) =>
			post('followup', {
				...follow,
				revisi: '2',
				status: 'selesai',
				uraian: `Koreksi bersamaan ${i}`,
				requestKey: randomUUID()
			})
		)
	);
	assert.equal(concurrent.filter((r) => r.result.type === 'success').length, 1);
	assert.equal(
		(await exec('SELECT revisi FROM pengasuhan_catatan WHERE id=?', [record.id]))[0].revisi,
		3
	);
	pass('dua pembaruan bersamaan tidak saling menimpa');
	for (let i = 0; i < 2; i++)
		assert.equal(
			(await post('create', { ...values, jenis: 'sakit', requestKey: randomUUID() })).result.type,
			i ? 'failure' : 'success'
		);
	pass('satu pantauan sakit aktif per UID');
	const reportValues = {
		id: '0',
		revisi: '0',
		tanggal: today,
		shift: 'malam',
		ringkasan: 'Piket pribadi QA',
		serahTerima: 'Periksa catatan terbuka'
	};
	assert.equal((await post('report', reportValues)).result.type, 'success');
	const [report] = await exec('SELECT * FROM pengasuhan_piket WHERE petugas_id=?', [guardian.id]);
	assert.ok(!(await (await get('/pengasuhan/piket', 'other')).text()).includes('Piket pribadi QA'));
	assert.equal(
		(await post('report', { ...reportValues, id: String(report.id), selesai: 'on' })).result.type,
		'success'
	);
	assert.equal(
		(await post('report', { ...reportValues, id: String(report.id), revisi: '1' })).result.type,
		'failure'
	);
	pass('laporan pribadi dan laporan selesai terkunci');
	await exec("UPDATE pegawai SET status='nonaktif' WHERE id=?", [guardian.employee]);
	assert.equal((await get(`/api/pengasuhan/catatan/${record.id}`, 'asuh')).status, 403);
	await exec("UPDATE pegawai SET status='aktif' WHERE id=?", [guardian.employee]);
	await exec('UPDATE murid SET wali_asuh_nama=? WHERE id=?', ['QA Asuh B', students[0].id]);
	assert.equal((await get(`/api/pengasuhan/catatan/${record.id}`, 'asuh')).status, 404);
	await exec('UPDATE murid SET wali_asuh_nama=? WHERE id=?', ['QA Asuh A', students[0].id]);
	pass('pegawai nonaktif dan pencabutan penugasan menutup akses');
	const [duplicate] = await exec(
		"INSERT INTO pegawai(sekolah_id,nama,nip,jenis,status,created_at) VALUES(?,?,?,'wali_asuh','aktif',?) RETURNING id",
		[school, 'QA Asuh A', 'QA-DUP', new Date().toISOString()]
	);
	assert.equal((await get(`/api/pengasuhan/catatan/${record.id}`, 'asuh')).status, 404);
	await exec('DELETE FROM pegawai WHERE id=?', [duplicate.id]);
	pass('nama pegawai ambigu tidak memperluas penugasan');
	const [currentSemester] = await exec('SELECT * FROM semester WHERE id=?', [academic.id]);
	await exec('UPDATE tahun_ajaran SET is_aktif=1 WHERE id=?', [currentSemester.tahun_ajaran_id]);
	const [historyYear] = await exec(
		"INSERT INTO tahun_ajaran(sekolah_id,nama,is_aktif,created_at) VALUES(?,'QA-History',0,?) RETURNING id",
		[school, new Date().toISOString()]
	);
	const semesterColumns = (await exec("PRAGMA table_info('semester')"))
		.map((c) => c.name)
		.filter((c) => c !== 'id');
	const [historySemester] = await exec(
		`INSERT INTO semester(${semesterColumns.join(',')}) VALUES(${semesterColumns.map(() => '?').join(',')}) RETURNING id`,
		semesterColumns.map((c) =>
			c === 'is_aktif' ? 0 : c === 'tahun_ajaran_id' ? historyYear.id : currentSemester[c]
		)
	);
	const [currentStudent] = await exec('SELECT * FROM murid WHERE id=?', [students[0].id]);
	await exec('UPDATE murid SET semester_id=? WHERE id=?', [historySemester.id, students[0].id]);
	await exec('UPDATE murid_identity_link SET semester_id=? WHERE murid_id=?', [
		historySemester.id,
		students[0].id
	]);
	const studentColumns = (await exec("PRAGMA table_info('murid')"))
		.map((c) => c.name)
		.filter((c) => c !== 'id');
	const [newStudent] = await exec(
		`INSERT INTO murid(${studentColumns.join(',')}) VALUES(${studentColumns.map(() => '?').join(',')}) RETURNING id`,
		studentColumns.map((c) => currentStudent[c])
	);
	await exec(
		'INSERT INTO murid_identity_link(murid_id,sekolah_id,semester_id,identity_uid) VALUES(?,?,?,?)',
		[newStudent.id, school, academic.id, students[0].identity_uid]
	);
	assert.equal((await get(`/api/pengasuhan/catatan/${record.id}`, 'asuh')).status, 200);
	students[0].id = newStudent.id;
	values.muridId = String(newStudent.id);
	pass('riwayat mengikuti UID saat baris murid semester berganti');
	const [oldSchool] = await exec('SELECT * FROM sekolah WHERE id=?', [school]);
	const [otherSchool] = await exec(
		"INSERT INTO sekolah(jenjang_pendidikan,nama,npsn,alamat_id,email,kepala_sekolah_id,created_at) VALUES('sd','Sekolah Uji QA','99999999',?,?,?,?) RETURNING id",
		[oldSchool.alamat_id, 'qa@example.test', oldSchool.kepala_sekolah_id, new Date().toISOString()]
	);
	await exec('UPDATE auth_user SET sekolah_id=? WHERE id=?', [otherSchool.id, guardian.id]);
	assert.notEqual((await get(`/api/pengasuhan/catatan/${record.id}`, 'asuh')).status, 200);
	assert.notEqual(
		(await post('followup', { ...follow, revisi: '2', requestKey: randomUUID() })).result.type,
		'success'
	);
	await exec('UPDATE auth_user SET sekolah_id=? WHERE id=?', [school, guardian.id]);
	pass('catatan dan mutasi lintas sekolah ditolak');
	const dev = { ...values, jenis: 'perkembangan', aspek: 'kemandirian', requestKey: randomUUID() };
	assert.equal((await post('create', dev)).result.type, 'success');
	assert.equal(
		(await exec('SELECT status FROM pengasuhan_catatan WHERE request_key=?', [dev.requestKey]))[0]
			.status,
		'selesai'
	);
	assert.equal(
		(await post('create', { ...dev, aspek: '', requestKey: randomUUID() })).result.type,
		'failure'
	);
	pass('perkembangan tercatat dan aspek wajib valid');
	for (const [table, snapshot] of snapshots)
		assert.equal(
			JSON.stringify(await exec(`SELECT * FROM "${table}" ORDER BY rowid`)),
			snapshot,
			`${table} berubah`
		);
	const audit = JSON.stringify(
		await exec("SELECT * FROM audit_log WHERE entity_type='pengasuhan'")
	);
	assert.ok(!audit.includes('NARASI-PRIVAT') && !audit.includes('Tindak lanjut privat'));
	pass('absensi/nilai/catatan rapor tetap; audit tanpa narasi pribadi');
	browser = await puppeteer.launch({
		executablePath:
			process.env.PUPPETEER_EXECUTABLE_PATH ||
			'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage(),
		browserErrors = [];
	page.on('pageerror', (err) => browserErrors.push(err.message));
	const token = cookies.get('asuh').split(';')[0].split('=')[1];
	await page.evaluateOnNewDocument(() => {
		Object.defineProperty(crypto, 'randomUUID', { value: undefined });
	});
	await page.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(school), url: base }
	);
	for (const [width, height] of [
		[1440, 1000],
		[768, 1024],
		[390, 844],
		[320, 740]
	]) {
		await page.setViewport({ width, height });
		await page.goto(`${base}/pengasuhan/kejadian`, { waitUntil: 'networkidle0' });
		await page.waitForSelector('button.btn-primary');
		await page.screenshot({ path: path.join(dir, `kejadian-${width}.png`), fullPage: true });
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
			`Page overflow ${width}`
		);
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find((b) => b.textContent.includes('Catat Pengasuhan'))
				.click()
		);
		await page.waitForSelector('dialog[open]');
		await new Promise((r) => setTimeout(r, 400));
		const bounds = await page.$eval('dialog .modal-box', (el) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
		});
		assert.ok(
			bounds.x >= 0 && bounds.right <= width + 1 && bounds.y >= 0 && bounds.bottom <= height + 1,
			JSON.stringify(bounds)
		);
		await writeFile(path.join(dir, `modal-metrics-${width}.json`), JSON.stringify(bounds));
		await page.screenshot({ path: path.join(dir, `form-${width}.png`) });
		await page.keyboard.press('Escape');
		assert.equal(await page.$eval('dialog', (el) => el.open), false);
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(`${base}/pengasuhan/kejadian`, { waitUntil: 'networkidle0' });
	await page.evaluate(() =>
		[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Detail')).click()
	);
	await page.waitForSelector('dialog textarea[name=uraian]');
	await new Promise((r) => setTimeout(r, 400));
	await page.screenshot({ path: path.join(dir, 'detail-desktop.png') });
	await page.keyboard.press('Escape');
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((b) => b.textContent.includes('Catat Pengasuhan'))
			.click()
	);
	await page.waitForSelector('dialog[open]');
	await page.select('dialog select[name=muridId]', String(students[0].id));
	await page.$eval('dialog input[name=waktu]', (el) => {
		el.value = '08:00';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.type('dialog input[name=judul]', 'Simpan melalui browser');
	await page.type('dialog textarea[name=uraian]', 'Catatan browser QA');
	const saved = page.waitForResponse(
		(r) => r.url().includes('?/create') && r.request().method() === 'POST'
	);
	await page.click('dialog button.btn-primary');
	await saved;
	await page.waitForFunction(() => !document.querySelector('dialog').open);
	assert.equal(
		(
			await exec(
				"SELECT count(*) AS n FROM pengasuhan_catatan WHERE judul='Simpan melalui browser'"
			)
		)[0].n,
		1
	);
	pass('formulir browser menyimpan dan menyegarkan daftar');
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((b) => b.textContent.includes('Catat Pengasuhan'))
			.click()
	);
	await page.select('dialog select[name=muridId]', String(students[0].id));
	await page.$eval('dialog input[name=waktu]', (el) => {
		el.value = '08:00';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.type('dialog input[name=judul]', 'Draf harus tetap ada');
	await page.type('dialog textarea[name=uraian]', 'Jangan hilangkan isian');
	await page.evaluate(
		() => (document.querySelector('dialog input[name=requestKey]').value = 'bad')
	);
	const rejected = page.waitForResponse(
		(r) => r.url().includes('?/create') && r.request().method() === 'POST'
	);
	await page.click('dialog button.btn-primary');
	await rejected;
	await page.waitForSelector('dialog [role=alert]');
	assert.equal(
		await page.$eval('dialog textarea[name=uraian]', (el) => el.value),
		'Jangan hilangkan isian'
	);
	page.once('dialog', (d) => d.dismiss());
	await page.keyboard.press('Escape');
	assert.equal(await page.$eval('dialog', (el) => el.open), true);
	page.once('dialog', (d) => d.accept());
	await page.keyboard.press('Escape');
	pass('gagal simpan mempertahankan isian dan Escape mengonfirmasi draf');
	await page.evaluate(() =>
		[...document.querySelectorAll('button')]
			.find((b) => b.textContent.includes('Catat Pengasuhan'))
			.click()
	);
	assert.equal(await page.$eval('dialog textarea[name=uraian]', (el) => el.value), '');
	await page.keyboard.press('Escape');
	pass('form baru bersih dan popup tanpa randomUUID (LAN)');
	if (process.env.QA_ADAPTIVE_AUDIT === '1') {
		const baseline = process.env.QA_ADAPTIVE_BASELINE === '1';
		await page.setCookie(
			{
				name: 'rapkumer-session',
				value: cookies.get('admin').split(';')[0].split('=')[1],
				url: base
			},
			{ name: 'active-kelas-id', value: String(students[0].kelas_id), url: base }
		);
		await exec('UPDATE murid SET nama=?,tempat_lahir=? WHERE id=?', [
			'Murid Uji A dengan nama panjang untuk pemeriksaan lebar kolom dan keterbacaan',
			'Kota Pengujian Dengan Nama Panjang',
			students[0].id
		]);
		const measurements = [];
		for (const [width, height] of [
			[2560, 1440],
			[1920, 1080],
			[1366, 768],
			[1024, 768],
			[768, 1024],
			[390, 844],
			[320, 740]
		]) {
			await page.setViewport({ width, height });
			for (const [name, route] of [
				['murid', '/murid?q=Murid%20Uji%20A'],
				['pengasuhan', '/pengasuhan/ringkasan']
			]) {
				await page.goto(`${base}${route}`, { waitUntil: 'networkidle0' });
				const metrics = await page.evaluate(() => {
					const measure = (selector) => {
						const el = document.querySelector(selector);
						if (!el) return null;
						const r = el.getBoundingClientRect(),
							css = getComputedStyle(el);
						return { x: r.x, right: r.right, width: r.width, height: r.height, font: css.fontSize };
					};
					return {
						overflow: document.documentElement.scrollWidth > innerWidth + 1,
						viewport: measure('.app-page-viewport'),
						content: measure('.app-page-container'),
						table: measure('table'),
						scroll: measure('.murid-table-scroll, .care-table-scroll'),
						row: measure('table tbody tr'),
						button: measure('table tbody .btn'),
						keyColumn: measure(
							'.murid-table tbody td:nth-child(3), .care-table tbody th:first-child'
						),
						title: measure('.care-heading h1, h2')
					};
				});
				assert.equal(metrics.overflow, false, `${name}/${width} page overflow`);
				if (!baseline) {
					// Includes both page gutters and the reserved vertical scrollbar gutter.
					assert.ok(
						metrics.viewport.width - metrics.content.width <= 64,
						`${name}/${width} content capped: ${JSON.stringify(metrics)}`
					);
					assert.ok(metrics.scroll.right <= width, `${name}/${width} table viewport clipped`);
					if (width >= 1920)
						assert.ok(metrics.keyColumn.width <= 482, `${name}/${width} name column overstretched`);
				}
				measurements.push({ name, width, height, ...metrics });
				await page.screenshot({ path: path.join(dir, `adaptive-${name}-${width}.png`) });
				await page.$eval('table', (el) => el.scrollIntoView({ block: 'center' }));
				await page.screenshot({ path: path.join(dir, `adaptive-${name}-table-${width}.png`) });
				if (!baseline && width <= 768) {
					const selector = name === 'murid' ? '.murid-table-scroll' : '.care-table-scroll';
					await page.focus(selector);
					await page.keyboard.press('ArrowRight');
					await new Promise((resolve) => setTimeout(resolve, 250));
					assert.ok(await page.$eval(selector, (el) => el.scrollLeft > 0));
					await page.$eval(selector, (el) => (el.scrollLeft = el.scrollWidth));
					assert.ok(
						await page.$eval(
							selector,
							(el, tableName) => {
								const viewport = el.getBoundingClientRect();
								const sticky = el.querySelector(
									tableName === 'murid' ? 'tbody td:nth-child(3)' : 'tbody th'
								);
								const keyRight =
									sticky && getComputedStyle(sticky).position === 'sticky'
										? sticky.getBoundingClientRect().right
										: viewport.left;
								return [...el.querySelectorAll('tbody .btn')].every((button) => {
									const r = button.getBoundingClientRect();
									return r.x >= keyRight - 1 && r.right <= viewport.right + 1;
								});
							},
							name
						),
						`${name}/${width} row action covered by sticky column`
					);
					await page.screenshot({ path: path.join(dir, `adaptive-${name}-actions-${width}.png`) });
				}
				if (name === 'pengasuhan' && [2560, 390, 320].includes(width)) {
					await page.click('.care-header .btn');
					await page.waitForSelector('dialog[open]');
					await new Promise((resolve) => setTimeout(resolve, 400));
					const bounds = await page.$eval('dialog .modal-box', (el) => {
						const r = el.getBoundingClientRect();
						return { x: r.x, right: r.right, width: r.width, bottom: r.bottom, y: r.y };
					});
					assert.ok(
						bounds.width <= 672 &&
							bounds.x >= 0 &&
							bounds.right <= width &&
							bounds.bottom <= height &&
							bounds.y >= 0
					);
					await page.screenshot({ path: path.join(dir, `adaptive-form-${width}.png`) });
					await page.keyboard.press('Escape');
				}
			}
		}
		if (!baseline) {
			for (const name of ['murid', 'pengasuhan']) {
				const fonts = measurements.filter((m) => m.name === name).map((m) => m.button.font);
				assert.equal(new Set(fonts).size, 1, `${name} button font scales with viewport`);
			}
		}
		await page.setViewport({ width: 2560, height: 1440 });
		if (!baseline) {
			await page.goto(`${base}/murid?q=Murid%20Uji%20A`, { waitUntil: 'networkidle0' });
			await page.click('input[name=muridIds]');
			await page.waitForFunction(
				() => document.querySelector('thead input[type=checkbox]').indeterminate
			);
			await page.click('thead input[type=checkbox]');
			assert.ok(
				await page.$$eval(
					'input[name=muridIds]',
					(items) => items.length > 0 && items.every((el) => el.checked)
				)
			);
			await page.click('thead input[type=checkbox]');
			assert.ok(
				await page.$$eval('input[name=muridIds]', (items) => items.every((el) => !el.checked))
			);
			for (const query of ['NO_MATCH_ADAPTIVE_QA', 'Murid Uji A']) {
				await page.$eval(
					'input[name=q]',
					(el, value) => {
						el.value = value;
						el.dispatchEvent(new Event('input', { bubbles: true }));
					},
					query
				);
				await page.waitForSelector(
					query.startsWith('NO_MATCH') ? '.murid-empty' : 'input[name=muridIds]'
				);
			}
			await page.click('input[name=muridIds]');
			await page.waitForFunction(
				() => document.querySelector('thead input[type=checkbox]').indeterminate
			);
			await page.click('input[name=muridIds]');
		}
		await page.goto(`${base}/pegawai`, { waitUntil: 'networkidle0' });
		assert.ok(
			await page.$eval('.app-page-container', (el) => el.getBoundingClientRect().width <= 1280)
		);
		for (const route of [
			'/murid?q=NO_MATCH_ADAPTIVE_QA',
			'/pengasuhan/kejadian?q=NO_MATCH_ADAPTIVE_QA'
		]) {
			await page.setViewport({ width: 320, height: 740 });
			await page.goto(`${base}${route}`, { waitUntil: 'networkidle0' });
			const empty = await page.$eval('table tbody td, .murid-empty, .care-empty', (el) => {
				const r = el.getBoundingClientRect();
				return { x: r.x, right: r.right };
			});
			if (!baseline) assert.ok(empty.x >= 0 && empty.right <= 320);
			await page.screenshot({
				path: path.join(dir, `adaptive-empty-${route.startsWith('/murid') ? 'murid' : 'care'}.png`)
			});
		}
		await writeFile(
			path.join(dir, 'adaptive-measurements.json'),
			JSON.stringify(measurements, null, 2)
		);
		pass(
			`adaptive ${baseline ? 'baseline' : 'verification'}: two menus, seven viewports, bounded modals, internal table scroll, unchanged control page`
		);
	}
	if (process.env.QA_UI_AUDIT === '1') {
		const measurements = [];
		for (const width of [2560, 1920, 1440, 1366, 1024, 768, 390, 320]) {
			await page.setViewport({ width, height: width < 640 ? 844 : 1000 });
			for (const section of ['ringkasan', 'piket', 'kejadian', 'perkembangan', 'sakit']) {
				await page.goto(`${base}/pengasuhan/${section}`, { waitUntil: 'networkidle0' });
				await page.screenshot({
					path: path.join(dir, `ui-${section}-${width}.png`),
					fullPage: true
				});
				const metrics = await page.evaluate(() => {
					const measure = (selector) => {
						const el = document.querySelector(selector);
						if (!el) return null;
						const r = el.getBoundingClientRect(),
							s = getComputedStyle(el);
						return {
							width: r.width,
							height: r.height,
							x: r.x,
							y: r.y,
							font: s.fontSize,
							padding: s.padding
						};
					};
					return {
						overflow: document.documentElement.scrollWidth > innerWidth + 1,
						sidebar: measure('.app-sidebar'),
						navbar: measure('.app-navbar'),
						content: measure('.app-page-container'),
						title: measure('.app-page-container h1'),
						tableHeader: measure('table thead th'),
						tableRow: measure('table tbody tr'),
						input: measure('input[name=q]'),
						action: measure('.app-page-container button.btn-primary')
					};
				});
				assert.equal(metrics.overflow, false, `UI overflow ${section}/${width}`);
				assert.ok(
					await page.$$eval('.care-detail', (buttons) =>
						buttons.every(
							(el) =>
								el.scrollWidth <= el.clientWidth && getComputedStyle(el).whiteSpace === 'nowrap'
						)
					),
					`Clipped action ${section}/${width}`
				);
				await page.waitForFunction(() => {
					const active = document.querySelector('.care-nav [aria-current=page]');
					const track = document.querySelector('.care-nav');
					const a = active.getBoundingClientRect(),
						t = track.getBoundingClientRect();
					return a.left >= t.left - 1 && a.right <= t.right + 1;
				});
				const table = await page.$('.care-table-scroll');
				if (table) {
					await table.evaluate((el) => el.scrollIntoView({ block: 'center' }));
					await page.screenshot({ path: path.join(dir, `ui-${section}-table-${width}.png`) });
				}
				measurements.push({ width, section, ...metrics });
			}
		}
		await page.setViewport({ width: 390, height: 844 });
		await page.goto(`${base}/pengasuhan/kejadian?q=NO_MATCH_QA`, { waitUntil: 'networkidle0' });
		await page.screenshot({ path: path.join(dir, 'ui-filtered-empty-390.png'), fullPage: true });
		await page.goto(`${base}/pengasuhan/piket`, { waitUntil: 'networkidle0' });
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find((b) => b.textContent.includes('Laporan Piket'))
				.click()
		);
		await page.waitForSelector('dialog[open]');
		await new Promise((r) => setTimeout(r, 400));
		await page.screenshot({ path: path.join(dir, 'ui-piket-form-390.png') });
		await page.keyboard.press('Escape');
		await page.goto(`${base}/pengasuhan/ringkasan`, { waitUntil: 'networkidle0' });
		await page.$eval('.care-table-scroll', (el) => el.scrollIntoView({ block: 'center' }));
		await page.screenshot({ path: path.join(dir, 'ui-table-390-start.png') });
		await page.focus('.care-table-scroll');
		await page.keyboard.press('ArrowRight');
		await new Promise((r) => setTimeout(r, 300));
		assert.ok(await page.$eval('.care-table-scroll', (el) => el.scrollLeft > 0));
		await page.$eval('.care-table-scroll', (el) => (el.scrollLeft = el.scrollWidth));
		await page.screenshot({ path: path.join(dir, 'ui-table-390-end.png') });
		await page.click('.care-table button');
		await page.waitForSelector('dialog textarea[name=uraian]');
		await new Promise((r) => setTimeout(r, 400));
		const footerPosition = () =>
			page.$eval('.care-modal-footer', (el) => {
				const r = el.getBoundingClientRect();
				return { top: r.top, bottom: r.bottom };
			});
		const footerBefore = await footerPosition();
		await page.$eval('.care-modal-body', (el) => (el.scrollTop = el.scrollHeight));
		assert.deepEqual(await footerPosition(), footerBefore);
		assert.ok(footerBefore.bottom <= 844);
		await page.screenshot({ path: path.join(dir, 'ui-detail-scrolled-390.png') });
		for (let i = 0; i < 12; i++) {
			await page.keyboard.press('Tab');
			// Chrome may move focus to its own toolbar; background controls must remain inert.
			assert.ok(
				await page.evaluate(
					() =>
						document.activeElement === document.body || !!document.activeElement?.closest('dialog')
				)
			);
		}
		await page.keyboard.press('Escape');
		assert.ok(await page.evaluate(() => document.activeElement?.matches('.care-table button')));
		pass(
			'gulir tabel dengan keyboard, footer popup tetap, latar tidak fokus dan fokus kembali ke pemicu'
		);
		await page.goto(`${base}/pengasuhan/ringkasan`, { waitUntil: 'networkidle0' });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		await page.screenshot({ path: path.join(dir, 'ui-dark-390.png'), fullPage: true });
		await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
		await page.setViewport({ width: 844, height: 390 });
		await page.goto(`${base}/pengasuhan/perkembangan`, { waitUntil: 'networkidle0' });
		await page.click('.care-create');
		await page.waitForSelector('dialog[open]');
		await new Promise((r) => setTimeout(r, 400));
		assert.ok(await page.$eval('.care-modal-body', (el) => el.scrollHeight > el.clientHeight));
		const landscape = await page.$eval('.care-modal-box', (el) => {
			const r = el.getBoundingClientRect();
			return { top: r.top, bottom: r.bottom, width: r.width };
		});
		assert.ok(landscape.top >= 0 && landscape.bottom <= 390 && landscape.width <= 672);
		await page.$eval('.care-modal-body', (el) => (el.scrollTop = el.scrollHeight));
		await page.screenshot({ path: path.join(dir, 'ui-short-landscape-form.png') });
		await page.keyboard.press('Escape');
		pass('popup layar mendatar pendek tetap dibatasi dan isi dapat digulir');

		await page.setViewport({ width: 390, height: 844 });
		await page.goto(`${base}/pengasuhan/ringkasan`, { waitUntil: 'networkidle0' });
		await page.evaluate(() => {
			for (const el of document.querySelectorAll('.care-metric h2'))
				el.textContent = 'Perkembangan dan tindak lanjut murid dengan nama panjang';
			for (const el of document.querySelectorAll('.care-metric-value')) el.textContent = '9999';
			const name = document.querySelector('.care-person .care-cell-title');
			name.textContent = 'Nama Murid Dengan Beberapa Kata Sangat Panjang Sekali';
		});
		assert.ok(
			await page.$$eval('.care-metric', (items) =>
				items.every((el) => {
					const copy = el.querySelector('.care-metric-copy').getBoundingClientRect();
					const value = el.querySelector('.care-metric-value').getBoundingClientRect();
					return copy.right <= value.left && el.scrollWidth <= el.clientWidth;
				})
			)
		);
		await page.screenshot({ path: path.join(dir, 'ui-long-content-390.png') });
		pass('label panjang dan angka empat digit tidak bertumpuk');

		await page.goto(`${base}/pengasuhan/ringkasan`, { waitUntil: 'networkidle0' });
		let releaseRequest;
		const gate = new Promise((resolve) => {
			releaseRequest = resolve;
		});
		const intercept = async (request) => {
			if (request.url().includes('/api/pengasuhan/catatan/')) {
				await gate;
				await request.respond({ status: 503, contentType: 'text/plain', body: 'QA unavailable' });
			} else await request.continue();
		};
		await page.setRequestInterception(true);
		page.on('request', intercept);
		await page.$eval('.care-table-scroll', (el) => el.scrollIntoView({ block: 'center' }));
		await page.click('.care-table button');
		await page.waitForSelector('.care-modal-loading');
		await new Promise((r) => setTimeout(r, 400));
		await page.screenshot({ path: path.join(dir, 'ui-detail-loading-390.png') });
		releaseRequest();
		await page.waitForSelector('dialog [role=alert]');
		await page.screenshot({ path: path.join(dir, 'ui-detail-error-390.png') });
		page.off('request', intercept);
		await page.setRequestInterception(false);
		await page.keyboard.press('Escape');
		pass('status memuat dan gagal memuat detail tampil tanpa kehilangan tata letak');
		await writeFile(path.join(dir, 'ui-measurements.json'), JSON.stringify(measurements, null, 2));
		pass('audit visual lima halaman, delapan viewport, filter kosong, piket, dan tema gelap');
	}
	assert.deepEqual(browserErrors, []);
	pass('desktop/tablet/HP, dialog dan Escape tanpa overflow atau galat JavaScript');
	assert.equal((await exec('PRAGMA quick_check'))[0].quick_check, 'ok');
	await writeFile(
		path.join(dir, 'results.json'),
		JSON.stringify({ results, directory: dir }, null, 2)
	);
	console.log(`QA_RESULTS=${dir}`);
} catch (e) {
	await writeFile(path.join(dir, 'error.log'), `${e.stack}\n${output}`);
	throw e;
} finally {
	if (browser) await browser.close();
	db.close();
	if (child.exitCode === null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
}
