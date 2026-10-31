import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import puppeteer from 'puppeteer-core';
import { createClient } from '@libsql/client';
import assert from 'node:assert/strict';

const { folder } = JSON.parse(await readFile('tmp/dormitory-latest.json', 'utf8'));
const fixture = JSON.parse(await readFile(path.join(folder, 'ui-fixture.json'), 'utf8'));
const after = process.env.DORMITORY_MEASURE_AFTER === '1',
	phase = after ? 'after' : 'before',
	port = 5194,
	base = `http://127.0.0.1:${port}`;
const client = createClient({ url: `file:${fixture.database}` });
const kelas = (
	await client.execute({
		sql: 'SELECT kelas_id FROM murid WHERE id=?',
		args: [fixture.students[0].id]
	})
).rows[0].kelas_id;
client.close();
let server,
	browser,
	output = '';
const measurements = [];
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
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(base + '/login')).ok) break;
		} catch {
			/* Wait for QA startup. */
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	browser = await puppeteer.launch({
		executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		headless: true,
		args: ['--no-sandbox']
	});
	await browser.setCookie(
		{ name: 'rapkumer-session', value: fixture.token, url: base },
		{ name: 'active-sekolah-id', value: String(fixture.schoolId), url: base }
	);
	const page = await browser.newPage();
	for (const width of [1440, 390]) {
		await page.setViewport({ width, height: 1000 });
		for (const [name, route] of [
			['murid', `/murid?kelas_id=${kelas}`],
			['asrama', after ? '/asrama/kamar' : '/asrama']
		]) {
			await page.goto(base + route, { waitUntil: 'networkidle0' });
			await page.evaluate(() => {
				const drawer = document.getElementById('my-drawer-2');
				if (drawer) drawer.checked = false;
			});
			await new Promise((r) => setTimeout(r, 200));
			const metric = await page.evaluate(() => {
				const size = (e) =>
					e
						? { width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }
						: null;
				const table =
					document.querySelector('main table') ??
					document.querySelector('.murid-table,.dorm-page table');
				const cell = table?.querySelector('tbody td'),
					style = cell ? getComputedStyle(cell) : null;
				return {
					viewport: innerWidth,
					pageWidth: document.documentElement.scrollWidth,
					sidebar: size(document.querySelector('.app-sidebar')),
					navbar: size(document.querySelector('.app-navbar')),
					table: size(table),
					header: size(table?.querySelector('thead')),
					row: size(table?.querySelector('tbody tr')),
					cellPadding: style
						? [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
						: null,
					button: size(document.querySelector('.dorm-page header button,.btn')),
					roomFilter: size(document.querySelector('#dorm-room')),
					columns: table
						? [...table.querySelectorAll('thead th')].map((th) => ({
								name: th.textContent.trim(),
								width: th.getBoundingClientRect().width
							}))
						: []
				};
			});
			measurements.push({ name, phase, ...metric });
			await page.screenshot({
				path: path.join(folder, `${phase}-${name}-${width}.png`),
				fullPage: true
			});
		}
	}
	await page.setViewport({ width: 1440, height: 1000 });
	await page.goto(base + (after ? '/asrama/gedung' : '/asrama'), { waitUntil: 'networkidle0' });
	await page.$$eval('.dorm-page header button', (buttons) =>
		buttons.find((b) => b.textContent.includes('Tambah Asrama')).click()
	);
	await new Promise((r) => setTimeout(r, 250));
	measurements.push({
		name: 'modal',
		phase,
		...(await page.$eval('dialog[open] .modal-box', (e) => ({
			width: e.getBoundingClientRect().width,
			maxHeight: getComputedStyle(e).maxHeight,
			padding: getComputedStyle(e).padding,
			radius: getComputedStyle(e).borderRadius,
			input: e.querySelector('input[name="nama"]').getBoundingClientRect().height,
			button: e.querySelector('.modal-action button').getBoundingClientRect().height
		})))
	});
	await writeFile(
		path.join(folder, `${phase}-measurements.json`),
		JSON.stringify(measurements, null, 2)
	);
	if (after) {
		const before = JSON.parse(
			await readFile(path.join(folder, 'before-measurements.json'), 'utf8')
		);
		for (const metric of measurements.filter((m) => m.name === 'murid')) {
			const previous = before.find((m) => m.name === 'murid' && m.viewport === metric.viewport);
			for (const key of ['table', 'header', 'row', 'cellPadding'])
				assert.deepEqual(metric[key], previous[key], `Data Murid changed: ${key}`);
		}
		for (const metric of measurements.filter((m) => m.name === 'asrama')) {
			const reference = measurements.find(
				(m) => m.name === 'murid' && m.viewport === metric.viewport
			);
			assert.equal(metric.table.width, reference.table.width);
			assert.deepEqual(metric.cellPadding, reference.cellPadding);
			assert.ok(Math.abs(metric.roomFilter.height - 40) < 1);
			assert.equal(metric.pageWidth, metric.viewport);
		}
	}
	console.log(JSON.stringify({ folder, measurements }, null, 2));
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		const exited = once(server, 'exit');
		server.kill();
		await exited;
	}
	await writeFile(path.join(folder, `${phase}-measure-server.log`), output);
}
