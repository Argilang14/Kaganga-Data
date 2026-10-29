import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import ExcelJS from 'exceljs';

const root = process.cwd();
await mkdir(path.join(root, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(root, 'tmp/upstream-oct28-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try { await source.execute({ sql: 'VACUUM INTO ?', args: [database] }); } finally { source.close(); }
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
const client = createClient({ url: process.env.DB_URL });
const now = new Date().toISOString();
const row = async (sql, args = []) => (await client.execute({ sql, args })).rows[0];
const clone = (value, changes) => { const copy = { ...value, ...changes }; delete copy.id; return copy; };
async function insert(table, value) {
	const keys = Object.keys(value);
	return Number((await client.execute({ sql: `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, args: Object.values(value) })).lastInsertRowid);
}
const checks = [];
const pass = (name) => { checks.push(name); console.log('PASS', name); };
let vite, close;
try {
	vite = await createServer({
		configFile: false, resolve: { alias: { $lib: path.join(root, 'src/lib') } },
		plugins: [{ name: 'upstream-oct28-env', resolveId(id) { if (id === '$env/dynamic/private') return '\0qa-env'; }, load(id) { if (id === '\0qa-env') return 'export const env = process.env;'; } }],
		optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error'
	});
	const connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	close = connection.closeDbClient;
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const original = await row('SELECT * FROM murid WHERE kelas_id IS NOT NULL LIMIT 1');
	assert.ok(original);
	const schoolId = Number(original.sekolah_id);
	const oldClass = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	const oldYear = await row('SELECT * FROM tahun_ajaran WHERE id=?', [oldClass.tahun_ajaran_id]);
	const oldSemester = await row('SELECT * FROM semester WHERE id=?', [oldClass.semester_id]);
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=0 WHERE sekolah_id=?', args: [schoolId] });
	const year = await insert('tahun_ajaran', clone(oldYear, { nama: 'QA 2098/2099', is_aktif: 1 }));
	const semester = await insert('semester', clone(oldSemester, { tahun_ajaran_id: year, is_aktif: 1 }));
	const kelas = await insert('kelas', clone(oldClass, { nama: 'X.QA Atomic', tahun_ajaran_id: year, semester_id: semester, dapodik_rombongan_belajar_id: null }));
	const student = await insert('murid', clone(original, { nama: 'QA Atomic Student', nis: 'QA-OCT28', nisn: '9999890011', kelas_id: kelas, semester_id: semester, qr_token: 'qa-oct28', dapodik_peserta_didik_id: null, dapodik_anggota_rombel_id: null }));
	const subject = await insert('mata_pelajaran', { kelas_id: kelas, nama: 'QA Atomic Subject', jenis: 'wajib', kkm: 70, created_at: now, updated_at: now });
	const historySubject = await insert('mata_pelajaran', { kelas_id: oldClass.id, nama: 'QA Historical Subject', jenis: 'wajib', kkm: 70, created_at: now, updated_at: now });
	const assessment = await insert('asesmen_sumatif', { murid_id: student, mata_pelajaran_id: subject, na_lingkup: 80, sts: 100, sas: 60, nilai_akhir_rts: 86, nilai_akhir: 80, created_at: now, updated_at: now });
	const history = await insert('asesmen_sumatif', { murid_id: original.id, mata_pelajaran_id: historySubject, na_lingkup: 80, sts: 100, sas: 60, nilai_akhir_rts: 37, nilai_akhir: 38, created_at: now, updated_at: now });
	await insert('tujuan_pembelajaran', { mata_pelajaran_id: subject, deskripsi: 'QA TP', lingkup_materi: 'QA Lingkup', bobot: 100, created_at: now, updated_at: now });
	const admin = { id: 1, type: 'admin', permissions: [], sekolahId: schoolId };
	const locals = { user: admin, sekolah: { id: schoolId } };
	const weights = await vite.ssrLoadModule('/src/routes/api/sekolah/sumatif-bobot/+server.ts');
	const put = (body, override = locals) => weights.PUT({ locals: override, request: new Request('http://localhost/api/sekolah/sumatif-bobot', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
	assert.equal((await put({ rapor: 'rts', lingkup: 50, sts: 50 })).status, 200);
	assert.equal((await row('SELECT nilai_akhir_rts n FROM asesmen_sumatif WHERE id=?', [assessment])).n, 90);
	assert.equal((await row('SELECT nilai_akhir_rts n FROM asesmen_sumatif WHERE id=?', [history])).n, 37);
	pass('RTS active semester updates without touching historical grades');
	await client.execute(`CREATE TRIGGER qa_fail_score BEFORE UPDATE ON asesmen_sumatif WHEN NEW.id=${assessment} BEGIN SELECT RAISE(ABORT, 'QA forced score failure'); END`);
	assert.equal((await put({ rapor: 'rts', lingkup: 20, sts: 80 })).status, 500);
	assert.equal((await row('SELECT sumatif_bobot_rts_lingkup n FROM sekolah WHERE id=?', [schoolId])).n, 50);
	assert.equal((await row('SELECT nilai_akhir_rts n FROM asesmen_sumatif WHERE id=?', [assessment])).n, 90);
	await client.execute('DROP TRIGGER qa_fail_score');
	pass('Injected score failure rolls back settings and grades together');
	assert.equal((await put({ rapor: 'ras', lingkup: 50, sts: 30, sas: 20 })).status, 200);
	assert.equal((await row('SELECT nilai_akhir n FROM asesmen_sumatif WHERE id=?', [assessment])).n, 82);
	assert.equal((await row('SELECT nilai_akhir n FROM asesmen_sumatif WHERE id=?', [history])).n, 38);
	assert.equal((await put(null)).status, 400);
	assert.equal((await put({ lingkup: 200, sts: 0, sas: 0 })).status, 400);
	assert.equal((await put({ lingkup: 50, sts: 30, sas: 20 }, { ...locals, user: { id: 99, type: 'user', permissions: [] } })).status, 403);
	pass('RAS formula, historical preservation, payload and action permission');
	const importer = await vite.ssrLoadModule('/src/routes/api/asesmen-sumatif/import/+server.ts');
	async function importScores(value, options = {}) {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Nilai');
		sheet.getRow(3).values = ['Nama', 'QA Lingkup', 'Sumatif Tengah Semester', null, 'Sumatif Akhir Semester', null];
		sheet.getRow(4).values = ['Nama', 'TP 1', 'Tes', 'Non Tes', 'Tes', 'Non Tes'];
		sheet.getRow(5).values = [options.name ?? 'QA Atomic Student', value, 90, null, 70, null];
		const form = new FormData();
		form.set('file', new File([await workbook.xlsx.writeBuffer()], 'qa.xlsx'));
		form.set('kelas_id', String(options.kelas ?? kelas));
		form.set('mapel_id', String(options.mapel ?? subject));
		return importer.POST({ locals: { ...locals, user: options.user ?? admin }, request: new Request('http://localhost/api/asesmen-sumatif/import', { method: 'POST', body: form }) });
	}
	const before = await row('SELECT * FROM asesmen_sumatif WHERE id=?', [assessment]);
	for (const value of [-1, 101, 'salah', { formula: '1+1', result: 2 }]) assert.equal((await importScores(value)).status, 400);
	assert.deepEqual(await row('SELECT * FROM asesmen_sumatif WHERE id=?', [assessment]), before);
	assert.equal((await importScores(80, { mapel: historySubject })).status, 400);
	assert.equal((await importScores(80, { mapel: '' })).status, 400);
	assert.equal((await importScores(80, { user: { id: 999999, type: 'tim_dapur', permissions: [] } })).status, 403);
	assert.equal((await importScores(80, { user: { id: 999999, type: 'user', permissions: [], kelasId: kelas, sekolahId: schoolId } })).status, 403);
	pass('Invalid score cells, wrong subject and unassigned/non-teacher accounts rejected before mutation');
	assert.equal((await importScores(0)).status, 200);
	assert.equal((await row('SELECT na_lingkup n FROM asesmen_sumatif WHERE id=?', [assessment])).n, 0);
	assert.equal((await importScores(null)).status, 200);
	assert.equal((await row('SELECT na_lingkup n FROM asesmen_sumatif WHERE id=?', [assessment])).n, null);
	pass('Workbook import preserves the difference between zero and blank');
	await insert('murid', clone(original, { nama: 'QA Atomic Student', nis: 'QA-OCT28-DUP', nisn: '9999890012', kelas_id: kelas, semester_id: semester, qr_token: 'qa-oct28-dup', dapodik_peserta_didik_id: null, dapodik_anggota_rombel_id: null }));
	const ambiguous = await importScores(88);
	assert.equal(ambiguous.status, 200);
	const ambiguousBody = await ambiguous.json();
	assert.equal(ambiguousBody.details.imported, 0);
	assert.equal((await row('SELECT na_lingkup n FROM asesmen_sumatif WHERE id=?', [assessment])).n, null);
	pass('Ambiguous student name is skipped, never assigned arbitrarily');
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [schoolId]);
	assert.ok(employee);
	await client.execute({ sql: 'UPDATE sekolah SET kepala_sekolah_id=? WHERE id=?', args: [employee.id, schoolId] });
	const assets = await vite.ssrLoadModule('/src/lib/server/print-assets.ts');
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1sAAAAASUVORK5CYII=', 'base64');
	await assets.savePrintAsset(schoolId, 'sd', 'ttd', png, 'image/png');
	const { getPrincipalPrintSignatures } = await vite.ssrLoadModule('/src/lib/server/print-signatures.ts');
	assert.ok((await getPrincipalPrintSignatures(schoolId, 'sd', Number(employee.id), true)).teacher);
	assert.equal((await getPrincipalPrintSignatures(schoolId, 'sd', Number(employee.id) + 1, true)).teacher, null);
	assert.equal((await getPrincipalPrintSignatures(schoolId, 'smp', Number(employee.id), true)).principal, null);
	assert.equal((await getPrincipalPrintSignatures(schoolId, 'sd', Number(employee.id), false)).principal, null);
	pass('Signature opt-in enforces principal employee ID and education-level assets');
	assert.equal((await client.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	console.log(JSON.stringify({ checks, database, productionUnchanged: true }));
} finally {
	await close?.();
	await vite?.close();
	client.close();
}
