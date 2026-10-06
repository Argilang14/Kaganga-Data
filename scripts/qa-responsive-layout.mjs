#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5152';
const databaseUrl = process.env.DB_URL || 'file:./data/database.sqlite3';
const browserPath =
	process.env.QA_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9333;
const outputDir = path.resolve('.qa-responsive');
const profileDir = path.resolve('.qa-responsive-profile');
const viewports = [
	{ name: 'phone', width: 360, height: 800, mobile: true },
	{ name: 'tablet', width: 768, height: 1024, mobile: true },
	{ name: 'ipad-landscape', width: 1024, height: 768, mobile: false },
	{ name: 'laptop', width: 1366, height: 768, mobile: false },
	{ name: 'desktop', width: 1920, height: 1080, mobile: false }
];
const routes = [
	'/',
	'/murid',
	'/pegawai',
	'/riwayat-pertumbuhan',
	'/rapor/jadwal-pelajaran',
	'/asesmen-martikulasi',
	'/presensi-pegawai',
	'/surat-menyurat/arsip',
	'/inventaris',
	'/inventaris/peminjaman',
	'/pengaturan',
	'/cetak'
];
const screenshotRoutes = new Set(['/', '/inventaris', '/rapor/jadwal-pelajaran']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJsonVersion() {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
			if (response.ok) return;
		} catch {}
		await sleep(100);
	}
	throw new Error('Browser headless tidak siap.');
}

async function createTarget() {
	const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
		method: 'PUT'
	});
	if (!response.ok) throw new Error(`Gagal membuat target browser: ${response.status}`);
	return response.json();
}

function createCdp(webSocketDebuggerUrl) {
	const socket = new WebSocket(webSocketDebuggerUrl);
	let sequence = 0;
	const pending = new Map();
	const ready = new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', reject, { once: true });
	});
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(String(event.data));
		if (!message.id || !pending.has(message.id)) return;
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) reject(new Error(message.error.message));
		else resolve(message.result);
	});
	return {
		async send(method, params = {}) {
			await ready;
			const id = ++sequence;
			const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
			socket.send(JSON.stringify({ id, method, params }));
			return result;
		},
		close() {
			socket.close();
		}
	};
}

async function waitForReady(cdp, expectedPath) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		const result = await cdp.send('Runtime.evaluate', {
			expression: `({ ready: document.readyState, path: location.pathname })`,
			returnByValue: true
		});
		const value = result.result.value;
		if (value?.ready === 'complete' && value?.path === expectedPath) return;
		await sleep(100);
	}
	throw new Error(`Halaman ${expectedPath} tidak selesai dimuat.`);
}

const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const client = createClient({ url: databaseUrl });
let browser;
let cdp;

try {
	await fs.rm(outputDir, { recursive: true, force: true });
	await fs.rm(profileDir, { recursive: true, force: true });
	await fs.mkdir(outputDir, { recursive: true });
	const admin = (
		await client.execute("SELECT id, sekolah_id FROM auth_user WHERE type='admin' ORDER BY id LIMIT 1")
	).rows[0];
	if (!admin) throw new Error('Akun admin QA tidak ditemukan.');
	const schoolId =
		admin.sekolah_id ??
		(await client.execute('SELECT id FROM sekolah ORDER BY id LIMIT 1')).rows[0]?.id;
	if (!schoolId) throw new Error('Sekolah QA tidak ditemukan.');
	const now = new Date().toISOString();
	await client.execute({
		sql: 'INSERT INTO auth_session(user_id, token_hash, user_agent, ip_address, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		args: [admin.id, tokenHash, 'Kaganga responsive QA', '127.0.0.1', new Date(Date.now() + 10 * 60_000).toISOString(), now, now]
	});

	browser = spawn(
		browserPath,
		[
			'--headless=new',
			'--disable-gpu',
			'--disable-breakpad',
			'--disable-crash-reporter',
			'--no-first-run',
			'--no-default-browser-check',
			`--remote-debugging-port=${debugPort}`,
			`--user-data-dir=${profileDir}`,
			'about:blank'
		],
		{ stdio: 'ignore' }
	);
	await waitForJsonVersion();
	const target = await createTarget();
	cdp = createCdp(target.webSocketDebuggerUrl);
	await cdp.send('Page.enable');
	await cdp.send('Runtime.enable');
	await cdp.send('Network.enable');
	await cdp.send('Network.setCookie', { name: 'rapkumer-session', value: token, url: baseUrl });
	await cdp.send('Network.setCookie', { name: 'active-sekolah-id', value: String(schoolId), url: baseUrl });

	let failures = 0;
	for (const viewport of viewports) {
		await cdp.send('Emulation.setDeviceMetricsOverride', {
			width: viewport.width,
			height: viewport.height,
			deviceScaleFactor: 1,
			mobile: viewport.mobile,
			screenWidth: viewport.width,
			screenHeight: viewport.height
		});
		for (const route of routes) {
			await cdp.send('Page.navigate', { url: `${baseUrl}${route}` });
			await waitForReady(cdp, route);
			await sleep(100);
			const result = await cdp.send('Runtime.evaluate', {
				expression: `(() => {
					const root = document.documentElement;
					const body = document.body;
					const navbar = document.querySelector('.app-navbar');
					const content = document.querySelector('.app-page-container');
					return {
						path: location.pathname,
						viewport: innerWidth,
						documentWidth: Math.max(root.scrollWidth, body?.scrollWidth || 0),
						hasHorizontalOverflow: Math.max(root.scrollWidth, body?.scrollWidth || 0) > innerWidth + 2,
						navbarOverflow: navbar ? navbar.scrollWidth > navbar.clientWidth + 2 : false,
						contentRight: content ? Math.round(content.getBoundingClientRect().right) : null,
						contentLeft: content ? Math.round(content.getBoundingClientRect().left) : null
					};
				})()`,
				returnByValue: true
			});
			const value = result.result.value;
			const failed = value.hasHorizontalOverflow || value.navbarOverflow;
			if (failed) failures += 1;
			console.log(`${failed ? 'FAIL' : 'PASS'} ${viewport.name} ${route} viewport=${value.viewport} document=${value.documentWidth} navbarOverflow=${value.navbarOverflow}`);

			if (route === '/' && viewport.width < 1024) {
				const drawerResult = await cdp.send('Runtime.evaluate', {
					expression: `(() => {
					const toggle = document.getElementById('my-drawer-2');
					toggle.checked = true;
					toggle.dispatchEvent(new Event('change', { bubbles: true }));
					const menu = document.querySelector('.drawer-side > ul');
					const rect = menu?.getBoundingClientRect();
					return { width: rect?.width ?? 0, left: rect?.left ?? -1, right: rect?.right ?? -1 };
				})()`,
					returnByValue: true
				});
				await sleep(150);
				const drawer = drawerResult.result.value;
				const drawerFailed = drawer.width <= 0 || drawer.width > viewport.width || drawer.right > viewport.width + 2;
				if (drawerFailed) failures += 1;
				console.log(`${drawerFailed ? 'FAIL' : 'PASS'} ${viewport.name} drawer width=${Math.round(drawer.width)} viewport=${viewport.width}`);
				await cdp.send('Runtime.evaluate', {
					expression: `document.getElementById('my-drawer-2').checked = false`
				});
			}

			if (route === '/inventaris' && viewport.width <= 1366) {
				await cdp.send('Runtime.evaluate', {
					expression: `Array.from(document.querySelectorAll('button')).find((item) => item.textContent.includes('Tambah Aset'))?.click()`
				});
				await sleep(100);
				const modalResult = await cdp.send('Runtime.evaluate', {
					expression: `(() => {
					const modal = document.querySelector('.modal-open .modal-box');
					const rect = modal?.getBoundingClientRect();
					return { width: rect?.width ?? 0, height: rect?.height ?? 0, left: rect?.left ?? -1, right: rect?.right ?? -1, top: rect?.top ?? -1, bottom: rect?.bottom ?? -1 };
				})()`,
					returnByValue: true
				});
				const modal = modalResult.result.value;
				const modalFailed = modal.width <= 0 || modal.right > viewport.width + 2 || modal.left < -2 || modal.height > viewport.height + 2;
				if (modalFailed) failures += 1;
				console.log(`${modalFailed ? 'FAIL' : 'PASS'} ${viewport.name} modal width=${Math.round(modal.width)} height=${Math.round(modal.height)}`);
				await cdp.send('Runtime.evaluate', {
					expression: `document.querySelector('.modal-open .modal-backdrop')?.click()`
				});
			}

			if (screenshotRoutes.has(route) && ['phone', 'tablet', 'laptop'].includes(viewport.name)) {
				const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
				const routeName = route === '/' ? 'dashboard' : route.slice(1).replaceAll('/', '-');
				await fs.writeFile(path.join(outputDir, `${viewport.name}-${routeName}.png`), Buffer.from(image.data, 'base64'));
			}
		}
	}
	console.log(`RESPONSIVE_QA_FAILURES=${failures}`);
	if (failures) process.exitCode = 1;
} finally {
	cdp?.close();
	browser?.kill();
	await sleep(500);
	await client.execute({ sql: 'DELETE FROM auth_session WHERE token_hash = ?', args: [tokenHash] });
	await client.close();
	try {
		await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	} catch (error) {
		console.warn(`Profil QA sementara belum dapat dibersihkan: ${error.message}`);
	}
	console.log('QA_SESSION_REMOVED');
}
