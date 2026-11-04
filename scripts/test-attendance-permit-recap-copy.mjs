import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';

await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/permit-recap-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
const tables = [
	'murid',
	'absensi_harian',
	'absensi_kegiatan',
	'izin_pulang_murid',
	'perjalanan_murid',
	'tindak_lanjut_absensi'
];
const snapshot = async (client) => {
	const result = {};
	for (const table of tables) {
		const exists = await client.execute({
			sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
			args: [table]
		});
		result[table] = exists.rows.length
			? createHash('sha256')
					.update(JSON.stringify((await client.execute(`SELECT * FROM ${table} ORDER BY id`)).rows))
					.digest('hex')
			: null;
	}
	return result;
};
const sourceBefore = await snapshot(source);
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
process.env.DB_URL = `file:${database}`;
const client = createClient({ url: process.env.DB_URL });
const row = async (sql, args = []) => (await client.execute({ sql, args })).rows[0];
const insert = async (table, values) => {
	values = { created_at: new Date().toISOString(), ...values };
	const keys = Object.keys(values);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
				args: Object.values(values)
			})
		).lastInsertRowid
	);
};
const clone = (original, changes) => {
	const value = { ...original, ...changes };
	delete value.id;
	return value;
};
const vite = await createServer({
	configFile: false,
	resolve: { alias: { $lib: path.resolve('src/lib') } },
	plugins: [
		{
			name: 'qa-env',
			enforce: 'pre',
			transform(source, id) {
				if (id.replaceAll('\\', '/').endsWith('/api/pdf/absensi-kegiatan/+server.ts'))
					return source.replace(
						'const pdf = Buffer.from(await renderPDF(html));',
						'globalThis.__permitQaPdfHtml = html; const pdf = Buffer.from(await renderPDF(html));'
					);
			},
			resolveId(id) {
				if (id === '$env/dynamic/private') return '\0qa-env';
				if (id.startsWith('$app/')) return '\0' + id;
			},
			load(id) {
				if (id === '\0qa-env') return 'export const env=process.env;';
				if (id === '\0$app/navigation')
					return 'export const goto=()=>{}; export const preloadData=()=>{}; export const pushState=()=>{};';
				if (id === '\0$app/server')
					return 'export const getRequestEvent=()=>globalThis.__permitQaEvent;';
			}
		}
	],
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'error'
});
let connection, renderer;
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	for (const [file, method] of [
		['ensure-absensi-digital', 'ensureAbsensiDigitalSchema'],
		['ensure-absence-monitoring', 'ensureAbsenceMonitoringSchema'],
		['ensure-attendance-illness', 'ensureAttendanceIllnessSchema'],
		['ensure-data-governance', 'ensureDataGovernanceSchema'],
		['ensure-education-units', 'ensureEducationUnitsSchema']
	])
		await (await vite.ssrLoadModule(`/src/lib/server/db/${file}.ts`))[method]();
	const original = await row('SELECT * FROM murid WHERE kelas_id IS NOT NULL LIMIT 1');
	assert(original, 'Requires one existing class student to clone into the QA copy.');
	const schoolId = Number(original.sekolah_id),
		semesterId = Number(original.semester_id);
	const originalClass = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	const yearId = Number(originalClass.tahun_ajaran_id);
	await client.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [yearId, schoolId]
	});
	await client.execute({
		sql: "UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END, tanggal_mulai='2026-09-01', tanggal_selesai='2026-12-31' WHERE tahun_ajaran_id=?",
		args: [semesterId, yearId]
	});
	await client.execute({
		sql: 'DELETE FROM kalender_pendidikan WHERE sekolah_id=? AND tahun_ajaran_id=?',
		args: [schoolId, yearId]
	});
	await client.execute({
		sql: 'DELETE FROM presensi_settings WHERE sekolah_id=? AND tahun_ajaran_id=?',
		args: [schoolId, yearId]
	});
	await insert('presensi_settings', {
		sekolah_id: schoolId,
		tahun_ajaran_id: yearId,
		hari_sekolah: 6,
		jam_masuk: '07:00',
		libur_nasional: '["2026-10-29"]',
		libur_semester: '[]'
	});
	const classId = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Izin 1',
			wali_kelas_id: null,
			wali_asrama_id: null,
			wali_asuh_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const otherClass = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Izin 2',
			wali_kelas_id: null,
			wali_asrama_id: null,
			wali_asuh_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	await insert('kalender_pendidikan', {
		sekolah_id: schoolId,
		tahun_ajaran_id: yearId,
		semester_id: semesterId,
		kelas_id: otherClass,
		tanggal_mulai: '2026-10-30',
		tanggal_selesai: '2026-10-30',
		jenis: 'libur_sekolah',
		judul: 'QA libur kelas lain',
		jenjang: 'semua'
	});
	const db = connection.default;
	const schema = await vite.ssrLoadModule('/src/lib/server/db/schema.ts');
	const { eq } = await vite.ssrLoadModule('drizzle-orm');
	const admin = await db.query.tableAuthUser.findFirst({
		where: eq(schema.tableAuthUser.type, 'admin')
	});
	const sekolah = await db.query.tableSekolah.findFirst({
		where: eq(schema.tableSekolah.id, schoolId),
		with: { alamat: true }
	});
	assert(admin && sekolah);
	const actorId = await insert(
		'auth_user',
		clone(await row('SELECT * FROM auth_user WHERE id=?', [admin.id]), {
			username: 'qa-permit-teacher',
			username_normalized: 'qa-permit-teacher',
			sekolah_id: schoolId,
			pegawai_id: null,
			kelas_id: null
		})
	);
	const actor = { ...admin, id: actorId, username: 'qa-permit-teacher', sekolahId: schoolId };
	const locals = { sekolah, user: actor };
	globalThis.__permitQaEvent = { locals, route: { id: '/administrasi/absensi/kegiatan/rekap' } };
	const students = [];
	for (let i = 0; i < 10; i++)
		students.push(
			await insert(
				'murid',
				clone(original, {
					nama: `QA Izin Murid ${i}`,
					nis: `QA-IZIN-${i}`,
					nisn: `QA-IZIN-${i}`,
					kelas_id: classId,
					qr_token: randomBytes(16).toString('hex'),
					tanggal_masuk: '2026-09-01',
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null
				})
			)
		);
	await client.execute({
		sql: "UPDATE kegiatan_absensi SET jam_mulai='07:00', jam_selesai='08:00' WHERE sekolah_id=? AND kode='apel_berangkat'",
		args: [schoolId]
	});
	const activities = (
		await client.execute({
			sql: 'SELECT * FROM kegiatan_absensi WHERE sekolah_id=?',
			args: [schoolId]
		})
	).rows;
	const entry = activities.find((a) => a.kode === 'apel_berangkat');
	const exit = activities.find((a) => a.kode === 'apel_pulang');
	assert(entry && exit);
	const now = new Date().toISOString();
	const permit = (i, changes = {}) =>
		insert('izin_pulang_murid', {
			sekolah_id: schoolId,
			tahun_ajaran_id: yearId,
			semester_id: semesterId,
			kelas_id: classId,
			murid_id: students[i],
			nis_snapshot: `QA-IZIN-${i}`,
			nama_snapshot: `QA Izin Murid ${i}`,
			kelas_snapshot: 'QA Izin 1',
			tanggal_keluar: '2026-10-28',
			waktu_keluar: '06:00',
			rencana_kembali: '2026-10-30',
			waktu_rencana_kembali: '18:00',
			alasan: 'QA izin resmi guru',
			penjemput_nama: 'QA Penjemput',
			penjemput_hubungan: 'Ibu',
			petugas_keluar_user_id: actorId,
			status: 'sedang_izin',
			created_at: now,
			updated_at: now,
			...changes
		});
	const p0 = await permit(0, { tanggal_keluar: '2026-10-30', rencana_kembali: '2026-11-02' });
	await permit(1, { waktu_keluar: '12:00', rencana_kembali: '2026-10-28' });
	await permit(3, { status: 'dibatalkan' });
	await permit(4, { waktu_keluar: null });
	await permit(5, {
		tanggal_kembali: '2026-10-30',
		waktu_kembali: '18:00',
		status: 'sudah_kembali'
	});
	await permit(5, {
		tanggal_keluar: '2026-10-30',
		waktu_keluar: '18:00',
		rencana_kembali: '2026-10-31'
	});
	await permit(6, { rencana_kembali: '2026-10-28' });
	await permit(7, {
		waktu_rencana_kembali: '07:00',
		tanggal_kembali: '2026-10-30',
		waktu_kembali: '10:00',
		status: 'terlambat_kembali'
	});
	const attendance = (i, activity, date, status, extra = {}) =>
		insert('absensi_kegiatan', {
			sekolah_id: schoolId,
			semester_id: semesterId,
			kelas_id: classId,
			murid_id: students[i],
			kegiatan_id: Number(activity.id),
			tanggal: date,
			status,
			metode: 'manual',
			auto_alfa: 0,
			...extra
		});
	await attendance(1, entry, '2026-10-28', 'hadir');
	await attendance(1, exit, '2026-10-28', 'pulang');
	await attendance(2, entry, '2026-10-28', 'alfa', { metode: 'auto', auto_alfa: 1 });
	await attendance(2, exit, '2026-10-28', 'alfa', { metode: 'auto', auto_alfa: 1 });
	await attendance(2, entry, '2026-10-30', 'alfa');
	await attendance(2, exit, '2026-10-30', 'alfa');
	const helper = await vite.ssrLoadModule('/src/lib/server/attendance-permit-recap.ts');
	const options = {
		schoolId,
		semesterId,
		studentIds: students,
		start: '2026-10-28',
		end: '2026-11-03',
		today: '2026-11-03'
	};
	const result = await helper.loadSchoolPermitRecap(options);
	assert.equal(result.get(students[0]).counts.izin, 3);
	assert.equal(result.get(students[0]).izinPulang, 1);
	assert.equal(result.get(students[0]).durasiPulang, 4);
	assert.equal(result.get(students[0]).belumDiverifikasi, 1);
	pass('Official teacher permit counts before security; class holiday stays in its class.');
	const october = await helper.loadSchoolPermitRecap({
		...options,
		start: '2026-10-30',
		end: '2026-10-31'
	});
	const november = await helper.loadSchoolPermitRecap({ ...options, start: '2026-11-01' });
	assert.equal(october.get(students[0]).izinPulang, 1);
	assert.equal(november.get(students[0]).izinPulang, 0);
	assert.equal(october.get(students[0]).durasiPulang, 2);
	assert.equal(november.get(students[0]).durasiPulang, 2);
	assert.equal(november.get(students[0]).counts.izin, 1);
	pass('Cross-month event counted once; calendar duration and school days allocated by month.');
	assert.equal(result.get(students[1]).counts.hadir, 1);
	assert.equal(result.get(students[1]).counts.izin, 0);
	assert.equal(result.get(students[2]).counts.alfa, 1);
	assert.equal(result.get(students[2]).belumTercatat, 4);
	assert.equal(result.get(students[3]).izinPulang, 0);
	assert.equal(result.get(students[4]).counts.izin, 1);
	assert.equal(result.get(students[5]).durasiPulang, 4);
	assert.equal(result.get(students[5]).counts.izin, 3);
	assert.equal(result.get(students[6]).counts.izin, 1);
	assert.equal(result.get(students[6]).counts.alfa, 0);
	assert.equal(result.get(students[7]).counts.izin, 1);
	assert.equal(result.get(students[7]).perluDiperiksa, 1);
	pass(
		'Midday presence, duplicate activities, auto alfa, cancelled/missing-time/overlapping/overdue permissions handled.'
	);
	const route = await vite.ssrLoadModule(
		'/src/routes/(administrasi)/administrasi/absensi/kegiatan/rekap/+page.server.ts'
	);
	const action = async (name, values) => {
		const form = new FormData();
		for (const [key, value] of Object.entries(values)) form.set(key, String(value));
		return route.actions[name]({
			locals,
			request: new Request('http://localhost/administrasi/absensi/kegiatan/rekap', {
				method: 'POST',
				body: form
			})
		});
	};
	const values = {
		muridId: students[8],
		kelasId: classId,
		tanggalKeluar: '2026-10-28',
		waktuKeluar: '06:00',
		rencanaKembali: '2026-10-30',
		waktuRencanaKembali: '07:00',
		alasan: 'QA dibuat melalui aksi guru',
		penjemputNama: 'QA Ibu',
		penjemputHubungan: 'Ibu'
	};
	for (const change of [
		{ waktuKeluar: '99:99' },
		{ tanggalKeluar: '2026-02-30' },
		{ rencanaKembali: '2026-10-28', waktuRencanaKembali: '05:00' },
		{ kelasId: otherClass }
	])
		assert.equal(
			(await action('saveIzinPulang', { ...values, ...change })).status,
			change.kelasId ? 404 : 400
		);
	assert((await action('saveIzinPulang', values)).message);
	const p8 = await row('SELECT * FROM izin_pulang_murid WHERE murid_id=?', [students[8]]);
	assert.equal(
		Number((await row('SELECT count(*) n FROM perjalanan_murid WHERE izin_id=?', [p8.id])).n),
		0
	);
	assert.equal((await action('saveIzinPulang', values)).status, 409);
	assert(
		(
			await action('markIzinReturned', {
				id: p8.id,
				tanggalKembali: '2026-10-30',
				waktuKembali: '10:00'
			})
		).message
	);
	assert.equal(
		(await row('SELECT status FROM izin_pulang_murid WHERE id=?', [p8.id])).status,
		'terlambat_kembali'
	);
	assert.equal(
		(await action('markIzinReturned', { id: p8.id, tanggalKembali: '2026-10-30' })).status,
		409
	);
	assert.equal((await action('cancelIzinPulang', { id: p8.id })).status, 409);
	assert((await action('saveIzinPulang', { ...values, muridId: students[9] })).message);
	const p9 = await row('SELECT id FROM izin_pulang_murid WHERE murid_id=?', [students[9]]);
	assert((await action('cancelIzinPulang', { id: p9.id })).message);
	pass(
		'Teacher actions validate real dates/times, prevent duplicate permits and preserve manual return without fake scans.'
	);
	const mutation = await vite.ssrLoadModule('/src/lib/server/attendance-mutation.ts');
	await mutation.saveAttendance({
		locals,
		request: new Request('http://localhost/'),
		semesterId,
		kelasId: classId,
		muridIds: [students[2]],
		tanggal: '2026-10-30',
		kegiatanId: Number(entry.id),
		status: 'izin',
		catatan: 'QA koreksi alfa berdasarkan bukti guru'
	});
	const corrected = await helper.loadSchoolPermitRecap(options);
	assert.equal(corrected.get(students[2]).counts.alfa, 0);
	assert.equal(corrected.get(students[2]).counts.izin, 1);
	pass(
		'Explicit teacher correction replaces prior school-day status without counting exit activity twice.'
	);
	const beforeReports = await snapshot(client);
	const url = new URL(
		`http://localhost/administrasi/absensi/kegiatan/rekap?kelas_id=${classId}&tanggal_awal=2026-10-28&tanggal_akhir=2026-11-03`
	);
	const page = await route.load({ locals, url });
	const dailyRoute = await vite.ssrLoadModule(
		'/src/routes/(administrasi)/administrasi/absensi/rekap/+page.server.ts'
	);
	const dailyPage = await dailyRoute.load({ locals, url });
	assert.deepEqual(
		page.rows.find((r) => r.id === students[0]).schoolRecap,
		dailyPage.rekapSiswa.find((r) => r.id === students[0]).permitRecap
	);
	assert.equal(page.autoAlfaInserted, 0);
	for (const [file, sheetName, headerRow, offset] of [
		['kegiatan/rekap', 'Rekap Per Siswa', 7, 1],
		['rekap', 'Rekap Absensi', 5, 0]
	]) {
		const api = await vite.ssrLoadModule(
			`/src/routes/api/administrasi/absensi/${file}/export/+server.ts`
		);
		const response = await api.GET({ locals, url });
		assert.equal(response.status, 200);
		const bytes = Buffer.from(await response.arrayBuffer());
		await writeFile(path.join(folder, `${sheetName}.xlsx`), bytes);
		const book = new ExcelJS.Workbook();
		await book.xlsx.load(bytes);
		const sheet = book.getWorksheet(sheetName);
		const headers = sheet.getRow(headerRow).values;
		const studentRow = sheet
			.getRows(headerRow + 1, sheet.rowCount - headerRow)
			.find((r) => r.getCell(offset + 1).value === 'QA Izin Murid 0');
		for (const [label, expected] of [
			['Izin pulang (kali)', 1],
			['Durasi pulang (hari kalender)', 4],
			['Belum diverifikasi security (izin)', 1]
		])
			assert.equal(studentRow.getCell(headers.indexOf(label)).value, expected, label);
		if (file.startsWith('kegiatan')) {
			const detail = book.getWorksheet('Catatan Izin Pulang');
			const record = detail
				.getRows(2, detail.rowCount - 1)
				.find((r) => Number(r.getCell(1).value) === p0);
			assert.match(record.getCell(11).value, /qa-permit-teacher/);
			assert.equal(record.getCell(13).value, '');
		}
	}
	assert.deepEqual(await snapshot(client), beforeReports);
	pass(
		'Daily/activity pages and Excel agree; reading/exporting creates no attendance or journey records.'
	);
	const pdfTemplate = await vite.ssrLoadModule('/src/lib/server/pdf/templates/absensi-kegiatan.ts');
	const printData = {
		sekolah: { nama: 'QA', npsn: '', alamat: '' },
		periode: 'QA',
		kelas: 'QA',
		kegiatan: 'QA',
		summary: page.summary,
		studentRows: [
			{
				no: 1,
				nis: 'QA',
				nama: '<script>QA</script>',
				counts: page.rows[0].counts,
				schoolRecap: page.rows.find((r) => r.id === students[0]).schoolRecap
			}
		],
		alerts: [],
		permits: [],
		tandaTangan: {
			kiri: { jabatan: '', nama: '', nip: '' },
			kanan: { jabatan: '', nama: '', nip: '' }
		}
	};
	const html = pdfTemplate.renderAbsensiKegiatanHTML(printData);
	assert(!html.includes('<small>'));
	assert(!html.includes('(kegiatan)'));
	assert(html.includes('<td>&lt;script&gt;QA&lt;/script&gt;</td>'));
	assert(html.includes('&lt;script&gt;QA&lt;/script&gt;'));
	process.env.PUPPETEER_EXECUTABLE_PATH ||= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
	renderer = await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts');
	const pdfRoute = await vite.ssrLoadModule('/src/routes/api/pdf/absensi-kegiatan/+server.ts');
	const pdfResponse = await pdfRoute.GET({ locals, url });
	assert.equal(pdfResponse.status, 200);
	const crossMonthIndicators = globalThis.__permitQaPdfHtml
		.split('INDIKATOR YANG MEMERLUKAN TINDAK LANJUT')[1]
		.split('CATATAN IZIN PULANG')[0];
	const crossMonthRows = [...crossMonthIndicators.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td>/g)];
	assert(!crossMonthRows.some((r) => r[1] === 'QA Izin Murid 0' && r[2].startsWith('Pulang')));
	assert(crossMonthRows.some((r) => r[1] === 'QA Izin Murid 5' && r[2].startsWith('Pulang')));
	const bytes = Buffer.from(await pdfResponse.arrayBuffer());
	const pdf = await PDFDocument.load(bytes);
	assert(pdf.getPageCount() > 0);
	await writeFile(path.join(folder, 'rekap.pdf'), bytes);
	assert.deepEqual(await snapshot(client), beforeReports);
	pass(
		`PDF keeps plain student names, status headers, monthly indicators and permit details; actual PDF ${pdf.getPageCount()} pages.`
	);
	await insert('perjalanan_murid', {
		izin_id: p0,
		keluar_pada: '2026-10-30T02:00:00.000Z',
		keluar_oleh: actorId
	});
	const afterScan = await helper.loadSchoolPermitRecap(options);
	assert.equal(afterScan.get(students[0]).counts.izin, 3);
	assert.equal(afterScan.get(students[0]).izinPulang, 1);
	assert.equal(afterScan.get(students[0]).belumDiverifikasi, 0);
	assert.equal(afterScan.get(students[0]).perluDiperiksa, 1);
	assert.deepEqual(await helper.loadSchoolPermitRecap(options), afterScan);
	assert.equal((await action('cancelIzinPulang', { id: p0 })).status, 409);
	const details = await helper.loadPermitRecapDetails(
		schoolId,
		students,
		options.start,
		options.end
	);
	assert.equal(details.find((p) => p.id === p0).perjalanan.keluarPada, '2026-10-30T02:00:00.000Z');
	pass(
		'Delayed security observation stays separate from teacher authorization; no double event or destructive cancellation.'
	);
	await assert.rejects(
		helper.loadSchoolPermitRecap({ ...options, start: '2026-02-30' }),
		(e) => e.status === 400
	);
	await assert.rejects(
		helper.loadSchoolPermitRecap({ ...options, start: '2024-01-01' }),
		(e) => e.status === 400
	);
	assert.equal((await helper.loadSchoolPermitRecap({ ...options, studentIds: [] })).size, 0);
	assert.equal(
		(await helper.loadPermitRecapDetails(schoolId, students, '2099-01-01', '2099-01-01')).length,
		0
	);
	const monthlyRules = await vite.ssrLoadModule('/src/lib/attendance-permit-recap.ts');
	const { listSchoolDays } = await vite.ssrLoadModule('/src/lib/server/absence-monitoring.ts');
	const monthlyClass = await insert(
		'kelas',
		clone(originalClass, {
			nama: 'QA Rekap Bulanan',
			wali_kelas_id: null,
			wali_asrama_id: null,
			wali_asuh_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const monthStudents = [];
	for (let i = 0; i < 12; i++) {
		const nama = `QA Bulanan ${i}`;
		const id = await insert(
			'murid',
			clone(original, {
				nama,
				nis: `QA-BULAN-${i}`,
				nisn: `QA-BULAN-${i}`,
				kelas_id: monthlyClass,
				tanggal_masuk: i === 10 ? '2026-10-30' : '2026-09-01',
				qr_token: randomBytes(16).toString('hex'),
				dapodik_peserta_didik_id: null,
				dapodik_anggota_rombel_id: null
			})
		);
		monthStudents.push({ id, nama });
	}
	const schoolDates = listSchoolDays({
		start: '2026-10-01',
		end: '2026-10-31',
		hariSekolah: 6,
		holidayDates: new Set(['2026-10-29'])
	});
	const recurring = ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07'];
	for (const [i, student] of monthStudents.entries()) {
		for (const date of schoolDates) {
			if (
				i === 10 ||
				i === 11 ||
				(i === 7 && recurring.includes(date)) ||
				(i === 8 && recurring.slice(0, 3).includes(date))
			)
				continue;
			let status = 'hadir';
			if ((i === 0 || i === 1) && recurring.slice(0, i === 0 ? 4 : 3).includes(date))
				status = 'izin';
			if (i === 2 && date === recurring[0]) status = 'alfa';
			if ((i === 3 || i === 4) && recurring.slice(0, i === 3 ? 4 : 3).includes(date))
				status = 'sakit';
			if (
				(i === 5 && ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'].includes(date)) ||
				(i === 6 && ['2026-10-09', '2026-10-10'].includes(date)) ||
				(i === 9 && ['2026-10-30', '2026-10-31'].includes(date))
			)
				continue;
			await insert('absensi_harian', {
				sekolah_id: schoolId,
				semester_id: semesterId,
				kelas_id: monthlyClass,
				murid_id: student.id,
				tanggal: date,
				status,
				metode: 'manual'
			});
			await insert('absensi_kegiatan', {
				sekolah_id: schoolId,
				semester_id: semesterId,
				kelas_id: monthlyClass,
				murid_id: student.id,
				kegiatan_id: Number(entry.id),
				tanggal: date,
				status,
				metode: 'manual',
				auto_alfa: 0
			});
		}
	}
	for (const [i, start, end] of [
		[5, '2026-10-01', '2026-10-02'],
		[5, '2026-10-05', '2026-10-06'],
		[6, '2026-10-09', '2026-10-11'],
		[9, '2026-10-30', '2026-11-02']
	])
		await insert('izin_pulang_murid', {
			sekolah_id: schoolId,
			tahun_ajaran_id: yearId,
			semester_id: semesterId,
			kelas_id: monthlyClass,
			murid_id: monthStudents[i].id,
			nis_snapshot: `QA-BULAN-${i}`,
			nama_snapshot: monthStudents[i].nama,
			kelas_snapshot: 'QA Rekap Bulanan',
			tanggal_keluar: start,
			waktu_keluar: '06:00',
			rencana_kembali: end,
			tanggal_kembali: end,
			waktu_kembali: '18:00',
			status: 'sudah_kembali',
			alasan: 'QA izin resmi tanpa scan',
			petugas_keluar_user_id: actorId
		});
	// A second activity must not duplicate a single school-day alfa.
	await insert('absensi_kegiatan', {
		sekolah_id: schoolId,
		semester_id: semesterId,
		kelas_id: monthlyClass,
		murid_id: monthStudents[2].id,
		kegiatan_id: Number(exit.id),
		tanggal: recurring[0],
		status: 'alfa',
		metode: 'manual',
		auto_alfa: 0
	});
	const inactiveUid = randomBytes(16).toString('hex');
	await client.execute({
		sql: 'INSERT INTO murid_identity_link (sekolah_id, semester_id, murid_id, identity_uid) VALUES (?,?,?,?)',
		args: [schoolId, semesterId, monthStudents[11].id, inactiveUid]
	});
	await insert('murid_lifecycle', {
		sekolah_id: schoolId,
		identity_key: `uid:${inactiveUid}`,
		nis: 'QA-BULAN-11',
		nama_snapshot: monthStudents[11].nama,
		status: 'keluar',
		last_murid_id: monthStudents[11].id
	});
	await insert('tindak_lanjut_absensi', {
		sekolah_id: schoolId,
		murid_id: monthStudents[2].id,
		nama_snapshot: monthStudents[2].nama,
		kelas_snapshot: 'QA Rekap Bulanan',
		jenis: 'alfa_berulang',
		periode_mulai: '2026-10-01',
		periode_selesai: '2026-10-31',
		status: 'diproses',
		catatan: 'QA tindak lanjut Oktober'
	});
	const monthlyOptions = {
		schoolId,
		semesterId,
		studentIds: monthStudents.map((s) => s.id),
		start: '2026-10-01',
		end: '2026-10-31',
		today: '2026-11-03',
		excludeCurrentUnrecorded: true
	};
	const monthlyTotals = await helper.loadSchoolPermitRecap(monthlyOptions);
	const followUps = await db.query.tableTindakLanjutAbsensi.findMany({
		where: eq(schema.tableTindakLanjutAbsensi.sekolahId, schoolId)
	});
	const indicators = monthStudents.flatMap((s) =>
		monthlyRules.monthlyAttendanceIndicators(
			s,
			monthlyTotals.get(s.id),
			{ start: monthlyOptions.start, end: monthlyOptions.end },
			followUps
		)
	);
	const ownIndicators = (i) => indicators.filter((r) => r.nama === monthStudents[i].nama);
	assert.equal(ownIndicators(0)[0].akumulasi, '4 hari sekolah');
	assert.equal(ownIndicators(1).length, 0);
	assert.equal(ownIndicators(2)[0].akumulasi, '1 hari sekolah');
	assert.equal(ownIndicators(2)[0].status, 'diproses');
	assert.equal(ownIndicators(3)[0].indikator, 'Sakit lebih dari 3 hari');
	assert.equal(ownIndicators(4).length, 0);
	assert.equal(ownIndicators(5).length, 2);
	assert.equal(
		ownIndicators(5).find((r) => r.indikator.startsWith('Pulang')).akumulasi,
		'4 hari kalender'
	);
	assert.equal(ownIndicators(6).length, 0);
	assert.equal(ownIndicators(7)[0].indikator, 'Presensi harian belum tercatat');
	assert.equal(ownIndicators(8).length, 0);
	assert.equal(monthlyTotals.get(monthStudents[9].id).durasiPulang, 2);
	assert.equal(monthlyTotals.get(monthStudents[10].id).belumTercatat, 2);
	const currentDay = await helper.loadSchoolPermitRecap({
		...monthlyOptions,
		studentIds: [monthStudents[7].id],
		end: '2026-10-07',
		today: '2026-10-07'
	});
	assert.equal(currentDay.get(monthStudents[7].id).belumTercatat, 3);
	const nextMonth = await helper.loadSchoolPermitRecap({
		...monthlyOptions,
		studentIds: [monthStudents[9].id],
		start: '2026-11-01',
		end: '2026-11-02'
	});
	assert.equal(nextMonth.get(monthStudents[9].id).durasiPulang, 2);
	assert(
		!monthlyRules
			.monthlyAttendanceIndicators(monthStudents[9], nextMonth.get(monthStudents[9].id), {
				start: '2026-11-01',
				end: '2026-11-02'
			})
			.some((r) => r.indikator.startsWith('Pulang'))
	);
	pass(
		'Monthly cumulative thresholds, single alfa, non-consecutive sickness, multi-indicator pupils, missing attendance, enrollment and cross-month permits verified.'
	);
	const beforeMonthlyPdf = await snapshot(client);
	const monthlyUrl = new URL(
		`http://localhost/api/pdf/absensi-kegiatan?kelas_id=${monthlyClass}&tanggal_awal=2026-10-01&tanggal_akhir=2026-10-31`
	);
	// Requests receive fresh user objects; avoid reusing class-access cache from before fixture creation.
	const monthlyLocals = { ...locals, user: { ...actor } };
	globalThis.__permitQaEvent = {
		locals: monthlyLocals,
		route: { id: '/api/pdf/absensi-kegiatan' }
	};
	const monthlyResponse = await pdfRoute.GET({ locals: monthlyLocals, url: monthlyUrl });
	assert.equal(monthlyResponse.status, 200);
	const monthlyPdfPath = path.join(folder, 'rekap-bulanan.pdf');
	await writeFile(monthlyPdfPath, Buffer.from(await monthlyResponse.arrayBuffer()));
	const monthlyText = globalThis.__permitQaPdfHtml;
	assert.equal(typeof monthlyText, 'string');
	await writeFile(path.join(folder, 'rekap-bulanan.html'), monthlyText);
	assert(!monthlyText.includes('RINCIAN HARIAN'));
	assert(monthlyText.includes('Akumulasi'));
	assert(monthlyText.includes('QA tindak lanjut Oktober'));
	assert(!monthlyText.includes('QA Bulanan 11'));
	assert(monthlyText.includes('Data kosong bukan'));
	const indicatorSection = monthlyText
		.split('INDIKATOR YANG MEMERLUKAN TINDAK LANJUT')[1]
		.split('CATATAN IZIN PULANG')[0];
	for (const i of [0, 2, 3, 5, 7]) assert(indicatorSection.includes(monthStudents[i].nama));
	for (const i of [1, 4, 6, 8, 9, 10, 11])
		assert(!indicatorSection.includes(`${monthStudents[i].nama}</td>`));
	assert.deepEqual(await snapshot(client), beforeMonthlyPdf);
	const exampleRows = monthStudents
		.filter((_, i) => [0, 1, 2, 3, 5, 7].includes(i))
		.map((s, index) => ({
			no: index + 1,
			nis: `CONTOH-${monthStudents.indexOf(s) + 1}`,
			nama: `Murid Contoh ${monthStudents.indexOf(s) + 1}`,
			counts: { ...monthlyTotals.get(s.id).counts, pulang: 0 },
			schoolRecap: monthlyTotals.get(s.id)
		}));
	const exampleHtml = pdfTemplate.renderAbsensiKegiatanHTML({
		...printData,
		sekolah: {
			nama: 'Sekolah Rakyat Contoh',
			npsn: '12345678',
			alamat: 'Jalan Pendidikan, Bengkulu',
			naungan: 'kemsos',
			email: 'sekolah@example.id'
		},
		periode: '1 Oktober 2026 - 31 Oktober 2026',
		kelas: 'Masa Persiapan',
		kegiatan: 'Semua kegiatan',
		summary: exampleRows.reduce(
			(counts, r) =>
				Object.fromEntries(Object.keys(counts).map((key) => [key, counts[key] + r.counts[key]])),
			{ hadir: 0, terlambat: 0, sakit: 0, izin: 0, alfa: 0, pulang: 0 }
		),
		studentRows: exampleRows,
		alerts: indicators
			.filter((r) => !r.nama.endsWith('11'))
			.map((r) => ({
				...r,
				nama: `Murid Contoh ${monthStudents.findIndex((s) => s.nama === r.nama) + 1}`,
				periode: '1 Oktober 2026 - 31 Oktober 2026',
				status: r.status === 'diproses' ? 'Diproses' : 'Baru'
			})),
		permits: [
			[5, '1 Oktober 2026', '2 Oktober 2026'],
			[5, '5 Oktober 2026', '6 Oktober 2026'],
			[6, '9 Oktober 2026', '11 Oktober 2026'],
			[9, '30 Oktober 2026', '2 November 2026']
		]
			.filter(([i]) => i === 5)
			.map(([i, start, end]) => ({
				nama: `Murid Contoh ${i + 1}`,
				tanggalKeluar: start,
				rencanaKembali: end,
				status: 'Sudah Kembali',
				alasan: 'Izin resmi tercatat oleh guru. Belum diverifikasi security.'
			})),
		tandaTangan: {
			kiri: { jabatan: 'Mengetahui, Kepala Sekolah', nama: 'Kepala Sekolah Contoh', nip: '-' },
			kanan: { jabatan: 'Wali Kelas', nama: 'Wali Kelas Contoh', nip: '-' }
		}
	});
	await writeFile(path.join(folder, 'contoh.html'), exampleHtml);
	await mkdir('output/pdf', { recursive: true });
	const examplePdf = await renderer.renderPDF(exampleHtml);
	assert.equal(
		(await PDFDocument.load(examplePdf)).getPageCount(),
		2,
		'Keep section headings with tables; no duplicate narrow table or orphaned signature page.'
	);
	await writeFile('output/pdf/rekap-absensi-kegiatan-bulanan.pdf', examplePdf);
	pass(
		'Actual monthly PDF omits daily section and inactive students; below-threshold rows hidden, saved follow-up preserved, copy database unchanged by printing.'
	);
	const { todayLocalDate } = await vite.ssrLoadModule('/src/lib/server/absensi-digital.ts');
	const today = todayLocalDate();
	const teacherId = await insert(
		'auth_user',
		clone(await row('SELECT * FROM auth_user WHERE id=?', [actorId]), {
			username: 'qa-manual-pulang',
			username_normalized: 'qa-manual-pulang',
			type: 'user',
			roles: '["user"]',
			permissions: '[]',
			kelas_id: classId
		})
	);
	await insert('auth_user_kelas', { auth_user_id: teacherId, kelas_id: classId });
	const teacher = {
		...actor,
		id: teacherId,
		username: 'qa-manual-pulang',
		type: 'user',
		roles: ['user'],
		permissions: [],
		kelasId: classId,
		waliKelasIds: []
	};
	const manualStudents = [];
	for (const [index, kelas] of [classId, otherClass].entries())
		manualStudents.push(
			await insert(
				'murid',
				clone(original, {
					nama: `QA Pulang Manual ${index}`,
					nis: `QA-PULANG-${index}`,
					nisn: `QA-PULANG-${index}`,
					kelas_id: kelas,
					tanggal_masuk: today,
					qr_token: randomBytes(16).toString('hex'),
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null
				})
			)
		);
	const officialBefore = await snapshot(client);
	const completion = await vite.ssrLoadModule(
		'/src/routes/api/administrasi/absensi/kegiatan/ringkasan/catat/+server.ts'
	);
	const { attendanceGuard } = await vite.ssrLoadModule('/src/lib/server/attendance-guard.ts');
	const submitManual = async (id, status = 'pulang', changes = {}) => {
		const url = new URL('http://localhost/api/administrasi/absensi/kegiatan/ringkasan/catat');
		url.search = new URLSearchParams({
			tanggal: today,
			kegiatan_id: String(entry.id),
			cakupan: 'kelas',
			kelas_id: String(classId),
			...changes
		}).toString();
		const event = {
			locals: { sekolah, user: teacher },
			url,
			request: new Request(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ entries: [{ muridId: id, status, catatan: 'Pulang dicatat guru' }] })
			})
		};
		return (await attendanceGuard({ event, resolve: (event) => completion.POST(event) })).json();
	};
	const manual = await submitManual(manualStudents[0]);
	assert.equal(manual.results[0].code, 'saved');
	assert.match(manual.report.text, /QA Pulang Manual 0 \(p\)/);
	assert(!manual.report.missingStudents.some((s) => s.id === manualStudents[0]));
	const manualRecord = await row('SELECT * FROM absensi_kegiatan WHERE murid_id=? AND tanggal=?', [
		manualStudents[0],
		today
	]);
	assert.equal(manualRecord.status, 'pulang');
	assert.equal(manualRecord.metode, 'manual');
	assert.equal(Number(manualRecord.petugas_user_id), teacherId);
	assert.equal(manualRecord.catatan, 'Pulang dicatat guru');
	const audit = await row(
		"SELECT after_data FROM audit_log WHERE entity_type='absensi_kegiatan' AND entity_id=? ORDER BY id DESC LIMIT 1",
		[`${manualStudents[0]}:${today}:${entry.id}`]
	);
	assert.equal(JSON.parse(audit.after_data).status, 'pulang');
	assert.equal((await submitManual(manualStudents[0], 'hadir')).results[0].code, 'changed');
	assert.deepEqual(
		await row('SELECT * FROM absensi_kegiatan WHERE id=?', [manualRecord.id]),
		manualRecord
	);
	assert.equal((await submitManual(manualStudents[1])).results[0].code, 'changed');
	await assert.rejects(
		submitManual(manualStudents[1], 'pulang', { kelas_id: String(otherClass) }),
		(e) => e.status === 403
	);
	await assert.rejects(
		submitManual(manualStudents[0], 'pulang', { tanggal: '2026-02-30' }),
		(e) => e.status === 400
	);
	const yesterday = new Date(`${today}T00:00:00Z`);
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);
	const oldDate = await submitManual(manualStudents[0], 'pulang', {
		tanggal: yesterday.toISOString().slice(0, 10)
	});
	assert.equal(oldDate.results[0].code, 'forbidden');
	pass(
		'Manual Pulang saves without permit, leaves audit and summary, rejects other classes/old dates and never overwrites prior attendance.'
	);
	const { loadAttendanceSummary } = await vite.ssrLoadModule(
		'/src/lib/server/attendance-summary.ts'
	);
	const reloaded = await loadAttendanceSummary(
		{ sekolah, user: teacher },
		new URLSearchParams({
			tanggal: today,
			kegiatan_id: String(entry.id),
			cakupan: 'kelas',
			kelas_id: String(classId)
		})
	);
	assert.match(reloaded.text, /QA Pulang Manual 0 \(p\)/);
	assert(!reloaded.missingStudents.some((s) => s.id === manualStudents[0]));
	const scan = await vite.ssrLoadModule(
		'/src/routes/api/administrasi/absensi/scan/perjalanan/+server.ts'
	);
	await assert.rejects(
		scan.POST({
			locals: { sekolah, user: teacher },
			request: new Request('http://localhost/', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: 'qa', operation: 'pulang_ke_rumah' })
			})
		}),
		(e) => e.status === 403
	);
	const officialAfter = await snapshot(client);
	for (const table of ['izin_pulang_murid', 'perjalanan_murid'])
		assert.equal(officialAfter[table], officialBefore[table]);
	pass(
		'Reload preserves manual Pulang; no official authorization or security confirmation is created.'
	);
	// Include every weekday so this regression also runs on weekends.
	await client.execute({
		sql: 'UPDATE presensi_settings SET hari_sekolah=7 WHERE sekolah_id=? AND tahun_ajaran_id=?',
		args: [schoolId, yearId]
	});
	const manualRecap = await helper.loadSchoolPermitRecap({
		schoolId,
		semesterId,
		studentIds: [manualStudents[0]],
		start: today,
		end: today,
		today
	});
	assert.equal(manualRecap.get(manualStudents[0]).counts.izin, 1);
	assert.equal(manualRecap.get(manualStudents[0]).belumTercatat, 0);
	assert.equal(manualRecap.get(manualStudents[0]).izinPulang, 0);
	pass(
		'School recap counts manual Pulang as one recorded izin day without inventing an official permit.'
	);
	assert.deepEqual(await snapshot(source), sourceBefore);
	pass('Invalid ranges rejected; operational source database unchanged.');
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify({ checks, database, schoolId, classId, semesterId, actorId }, null, 2)
	);
	console.log('QA artifacts:', folder);
} finally {
	delete globalThis.__permitQaEvent;
	delete globalThis.__permitQaPdfHtml;
	if (renderer) await (await renderer.getBrowser()).close();
	if (connection) await connection.closeDbClient();
	await vite.close();
	client.close();
	source.close();
}
process.exit(0);
