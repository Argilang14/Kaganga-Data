import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createClient } from '@libsql/client';
import { createHash, randomUUID } from 'node:crypto';

const { folder } = JSON.parse(await readFile('tmp/dormitory-latest.json', 'utf8'));
const fixture = JSON.parse(await readFile(path.join(folder, 'ui-fixture.json'), 'utf8'));
const port = Number(process.env.DORMITORY_QA_PORT ?? 5193);
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536 && ![5152, 1206].includes(port));
await new Promise((resolve, reject) => {
	const s = net.createServer();
	s.once('error', reject);
	s.listen(port, '127.0.0.1', () => s.close(resolve));
});
const base = `http://127.0.0.1:${port}`;
const client = createClient({ url: `file:${fixture.database}` });
let server,
	browser,
	output = '';
const checks = [],
	screens = [],
	measurements = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
try {
	server = spawn(process.execPath, ['build/index.js'], {
		cwd: process.cwd(),
		windowsHide: true,
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(port),
			ORIGIN: base,
			DB_URL: `file:${fixture.database}`,
			KAGANGA_DATA_DIR: path.join(folder, 'data')
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	server.stdout.on('data', (s) => (output += s));
	server.stderr.on('data', (s) => (output += s));
	let ready = false;
	for (let n = 0; n < 100; n++) {
		try {
			if ((await fetch(base + '/login')).ok) {
				ready = true;
				break;
			}
		} catch {
			/* Starting QA server. */
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	assert.ok(ready, output);
	browser = await puppeteer.launch({
		executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		defaultViewport: { width: 1440, height: 1000 }
	});
	await browser.setCookie(
		{ name: 'rapkumer-session', value: fixture.token, url: base },
		{ name: 'active-sekolah-id', value: String(fixture.schoolId), url: base }
	);
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	assert.equal((await page.goto(base + '/asrama', { waitUntil: 'networkidle0' })).status(), 200);
	assert.equal(new URL(page.url()).pathname, '/asrama/kamar');
	for (const section of ['gedung', 'kamar', 'penghuni', 'penugasan', 'riwayat', 'penempatan']) {
		await page.click(`.app-sidebar a[href="/asrama/${section}"]`);
		await page.waitForFunction(
			(section) => location.pathname === `/asrama/${section}`,
			{},
			section
		);
		await page.waitForSelector('.dorm-page');
		assert.equal(await page.$('.dorm-page .tabs'), null);
		assert.ok(!new URL(page.url()).searchParams.has('view'));
	}
	await page.goto(base + '/asrama/kamar', { waitUntil: 'networkidle0' });
	pass('six sidebar links open independent pages without inline tabs');
	await page.waitForSelector('.dorm-page');
	for (const width of [320, 360, 390, 768, 1024, 1280, 1366, 1440, 1920]) {
		await page.setViewport({ width, height: 1000 });
		await page.evaluate(() => {
			const d = document.getElementById('my-drawer-2');
			if (d) d.checked = false;
		});
		await new Promise((r) => setTimeout(r, 150));
		const metrics = await page.evaluate(() => ({
			width: innerWidth,
			scrollWidth: document.documentElement.scrollWidth,
			table: document.querySelector('.dorm-page table')?.getBoundingClientRect().width,
			button: document.querySelector('.dorm-page header button')?.getBoundingClientRect().height
		}));
		assert.ok(metrics.scrollWidth <= width + 1, JSON.stringify(metrics));
		assert.ok(
			await page.$eval(
				'#dorm-room',
				(select) =>
					select.getBoundingClientRect().height >= 39 && select.getBoundingClientRect().height <= 41
			),
			'Room filter must match 40px controls'
		);
		assert.ok(
			await page.$eval(
				'#dorm-room',
				(select, min) => select.getBoundingClientRect().width >= min,
				Math.min(200, width - 150)
			),
			'Room selector must show its label, not only the arrow'
		);
		measurements.push(metrics);
		assert.ok(
			await page.$eval(
				'#dorm-room',
				(select) =>
					select.selectedOptions.length === 1 &&
					select.selectedOptions[0].textContent.trim().length > 0
			),
			'Room selector default label must be visible'
		);
		const shot = path.join(folder, `asrama-${width}.png`);
		await page.screenshot({ path: shot, fullPage: true });
		screens.push(shot);
	}
	pass('320/360/390/768/1024/1280/1440/1920 responsive; only table wrapper scrolls');
	await page.setViewport({ width: 390, height: 850 });
	await page.$eval('.dorm-table-scroll', (el) => (el.scrollLeft = el.scrollWidth));
	assert.ok(
		await page.$eval(
			'.dorm-table-scroll',
			(el) =>
				el.scrollLeft > 0 &&
				el.querySelector('tbody td:last-child').getBoundingClientRect().right <=
					el.getBoundingClientRect().right + 1
		)
	);
	await page.focus('.dorm-table-scroll');
	assert.ok(await page.$eval('.dorm-table-scroll', (el) => el === document.activeElement));
	pass('wide table keeps last action reachable and supports keyboard scrolling');
	for (const section of ['gedung', 'penghuni', 'penugasan', 'riwayat', 'penempatan']) {
		for (const width of [320, 768, 1440]) {
			await page.setViewport({ width, height: 1000 });
			await page.goto(base + `/asrama/${section}`, { waitUntil: 'networkidle0' });
			await page.evaluate(() => {
				const d = document.getElementById('my-drawer-2');
				if (d) d.checked = false;
			});
			assert.ok(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
				`${section} overflow at ${width}`
			);
			const shot = path.join(folder, `asrama-${section}-${width}.png`);
			await page.screenshot({ path: shot, fullPage: true });
			screens.push(shot);
		}
	}
	pass('all six pages reflow independently on phone, tablet and desktop');
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(base + '/asrama/gedung', { waitUntil: 'networkidle0' });
	await page.$$eval('.dorm-page header button', (buttons) =>
		buttons.find((b) => b.textContent.includes('Tambah Asrama')).click()
	);
	await page.waitForSelector('dialog[open] input[name="nama"]');
	await page.type('dialog[open] input[name="nama"]', `QA UI ${fixture.suffix}`);
	const formMetrics = await page.$eval('dialog[open] .modal-box', (box) => ({
		width: box.getBoundingClientRect().width,
		inputHeight: box.querySelector('input[name="nama"]').getBoundingClientRect().height
	}));
	assert.ok(formMetrics.width <= 672);
	assert.ok(formMetrics.inputHeight >= 36 && formMetrics.inputHeight <= 49);
	await page.setViewport({ width: 768, height: 390 });
	assert.ok(
		await page.$eval(
			'dialog[open] .modal-box',
			(box) => box.getBoundingClientRect().height <= innerHeight * 0.85 + 1
		)
	);
	await page.$eval('dialog[open] .modal-box', (box) => box.scrollTo(0, box.scrollHeight));
	assert.ok(
		await page.$eval(
			'dialog[open] .modal-action button:last-child',
			(button) => button.getBoundingClientRect().bottom <= innerHeight
		)
	);
	await page.setViewport({ width: 1440, height: 1000 });
	measurements.push(formMetrics);
	await page.keyboard.press('Tab');
	assert.ok(await page.$eval('dialog[open]', (dialog) => dialog.contains(document.activeElement)));
	await page.keyboard.press('Escape');
	assert.equal(await page.$('dialog[open]'), null);
	pass('bounded modal and inputs; keyboard focus and Escape work');
	await page.$$eval('.dorm-page header button', (buttons) =>
		buttons.find((b) => b.textContent.includes('Tambah Asrama')).click()
	);
	await page.type('dialog[open] input[name="nama"]', `QA UI ${fixture.suffix}`);
	await page.click(
		'dialog[open] button[type="submit"],dialog[open] .modal-action button:last-child'
	);
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	const building = Number(
		(
			await client.execute({
				sql: 'SELECT id FROM asrama WHERE nama=?',
				args: [`QA UI ${fixture.suffix}`]
			})
		).rows[0].id
	);
	await page.goto(base + '/asrama/kamar', { waitUntil: 'networkidle0' });
	await page.$$eval('.dorm-page header button', (buttons) =>
		buttons.find((b) => b.textContent.includes('Tambah Kamar')).click()
	);
	await page.type('dialog[open] input[name="nama"]', 'Kamar Pengasuhan Lantai Satu');
	await page.select('dialog[open] select[name="asramaId"]', String(building));
	await page.$eval('dialog[open] input[name="kapasitas"]', (el) => {
		el.value = '3';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.click('dialog[open] .modal-action button:last-child');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	const room = Number(
		(
			await client.execute({
				sql: 'SELECT id FROM asrama_kamar WHERE asrama_id=?',
				args: [building]
			})
		).rows[0].id
	);
	pass('create building and room via UI with existing actions and CSRF');
	await page.goto(base + `/asrama/penugasan?kamar_id=${room}`, { waitUntil: 'networkidle0' });
	await page.$$eval('.dorm-page button', (buttons) =>
		buttons.find((b) => b.textContent.includes('Tugaskan Wali')).click()
	);
	await page.select('dialog[open] select[name="pegawaiId"]', String(fixture.employee));
	await page.type('dialog[open] input[name="alasan"]', 'QA penugasan melalui UI');
	await page.click('dialog[open] .modal-action button:last-child');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	pass('warden is selected by employee ID, not name');
	await page.click('.app-class-switcher');
	await page.$$eval('.app-class-menu summary', (items) =>
		items.find((item) => item.textContent.includes('Pindah Asrama')).click()
	);
	await page.$$eval(
		'.app-class-menu a',
		(items, room) => items.find((item) => item.href.includes(`kamar_id=${room}`)).click(),
		room
	);
	await page.waitForFunction(
		(room) => new URL(location.href).searchParams.get('kamar_id') === String(room),
		{},
		room
	);
	assert.ok(
		await page.$eval(
			'.app-class-menu',
			(node) =>
				node.textContent.includes('Pindah Kelas') && node.textContent.includes('Pindah Asrama')
		)
	);
	pass('navbar keeps separate class and room selectors');
	const student = fixture.students[0];
	const classBefore = (
		await client.execute({ sql: 'SELECT kelas_id FROM murid WHERE id=?', args: [student.id] })
	).rows[0].kelas_id;
	await page.goto(base + `/asrama/penempatan?q=QA%20Murid%200%20${fixture.suffix}`, {
		waitUntil: 'networkidle0'
	});
	await page.click('.dorm-page tbody input[type="checkbox"]');
	await page.select('form[action="?/save"] select[name="kamarId"]', String(room));
	await page.type('form[action="?/save"] input[name="alasan"]', 'QA perpindahan melalui UI');
	await page.click('form[action="?/save"] button');
	await page.waitForSelector('dialog[open] input[name="token"]');
	await client.execute({ sql: 'UPDATE asrama_kamar SET versi=versi+1 WHERE id=?', args: [room] });
	await page.click('dialog[open] .modal-action button:last-child');
	await page.waitForSelector('dialog[open] [role="alert"]');
	assert.ok(await page.$('dialog[open] .modal-action button:first-child'));
	await page.click('dialog[open] .modal-action button:first-child');
	await page.click('form[action="?/save"] button');
	await page.waitForSelector('dialog[open] input[name="token"]');
	const previewShot = path.join(folder, 'asrama-preview-desktop.png');
	await page.screenshot({ path: previewShot, fullPage: true });
	screens.push(previewShot);
	await page.setViewport({ width: 390, height: 700 });
	assert.ok(
		await page.$eval(
			'dialog[open] .modal-box',
			(box) => box.getBoundingClientRect().width <= innerWidth
		)
	);
	const mobileShot = path.join(folder, 'asrama-preview-mobile.png');
	await page.screenshot({ path: mobileShot, fullPage: true });
	screens.push(mobileShot);
	await page.click('dialog[open] .modal-action button:last-child');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.equal(
		Number(
			(
				await client.execute({
					sql: 'SELECT kamar_id FROM asrama_penempatan WHERE identity_uid=? AND selesai IS NULL',
					args: [student.uid]
				})
			).rows[0].kamar_id
		),
		room
	);
	assert.equal(
		(await client.execute({ sql: 'SELECT kelas_id FROM murid WHERE id=?', args: [student.id] }))
			.rows[0].kelas_id,
		classBefore
	);
	pass('stale preview fails safely; retry confirms transfer without changing academic class');
	await page.goto(base + `/asrama/penghuni?kamar_id=${room}`, { waitUntil: 'networkidle0' });
	await page.setViewport({ width: 1440, height: 1000 });
	const cookies = await browser.cookies();
	const activeClass = cookies.find((c) => c.name === 'active-kelas-id')?.value;
	const roomCookie = cookies.find((c) => c.name === 'active-kamar-id')?.value;
	assert.equal(roomCookie, String(room));
	await page.goto(base + `/administrasi/absensi/monitoring?tab=asrama&kamar_id=${room}`, {
		waitUntil: 'networkidle0'
	});
	assert.ok((await page.content()).includes('Kamar Pengasuhan Lantai Satu'));
	assert.equal(
		(await browser.cookies()).find((c) => c.name === 'active-kelas-id')?.value,
		activeClass
	);
	pass('room view and monitoring use separate cookie without modifying class selection');
	await page.goto(base + '/administrasi/absensi/monitoring?tab=asrama', {
		waitUntil: 'networkidle0'
	});
	assert.ok(
		(await page.$eval('.monitoring-heading', (el) => el.textContent)).includes(
			'Kamar Pengasuhan Lantai Satu'
		)
	);
	const snapshot = await page.evaluate(() =>
		fetch('/api/administrasi/absensi/monitoring?tab=asrama').then((r) => r.json())
	);
	assert.equal(Number(snapshot.asrama.id), room);
	pass('selected room persists through sidebar navigation and monitoring refresh API');
	await page.goto(base + `/asrama/riwayat?q=QA%20Murid%200%20${fixture.suffix}`, {
		waitUntil: 'networkidle0'
	});
	await page.click('.dorm-page tbody button');
	await page.type('dialog[open] input[name="alasan"]', 'QA akhiri dari riwayat');
	await page.click('dialog[open] .modal-action button:last-child');
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	assert.equal(
		Number(
			(
				await client.execute({
					sql: 'SELECT COUNT(*) AS n FROM asrama_penempatan WHERE identity_uid=? AND selesai IS NULL',
					args: [student.uid]
				})
			).rows[0].n
		),
		0
	);
	pass('operator can end an open placement from history, independently of current semester roster');
	const authSource = (await client.execute("SELECT * FROM auth_user WHERE type='admin' LIMIT 1"))
		.rows[0];
	const now = new Date().toISOString();
	const addAccount = async (type, employee) => {
		const record = {
			...authSource,
			username: `qa_${type}_${fixture.suffix}`,
			username_normalized: `qa_${type}_${fixture.suffix}`,
			type,
			jabatan_akses: null,
			sekolah_id: fixture.schoolId,
			pegawai_id: employee,
			permissions: '[]',
			must_change_password: 0
		};
		delete record.id;
		const entries = Object.entries(record);
		const userId = Number(
			(
				await client.execute({
					sql: `INSERT INTO auth_user (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
					args: entries.map(([, value]) => value)
				})
			).lastInsertRowid
		);
		const token = randomUUID();
		await client.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at) VALUES(?,?,?,?,?,?)',
			args: [
				userId,
				createHash('sha256').update(token).digest('hex'),
				'QA UI asrama',
				'127.0.0.1',
				new Date(Date.now() + 3600000).toISOString(),
				now
			]
		});
		return token;
	};
	const wardenToken = await addAccount('wali_asrama', fixture.employee);
	const teacherToken = await addAccount('user', null);
	for (const [token, status] of [
		[wardenToken, 200],
		[teacherToken, 403]
	]) {
		const response = await fetch(base + '/asrama/kamar', {
			headers: { cookie: `rapkumer-session=${token}; active-sekolah-id=${fixture.schoolId}` },
			redirect: 'manual'
		});
		assert.equal(response.status, status);
	}
	const denied = await fetch(base + '/asrama?/save', {
		method: 'POST',
		redirect: 'manual',
		headers: {
			cookie: `rapkumer-session=${wardenToken}; active-sekolah-id=${fixture.schoolId}`,
			origin: base,
			accept: 'application/json',
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			operation: 'close',
			id: '1',
			tanggal: fixture.today,
			alasan: 'QA terlarang'
		})
	});
	const deniedBody = await denied.text();
	const deniedAction = JSON.parse(deniedBody);
	assert.equal(deniedAction.type, 'failure');
	assert.equal(deniedAction.status, 403);
	pass('HTTP role guard allows assigned warden, denies teacher and warden mutations');
	const legacy = await fetch(base + `/asrama?view=pemetaan&kamar_id=${room}`, {
		headers: { cookie: `rapkumer-session=${fixture.token}; active-sekolah-id=${fixture.schoolId}` },
		redirect: 'manual'
	});
	assert.equal(legacy.status, 303);
	assert.equal(legacy.headers.get('location'), `/asrama/penempatan?kamar_id=${room}`);
	const guarded = await fetch(base + '/asrama/gedung', {
		headers: { cookie: `rapkumer-session=${wardenToken}; active-sekolah-id=${fixture.schoolId}` },
		redirect: 'manual'
	});
	assert.equal(guarded.status, 403);
	pass('legacy views redirect safely; new master page remains restricted');
	await page.goto(base + '/asrama', { waitUntil: 'networkidle0' });
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	const darkShot = path.join(folder, 'asrama-dark.png');
	await page.screenshot({ path: darkShot, fullPage: true });
	screens.push(darkShot);
	assert.deepEqual(errors, []);
	pass('no browser runtime errors; dark-mode screenshot recorded');
	await writeFile(
		path.join(folder, 'ui-result.json'),
		JSON.stringify({ checks, screens, measurements }, null, 2)
	);
	console.log(JSON.stringify({ passed: checks.length, folder, screens, measurements }, null, 2));
} finally {
	await browser?.close();
	client.close();
	if (server && server.exitCode === null) {
		const exit = once(server, 'exit');
		server.kill();
		await exit;
	}
	await writeFile(path.join(folder, 'ui-server.log'), output);
}
