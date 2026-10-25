import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { compile } from 'svelte/compiler';
import { format } from 'prettier';

const component = 'src/routes/(kurikulum)/martikulasi/pengaturan/+page.svelte';
const source = await readFile(component, 'utf8');
assert.deepEqual(compile(source, { filename: component }).warnings, []);
const before = execFileSync('git', ['show', `HEAD:${component}`], { encoding: 'utf8' });
const script = (value) =>
	value.slice(value.indexOf('<script lang="ts">') + 18, value.indexOf('</script>'));
assert.equal(
	await format(
		script(source)
			.replace(/\s*let anggotaDialog = \$state<HTMLDialogElement \| null>\(null\);/, '')
			.replace(/\s*let addingMember = \$state\(false\);/, '')
			.replace(
				/\s*function settingsFormValues\(\) \{[\s\S]*?let settingsValues = \$derived\(settingsFormValues\(\)\);/,
				''
			)
			.replace(/\s*import \{ resolve \} from '\$app\/paths';/, '')
			.replace(
				'goto(resolve(`/martikulasi/pengaturan?tahun_ajaran_id=${id}`));',
				'goto(`/martikulasi/pengaturan?tahun_ajaran_id=${id}`);'
			),
		{ parser: 'typescript' }
	),
	await format(script(before), { parser: 'typescript' }),
	'Only modal state, stable form bindings and base-path-safe navigation may change in the script'
);

const local = process.env.MARTIKULASI_UI_LOCAL === '1';
const port = local ? 5152 : 5159,
	base = `http://localhost:${port}`,
	route = '/martikulasi/pengaturan';
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(
	path.resolve('tmp', local ? 'martikulasi-ui-local-' : 'martikulasi-ui-copy-')
);
const measurements = [],
	actions = [],
	blocked = [],
	errors = [];
let browser,
	child,
	db,
	session,
	output = '';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
	if (!local) {
		let occupied = false;
		try {
			occupied = (await fetch(`${base}/login`)).status > 0;
		} catch {
			/* Unused QA port. */
		}
		assert.equal(occupied, false, 'QA port is occupied');
		const file = path.join(folder, 'database.sqlite3');
		const original = createClient({ url: 'file:./data/database.sqlite3' });
		try {
			await original.execute({ sql: 'VACUUM INTO ?', args: [file] });
		} finally {
			original.close();
		}
		db = createClient({ url: `file:${file}` });
		const admin = (
			await db.execute("SELECT id,sekolah_id FROM auth_user WHERE type='admin' LIMIT 1")
		).rows[0];
		const school = Number(
			admin.sekolah_id || (await db.execute('SELECT id FROM sekolah LIMIT 1')).rows[0].id
		);
		const kelas = Number(
			(await db.execute({ sql: 'SELECT id FROM kelas WHERE sekolah_id=? LIMIT 1', args: [school] }))
				.rows[0].id
		);
		await db.execute({
			sql: 'UPDATE auth_user SET sekolah_id=?,must_change_password=0 WHERE id=?',
			args: [school, admin.id]
		});
		const now = new Date().toISOString(),
			token = randomBytes(32).toString('base64url');
		await db.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
			args: [
				admin.id,
				createHash('sha256').update(token).digest('hex'),
				'Martikulasi UI QA',
				'127.0.0.1',
				new Date(Date.now() + 1800000).toISOString(),
				now,
				now
			]
		});
		session = { school, kelas, token };
		child = spawn(process.execPath, ['build/index.js'], {
			windowsHide: true,
			env: {
				...process.env,
				PORT: String(port),
				HOST: '127.0.0.1',
				ORIGIN: base,
				DB_URL: `file:${file}`,
				KAGANGA_DATA_DIR: path.join(folder, 'data'),
				NODE_ENV: 'production'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		child.stdout.on('data', (chunk) => {
			output += chunk;
		});
		child.stderr.on('data', (chunk) => {
			output += chunk;
		});
		let ready = false;
		for (let i = 0; i < 120; i++) {
			try {
				if ((await fetch(`${base}/login`)).status === 200) {
					ready = true;
					break;
				}
			} catch {
				/* Startup. */
			}
			if (child.exitCode !== null) break;
			await delay(500);
		}
		assert.ok(ready, output.slice(-3000));
	}
	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	const page = await browser.newPage();
	await page.setCacheEnabled(false);
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setRequestInterception(true);
	page.on('request', (request) => {
		const url = new URL(request.url());
		const mutation =
			!['GET', 'HEAD'].includes(request.method()) &&
			!(url.pathname === '/login' && request.method() === 'POST');
		if (mutation && (local || url.pathname !== route)) {
			blocked.push(url.pathname);
			void request.abort();
		} else if (mutation) {
			actions.push(url.search);
			setTimeout(() => void request.continue(), 500);
		} else void request.continue();
	});
	if (session)
		await browser.setCookie(
			...Object.entries({
				'rapkumer-session': session.token,
				'active-sekolah-id': String(session.school),
				'active-kelas-id': String(session.kelas)
			}).map(([name, value]) => ({ name, value, url: base }))
		);
	else {
		await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
		await page.type('#username', process.env.KAGANGA_AUDIT_USERNAME || 'Admin');
		await page.type('#password', process.env.KAGANGA_AUDIT_PASSWORD || 'Admin123');
		await Promise.all([
			page.waitForNavigation({ waitUntil: 'networkidle0' }),
			page.click('button[type="submit"]')
		]);
	}
	async function go(query = '') {
		const response = await page.goto(base + route + query, { waitUntil: 'networkidle0' });
		assert.equal(response.status(), 200);
		assert.equal(new URL(page.url()).pathname, route);
		await page.addStyleTag({
			content: '*,*::before,*::after{animation:none!important;transition:none!important}'
		});
	}
	async function capture(label) {
		const value = await page.evaluate(() => {
			const rect = (el) => {
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return { x: r.x, y: r.y, width: r.width, height: r.height };
			};
			const table = document.querySelector('.martikulasi-table'),
				modal = document.querySelector('dialog[open] .app-modal-box');
			return {
				viewport: innerWidth,
				pageWidth: document.documentElement.scrollWidth,
				page: rect(document.querySelector('.martikulasi-page')),
				sections: [...document.querySelectorAll('.martikulasi-section')].map(rect),
				titleFont: getComputedStyle(document.querySelector('.martikulasi-header h1')).fontSize,
				table: rect(table),
				wrapper: rect(table?.parentElement),
				deleteButton: rect(table?.querySelector('.martikulasi-delete')),
				deleteIcon: rect(table?.querySelector('.martikulasi-delete svg')),
				fields: [...document.querySelectorAll('.form-control > input,.form-control > select')]
					.filter((el) => el.getClientRects().length > 0 && !el.closest('dialog:not([open])'))
					.map((el) => ({ name: el.name, ...rect(el) })),
				modal: rect(modal),
				footer: rect(modal?.querySelector('.app-modal-actions')),
				modalOverflow: modal ? modal.scrollWidth > modal.clientWidth + 1 : false
			};
		});
		await writeFile(path.join(folder, 'last-measurement.json'), JSON.stringify(value, null, 2));
		assert.ok(value.pageWidth <= value.viewport + 1, `${label}: page overflow`);
		assert.equal(value.titleFont, '20px');
		for (const section of value.sections)
			assert.ok(
				section.x >= -1 && section.x + section.width <= value.viewport + 1,
				`${label}: section overflow`
			);
		assert.ok(value.wrapper.width <= value.page.width);
		for (const field of value.fields)
			assert.equal(Math.round(field.height), 40, `${label}: input ${field.name} height`);
		if (value.deleteButton) {
			assert.equal(Math.round(value.deleteButton.width), 32);
			assert.equal(Math.round(value.deleteButton.height), 32);
			assert.equal(Math.round(value.deleteIcon.width), 16);
		}
		if (value.modal) {
			assert.ok(value.modal.x >= 0 && value.modal.x + value.modal.width <= value.viewport + 1);
			assert.equal(value.modalOverflow, false, `${label}: modal overflow`);
			assert.ok(
				value.footer.y >= value.modal.y &&
					value.footer.y + value.footer.height <= value.modal.y + value.modal.height + 1,
				`${label}: clipped footer`
			);
			// Disabling the clicked submit button can temporarily move browser focus to body.
			if (!label.endsWith('-loading')) {
				assert.ok(
					await page.evaluate(() =>
						document.querySelector('dialog[open]').contains(document.activeElement)
					),
					'Modal focus containment'
				);
			}
		}
		measurements.push({ label, ...value });
		await page.screenshot({ path: path.join(folder, `${label}.png`) });
	}
	for (const width of [1440, 1280, 1024, 768, 390, 320]) {
		await page.setViewport({ width, height: width <= 390 ? 844 : 1000 });
		await go();
		await capture(`${width}-page`);
		await page.$eval('.martikulasi-table-scroll', (el) => el.scrollIntoView({ block: 'start' }));
		await page.$eval('.martikulasi-table-scroll', (el) => {
			el.scrollLeft = el.scrollWidth;
		});
		await capture(`${width}-team`);
		await page.$eval('.martikulasi-section:last-of-type', (el) =>
			el.scrollIntoView({ block: 'end' })
		);
		await capture(`${width}-issue`);
		const trigger = '.martikulasi-section-heading button';
		if (
			(await page.$eval(trigger, (el) => !el.disabled)) &&
			[1440, 768, 390, 320].includes(width)
		) {
			await page.click(trigger);
			await capture(`${width}-member-dialog`);
			await page.keyboard.press('Tab');
			await page.keyboard.down('Shift');
			await page.keyboard.press('Tab');
			await page.keyboard.up('Shift');
			assert.ok(
				await page.evaluate(() =>
					document.querySelector('dialog[open]').contains(document.activeElement)
				)
			);
			await page.keyboard.press('Escape');
			assert.equal(await page.$('dialog[open]'), null);
			assert.ok(
				await page.$eval(trigger, (el) => document.activeElement === el),
				'Return focus to add button'
			);
		}
	}
	await page.setViewport({ width: 390, height: 600 });
	await go();
	if (await page.$eval('.martikulasi-section-heading button', (el) => !el.disabled)) {
		await page.click('.martikulasi-section-heading button');
		await capture('390-short-dialog');
		await page.keyboard.press('Escape');
	}
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await capture('390-dark');
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
	if (!local) {
		await page.setViewport({ width: 1440, height: 1000 });
		await go();
		const year = Number(
			await page.$eval('#martikulasi-settings-form [name="tahunAjaranId"]', (el) => el.value)
		);
		const now = new Date().toISOString();
		const freshYear = Number(
			(
				await db.execute({
					sql: 'INSERT INTO tahun_ajaran(sekolah_id,nama,is_aktif,created_at,updated_at) VALUES(?,?,?,?,?) RETURNING id',
					args: [session.school, `2098/2099 QA ${Date.now()}`, 0, now, now]
				})
			).rows[0].id
		);
		await go(`?tahun_ajaran_id=${freshYear}`);
		assert.ok(await page.$eval('.martikulasi-section-heading button', (el) => el.disabled));
		await capture('unconfigured-year');
		await page.select('.martikulasi-header select', String(year));
		await page.waitForFunction(
			(year) => new URL(location.href).searchParams.get('tahun_ajaran_id') === String(year),
			{},
			year
		);
		await page.waitForNetworkIdle({ idleTime: 600 });
		assert.equal(
			await page.$eval('#martikulasi-settings-form [name="tahunAjaranId"]', (el) => el.value),
			String(year)
		);
		async function fill(selector, value) {
			await page.$eval(
				selector,
				(el, value) => {
					el.value = value;
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				},
				String(value)
			);
			await delay(100);
			assert.equal(
				await page.$eval(selector, (el) => el.value),
				String(value),
				`Changed value must persist: ${selector}`
			);
		}
		async function submit(selector, action, loading = false) {
			const response = page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes(`?/${action}`)
			);
			void response.catch(() => {});
			await page.click(selector);
			if (loading) {
				await page.waitForSelector(`${selector}[disabled]`);
				await capture(`${action}-loading`);
			}
			const result = await response;
			await page.waitForNetworkIdle({ idleTime: 600 });
			return result;
		}
		await page.focus('#martikulasi-settings-form [name="nomorSk"]');
		await page.keyboard.down('Control');
		await page.keyboard.press('A');
		await page.keyboard.up('Control');
		await page.keyboard.type('QA typed');
		assert.equal(
			await page.$eval('#martikulasi-settings-form [name="nomorSk"]', (el) => el.value),
			'QA typed'
		);
		await fill('#martikulasi-settings-form [name="formatNomorSttm"]', 'INVALID');
		const invalidSettings = await submit('#martikulasi-settings-form button', 'simpan');
		const invalidResult = await invalidSettings.json();
		await writeFile(path.join(folder, 'invalid-result.json'), JSON.stringify(invalidResult));
		assert.equal(invalidResult.status, 400);
		await capture('settings-validation-error');
		await fill(
			'#martikulasi-settings-form [name="formatNomorSttm"]',
			'{urut}/STTM/QA/{bulan_romawi}/{tahun}'
		);
		await fill('#martikulasi-settings-form [name="nomorSk"]', 'QA/UI/2026');
		await fill('#martikulasi-settings-form [name="periodeMulai"]', '2026-08-01');
		await fill('#martikulasi-settings-form [name="periodeSelesai"]', '2026-09-30');
		await fill('#martikulasi-settings-form [name="nomorUrutSttmBerikutnya"]', '57');
		assert.equal((await submit('#martikulasi-settings-form button', 'simpan', true)).status(), 200);
		const settings = (
			await db.execute({
				sql: 'SELECT * FROM martikulasi_settings WHERE sekolah_id=? AND tahun_ajaran_id=?',
				args: [session.school, year]
			})
		).rows[0];
		assert.equal(settings.nomor_sk, 'QA/UI/2026');
		assert.equal(settings.periode_mulai, '2026-08-01');
		assert.equal(settings.periode_selesai, '2026-09-30');
		assert.equal(Number(settings.nomor_urut_sttm_berikutnya), 57);
		const employee = (
			await db.execute({
				sql: "SELECT id FROM pegawai WHERE sekolah_id=? AND status='aktif' LIMIT 1",
				args: [session.school]
			})
		).rows[0];
		assert.ok(employee);
		await page.click('.martikulasi-section-heading button');
		assert.equal(await page.$eval('#martikulasi-member-form', (el) => el.checkValidity()), false);
		await page.select('#martikulasi-member-form [name="pegawaiId"]', String(employee.id));
		await fill('#martikulasi-member-form [name="jabatanTim"]', 'Tim QA UI');
		await fill(
			'#martikulasi-member-form [name="tugas"]',
			'Memantau kelengkapan hasil martikulasi dan membantu koordinasi pelaksanaan kegiatan. '.repeat(
				5
			)
		);
		await submit('#martikulasi-member-form button[type="submit"]', 'tambahTim', true);
		assert.equal(await page.$('dialog[open]'), null);
		const member = (
			await db.execute(
				"SELECT * FROM martikulasi_tim WHERE jabatan_tim='Tim QA UI' ORDER BY id DESC LIMIT 1"
			)
		).rows[0];
		assert.ok(member);
		await page.$eval('.martikulasi-table-scroll', (el) => el.scrollIntoView({ block: 'center' }));
		await capture('member-added-long-text');
		const deleteSelector = `form:has(input[name="id"][value="${member.id}"]) button`;
		const countBefore = actions.length;
		page.once('dialog', (dialog) => void dialog.dismiss());
		await page.click(deleteSelector);
		await delay(600);
		assert.equal(actions.length, countBefore, 'Cancelled deletion must not POST');
		page.once('dialog', (dialog) => void dialog.accept());
		await submit(deleteSelector, 'hapusTim');
		assert.equal(
			(await db.execute({ sql: 'SELECT id FROM martikulasi_tim WHERE id=?', args: [member.id] }))
				.rows.length,
			0
		);
		await db.execute({
			sql: 'DELETE FROM martikulasi_tim WHERE settings_id=?',
			args: [settings.id]
		});
		await go(`?tahun_ajaran_id=${year}`);
		await page.$eval('.martikulasi-table-scroll', (el) => el.scrollIntoView({ block: 'center' }));
		await capture('empty-team');
		await page.setViewport({ width: 390, height: 844 });
		await page.$eval('.martikulasi-table-scroll', (el) => el.scrollIntoView({ block: 'center' }));
		assert.equal(
			await page.$eval('.martikulasi-table thead', (el) => getComputedStyle(el).display),
			'none'
		);
		await capture('390-empty-team');
		await page.setViewport({ width: 1440, height: 1000 });
		const murid = (
			await db.execute({
				sql: 'SELECT m.id,m.kelas_id FROM murid m JOIN kelas k ON k.id=m.kelas_id WHERE m.sekolah_id=? AND k.tahun_ajaran_id=? LIMIT 1',
				args: [session.school, year]
			})
		).rows[0];
		assert.ok(murid);
		await db.execute({
			sql: "UPDATE martikulasi_hasil SET status_kelengkapan='belum_lengkap' WHERE sekolah_id=? AND tahun_ajaran_id=? AND nomor_sttm IS NULL",
			args: [session.school, year]
		});
		await db.execute({
			sql: "INSERT INTO martikulasi_hasil(sekolah_id,tahun_ajaran_id,kelas_id,murid_id,status_kelengkapan,level_penempatan,created_at,updated_at) VALUES(?,?,?,?,'lengkap','madya',?,?) ON CONFLICT(sekolah_id,tahun_ajaran_id,murid_id) DO UPDATE SET status_kelengkapan='lengkap',nomor_sttm=NULL,tanggal_sttm=NULL",
			args: [session.school, year, murid.kelas_id, murid.id, now, now]
		});
		await go(`?tahun_ajaran_id=${year}`);
		await fill('#martikulasi-issue-form [name="tanggalSttm"]', '2026-10-25');
		await page.$eval('#martikulasi-issue-form', (el) => el.scrollIntoView({ block: 'center' }));
		await submit('#martikulasi-issue-form button', 'terbitkanSttm', true);
		const issued = (
			await db.execute({
				sql: 'SELECT nomor_sttm,tanggal_sttm FROM martikulasi_hasil WHERE murid_id=? AND tahun_ajaran_id=? AND sekolah_id=?',
				args: [murid.id, year, session.school]
			})
		).rows[0];
		assert.ok(issued.nomor_sttm.includes('/STTM/QA/'));
		assert.equal(issued.tanggal_sttm, '2026-10-25');
		assert.equal(
			Number(
				(
					await db.execute({
						sql: 'SELECT nomor_urut_sttm_berikutnya FROM martikulasi_settings WHERE id=?',
						args: [settings.id]
					})
				).rows[0].nomor_urut_sttm_berikutnya
			),
			58
		);
		assert.ok(await page.$eval('#martikulasi-issue-form button', (el) => el.disabled));
		await capture('issued-sttm');
	}
	assert.deepEqual(errors, []);
	assert.deepEqual(blocked, []);
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify({ status: 'PASS', local, measurements, actions, errors, blocked }, null, 2)
	);
	console.log(
		JSON.stringify({
			status: 'PASS',
			folder,
			screenshots: measurements.length,
			actions: actions.length
		})
	);
} catch (error) {
	console.error(error);
	if (browser) {
		const pages = await browser.pages(),
			page = pages.at(-1);
		if (error.name !== 'TimeoutError') {
			await Promise.race([
				page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {}),
				delay(3000)
			]);
		}
		await writeFile(
			path.join(folder, 'failure.txt'),
			await Promise.race([
				page.evaluate(() => document.body.innerText).catch(() => String(error)),
				delay(3000).then(() => String(error))
			])
		);
	}
	throw error;
} finally {
	if (browser) await browser.close().catch(() => {});
	if (child && child.exitCode === null) {
		const exited = once(child, 'exit');
		child.kill();
		await exited;
	}
	if (db) db.close();
	await writeFile(path.join(folder, 'server.log'), output);
}
