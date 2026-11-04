import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import { PDFDocument } from 'pdf-lib';

await mkdir('tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('tmp/rapor-attendance-'));
const database = path.join(directory, 'database.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
const client = createClient({ url: process.env.DB_URL });
const vite = await createServer({
	configFile: false,
	resolve: { alias: { $lib: path.resolve('src/lib') } },
	plugins: [
		{
			name: 'qa-env',
			resolveId(id) {
				if (id === '$env/dynamic/private') return '\0qa-env';
				if (id.startsWith('$app/')) return '\0' + id;
			},
			load(id) {
				if (id === '\0qa-env') return 'export const env = process.env;';
				if (id === '\0$app/navigation')
					return 'export const goto=()=>{}; export const preloadData=()=>{}; export const pushState=()=>{};';
				if (id === '\0$app/server')
					return 'export const getRequestEvent=()=>globalThis.__raporQaEvent;';
			}
		}
	],
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'error'
});
let connection;
let renderer;
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	await (
		await vite.ssrLoadModule('/src/lib/server/db/ensure-dorm-evaluation.ts')
	).ensureDormEvaluationSchema();
	const db = connection.default;
	const { tableMurid, tableSekolah, tableAuthUser } = await vite.ssrLoadModule(
		'/src/lib/server/db/schema.ts'
	);
	const { and, eq, isNotNull } = await vite.ssrLoadModule('drizzle-orm');
	const student = await db.query.tableMurid.findFirst({
		where: and(isNotNull(tableMurid.kelasId), eq(tableMurid.id, 591))
	});
	assert(student, 'Requires affected student 591 in the database copy.');
	const sekolah = await db.query.tableSekolah.findFirst({
		where: eq(tableSekolah.id, student.sekolahId),
		with: { alamat: true, kepalaSekolah: true }
	});
	const user = await db.query.tableAuthUser.findFirst({ where: eq(tableAuthUser.type, 'admin') });
	assert(sekolah && user);
	const locals = { sekolah, user };
	globalThis.__raporQaEvent = { locals, route: { id: '/cetak-raport' } };
	const attendance = await vite.ssrLoadModule('/src/lib/server/pdf/attendance-utils.ts');
	const missing = ['ketidakhadiran_harian', 'absensi', 'ketidakhadiran_rapor'];
	// Reproduce an installation that has never initialized the legacy attendance tables.
	for (const table of missing) await client.execute(`DROP TABLE IF EXISTS ${table}`);
	const snapshots = {};
	for (const table of [
		'murid',
		'asesmen_sumatif',
		'asesmen_keasramaan',
		'absensi_harian',
		'absensi_kegiatan'
	]) {
		snapshots[table] = (await client.execute(`SELECT * FROM ${table} ORDER BY id`)).rows;
	}
	const period = {
		id: student.semesterId,
		tanggalMasuk: '2026-11-02',
		tanggalBagiRaport: '2026-11-05'
	};
	const year = Number(
		(
			await client.execute({
				sql: 'SELECT tahun_ajaran_id FROM semester WHERE id=?',
				args: [student.semesterId]
			})
		).rows[0].tahun_ajaran_id
	);
	const counts = await attendance.computeRaporAttendance(sekolah.id, year, student.id, period);
	assert.deepEqual(counts, { sakit: 0, izin: 0, alfa: 4 });
	for (const table of missing)
		assert.equal(
			(
				await client.execute({
					sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
					args: [table]
				})
			).rows.length,
			1
		);
	for (const [date, status] of [
		['2026-11-02', 'sakit'],
		['2026-11-03', 'izin']
	])
		await client.execute({
			sql: 'INSERT INTO ketidakhadiran_harian(murid_id,tanggal,keterangan,created_at) VALUES(?,?,?,?)',
			args: [student.id, date, status, new Date().toISOString()]
		});
	await client.execute({
		sql: 'INSERT INTO absensi(murid_id,waktu,created_at) VALUES(?,?,?)',
		args: [student.id, '2026-11-04T01:00:00.000Z', new Date().toISOString()]
	});
	assert.deepEqual(await attendance.computeRaporAttendance(sekolah.id, year, student.id, period), {
		sakit: 1,
		izin: 1,
		alfa: 1
	});
	await client.execute({
		sql: 'INSERT INTO ketidakhadiran_rapor(murid_id,semester_id,sakit,izin,alfa,created_at) VALUES(?,?,?,?,?,?)',
		args: [student.id, student.semesterId, 7, 0, 2, new Date().toISOString()]
	});
	assert.deepEqual(await attendance.computeRaporAttendance(sekolah.id, year, student.id, period), {
		sakit: 7,
		izin: 0,
		alfa: 2
	});
	const history = (await client.execute('SELECT * FROM ketidakhadiran_harian ORDER BY id')).rows;
	await attendance.computeRaporAttendance(sekolah.id, year, student.id, period);
	assert.deepEqual(
		(await client.execute('SELECT * FROM ketidakhadiran_harian ORDER BY id')).rows,
		history
	);
	const urls = new URLSearchParams({
		murid_id: String(student.id),
		kelas_id: String(student.kelasId),
		rapor_periode: 'ras'
	});
	renderer = await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts');
	const tokenRoute = await vite.ssrLoadModule('/src/routes/api/pdf/token/+server.ts');
	const pdfRoute = await vite.ssrLoadModule('/src/routes/cetak/pdf/[slug]/[token]/+server.ts');
	for (const kind of ['rapor', 'keasramaan']) {
		const route = await vite.ssrLoadModule(`/src/routes/cetak/${kind}.pdf/+server.ts`);
		const response = await route.GET({
			locals,
			url: new URL(`http://127.0.0.1:5173/cetak/${kind}.pdf?${urls}`)
		});
		assert.equal(response.status, 200);
		const bytes = new Uint8Array(await response.arrayBuffer());
		assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
		const pdf = await PDFDocument.load(bytes);
		assert(pdf.getPageCount() > 0);
		await writeFile(path.join(directory, `${kind}.pdf`), bytes);
		console.log(`PASS ${kind}: HTTP 200, valid PDF, ${pdf.getPageCount()} pages.`);
		const tokenResponse = await tokenRoute.POST({
			locals,
			request: new Request('http://localhost/api/pdf/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					docType: kind,
					muridId: student.id,
					kelasId: student.kelasId,
					raporPeriode: 'ras',
					parentSignature: 'wali'
				})
			})
		});
		assert.equal(tokenResponse.status, 200);
		const params = await tokenResponse.json();
		const menuResponse = await pdfRoute.GET({ locals, params });
		assert.equal(menuResponse.status, 200);
		assert.equal(menuResponse.headers.get('Content-Type'), 'application/pdf');
		const menuBytes = new Uint8Array(await menuResponse.arrayBuffer());
		assert.equal(Buffer.from(menuBytes.subarray(0, 5)).toString(), '%PDF-');
		const menuPdf = await PDFDocument.load(menuBytes);
		assert(menuPdf.getPageCount() > 0);
		await writeFile(path.join(directory, `${kind}-menu.pdf`), menuBytes);
		console.log(`PASS menu ${kind}: token and PDF 200, ${menuPdf.getPageCount()} pages.`);
	}
	for (const [table, rows] of Object.entries(snapshots))
		assert.deepEqual(
			(await client.execute(`SELECT * FROM ${table} ORDER BY id`)).rows,
			rows,
			`${table} unchanged`
		);
	assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	console.log(
		'PASS: absent tables initialize, attendance and overrides preserved, repeated calls keep data, grades/students/digital attendance unchanged.'
	);
	console.log('QA artifacts:', directory);
} finally {
	delete globalThis.__raporQaEvent;
	if (renderer) await (await renderer.getBrowser()).close();
	if (connection) await connection.closeDbClient();
	await vite.close();
	client.close();
}
// The token store owns a server-lifetime cleanup timer; this standalone check is done.
process.exit(0);
