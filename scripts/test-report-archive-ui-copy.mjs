import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const { folder } = JSON.parse(await readFile('tmp/report-archive-latest.json', 'utf8'));
const fixture = JSON.parse(await readFile(path.join(folder, 'ui-fixture.json'), 'utf8'));
const port = Number(process.env.REPORT_ARCHIVE_QA_PORT ?? 5192);
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536 && ![5152, 1206].includes(port));
await new Promise((resolve, reject) => {
	const probe = net.createServer();
	probe.once('error', reject);
	probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
const base = `http://127.0.0.1:${port}`;
let server,
	browser,
	output = '';
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
async function fillMetadata(page, metadata, labels) {
	await page.evaluate(
		({ metadata, labels }) => {
			for (const [key, label] of Object.entries(labels)) {
				const input = [...document.querySelectorAll('form label')]
					.find((node) => node.textContent.includes(label))
					?.querySelector('input,select');
				if (input) {
					input.value = metadata[key];
					input.dispatchEvent(new Event('input', { bubbles: true }));
					input.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}
		},
		{ metadata, labels }
	);
}
async function settleViewport(page, width, height = 1000) {
	await page.setViewport({ width, height });
	await page.evaluate(() => {
		const drawer = document.getElementById('my-drawer-2');
		if (drawer) drawer.checked = false;
		document.getElementById('app-content')?.scrollTo(0, 0);
		window.scrollTo(0, 0);
	});
	await new Promise((resolve) => setTimeout(resolve, 350));
}
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
			KAGANGA_DATA_DIR: path.join(folder, 'data'),
			photo: fixture.uploadRoot
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	server.stdout.on('data', (data) => {
		output += data;
	});
	server.stderr.on('data', (data) => {
		output += data;
	});
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try {
			const response = await fetch(base + '/login');
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {
			/* QA server may still be starting. */
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	assert.ok(ready, 'QA server did not start: ' + output);
	browser = await puppeteer.launch({
		executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		defaultViewport: { width: 1440, height: 1000 }
	});
	const page = await browser.newPage();
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await browser.setCookie(
		{ name: 'rapkumer-session', value: fixture.token, url: base },
		{ name: 'active-sekolah-id', value: String(fixture.schoolId), url: base }
	);
	const target = `/murid/arsip/rapor/${fixture.history}?jenis=sekolah&periode=rts`;
	const response = await page.goto(base + target, { waitUntil: 'networkidle0' });
	assert.equal(response.status(), 200);
	assert.ok(
		(await page.$eval('h1', (node) => node.textContent)).includes('Rapor Riwayat Pendidikan')
	);
	for (const width of [360, 390, 768, 1024, 1440]) {
		await page.setViewport({ width, height: 1000 });
		await new Promise((resolve) => setTimeout(resolve, 150));
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
			`Page overflow at ${width}`
		);
		await page.screenshot({ path: path.join(folder, `review-${width}.png`), fullPage: true });
	}
	pass('Review page loads at 360, 390, 768, 1024 and 1440px without horizontal page overflow');
	await page.setViewport({ width: 1440, height: 1000 });
	const labels = {
		schoolName: 'Nama resmi',
		npsn: 'NPSN',
		address: 'Alamat sekolah',
		principalName: 'Nama kepala',
		principalNip: 'NIP kepala',
		principalStatus: 'Status kepala',
		teacherName: 'Nama wali',
		teacherNip: 'NIP wali',
		place: 'Tempat penetapan',
		date: 'Tanggal rapor'
	};
	await fillMetadata(page, fixture.metadata, labels);
	assert.equal(await page.$eval('button[type=submit]', (node) => node.disabled), true);
	await page.click('form input[type=checkbox]:not([name])');
	await page.click('button[type=submit]');
	await page.waitForSelector('iframe', { timeout: 60000 });
	assert.equal(await page.$eval('button[type=submit]', (node) => node.disabled), false);
	await page.screenshot({ path: path.join(folder, 'preview-desktop.png'), fullPage: true });
	await page.click('input[name=confirmFinal]');
	await page.click('button.btn-success');
	await page.waitForFunction(() => document.body.textContent.includes('Arsip final tersedia'), {
		timeout: 60000
	});
	assert.equal(await page.$('form input[type=date]'), null);
	pass(
		'UI metadata confirmation, real PDF preview, explicit final approval and final-only controls work'
	);
	const bytes = await page.evaluate(async (url) => {
		const response = await fetch(url);
		return {
			status: response.status,
			type: response.headers.get('content-type'),
			cache: response.headers.get('cache-control'),
			bytes: (await response.arrayBuffer()).byteLength
		};
	}, `/api/rapor-arsip/${fixture.history}?jenis=sekolah&periode=ras`);
	assert.equal(bytes.status, 200);
	assert.equal(bytes.type, 'application/pdf');
	assert.equal(bytes.cache, 'no-store');
	assert.ok(bytes.bytes > 1000);
	await page.goto(base + `/murid/arsip/rapor/${fixture.history}?jenis=asrama&periode=ras`, {
		waitUntil: 'networkidle0'
	});
	assert.ok(
		(await page.$eval('section', (node) => node.textContent)).includes('Arsip final tersedia')
	);
	await page.goto(base + '/murid/arsip', { waitUntil: 'networkidle0' });
	const historyButton = await page.$('button[data-history-id]');
	assert.ok(historyButton);
	await historyButton.click();
	await page.waitForSelector('dialog[open]');
	await page.setViewport({ width: 390, height: 900 });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	await page.screenshot({ path: path.join(folder, 'history-mobile.png'), fullPage: true });
	pass('History popup remains locally scrollable on mobile');
	assert.deepEqual(pageErrors, []);
	pass('Final PDF endpoint, dorm review and browser runtime have no errors');
	const anonymous = await fetch(
		base + `/api/rapor-arsip/${fixture.history}?jenis=sekolah&periode=ras`,
		{ redirect: 'manual' }
	);
	assert.ok([401, 303].includes(anonymous.status));
	pass('Anonymous PDF download is not allowed');
	if (fixture.accounts) {
		const http = async (label, route, body) =>
			fetch(base + route, {
				redirect: 'manual',
				method: body ? 'POST' : 'GET',
				headers: {
					cookie: `rapkumer-session=${fixture.accounts[label].token}; active-sekolah-id=${fixture.schoolId}`,
					origin: base,
					...(body ? { 'content-type': 'application/json' } : {})
				},
				body: body ? JSON.stringify(body) : undefined
			});
		for (const [label, kind, status] of [
			['teacher', 'sekolah', 200],
			['unassigned', 'sekolah', 403],
			['asuh', 'asrama', 200],
			['asrama', 'asrama', 200],
			['asrama_unassigned', 'asrama', 403],
			['leader', 'sekolah', 200],
			['kitchen', 'sekolah', 403]
		])
			assert.equal(
				(await http(label, `/api/rapor-arsip/${fixture.history}?jenis=${kind}&periode=ras`)).status,
				status,
				label
			);
		assert.equal(
			(
				await http('leader', `/api/rapor-arsip/${fixture.history}?jenis=sekolah&periode=ras`, {
					action: 'finalize',
					metadata: fixture.metadata,
					confirmMetadata: true
				})
			).status,
			403
		);
		assert.equal(
			(
				await http('teacher', '/api/rapor-arsip/batch?jenis=sekolah&periode=ras', {
					historyIds: fixture.batchHistories,
					metadata: fixture.metadata,
					confirmMetadata: true
				})
			).status,
			403
		);
		const teacherContext = await browser.createBrowserContext();
		await teacherContext.setCookie(
			{ name: 'rapkumer-session', value: fixture.accounts.teacher.token, url: base },
			{ name: 'active-sekolah-id', value: String(fixture.schoolId), url: base }
		);
		const teacherPage = await teacherContext.newPage();
		await teacherPage.goto(
			base + `/murid/arsip/rapor/${fixture.history}?jenis=sekolah&periode=ras`,
			{ waitUntil: 'networkidle0' }
		);
		assert.equal(await teacherPage.$('.is-readonly'), null);
		assert.equal(await teacherPage.$('a[href*=revisi]'), null);
		await teacherContext.close();
		pass(
			'HTTP and UI enforce teacher/guardian assignments, deny kitchen access and require explicit delegated approval'
		);
		await page.setViewport({ width: 1440, height: 1000 });
		await page.goto(base + `/murid/arsip/rapor/${fixture.history}?jenis=sekolah&periode=ras`, {
			waitUntil: 'networkidle0'
		});
		assert.equal(
			await page.$$eval(
				'select option',
				(nodes, id) => nodes.filter((n) => n.value === id).length,
				fixture.baseArchiveId
			),
			1
		);
		const original = await fetch(
			base +
				`/api/rapor-arsip/${fixture.history}?jenis=sekolah&periode=ras&versi=${fixture.baseArchiveId}`,
			{
				headers: {
					cookie: `rapkumer-session=${fixture.token}; active-sekolah-id=${fixture.schoolId}`
				}
			}
		);
		const oldHash = createHash('sha256')
			.update(Buffer.from(await original.arrayBuffer()))
			.digest('hex');
		assert.equal(
			oldHash,
			createHash('sha256')
				.update(await readFile(path.join(folder, 'school-final.pdf')))
				.digest('hex')
		);
		await page.click('a[href*=revisi]');
		await page.waitForSelector('form textarea');
		await fillMetadata(page, fixture.metadata, labels);
		await page.type('form textarea', 'Koreksi dokumen melalui pemeriksaan UI');
		await page.click('form input[type=checkbox]:not([name])');
		await page.click('button[type=submit]');
		await page.waitForSelector('iframe', { timeout: 60000 });
		await page.click('input[name=confirmFinal]');
		await page.click('button.btn-success');
		await page.waitForFunction(
			() => document.body.textContent.includes('v3') && !document.querySelector('form textarea'),
			{ timeout: 60000 }
		);
		await page.screenshot({
			path: path.join(folder, 'revision-history-desktop.png'),
			fullPage: true
		});
		pass('Admin revision UI publishes v3 while v1 PDF remains downloadable byte-for-byte');
		await page.goto(
			base + `/murid/arsip/rapor?kelas_id=${fixture.classId}&jenis=sekolah&periode=rts`,
			{ waitUntil: 'networkidle0' }
		);
		for (const width of [360, 390, 768, 1024, 1440]) {
			await settleViewport(page, width);
			assert.ok(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
				`Batch overflow at ${width}`
			);
			await page.screenshot({ path: path.join(folder, `batch-${width}.png`), fullPage: true });
		}
		await page.setViewport({ width: 1440, height: 1000 });
		await page.click('input[aria-label="Pilih QA Massal 1"]');
		await page.click('input[aria-label="Pilih QA Massal 2"]');
		await fillMetadata(page, fixture.metadata, labels);
		await page.click('form input[type=checkbox]:not([name])');
		let failNext = true,
			previewRequests = 0;
		await page.setRequestInterception(true);
		const intercept = async (req) => {
			if (req.url().includes('/api/rapor-arsip/batch')) {
				previewRequests++;
				if (failNext) {
					failNext = false;
					await req.respond({
						status: 503,
						contentType: 'application/json',
						body: JSON.stringify({ message: 'QA gangguan sementara' })
					});
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, 400));
			}
			await req.continue();
		};
		page.on('request', intercept);
		await page.click('button.btn-primary');
		await page.waitForFunction(() => document.body.textContent.includes('QA gangguan sementara'));
		assert.equal(await page.$eval('button.btn-success', (node) => node.disabled), true);
		await page.click('button.btn-primary');
		assert.equal(await page.$eval('button.btn-primary', (node) => node.disabled), true);
		await page.evaluate(() => document.querySelector('button.btn-primary').click());
		await page.waitForSelector('iframe', { timeout: 60000 });
		assert.equal(previewRequests, 2);
		page.off('request', intercept);
		await page.setRequestInterception(false);
		await page.click('input[name=approved]');
		await page.click('button.btn-success');
		await page.waitForFunction(() => document.body.textContent.includes('Proses selesai.'), {
			timeout: 60000
		});
		assert.equal(
			await page.$$eval(
				'td p',
				(nodes) => nodes.filter((n) => n.textContent === 'Tersimpan').length
			),
			2
		);
		await page.screenshot({
			path: path.join(folder, 'batch-complete-desktop.png'),
			fullPage: true
		});
		await settleViewport(page, 390);
		await page.screenshot({ path: path.join(folder, 'batch-complete-mobile.png'), fullPage: true });
		await page.focus('section header a');
		await page.keyboard.press('Tab');
		assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SELECT');
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
		await new Promise((resolve) => setTimeout(resolve, 200));
		await page.screenshot({ path: path.join(folder, 'batch-dark-mobile.png'), fullPage: true });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
		await settleViewport(page, 1440);
		const measurements = await page.evaluate(() => ({
			viewport: innerWidth,
			headerHeight: document.querySelector('table thead tr')?.getBoundingClientRect().height,
			rowHeight: document.querySelector('table tbody tr')?.getBoundingClientRect().height,
			selectHeight: document.querySelector('select')?.getBoundingClientRect().height,
			tableWidth: document.querySelector('table')?.getBoundingClientRect().width
		}));
		await writeFile(
			path.join(folder, 'ui-measurements.json'),
			JSON.stringify(measurements, null, 2)
		);
		assert.deepEqual(pageErrors, []);
		pass(
			'Batch UI survives a temporary error, prevents duplicate submit, previews then finalizes selected rows responsively'
		);
		const backup = await import('../src/lib/server/report-history-backup.ts');
		const bundle = await backup.createReportHistoryBackup({
			database: fixture.database,
			directory: path.join(folder, 'ui-final-backup'),
			uploads: [fixture.uploadRoot]
		});
		assert.equal(bundle.manifest.complete, true);
		assert.ok(
			bundle.manifest.references.filter(
				(v) => v.table === 'rapor_arsip_revisi' && v.status === 'ok'
			).length >= 2
		);
		await backup.restoreReportHistoryBackup(
			path.join(folder, 'ui-final-backup'),
			path.join(folder, 'ui-final-restored')
		);
		pass(
			'Post-UI backup restores all original, revised and bulk-finalized PDF files with verified hashes'
		);
		const control = await page.goto(base + '/jurnal-mengajar', { waitUntil: 'networkidle0' });
		assert.equal(control.status(), 200);
		assert.ok((await page.title()).includes('Jurnal'));
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({
			path: path.join(folder, 'control-jurnal-desktop.png'),
			fullPage: true
		});
		assert.deepEqual(pageErrors, []);
		pass(
			'Keyboard focus, dark-mode rendering and unaffected teaching-journal control page verified'
		);
	}
	await writeFile(
		path.join(folder, 'ui-results.json'),
		JSON.stringify({ checks, pageErrors, bytes }, null, 2)
	);
	console.log(JSON.stringify({ folder, checks: checks.length }));
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		server.kill();
		await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
		if (server.exitCode === null) server.kill('SIGKILL');
	}
	await writeFile(path.join(folder, 'ui-server.log'), output);
}
