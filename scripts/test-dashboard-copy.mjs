import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const port = 5153,
	base = `http://127.0.0.1:${port}`;
assert.equal(
	await new Promise((resolve) => {
		const socket = net.connect(port, '127.0.0.1');
		socket.once('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.once('error', () => {
			socket.destroy();
			resolve(false);
		});
	}),
	false,
	'Test port occupied; no existing server will be stopped.'
);
const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-dashboard-'));
const databasePath = path.join(directory, 'runtime.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try {
	await source.execute(`VACUUM INTO '${databasePath.replaceAll('\\', '/').replaceAll("'", "''")}'`);
} finally {
	source.close();
}
const db = createClient({ url: `file:${databasePath}` });
const first = (
	await db.execute(
		'SELECT k.* FROM kelas k JOIN semester s ON s.id=k.semester_id JOIN tahun_ajaran t ON t.id=k.tahun_ajaran_id WHERE s.is_aktif=1 AND t.is_aktif=1 ORDER BY k.id LIMIT 1'
	)
).rows[0];
assert.ok(first);
const seed = (await db.execute('SELECT * FROM auth_user LIMIT 1')).rows[0];
const columns = (await db.execute('PRAGMA table_info(auth_user)')).rows.map((row) =>
	String(row.name)
);
async function account(type, assigned = false, employeeId = null) {
	const username = `qa-dashboard-${randomBytes(8).toString('hex')}`;
	const values = {
		...seed,
		id: null,
		username,
		username_normalized: username,
		type,
		permissions: '[]',
		sekolah_id: first.sekolah_id,
		kelas_id: first.id,
		pegawai_id: employeeId,
		must_change_password: 0
	};
	const inserted = await db.execute({
		sql: `INSERT INTO auth_user (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
		args: columns.map((c) => values[c] ?? null)
	});
	if (assigned)
		await db.execute({
			sql: 'INSERT INTO auth_user_kelas (auth_user_id,kelas_id,created_at) VALUES (?,?,?)',
			args: [Number(inserted.lastInsertRowid), first.id, new Date().toISOString()]
		});
	const token = randomBytes(32).toString('base64url');
	await db.execute({
		sql: 'INSERT INTO auth_session (user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?)',
		args: [
			Number(inserted.lastInsertRowid),
			createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 3600000).toISOString(),
			new Date().toISOString()
		]
	});
	return `rapkumer-session=${token}; active-sekolah-id=${first.sekolah_id}; active-kelas-id=${first.id}`;
}
const accounts = {
	admin: await account('admin'),
	teacher: await account('user', true),
	denied: await account('user'),
	guardian: await account('wali_asuh'),
	dorm: await account('wali_asrama'),
	homeroom: await account('wali_kelas')
};
const today = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Jakarta',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
}).format(new Date());
const child = (
	await db.execute({
		sql: 'SELECT id FROM murid WHERE kelas_id=? AND semester_id=? LIMIT 1',
		args: [first.id, first.semester_id]
	})
).rows[0];
assert.ok(child, 'Active class needs a student for count tests.');
await db.execute({
	sql: 'DELETE FROM absensi_harian WHERE sekolah_id=? AND tanggal=?',
	args: [first.sekolah_id, today]
});
await db.execute({
	sql: 'INSERT INTO absensi_harian (sekolah_id,semester_id,kelas_id,murid_id,tanggal,status,metode,created_at) VALUES (?,?,?,?,?,?,?,?)',
	args: [
		first.sekolah_id,
		first.semester_id,
		first.id,
		child.id,
		today,
		'alfa',
		'manual',
		new Date().toISOString()
	]
});
const expectedTeacher = Number(
	(
		await db.execute({
			sql: 'SELECT count(*) AS total FROM murid WHERE sekolah_id=? AND kelas_id=? AND semester_id=?',
			args: [first.sekolah_id, first.id, first.semester_id]
		})
	).rows[0].total
);
const extraChildren = (
	await db.execute({
		sql: 'SELECT id,nama FROM murid WHERE kelas_id=? AND semester_id=? AND id<>? ORDER BY id LIMIT 2',
		args: [first.id, first.semester_id, child.id]
	})
).rows;
assert.equal(extraChildren.length, 2);
for (const [index, student] of extraChildren.entries())
	await db.execute({
		sql: 'INSERT INTO absensi_harian (sekolah_id,semester_id,kelas_id,murid_id,tanggal,status,metode,created_at) VALUES (?,?,?,?,?,?,?,?)',
		args: [
			first.sekolah_id,
			first.semester_id,
			first.id,
			student.id,
			today,
			index === 0 ? 'sakit' : 'izin',
			'manual',
			new Date().toISOString()
		]
	});
const childName = String(
	(await db.execute({ sql: 'SELECT nama FROM murid WHERE id=?', args: [child.id] })).rows[0].nama
);
const employee = (
	await db.execute({
		sql: 'SELECT id FROM pegawai WHERE sekolah_id=? LIMIT 1',
		args: [first.sekolah_id]
	})
).rows[0];
assert.ok(employee);
const guardianName = `QA guardian ${randomBytes(6).toString('hex')}`;
await db.execute({
	sql: 'UPDATE pegawai SET nama=? WHERE id=?',
	args: [guardianName, employee.id]
});
await db.execute({
	sql: 'UPDATE murid SET wali_asuh_nama=?,wali_asrama_nama=? WHERE id=?',
	args: [guardianName, guardianName, child.id]
});
accounts.assignedGuardian = await account('wali_asuh', false, Number(employee.id));
accounts.assignedDorm = await account('wali_asrama', false, Number(employee.id));
await db.execute({
	sql: 'INSERT INTO kalender_pendidikan (sekolah_id,tahun_ajaran_id,semester_id,kelas_id,tanggal_mulai,tanggal_selesai,judul,jenis,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
	args: [
		first.sekolah_id,
		first.tahun_ajaran_id,
		first.semester_id,
		first.id,
		today,
		today,
		'QA agenda kelas',
		'kegiatan_sekolah',
		new Date().toISOString()
	]
});
let log = '',
	browser;
const server = spawn(process.execPath, ['build/index.js'], {
	windowsHide: true,
	env: {
		...process.env,
		PORT: String(port),
		HOST: '127.0.0.1',
		ORIGIN: base,
		DB_URL: `file:${databasePath}`,
		NODE_ENV: 'production'
	},
	stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', (chunk) => {
	log += chunk;
});
server.stderr.on('data', (chunk) => {
	log += chunk;
});
try {
	let ready = false;
	for (let i = 0; i < 120; i++) {
		try {
			ready = (await fetch(base + '/login')).status === 200;
		} catch {}
		if (ready) break;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	assert.ok(ready, log);
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	let page, context;
	const errors = [];
	async function selectAccount(cookie) {
		await context?.close();
		context = await browser.createBrowserContext();
		page = await context.newPage();
		await page.setCacheEnabled(false);
		page.on('pageerror', (error) => errors.push(String(error)));
		await context.setCookie(
			...cookie.split('; ').map((pair) => {
				const separator = pair.indexOf('=');
				return {
					name: pair.slice(0, separator),
					value: pair.slice(separator + 1),
					domain: '127.0.0.1',
					path: '/',
					secure: false,
					sameSite: 'Lax'
				};
			})
		);
	}
	for (const [role, cookie] of Object.entries(accounts)) {
		await selectAccount(cookie);
		const response = await page.goto(base, { waitUntil: 'networkidle0' });
		assert.equal(response.status(), 200, role);
		const attendance = (
			await page.$eval('section[aria-label="Absensi hari ini"]', (el) => el.textContent)
		)
			.replace(/\s+/g, ' ')
			.trim();
		assert.ok(attendance.includes('Belum diisi'), role);
		assert.equal(attendance.includes('Pegawai'), role === 'admin', role);
		if (['denied', 'guardian', 'dorm'].includes(role))
			assert.ok(attendance.includes('Murid (0)'), role);
		if (['teacher', 'homeroom'].includes(role)) {
			assert.equal(Number(attendance.match(/Murid\s*\((\d+)\)/)?.[1]), expectedTeacher, role);
			assert.ok(attendance.includes('Alfa 1'), role);
			assert.ok(attendance.includes(`Belum diisi ${expectedTeacher - 3}`), role);
		}
		assert.equal(
			await page.$eval('#absensi-hari-ini', (el) =>
				el.parentElement.previousElementSibling.textContent.includes('Intrakurikuler')
			),
			true,
			'Below subject statistics'
		);
		assert.equal(
			attendance.includes(childName),
			!['denied', 'guardian', 'dorm'].includes(role),
			`${role}: absent student scope`
		);
		for (const student of extraChildren)
			assert.equal(
				attendance.includes(String(student.nama)),
				['admin', 'teacher', 'homeroom'].includes(role),
				`${role}: sick/permission student scope`
			);
		for (const status of ['Sakit', 'Izin', 'Alfa'])
			assert.ok(attendance.includes(`${status} (`), `${role}: category total`);
		if (['assignedGuardian', 'assignedDorm'].includes(role))
			assert.ok(attendance.includes('Murid (1)'), role);
		assert.equal(await page.$('section[aria-label="Agenda hari ini"]'), null);
		assert.ok(await page.$('section[aria-label="Absensi hari ini"] h2 svg'));
		assert.ok(await page.$('section[aria-label="Data belum lengkap"] h2 svg'));
		for (const width of [1440, 390]) {
			await page.setViewport({ width, height: 1000 });
			await new Promise((resolve) => setTimeout(resolve, 500));
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2),
				false,
				`${role} overflow ${width}`
			);
			if (role === 'admin') {
				await page.screenshot({
					path: path.join(directory, `dashboard-${width}.png`),
					fullPage: true
				});
				await page.$eval('section[aria-label="Data belum lengkap"]', el => el.scrollIntoView({ block: 'end' }));
				await page.screenshot({ path: path.join(directory, `dashboard-lower-${width}.png`), fullPage: true });
				await page.$eval('#absensi-hari-ini', el => el.scrollIntoView({ block: 'start' }));
				await page.screenshot({ path: path.join(directory, `dashboard-attendance-${width}.png`), fullPage: true });
			}
		}
	}
	await selectAccount(accounts.admin);
	const sickChildren = (
		await db.execute({
			sql: 'SELECT id FROM murid WHERE kelas_id=? AND semester_id=? AND id NOT IN (?,?) LIMIT 21',
			args: [first.id, first.semester_id, child.id, extraChildren[1].id]
		})
	).rows;
	assert.equal(sickChildren.length, 21, 'Pagination test needs 21 students in the active class.');
	for (const student of sickChildren)
		await db.execute({
			sql: 'INSERT INTO absensi_harian (sekolah_id,semester_id,kelas_id,murid_id,tanggal,status,metode,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(murid_id,tanggal) DO UPDATE SET status=excluded.status',
			args: [
				first.sekolah_id,
				first.semester_id,
				first.id,
				student.id,
				today,
				'sakit',
				'manual',
				new Date().toISOString()
			]
		});
	await page.goto(base, { waitUntil: 'networkidle0' });
	assert.equal(
		await page.$$eval('table[aria-label="Daftar murid Sakit"] tbody tr', (rows) => rows.length),
		20
	);
	await page.click('nav[aria-label="Halaman daftar Sakit"] a[aria-label="Halaman berikutnya"]');
	await page.waitForFunction(() => new URL(location.href).searchParams.get('sakit_page') === '2');
	await page.waitForFunction(
		() => document.querySelectorAll('table[aria-label="Daftar murid Sakit"] tbody tr').length === 1
	);
	assert.ok(
		(await page.$eval('section[aria-label="Absensi hari ini"]', (el) => el.textContent)).includes(
			'21 anak'
		)
	);
	for (const kind of ['foto', 'qr']) {
		assert.equal(
			(
				await page.goto(`${base}/murid?kelas_id=semua&belum_lengkap=${kind}`, {
					waitUntil: 'networkidle0'
				})
			).status(),
			200
		);
	}
	// Switch academic context on the private copy; a new year has no classes yet.
	async function cloneRow(table, id, overrides) {
		const row = (await db.execute({ sql: `SELECT * FROM ${table} WHERE id=?`, args: [id] }))
			.rows[0];
		const values = { ...row, id: null, ...overrides };
		const keys = Object.keys(row);
		return Number(
			(
				await db.execute({
					sql: `INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
					args: keys.map((key) => values[key] ?? null)
				})
			).lastInsertRowid
		);
	}
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=0 WHERE sekolah_id=?',
		args: [first.sekolah_id]
	});
	const newYear = await cloneRow('tahun_ajaran', first.tahun_ajaran_id, {
		nama: 'QA new year',
		is_aktif: 1
	});
	await cloneRow('semester', first.semester_id, { tahun_ajaran_id: newYear, is_aktif: 1 });
	assert.equal((await page.goto(base, { waitUntil: 'networkidle0' })).status(), 200);
	assert.ok(
		(await page.$eval('section[aria-label="Absensi hari ini"]', (el) => el.textContent))
			.replace(/\s+/g, ' ')
			.includes('Murid (0)')
	);
	assert.deepEqual(errors, []);
	assert.equal(String((await db.execute('PRAGMA quick_check')).rows[0].quick_check), 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	console.log(
		'PASS dashboard admin, assigned teacher, unassigned accounts, guardians, mobile/desktop, SQLite.'
	);
	console.log('QA copy and screenshots:', directory);
} finally {
	await browser?.close();
	server.kill();
	await new Promise((resolve) =>
		server.exitCode !== null ? resolve() : server.once('exit', resolve)
	);
	db.close();
	await writeFile(path.join(directory, 'server.log'), log);
}
