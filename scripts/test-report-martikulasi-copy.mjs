import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import { PDFDocument } from 'pdf-lib';
import puppeteer from 'puppeteer-core';

// Run test-report-archive-copy.mjs first to prepare an isolated historical identity.
const { folder: existing } = JSON.parse(await readFile('tmp/report-archive-latest.json', 'utf8'));
const fixture = JSON.parse(await readFile(path.join(existing, 'ui-fixture.json'), 'utf8'));
const root = process.cwd();
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/report-martikulasi-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: `file:${fixture.database}` });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
process.env.KAGANGA_UPLOADS_DIR = path.join(folder, 'uploads');
process.env.photo = path.join(folder, 'uploads');
const client = createClient({ url: process.env.DB_URL });
const rows = async (sql, args = []) => (await client.execute({ sql, args })).rows;
const row = async (sql, args = []) => (await rows(sql, args))[0];
const insert = async (table, data) => {
	const entries = Object.entries(data);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
				args: entries.map(([, value]) => value)
			})
		).lastInsertRowid
	);
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const checks = [],
	pass = (name) => {
		checks.push(name);
		console.log('PASS', name);
	};
const reject = (fn, status) => assert.rejects(fn, (cause) => cause.status === status);
let vite,
	connection,
	pdfBrowser,
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
	const service = await vite.ssrLoadModule('/src/lib/server/report-archive.ts');
	const batch = await vite.ssrLoadModule('/src/lib/server/report-archive-batch.ts');
	const enums = await vite.ssrLoadModule('/src/lib/martikulasi.ts');
	const schema = await vite.ssrLoadModule('/src/lib/server/db/ensure-martikulasi.ts');
	await schema.ensureMartikulasiSchema();
	const user = await connection.default.query.tableAuthUser.findFirst({
		where: (t, { eq }) => eq(t.type, 'admin')
	});
	const school = await connection.default.query.tableSekolah.findFirst({
		where: (t, { eq }) => eq(t.id, fixture.schoolId),
		with: { kepalaSekolah: true }
	});
	const locals = { user: { ...user, permissions: [] }, sekolah: school };
	const h = await row('SELECT * FROM murid_riwayat_kelas WHERE id=?', [fixture.history]);
	const old = JSON.stringify({
		base: await rows('SELECT * FROM rapor_arsip ORDER BY id'),
		revisions: await rows('SELECT * FROM rapor_arsip_revisi ORDER BY id')
	});
	const now = new Date().toISOString();
	await insert('martikulasi_settings', {
		sekolah_id: fixture.schoolId,
		tahun_ajaran_id: h.tahun_ajaran_id,
		periode_mulai: '2024-07-01',
		periode_selesai: '2025-06-20',
		created_at: now
	});
	const result = await insert('martikulasi_hasil', {
		sekolah_id: fixture.schoolId,
		tahun_ajaran_id: h.tahun_ajaran_id,
		kelas_id: h.kelas_id,
		murid_id: h.murid_id,
		status_kelengkapan: 'belum_lengkap',
		created_at: now
	});
	for (const a of enums.martikulasiAspek)
		await insert('martikulasi_nilai', {
			hasil_id: result,
			aspek_kode: a.kode,
			kelompok: a.kelompok,
			capaian_awal: 'Mulai berkembang',
			capaian_akhir: 'Berkembang baik',
			ketuntasan: 'tuntas',
			deskripsi_capaian: 'Mandiri dan disiplin',
			created_at: now
		});
	const request = new Request('http://localhost/api/rapor-arsip', { method: 'POST' });
	const input = { action: 'preview', confirmMetadata: true, metadata: fixture.metadata };
	let info = await service.historicalReportInfo(locals, fixture.history, 'martikulasi', 'ras');
	assert.equal(info.coverage.filled, 8);
	assert.equal(info.coverage.expected, 9);
	await reject(
		() =>
			service.previewOrFinalizeReport(
				locals,
				fixture.history,
				'martikulasi',
				'ras',
				{ ...input, bulkPreview: true },
				request
			),
		409
	);
	pass('Missing final level blocks finalization even with eight filled aspects');
	await client.execute({
		sql: "UPDATE martikulasi_hasil SET level_penempatan='madya' WHERE id=?",
		args: [result]
	});
	info = await service.historicalReportInfo(locals, fixture.history, 'martikulasi', 'ras');
	assert.equal(info.coverage.status, 'nilai_inti_lengkap');
	await reject(
		() =>
			service.historicalReportInfo(
				{
					...locals,
					user: {
						...user,
						type: 'wali_asrama',
						sekolahId: fixture.schoolId,
						jabatanAkses: null,
						permissions: ['murid_arsip', 'cetak_keasramaan']
					}
				},
				fixture.history,
				'martikulasi',
				'ras'
			),
		403
	);
	await client.execute({
		sql: 'UPDATE martikulasi_hasil SET kelas_id=? WHERE id=?',
		args: [(await row('SELECT id FROM kelas WHERE id!=? LIMIT 1', [h.kelas_id])).id, result]
	});
	await reject(
		() => service.historicalReportInfo(locals, fixture.history, 'martikulasi', 'ras'),
		409
	);
	await client.execute({
		sql: 'UPDATE martikulasi_hasil SET kelas_id=? WHERE id=?',
		args: [h.kelas_id, result]
	});
	pass('Academic print permission and exact source class/year/student are enforced');
	pdfBrowser = await (await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts')).getBrowser();
	const preview = await service.previewOrFinalizeReport(
		locals,
		fixture.history,
		'martikulasi',
		'ras',
		input,
		request
	);
	assert.ok((await PDFDocument.load(preview.bytes)).getPageCount() > 0);
	await writeFile(path.join(folder, 'martikulasi-preview.pdf'), preview.bytes);
	assert.equal((await row('SELECT COUNT(*) n FROM rapor_martikulasi_arsip')).n, 0);
	const combined = await batch.previewReportBatch(
		locals,
		'martikulasi',
		'ras',
		{ historyIds: [fixture.history], metadata: fixture.metadata, confirmMetadata: true },
		request
	);
	assert.equal(combined.plan.length, 1);
	pass('Individual and batch previews generate real PDFs without saving final archives');
	await client.execute({
		sql: "UPDATE martikulasi_hasil SET rekomendasi='Pendampingan lanjutan' WHERE id=?",
		args: [result]
	});
	await reject(
		() =>
			service.previewOrFinalizeReport(
				locals,
				fixture.history,
				'martikulasi',
				'ras',
				{ ...input, action: 'finalize', confirmFinal: true, expectedHash: preview.hash },
				request
			),
		409
	);
	const fresh = await service.previewOrFinalizeReport(
		locals,
		fixture.history,
		'martikulasi',
		'ras',
		input,
		request
	);
	const final = await service.previewOrFinalizeReport(
		locals,
		fixture.history,
		'martikulasi',
		'ras',
		{ ...input, action: 'finalize', confirmFinal: true, expectedHash: fresh.hash },
		request
	);
	assert.equal(final.final, true);
	const archive = await row('SELECT * FROM rapor_martikulasi_arsip WHERE history_id=?', [
		fixture.history
	]);
	assert.equal(archive.sha256, hash(final.bytes));
	assert.equal(
		JSON.parse(archive.snapshot_json).data.settings.tahunAjaran,
		h.tahun_ajaran_snapshot
	);
	await client.execute({
		sql: "UPDATE martikulasi_hasil SET catatan_umum='Catatan revisi' WHERE id=?",
		args: [result]
	});
	assert.equal(
		hash(await service.archivedReportPdf(locals, fixture.history, 'martikulasi', 'ras')),
		archive.sha256
	);
	await assert.rejects(() =>
		client.execute({
			sql: "UPDATE rapor_martikulasi_arsip SET snapshot_json='{}' WHERE id=?",
			args: [archive.id]
		})
	);
	pass('Stale preview is rejected; final PDF and snapshot remain frozen and immutable');
	const revisedInput = {
		...input,
		action: 'revise-preview',
		reason: 'Koreksi catatan berdasarkan berita acara',
		expectedVersionId: archive.id
	};
	const revised = await service.previewOrFinalizeReport(
		locals,
		fixture.history,
		'martikulasi',
		'ras',
		revisedInput,
		request
	);
	await service.previewOrFinalizeReport(
		locals,
		fixture.history,
		'martikulasi',
		'ras',
		{ ...revisedInput, action: 'revise-finalize', confirmFinal: true, expectedHash: revised.hash },
		request
	);
	info = await service.historicalReportInfo(locals, fixture.history, 'martikulasi', 'ras');
	assert.equal(info.versions.length, 2);
	assert.equal(info.archived.number, 2);
	assert.equal(
		hash(
			await service.archivedReportPdf(locals, fixture.history, 'martikulasi', 'ras', archive.id)
		),
		archive.sha256
	);
	assert.equal(
		JSON.stringify({
			base: await rows('SELECT * FROM rapor_arsip ORDER BY id'),
			revisions: await rows('SELECT * FROM rapor_arsip_revisi ORDER BY id')
		}),
		old
	);
	pass('Revision preserves original PDF and leaves school/dormitory archives unchanged');
	const backup = await vite.ssrLoadModule('/src/lib/server/report-history-backup.ts');
	await backup.createReportHistoryBackup({
		database,
		directory: path.join(folder, 'backup'),
		uploads: [process.env.photo]
	});
	const manifest = JSON.parse(await readFile(path.join(folder, 'backup', 'manifest.json'), 'utf8'));
	assert.ok(
		manifest.references.some((r) => r.table === 'rapor_martikulasi_arsip' && r.status === 'ok')
	);
	assert.ok(
		manifest.references.some((r) => r.table === 'rapor_martikulasi_revisi' && r.status === 'ok')
	);
	pass('Backup manifest verifies both martikulasi final and revision PDFs');
	const token = randomUUID();
	await insert('auth_session', {
		user_id: user.id,
		token_hash: hash(token),
		user_agent: 'QA martikulasi archive',
		ip_address: '127.0.0.1',
		expires_at: new Date(Date.now() + 3600000).toISOString(),
		created_at: now,
		updated_at: now
	});
	await pdfBrowser.close();
	pdfBrowser = null;
	await connection.closeDbClient();
	connection = null;
	await vite.close();
	vite = null;
	const base = 'http://127.0.0.1:5196';
	const probe = await fetch(base + '/login').catch(() => null);
	assert.equal(probe, null, 'QA port 5196 must be free');
	server = spawn(process.execPath, ['build/index.js'], {
		cwd: root,
		windowsHide: true,
		env: { ...process.env, HOST: '127.0.0.1', PORT: '5196', ORIGIN: base },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	server.stdout.on('data', (b) => (output += b));
	server.stderr.on('data', (b) => (output += b));
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(base + '/login')).ok) {
				ready = true;
				break;
			}
		} catch {
			/* Wait for QA server. */
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	assert.ok(ready, output);
	browser = await puppeteer.launch({
		executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		headless: true,
		args: ['--no-sandbox']
	});
	await browser.setCookie(
		{ name: 'rapkumer-session', value: token, url: base },
		{ name: 'active-sekolah-id', value: String(fixture.schoolId), url: base }
	);
	const page = await browser.newPage(),
		errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	assert.equal(
		(
			await page.goto(
				base + `/murid/arsip/rapor?kelas_id=${h.kelas_id}&jenis=martikulasi&periode=ras`,
				{ waitUntil: 'networkidle0' }
			)
		).status(),
		200
	);
	assert.equal(await page.$eval('[name=jenis]', (n) => n.value), 'martikulasi');
	assert.equal(await page.$eval('[name=periode] option', (n) => n.textContent), 'Akhir program');
	assert.equal(await page.$$eval('[name=periode] option', (ns) => ns.length), 1);
	for (const width of [390, 768, 1440]) {
		await page.setViewport({ width, height: 1000 });
		await page.evaluate(() => {
			const d = document.getElementById('my-drawer-2');
			if (d) d.checked = false;
		});
		await new Promise((r) => setTimeout(r, 200));
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(folder, `list-${width}.png`), fullPage: true });
	}
	await page.goto(base + `/murid/arsip/rapor/${fixture.history}?jenis=martikulasi&periode=ras`, {
		waitUntil: 'networkidle0'
	});
	assert.ok(await page.$('a[aria-current=page][href*="jenis=martikulasi"]'));
	const download = await page.evaluate(async (url) => {
		const r = await fetch(url);
		return {
			status: r.status,
			type: r.headers.get('content-type'),
			length: (await r.arrayBuffer()).byteLength
		};
	}, `/api/rapor-arsip/${fixture.history}?jenis=martikulasi&periode=ras`);
	assert.equal(download.status, 200);
	assert.equal(download.type, 'application/pdf');
	assert.ok(download.length > 1000);
	assert.deepEqual(errors, []);
	pass('List/detail UI, final PDF API and responsive viewports work without browser errors');
	await writeFile(path.join(folder, 'results.json'), JSON.stringify({ checks, folder }, null, 2));
	await writeFile('tmp/report-martikulasi-latest.json', JSON.stringify({ folder }));
	console.log(JSON.stringify({ passed: checks.length, folder }));
} finally {
	await browser?.close();
	await pdfBrowser?.close();
	if (server && server.exitCode === null) {
		const exited = once(server, 'exit');
		server.kill();
		await exited;
	}
	await connection?.closeDbClient?.();
	await vite?.close();
	client.close();
}
