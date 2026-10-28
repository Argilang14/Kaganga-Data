import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer-core';

const dir = path.resolve('tmp', `murid-class-excel-${Date.now()}`);
await mkdir(dir, { recursive: true });
const database = path.join(dir, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute(`VACUUM INTO '${database.replaceAll("'", "''")}'`);
source.close();
const db = createClient({ url: `file:${database}` });
const sql = async (query, args = []) => {
	for (let attempt = 0; ; attempt++) {
		try {
			return (await db.execute({ sql: query, args })).rows;
		} catch (error) {
			if (error.code !== 'SQLITE_BUSY' || attempt >= 30) throw error;
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
	}
};
const port = 5188,
	base = `http://127.0.0.1:${port}`;
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
		KAGANGA_DATA_DIR: dir,
		HOST: '127.0.0.1',
		PORT: String(port),
		ORIGIN: base,
		NODE_ENV: 'production'
	}
});
let output = '',
	browser;
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));
const results = [];
const pass = (message) => {
	results.push(message);
	console.log(`PASS ${message}`);
};
try {
	for (let i = 0; ; i++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) break;
		} catch {
			/* Isolated server is starting. */
		}
		if (i >= 100) throw new Error('QA server did not start');
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	const [school] = await sql('SELECT id FROM sekolah ORDER BY id LIMIT 1');
	const [year] = await sql(
		'SELECT id FROM tahun_ajaran WHERE sekolah_id=? ORDER BY is_aktif DESC,id DESC LIMIT 1',
		[school.id]
	);
	const [semester] = await sql(
		'SELECT id FROM semester WHERE tahun_ajaran_id=? ORDER BY is_aktif DESC,id LIMIT 1',
		[year.id]
	);
	const classes = await sql(
		'SELECT k.id,k.nama,count(m.id) AS jumlah FROM kelas k LEFT JOIN murid m ON m.kelas_id=k.id WHERE k.sekolah_id=? AND k.semester_id=? GROUP BY k.id ORDER BY jumlah DESC,k.id',
		[school.id, semester.id]
	);
	assert.ok(
		classes.length >= 2 && classes[0].jumlah > 0,
		'Requires at least two classes and student data in the local copy'
	);
	const now = new Date().toISOString();
	const [user] = await sql(
		'INSERT INTO auth_user(username,username_normalized,password_hash,password_salt,type,sekolah_id,permissions,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,0,?) RETURNING id',
		['QA Excel', `qa-excel-${Date.now()}`, 'unused', 'unused', 'admin', school.id, '[]', now]
	);
	const token = randomBytes(32).toString('base64url');
	await sql(
		'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)',
		[
			user.id,
			createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 3600000).toISOString(),
			now,
			now
		]
	);
	const cookie = `rapkumer-session=${token}; active-sekolah-id=${school.id}`;
	const request = (query) =>
		fetch(`${base}/api/murid/download-excel?${query}`, { headers: { cookie } });
	async function workbook(query) {
		const response = await request(query);
		assert.equal(
			response.status,
			200,
			await response
				.clone()
				.text()
				.then((text) => (response.ok ? '' : text))
		);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
		const book = new ExcelJS.Workbook();
		await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
		return {
			rows: book.worksheets[0]
				.getSheetValues()
				.slice(1)
				.map((row) => row.slice(1)),
			disposition: response.headers.get('content-disposition')
		};
	}
	const all = await workbook('status=aktif');
	assert.equal(all.disposition, 'attachment; filename="Data Murid-aktif.xlsx"');
	for (const kelas of classes.slice(0, 2)) {
		const single = await workbook(`status=aktif&kelas_id=${kelas.id}`);
		assert.deepEqual(single.rows[0], all.rows[0]);
		assert.deepEqual(
			single.rows.slice(1),
			all.rows.slice(1).filter((row) => row[2] === kelas.nama)
		);
		assert.ok(single.disposition.includes(`Kelas ${kelas.nama}`));
	}
	pass('class exports contain only their class; full export and column format preserved');
	for (const status of ['arsip', 'semua']) {
		const full = await workbook(`status=${status}`),
			single = await workbook(`status=${status}&kelas_id=${classes[0].id}`);
		assert.deepEqual(
			single.rows.slice(1),
			full.rows.slice(1).filter((row) => row[2] === classes[0].nama)
		);
	}
	pass('existing archive/status filters combine with class filter');
	for (const invalid of ['', '0', '-1', 'abc', '1.5', '1e0', '9007199254740992'])
		assert.equal((await request(`status=aktif&kelas_id=${invalid}`)).status, 400);
	assert.equal((await request('status=aktif&kelas_id=999999999')).status, 404);
	const [foreignSchool] = await sql(
		"INSERT INTO sekolah(jenjang_pendidikan,nama,npsn,alamat_id,email,kepala_sekolah_id,created_at) SELECT jenjang_pendidikan,'QA Other School','99999999',alamat_id,email,kepala_sekolah_id,? FROM sekolah WHERE id=? RETURNING id",
		[now, school.id]
	);
	const [foreignClass] = await sql(
		"INSERT INTO kelas(sekolah_id,tahun_ajaran_id,semester_id,nama,created_at) VALUES(?,?,?,'QA Foreign',?) RETURNING id",
		[foreignSchool.id, year.id, semester.id, now]
	);
	assert.equal((await request(`status=aktif&kelas_id=${foreignClass.id}`)).status, 404);
	const [oldSemester] = await sql(
		'SELECT id FROM semester WHERE tahun_ajaran_id=? AND id<>? LIMIT 1',
		[year.id, semester.id]
	);
	if (oldSemester) {
		const [oldClass] = await sql(
			"INSERT INTO kelas(sekolah_id,tahun_ajaran_id,semester_id,nama,created_at) VALUES(?,?,?,'QA Old Semester',?) RETURNING id",
			[school.id, year.id, oldSemester.id, now]
		);
		assert.equal((await request(`status=aktif&kelas_id=${oldClass.id}`)).status, 404);
	}
	pass('malformed/missing, foreign-school and inactive-semester classes rejected');
	const [emptyClass] = await sql(
		"INSERT INTO kelas(sekolah_id,tahun_ajaran_id,semester_id,nama,created_at) VALUES(?,?,?,'QA Empty',?) RETURNING id",
		[school.id, year.id, semester.id, now]
	);
	assert.equal((await workbook(`status=aktif&kelas_id=${emptyClass.id}`)).rows.length, 1);
	pass('empty class returns a valid header-only workbook');
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage(),
		errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(school.id), url: base }
	);
	for (const width of [1440, 390]) {
		await page.setViewport({ width, height: 900 });
		for (const kelas of classes.slice(0, 2)) {
			await page.goto(`${base}/murid?kelas_id=${kelas.id}`, { waitUntil: 'networkidle0' });
			await page.click('button[aria-label="Opsi data murid"]');
			const href = `/api/murid/download-excel?status=aktif&kelas_id=${kelas.id}`;
			await page.waitForSelector(`a[href="${href}"]`, { visible: true });
			await page.$eval('.dropdown-content', async (el) => {
				await Promise.all(el.getAnimations().map((animation) => animation.finished));
			});
			assert.ok(
				await page.$eval(`a[href="${href}"]`, (el) =>
					el.textContent.trim().startsWith('Download Kelas')
				)
			);
			assert.ok(
				await page.$eval(`a[href="${href}"]`, (el) => {
					const rect = el.getBoundingClientRect();
					return el.contains(
						document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
					);
				}),
				'Class download must not be covered by the table'
			);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await page.screenshot({ path: path.join(dir, `menu-${width}-${kelas.id}.png`) });
		}
	}
	assert.deepEqual(errors, []);
	pass('desktop/mobile menu follows selected class without horizontal page overflow');
	await sql("UPDATE auth_user SET type='user',permissions='[]' WHERE id=?", [user.id]);
	await sql('INSERT INTO auth_user_kelas(auth_user_id,kelas_id,created_at) VALUES(?,?,?)', [
		user.id,
		classes[0].id,
		now
	]);
	assert.ok((await workbook(`status=aktif&kelas_id=${classes[0].id}`)).rows.length > 1);
	assert.equal(
		(await request(`status=aktif&kelas_id=${classes[1].id}`)).status,
		classes[1].jumlah > 0 ? 403 : 200
	);
	assert.equal((await request(`status=arsip&kelas_id=${classes[0].id}`)).status, 403);
	pass('teacher assignments and archive permissions remain enforced');
	const unauthenticated = await fetch(
		`${base}/api/murid/download-excel?status=aktif&kelas_id=${classes[0].id}`,
		{ redirect: 'manual' }
	);
	assert.ok([401, 303].includes(unauthenticated.status));
	pass('unauthenticated export blocked');
	await writeFile(path.join(dir, 'results.json'), JSON.stringify({ results, dir }, null, 2));
	console.log(`QA_RESULTS=${dir}`);
} catch (error) {
	await writeFile(path.join(dir, 'error.log'), `${error.stack}\n${output}`);
	throw error;
} finally {
	if (browser) await browser.close();
	db.close();
	if (child.exitCode === null) {
		const done = once(child, 'exit');
		child.kill();
		await done;
	}
}
