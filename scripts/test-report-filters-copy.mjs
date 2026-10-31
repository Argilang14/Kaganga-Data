import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/report-filters-qa-'));
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
const query = async (sql, args = []) => (await client.execute({ sql, args })).rows;
const row = async (sql, args = []) => (await query(sql, args))[0];
const insert = async (table, value) => {
	const entries = Object.entries(value);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
				args: entries.map(([, value]) => value)
			})
		).lastInsertRowid
	);
};
const clone = (record, changes) => {
	const value = { ...record, ...changes };
	delete value.id;
	return value;
};
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
let vite,
	connection,
	browser,
	server,
	output = '';
try {
	vite = await createServer({
		configFile: false,
		resolve: { alias: { $lib: path.join(root, 'src/lib') } },
		plugins: [
			{
				name: 'qa-env',
				resolveId(id) {
					if (id === '$env/dynamic/private') return '\0qa-env';
				},
				load(id) {
					if (id === '\0qa-env') return 'export const env = process.env;';
				}
			}
		],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		appType: 'custom',
		logLevel: 'error'
	});
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const service = await vite.ssrLoadModule('/src/lib/server/report-archive-list.ts');
	const admin = await connection.default.query.tableAuthUser.findFirst({
		where: (t, { eq }) => eq(t.type, 'admin')
	});
	const original = await row('SELECT * FROM kelas LIMIT 1');
	const school = await connection.default.query.tableSekolah.findFirst({
		where: (t, { eq }) => eq(t.id, Number(original.sekolah_id))
	});
	const yearTemplate = await row('SELECT * FROM tahun_ajaran WHERE id=?', [
		original.tahun_ajaran_id
	]);
	const semesterTemplate = await row('SELECT * FROM semester WHERE id=?', [original.semester_id]);
	const years = [],
		semesters = [],
		classes = [];
	for (const name of ['2088/2089', '2089/2090']) {
		const year = await insert(
			'tahun_ajaran',
			clone(yearTemplate, { nama: name, is_aktif: 0, dapodik_tahun_ajaran_id: null })
		);
		years.push(year);
		const semesterIds = [],
			classIds = [];
		for (const type of ['ganjil', 'genap']) {
			const semester = await insert(
				'semester',
				clone(semesterTemplate, {
					tahun_ajaran_id: year,
					tipe: type,
					nama: `Semester ${type}`,
					is_aktif: 0,
					dapodik_semester_id: null
				})
			);
			semesterIds.push(semester);
			classIds.push(
				await insert(
					'kelas',
					clone(original, {
						tahun_ajaran_id: year,
						semester_id: semester,
						nama: 'QA X.A',
						dapodik_rombongan_belajar_id: null
					})
				)
			);
		}
		semesters.push(semesterIds);
		classes.push(classIds);
	}
	const locals = { user: { ...admin, permissions: [], jabatanAkses: null }, sekolah: school };
	const selected = await service.reportArchiveList(locals, 'sekolah', 'ras', classes[0][1], 1);
	assert.equal(selected.yearId, years[0]);
	assert.equal(selected.semesterId, semesters[0][1]);
	assert.deepEqual(selected.classes, [{ id: classes[0][1], label: 'QA X.A' }]);
	pass('Legacy class link infers historical year/semester and uses actual class names');
	const other = await service.reportArchiveList(locals, 'sekolah', 'rts', classes[1][0], 1, {
		yearId: years[1],
		semesterId: semesters[1][0]
	});
	assert.equal(other.classId, classes[1][0]);
	assert.deepEqual(
		other.classes.map((c) => c.id),
		[classes[1][0]]
	);
	pass('Explicit year and semester restrict available classes');
	for (const filters of [
		{ yearId: years[0], semesterId: semesters[1][0] },
		{ yearId: 999999, semesterId: semesters[0][0] }
	]) {
		const invalid = await service.reportArchiveList(
			locals,
			'sekolah',
			'ras',
			classes[0][0],
			1,
			filters
		);
		assert.equal(invalid.classId, 0);
		assert.deepEqual(invalid.items, []);
		assert.deepEqual(invalid.classes, []);
	}
	pass('Mismatched filters cannot retrieve another period');
	await assert.rejects(
		() => service.reportArchiveList({ ...locals, user: null }, 'sekolah', 'ras', classes[0][0], 1),
		(cause) => cause.status === 401 || cause.status === 403
	);
	pass('Archive authorization remains enforced');
	const token = randomUUID(),
		now = new Date().toISOString();
	await insert('auth_session', {
		user_id: admin.id,
		token_hash: createHash('sha256').update(token).digest('hex'),
		user_agent: 'QA report filters',
		ip_address: '127.0.0.1',
		expires_at: new Date(Date.now() + 3600000).toISOString(),
		created_at: now,
		updated_at: now
	});
	await connection.closeDbClient();
	connection = null;
	await vite.close();
	vite = null;
	const port = 5195,
		base = `http://127.0.0.1:${port}`;
	await new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once('error', reject);
		probe.listen(port, '127.0.0.1', () => probe.close(resolve));
	});
	server = spawn(process.execPath, ['build/index.js'], {
		cwd: root,
		windowsHide: true,
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ORIGIN: base },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	server.stdout.on('data', (data) => (output += data));
	server.stderr.on('data', (data) => (output += data));
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(base + '/login')).ok) {
				ready = true;
				break;
			}
		} catch {
			/* Wait for the isolated QA server. */
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	assert.ok(ready, output);
	browser = await puppeteer.launch({
		executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		headless: true,
		args: ['--no-sandbox']
	});
	await browser.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(school.id), url: base }
	);
	const page = await browser.newPage(),
		errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const target = base + `/murid/arsip/rapor?kelas_id=${classes[0][1]}&jenis=sekolah&periode=rts`;
	assert.equal((await page.goto(target, { waitUntil: 'networkidle0' })).status(), 200);
	assert.equal(await page.$eval('[name=tahun_ajaran_id]', (n) => Number(n.value)), years[0]);
	assert.equal(await page.$eval('[name=semester_id]', (n) => Number(n.value)), semesters[0][1]);
	assert.equal(await page.$eval('[name=kelas_id]', (n) => Number(n.value)), classes[0][1]);
	pass('Browser retains historical filters on old links');
	await page.select('[name=tahun_ajaran_id]', String(years[1]));
	await page.waitForFunction(() => document.querySelector('[name=kelas_id]').value === '0');
	assert.deepEqual(await page.$$eval('[name=kelas_id] option', (ns) => ns.map((n) => n.value)), [
		'0',
		String(classes[1][0])
	]);
	await page.select('[name=semester_id]', String(semesters[1][1]));
	await page.waitForFunction(
		(id) => !!document.querySelector(`[name=kelas_id] option[value="${id}"]`),
		{},
		classes[1][1]
	);
	await page.select('[name=kelas_id]', String(classes[1][1]));
	await Promise.all([
		page.waitForNavigation({ waitUntil: 'networkidle0' }),
		page.click('form[method=GET] button')
	]);
	const applied = new URL(page.url());
	assert.equal(applied.searchParams.get('tahun_ajaran_id'), String(years[1]));
	assert.equal(applied.searchParams.get('semester_id'), String(semesters[1][1]));
	assert.equal(applied.searchParams.get('kelas_id'), String(classes[1][1]));
	assert.ok((await page.$eval('section header', (n) => n.textContent)).includes('2089/2090'));
	pass('Dependent selects reset class, update options, and submit the correct context');
	for (const width of [360, 390, 768, 1024, 1440]) {
		await page.setViewport({ width, height: 1000 });
		await page.evaluate(() => {
			const drawer = document.getElementById('my-drawer-2');
			if (drawer) drawer.checked = false;
		});
		await new Promise((resolve) => setTimeout(resolve, 250));
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
			`Page overflow at ${width}`
		);
		const dimensions = await page.$$eval('section form[method=GET] select', (ns) =>
			ns.map((n) => ({
				width: n.getBoundingClientRect().width,
				height: n.getBoundingClientRect().height
			}))
		);
		assert.ok(dimensions.every((n) => n.width > 100 && n.height >= 39));
		await page.screenshot({ path: path.join(folder, `filters-${width}.png`), fullPage: true });
	}
	pass('Five viewport sizes retain readable controls and no horizontal page overflow');
	const invalid = await page.goto(base + '/murid/arsip/rapor?tahun_ajaran_id=abc', {
		waitUntil: 'networkidle0'
	});
	assert.equal(invalid.status(), 400);
	assert.deepEqual(errors, []);
	pass('Malformed URL returns 400 and the page has no JavaScript errors');
	await writeFile(path.join(folder, 'results.json'), JSON.stringify({ checks, folder }, null, 2));
	await writeFile('tmp/report-filters-latest.json', JSON.stringify({ folder }));
	console.log(JSON.stringify({ passed: checks.length, folder }, null, 2));
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		const exited = once(server, 'exit');
		server.kill();
		await exited;
	}
	client.close();
	await connection?.closeDbClient?.();
	await vite?.close();
}
