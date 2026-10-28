import { createClient } from '@libsql/client';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const baseline = process.env.QA_LOGIN_BASELINE === '1';
const dir = path.resolve('tmp', `login-ui-${baseline ? 'before' : 'after'}-${Date.now()}`);
await mkdir(dir, { recursive: true });
const database = path.join(dir, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute(`VACUUM INTO '${database.replaceAll("'", "''")}'`);
source.close();
const db = createClient({ url: `file:${database}` });
const port = 5187;
const base = `http://127.0.0.1:${port}`;
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
const sql = async (query, args = []) => (await db.execute({ sql: query, args })).rows;
const cookieFrom = (response) =>
	response.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
const credentials = {
	username: `qa-login-${randomBytes(6).toString('hex')}`,
	password: randomBytes(12).toString('hex')
};
const post = (values, cookie = '', origin = base) =>
	fetch(`${base}/login?/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			origin,
			cookie,
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(values)
	});
try {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${base}/login`)).status === 200) break;
		} catch {
			/* The isolated server is starting. */
		}
		if (i === 99) throw new Error(`Server QA not ready: ${output.slice(-1000)}`);
		await new Promise((r) => setTimeout(r, 300));
	}
	const [school] = await sql('SELECT id,nama,logo,logo_type FROM sekolah ORDER BY id LIMIT 1');
	assert.ok(school);
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(credentials.password, salt, 64).toString('hex');
	const [user] = await sql(
		'INSERT INTO auth_user(username,username_normalized,password_hash,password_salt,type,sekolah_id,permissions,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,0,?) RETURNING id',
		[
			credentials.username,
			credentials.username,
			hash,
			salt,
			'admin',
			school.id,
			'[]',
			new Date().toISOString()
		]
	);
	const token = randomBytes(32).toString('base64url');
	await sql(
		'INSERT INTO auth_session(user_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)',
		[
			user.id,
			createHash('sha256').update(token).digest('hex'),
			new Date(Date.now() + 3600000).toISOString(),
			new Date().toISOString(),
			new Date().toISOString()
		]
	);
	const authCookie = `rapkumer-session=${token}; active-sekolah-id=${school.id}`;
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setCookie({ name: 'active-sekolah-id', value: String(school.id), url: base });
	const measurements = [];
	for (const width of [1440, 1024, 768, 390, 360, 320]) {
		await page.setViewport({ width, height: width < 768 ? 844 : 1000 });
		await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
		await page.screenshot({ path: path.join(dir, `login-${width}.png`), fullPage: true });
		const metric = await page.evaluate(() => {
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
					radius: s.borderRadius
				};
			};
			return {
				overflow: document.documentElement.scrollWidth > innerWidth,
				card: measure('.login-card, section.card'),
				input: measure('.login-input, input[name=username]'),
				button: measure('button[type=submit]'),
				heading: measure('h1'),
				shell: measure('.login-layout'),
				brand: measure('.brand-panel')
			};
		});
		assert.equal(metric.overflow, false, `Overflow at ${width}`);
		if (!baseline) {
			assert.equal(metric.input.height, 48);
			assert.equal(metric.button.height, 48);
			assert.ok(metric.card.width <= 520);
			assert.equal(await page.$eval('input[name=password]', (el) => el.minLength), -1);
			assert.equal(
				await page.$$eval(
					'select[name=role],input[name=role],input[name=remember]',
					(els) => els.length
				),
				0
			);
			assert.ok(await page.$eval('.school-photo', (img) => img.complete && img.naturalWidth > 0));
		}
		measurements.push({ width, ...metric });
	}
	pass('six responsive widths without page overflow');

	await page.setCookie({ name: 'rapkumer-session', value: token, url: base });
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(`${base}/pengasuhan/ringkasan`, { waitUntil: 'networkidle0' });
	await page.screenshot({ path: path.join(dir, 'control-pengasuhan-1440.png'), fullPage: true });
	const control = await page.$eval('.care-page', (el) => {
		const r = el.getBoundingClientRect();
		return { width: r.width, font: getComputedStyle(el).fontSize };
	});
	await writeFile(path.join(dir, 'control.json'), JSON.stringify(control));
	await page.deleteCookie({ name: 'rapkumer-session', url: base });

	if (!baseline) {
		const [originalSchool] = await sql('SELECT * FROM sekolah WHERE id=?', [school.id]);
		const fixtureSchool = {
			...originalSchool,
			nama: 'QA Sekolah Kedua',
			email: 'private-branding-check@example.invalid',
			logo: Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=',
				'base64'
			),
			logo_type: 'image/png'
		};
		delete fixtureSchool.id;
		const columns = Object.keys(fixtureSchool);
		const [secondSchool] = await sql(
			`INSERT INTO sekolah (${columns.map((key) => `"${key}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')}) RETURNING id`,
			Object.values(fixtureSchool)
		);
		await page.setCookie({ name: 'active-sekolah-id', value: String(secondSchool.id), url: base });
		await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
		assert.equal(
			await page.$eval('.school-logo', (img) => img.getAttribute('src')),
			`data:image/png;base64,${Buffer.from(fixtureSchool.logo).toString('base64')}`
		);
		assert.equal(await page.$eval('.school-logo', (img) => img.alt), 'Logo QA Sekolah Kedua');
		assert.ok(!(await page.content()).includes(fixtureSchool.email));
		await sql("UPDATE sekolah SET logo_type='image/svg+xml' WHERE id=?", [secondSchool.id]);
		await page.reload({ waitUntil: 'networkidle0' });
		assert.equal(await page.$eval('.school-logo', (img) => img.getAttribute('src')), '/logo.png');
		await page.setCookie({ name: 'active-sekolah-id', value: '999999999', url: base });
		await page.reload({ waitUntil: 'networkidle0' });
		assert.notEqual(await page.$eval('.school-logo', (img) => img.alt), 'Logo QA Sekolah Kedua');
		await sql('DELETE FROM sekolah WHERE id=?', [secondSchool.id]);
		await page.setCookie({ name: 'active-sekolah-id', value: String(school.id), url: base });
		pass(
			'active-school logo changes, invalid school falls back, unsafe MIME/private fields stay hidden'
		);
		let response = await post({ username: '', password: '' });
		assert.equal(response.status, 400);
		pass('server rejects empty credentials');
		response = await post(credentials, '', 'https://untrusted.invalid');
		assert.equal(response.status, 403);
		pass('CSRF still rejects foreign origins');
		response = await post({ username: credentials.username, password: 'incorrect' });
		assert.equal(response.status, 401);
		const invalidExisting = await response.text();
		response = await post({ username: 'qa-no-such-user', password: 'incorrect' });
		assert.equal(response.status, 401);
		assert.ok(invalidExisting.includes('Nama pengguna atau kata sandi tidak valid.'));
		assert.ok((await response.text()).includes('Nama pengguna atau kata sandi tidak valid.'));
		pass('invalid and missing accounts share the same generic error');
		for (let i = 0; i < 5; i++)
			response = await post({ username: 'qa-rate-test', password: 'incorrect' });
		assert.equal(response.status, 429);
		pass('existing login rate limit remains active');

		const beforeSessions = (
			await sql('SELECT count(*) AS n FROM auth_session WHERE user_id=?', [user.id])
		)[0].n;
		response = await fetch(`${base}/login?redirect=%2Fpengasuhan%2Fringkasan&/login`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				origin: base,
				accept: 'text/html',
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams(credentials)
		});
		assert.equal(response.status, 303);
		assert.equal(response.headers.get('location'), '/pengasuhan/ringkasan');
		assert.ok(
			response.headers
				.getSetCookie()
				.some(
					(c) =>
						c.includes('rapkumer-session=') && c.includes('HttpOnly') && c.includes('SameSite=Lax')
				)
		);
		assert.equal(
			(await sql('SELECT count(*) AS n FROM auth_session WHERE user_id=?', [user.id]))[0].n,
			Number(beforeSessions) + 1
		);
		assert.equal(
			(
				await fetch(`${base}/pengasuhan/ringkasan`, {
					headers: { cookie: cookieFrom(response) },
					redirect: 'manual'
				})
			).status,
			200
		);
		pass('valid login creates existing session cookie and follows protected redirect');
		await sql("UPDATE auth_user SET type='user' WHERE id=?", [user.id]);
		response = await post({ ...credentials, role: 'admin', jabatanAkses: 'kepala_sekolah' });
		assert.equal(response.status, 303);
		assert.notEqual(
			(
				await fetch(`${base}/pengasuhan/ringkasan`, {
					headers: { cookie: cookieFrom(response) },
					redirect: 'manual'
				})
			).status,
			200
		);
		assert.equal((await sql('SELECT type FROM auth_user WHERE id=?', [user.id]))[0].type, 'user');
		pass('posted role cannot elevate an authenticated teacher');
		await sql('UPDATE auth_user SET must_change_password=1 WHERE id=?', [user.id]);
		response = await post(credentials);
		assert.equal(response.headers.get('location'), '/pengaturan?ganti_password=1');
		await sql("UPDATE auth_user SET type='admin',must_change_password=0 WHERE id=?", [user.id]);
		pass('new-account password-change redirect is unchanged');
		await sql('UPDATE auth_user SET password_hash=? WHERE id=?', [
			scryptSync('abc', salt, 64).toString('hex'),
			user.id
		]);
		response = await post({ username: credentials.username, password: 'abc' });
		assert.equal(response.status, 303);
		await sql('UPDATE auth_user SET password_hash=? WHERE id=?', [hash, user.id]);
		pass('legacy short passwords remain accepted by existing authentication');
		assert.equal(
			(
				await fetch(`${base}/login`, { headers: { cookie: authCookie }, redirect: 'manual' })
			).headers.get('location'),
			'/'
		);
		assert.equal(
			(await fetch(`${base}/sekolah/logo/${school.id}`, { redirect: 'manual' })).status,
			303
		);
		pass('authenticated users leave login; protected school-logo route remains private');

		await page.setViewport({ width: 390, height: 844 });
		await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
		assert.equal(await page.$eval('button[type=submit]', (el) => el.disabled), true);
		await page.focus('#username');
		await page.keyboard.press('Tab');
		assert.equal(await page.evaluate(() => document.activeElement.id), 'password');
		await page.keyboard.press('Tab');
		assert.equal(
			await page.evaluate(() => document.activeElement.getAttribute('aria-label')),
			'Tampilkan kata sandi'
		);
		await page.keyboard.press('Space');
		assert.equal(await page.$eval('#password', (el) => el.type), 'text');
		await page.keyboard.press('Space');
		assert.equal(await page.$eval('#password', (el) => el.type), 'password');
		pass('empty submit disabled; keyboard navigation and password toggle work');
		await page.type('#username', credentials.username);
		await page.type('#password', 'incorrect');
		await page.click('button[type=submit]');
		await page.waitForSelector('#login-error');
		assert.ok(
			await page.$eval('#login-error', (el) =>
				el.textContent.includes('Nama pengguna atau kata sandi tidak valid.')
			)
		);
		await page.screenshot({ path: path.join(dir, 'login-error-390.png'), fullPage: true });
		assert.equal(await page.$eval('#username', (el) => el.value), credentials.username);
		pass('inline failure preserves account input');
		await page.$eval('#password', (el) => {
			el.value = '';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.type('#password', credentials.password);
		let release,
			requests = 0;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		const intercept = async (request) => {
			if (request.url().includes('?/login') && request.method() === 'POST') {
				requests++;
				await gate;
			}
			await request.continue();
		};
		await page.setRequestInterception(true);
		page.on('request', intercept);
		await page.click('button[type=submit]');
		await page.waitForSelector('button[type=submit][disabled]');
		await new Promise((r) => setTimeout(r, 250));
		await page.screenshot({ path: path.join(dir, 'login-loading-390.png'), fullPage: true });
		await page.$eval('form', (form) => {
			form.requestSubmit();
			form.requestSubmit();
		});
		await new Promise((r) => setTimeout(r, 250));
		assert.equal(requests, 1);
		release();
		await page.waitForFunction(() => location.pathname !== '/login');
		page.off('request', intercept);
		await page.setRequestInterception(false);
		pass('loading blocks duplicate requests and valid browser login redirects');
		await page.deleteCookie({ name: 'rapkumer-session', url: base });
		await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
		await page.type('#username', credentials.username);
		await page.type('#password', credentials.password);
		const abortLogin = (request) =>
			request.method() === 'POST' ? request.abort('failed') : request.continue();
		await page.setRequestInterception(true);
		page.on('request', abortLogin);
		await page.focus('#password');
		await page.keyboard.press('Enter');
		await page.waitForSelector('#login-error');
		assert.ok(await page.$eval('#login-error', (el) => el.textContent.includes('Periksa koneksi')));
		await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled);
		page.off('request', abortLogin);
		await page.setRequestInterception(false);
		pass('Enter submits; network failure shows a recoverable inline error');
		await page.reload({ waitUntil: 'networkidle0' });
		await page.evaluate(() => localStorage.setItem('dark-mode', 'true'));
		await page.reload({ waitUntil: 'networkidle0' });
		assert.equal(
			await page.$eval('.school-login', (el) => getComputedStyle(el).colorScheme),
			'light'
		);
		await page.screenshot({
			path: path.join(dir, 'login-dark-preference-390.png'),
			fullPage: true
		});
		await page.setViewport({ width: 844, height: 390 });
		await page.screenshot({ path: path.join(dir, 'login-short-landscape.png'), fullPage: true });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		pass('light login is scoped; short landscape remains usable');
	}
	assert.deepEqual(errors, []);
	await writeFile(path.join(dir, 'measurements.json'), JSON.stringify(measurements, null, 2));
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
