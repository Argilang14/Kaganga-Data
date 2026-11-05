import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';

await mkdir('tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('tmp/student-qr-'));
const database = path.join(directory, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
process.env.DB_URL = `file:${database}`;
const client = createClient({ url: process.env.DB_URL });
const insert = async (table, fields) => {
	const columns = (await client.execute(`PRAGMA table_info("${table}")`)).rows;
	const values = { ...fields };
	for (const column of columns)
		if (
			column.name !== 'id' &&
			Number(column.notnull) &&
			column.dflt_value === null &&
			!(column.name in values)
		)
			values[column.name] = column.type.toLowerCase().includes('int')
				? 1
				: column.name === 'created_at'
					? new Date().toISOString()
					: '';
	const entries = Object.entries(values);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
				args: entries.map(([, value]) => value)
			})
		).lastInsertRowid
	);
};
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
					return 'export const goto = () => {}; export const preloadData = () => {}; export const pushState = () => {};';
				if (id === '\0$app/server')
					return 'export const getRequestEvent = () => globalThis.__studentQaEvent;';
			}
		}
	],
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'error'
});

let connection;
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	const db = connection.default;
	const { migrateUnassignedMurid } = await vite.ssrLoadModule(
		'/src/lib/server/db/murid-unassigned.ts'
	);
	await migrateUnassignedMurid(db.$client);
	const qr = await vite.ssrLoadModule('/src/lib/server/student-qr.ts');
	const tokens = await vite.ssrLoadModule('/src/lib/server/student-qr-token.ts');
	const exchange = await vite.ssrLoadModule('/src/lib/server/student-exchange.ts');
	await exchange.prepareStudentExchange();
	const get = async (sql, args = []) => (await client.execute({ sql, args })).rows;
	const exec = (sql, args = []) => client.execute({ sql, args });
	const address = await insert('alamat', {
		jalan: 'Jl Uji',
		desa: 'Desa',
		kecamatan: 'Kecamatan',
		kabupaten: 'Kabupaten'
	});
	const principal = await insert('pegawai', {
		nama: 'Kepala QA',
		nip: 'QA-QR',
		jenis: 'kepala_sekolah'
	});
	const schoolId = await insert('sekolah', {
		nama: 'Sekolah QR QA',
		npsn: '77888001',
		jenjang_pendidikan: 'sma',
		alamat_id: address,
		kepala_sekolah_id: principal
	});
	const year = await insert('tahun_ajaran', {
		sekolah_id: schoolId,
		nama: '2026/2027',
		is_aktif: 1
	});
	const before = await insert('semester', {
		tahun_ajaran_id: year,
		nama: 'Ganjil',
		tipe: 'ganjil',
		is_aktif: 0
	});
	const semesterId = await insert('semester', {
		tahun_ajaran_id: year,
		nama: 'Genap',
		tipe: 'genap',
		is_aktif: 1
	});
	const classA = await insert('kelas', {
		sekolah_id: schoolId,
		semester_id: semesterId,
		tahun_ajaran_id: year,
		nama: '1.1 QA',
		fase: 'Fase E',
		wali_kelas_id: principal
	});
	const otherTeacher = await insert('pegawai', {
		nama: 'Guru B QR QA',
		nip: 'QA-QR-B',
		jenis: 'guru',
		sekolah_id: schoolId,
		status: 'aktif'
	});
	const classB = await insert('kelas', {
		sekolah_id: schoolId,
		semester_id: semesterId,
		tahun_ajaran_id: year,
		nama: '1.2 QA',
		fase: 'Fase E',
		wali_kelas_id: otherTeacher
	});
	const uid = randomUUID();
	const makeStudent = async (semester, nis, name, identity = randomUUID(), kelas = null) => {
		const id = await insert('murid', {
			sekolah_id: schoolId,
			semester_id: semester,
			kelas_id: kelas,
			nis,
			nisn: '',
			nama: name,
			tanggal_lahir: '2015-01-01',
			jenis_kelamin: 'L',
			alamat_id: address,
			tanggal_masuk: '2026-01-01'
		});
		await insert('murid_identity_link', {
			sekolah_id: schoolId,
			semester_id: semester,
			murid_id: id,
			identity_uid: identity
		});
		return id;
	};
	const oldId = await makeStudent(before, 'QR001', 'Anak Tetap QR', uid);
	const currentId = await makeStudent(semesterId, 'QR001', 'Anak Tetap QR', uid, classA);
	const otherId = await makeStudent(semesterId, 'QR002', 'Anak Lain QR', randomUUID(), classB);
	const issuedAt = '2026-01-01T00:00:00.000Z';
	const original = tokens.createPreviewableQrToken({ muridId: oldId, tokenVersion: 2, issuedAt });
	const originalQrId = await insert('qr_murid', {
		murid_id: oldId,
		token_hash: tokens.hashQrToken(original),
		token_version: 2,
		issued_at: issuedAt
	});
	const adminId = Number((await get("SELECT id FROM auth_user WHERE type='admin' LIMIT 1"))[0].id);
	const locals = {
		user: {
			id: adminId,
			type: 'admin',
			roles: ['admin'],
			permissions: [],
			username: 'QA',
			sekolahId: schoolId
		},
		sekolah: { id: schoolId, nama: 'Sekolah QR QA' }
	};
	const context = { schoolId, semesterId, qrManage: true };
	const scan = await vite.ssrLoadModule('/src/routes/api/administrasi/absensi/scan/+server.ts');
	let scanOptions = {};
	const runScan = async (token = original, actor = locals, extra = {}) =>
		scan.POST({
			locals: actor,
			request: new Request('http://localhost/api/administrasi/absensi/scan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, ...scanOptions, ...extra })
			})
		});
	const firstScan = await runScan();
	assert.equal(firstScan.status, 200, await firstScan.clone().text());
	assert.equal((await firstScan.json()).murid.id, currentId);
	assert.equal(
		(
			await get('SELECT murid_id,kelas_id,semester_id FROM absensi_harian WHERE murid_id=?', [
				currentId
			])
		)[0].kelas_id,
		classA
	);
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	assert.equal(
		(await qr.loadPersonalQrMap(schoolId, [currentId])).get(currentId).muridId,
		oldId,
		'HMAC seed stays at issuance row'
	);
	assert.equal((await runScan()).status, 200);
	const snapshotHistory = await get('SELECT * FROM murid WHERE id=?', [oldId]);
	await exec('UPDATE murid SET kelas_id=? WHERE id=?', [classB, currentId]);
	await assert.rejects(
		() => runScan(),
		(e) => e.status === 409
	);
	const activity = await insert('kegiatan_absensi', {
		sekolah_id: schoolId,
		nama: 'Kegiatan QR QA',
		kode: 'qa_qr',
		kategori: 'asrama',
		akses_edit: 'asrama',
		aktif: 1
	});
	scanOptions = { mode: 'kegiatan', kegiatanId: activity };
	const nextScan = await runScan();
	assert.equal(nextScan.status, 200);
	assert.equal((await nextScan.json()).murid.id, currentId);
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	const dorm = await insert('asrama', {
		sekolah_id: schoolId,
		nama: 'Asrama QR',
		nama_key: 'asrama qr',
		kategori: 'putra',
		aktif: 1
	});
	const roomA = await insert('asrama_kamar', {
		sekolah_id: schoolId,
		asrama_id: dorm,
		nama: 'Kamar A',
		nama_key: 'kamar a',
		kapasitas: 10,
		aktif: 1
	});
	const roomB = await insert('asrama_kamar', {
		sekolah_id: schoolId,
		asrama_id: dorm,
		nama: 'Kamar B',
		nama_key: 'kamar b',
		kapasitas: 10,
		aktif: 1
	});
	const placement = await insert('asrama_penempatan', {
		sekolah_id: schoolId,
		kamar_id: roomA,
		identity_uid: uid,
		murid_id: currentId,
		mulai: '2026-01-01',
		nama_snapshot: 'Anak Tetap QR',
		kelas_snapshot: '1.2 QA'
	});
	await exec('UPDATE asrama_penempatan SET selesai=? WHERE id=?', ['2026-11-01', placement]);
	await insert('asrama_penempatan', {
		sekolah_id: schoolId,
		kamar_id: roomB,
		identity_uid: uid,
		murid_id: currentId,
		mulai: '2026-11-01',
		nama_snapshot: 'Anak Tetap QR',
		kelas_snapshot: '1.2 QA'
	});
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	// Actual card print loader uses current identity but the same QR image.
	const print = await vite.ssrLoadModule('/src/routes/cetak/kartu-absensi/preview-data.ts');
	const printed = await print.getKartuAbsensiPreviewPayload({
		locals,
		url: new URL(`http://localhost/cetak/kartu-absensi?murid_id=${currentId}&kelas_id=${classB}`)
	});
	assert.equal(
		printed.kartuAbsensiData.qrDataUrl,
		await QRCode.toDataURL(original, { margin: 1, width: 480 })
	);
	assert.equal(printed.kartuAbsensiData.murid.id, currentId);
	assert.match(printed.kartuAbsensiData.kelas.nama, /1.2/);
	const manager = await vite.ssrLoadModule('/src/routes/api/absensi/kartu-qr/+server.ts');
	const manage = async (action = 'generate-missing', ids = [currentId]) =>
		manager.POST({
			locals,
			request: new Request('http://localhost/api/absensi/kartu-qr', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, muridIds: ids })
			})
		});
	assert.equal((await (await manage()).json()).generated, 0);
	const stable = await db.transaction((tx) => qr.issuePersonalQr(schoolId, currentId, false, tx));
	assert.equal(stable.token, original);
	assert.equal(stable.created, false);
	const concurrent = await Promise.allSettled([
		manage('generate-missing', [otherId]),
		manage('generate-missing', [otherId])
	]);
	for (const result of concurrent)
		if (result.status === 'rejected') assert.equal(result.reason.status, 409);
	const generatedResults = await Promise.all(
		concurrent
			.filter((result) => result.status === 'fulfilled')
			.map((result) => result.value.json())
	);
	assert.equal(
		generatedResults.reduce((n, result) => n + result.generated, 0),
		1
	);
	assert.equal((await (await manage('generate-missing', [otherId])).json()).generated, 0);
	// Remove this synthetic second-child card before the unrelated-identity check below.
	await exec('DELETE FROM qr_murid WHERE murid_id=?', [otherId]);
	const teacher = {
		...locals,
		user: {
			id: adminId,
			type: 'user',
			roles: ['user'],
			permissions: [],
			sekolahId: schoolId,
			pegawaiId: principal
		}
	};
	assert.equal(
		(await runScan(original, teacher)).status,
		403,
		'Previous class assignment cannot follow the child into another class'
	);
	const { ensureAbsenceMonitoringSchema } = await vite.ssrLoadModule(
		'/src/lib/server/db/ensure-absence-monitoring.ts'
	);
	await ensureAbsenceMonitoringSchema();
	const { todayLocalDate } = await vite.ssrLoadModule('/src/lib/server/absensi-digital.ts');
	const today = todayLocalDate(),
		tomorrow = todayLocalDate(new Date(Date.now() + 86400000));
	const permit = await insert('izin_pulang_murid', {
		sekolah_id: schoolId,
		tahun_ajaran_id: year,
		semester_id: semesterId,
		kelas_id: classB,
		murid_id: currentId,
		nis_snapshot: 'QR001',
		nama_snapshot: 'Anak Tetap QR',
		kelas_snapshot: '1.2 QA',
		tanggal_keluar: today,
		waktu_keluar: '00:00',
		rencana_kembali: tomorrow,
		status: 'sedang_izin',
		alasan: 'QA QR travel',
		penjemput_nama: 'Orang Tua QA',
		penjemput_hubungan: 'Ibu',
		petugas_keluar_user_id: adminId
	});
	const travel = await vite.ssrLoadModule(
		'/src/routes/api/administrasi/absensi/scan/perjalanan/+server.ts'
	);
	const travelResponse = await travel.POST({
		locals,
		request: new Request('http://localhost/api/administrasi/absensi/scan/perjalanan', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: original, operation: 'pulang_ke_rumah' })
		})
	});
	const verification = (await travelResponse.json()).verification;
	assert.equal(verification.murid.id, currentId);
	assert.equal(verification.id, permit);
	// The verification-only request never confirms departure or interferes with attendance.
	await exec('DELETE FROM izin_pulang_murid WHERE id=?', [permit]);

	assert.equal(
		(await get('SELECT COUNT(*) AS n FROM qr_murid WHERE murid_id IN (?,?)', [oldId, currentId]))[0]
			.n,
		1
	);
	await exec('UPDATE qr_murid SET token_value=? WHERE id=?', ['corrupted-cache', originalQrId]);
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	// Stored exact value survives secret changes.
	const oldSecret = process.env.RAPKUMER_QR_SECRET;
	process.env.RAPKUMER_QR_SECRET = 'qa-changed-secret';
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	if (oldSecret === undefined) delete process.env.RAPKUMER_QR_SECRET;
	else process.env.RAPKUMER_QR_SECRET = oldSecret;
	const exported = await exchange.exportStudentExchange(context);
	const row = exported.records.find((r) => r['UID Kaganga'] === uid);
	assert.equal(row['Kode QR Murid'], original);
	const xlsx = await exchange.studentExchangeWorkbook([row], 'QR backup QA');
	const book = new ExcelJS.Workbook();
	await book.xlsx.load(xlsx);
	assert.equal(book.worksheets[0].columnCount, 67);
	const csv = exchange.studentExchangeCsv([row]);
	const parse = (records) =>
		exchange.readStudentExchange(new File([exchange.studentExchangeCsv(records)], 'qa.csv'));
	const parsed = await parse([row]);
	assert.equal(parsed.rows[0].fields['Kode QR Murid'], original);
	const excelParsed = await exchange.readStudentExchange(new File([xlsx], 'qa.xlsx'));
	assert.equal(excelParsed.rows[0].fields['Kode QR Murid'], original);
	const preview = (records) =>
		parse(records).then((parsed) => exchange.previewStudentExchange(parsed, context));
	let plan = await exchange.previewStudentExchange(parsed, context);
	assert.equal(plan.rows[0].action, 'update', plan.rows[0].message);
	await exchange.commitStudentExchange(parsed, context, plan.token, [2], { locals });
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	assert(
		!(
			await get('SELECT fields FROM murid_sumber_setara WHERE identity_uid=?', [uid])
		)[0].fields.includes('Kode QR Murid')
	);
	const blank = await parse([{ ...row, 'Kode QR Murid': '' }]);
	plan = await exchange.previewStudentExchange(blank, context);
	await exchange.commitStudentExchange(blank, context, plan.token, [2], { locals });
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	assert.equal(
		(await preview([{ ...row, 'Kode QR Murid': tokens.createQrToken() }])).rows[0].action,
		'blocked'
	);
	assert(
		(
			await preview([
				row,
				{ ...row, NIS: 'QRNEW', 'UID Kaganga': randomUUID(), 'Nama Peserta Didik': 'QR Ganda' }
			])
		).rows.every((r) => r.action === 'blocked')
	);
	assert.equal(
		(
			await preview([
				{ ...row, NIS: 'QRNEW', 'UID Kaganga': randomUUID(), 'Nama Peserta Didik': 'Pencuri QR' }
			])
		).rows[0].action,
		'blocked'
	);
	const denied = await exchange.previewStudentExchange(parsed, { ...context, qrManage: false });
	assert.equal(denied.rows[0].action, 'blocked');
	assert.equal(
		(await exchange.exportStudentExchange({ ...context, qrManage: false })).records[0][
			'Kode QR Murid'
		],
		''
	);
	const foreign = await insert('sekolah', {
		nama: 'Sekolah Lain QR QA',
		npsn: '77888002',
		alamat_id: address,
		kepala_sekolah_id: principal
	});
	const foreignYear = await insert('tahun_ajaran', {
		sekolah_id: foreign,
		nama: '2026/2027',
		is_aktif: 1
	});
	const foreignSemester = await insert('semester', {
		tahun_ajaran_id: foreignYear,
		nama: 'Genap',
		tipe: 'genap',
		is_aktif: 1
	});
	const foreignStudent = await insert('murid', {
		sekolah_id: foreign,
		semester_id: foreignSemester,
		nis: 'QR001',
		nama: 'Anak Tetap QR',
		tanggal_lahir: '2015-01-01',
		alamat_id: address
	});
	const foreignUid = randomUUID();
	await insert('murid_identity_link', {
		sekolah_id: foreign,
		semester_id: foreignSemester,
		murid_id: foreignStudent,
		identity_uid: foreignUid
	});
	const foreignToken = tokens.createQrToken();
	await insert('qr_murid', {
		murid_id: foreignStudent,
		token_hash: tokens.hashQrToken(foreignToken),
		issued_at: issuedAt
	});
	assert.equal((await runScan(foreignToken)).status, 404);
	assert.equal(
		(await preview([{ ...row, 'Kode QR Murid': foreignToken }])).rows[0].action,
		'blocked'
	);
	assert.equal(
		(
			await preview([
				{
					...row,
					NIS: 'QRNEW',
					'UID Kaganga': foreignUid,
					'Nama Peserta Didik': 'UID asing',
					'Kode QR Murid': ''
				}
			])
		).rows[0].action,
		'blocked'
	);
	// QR backup can be restored to a new database identity without reissuing its token.
	const restoreUid = randomUUID(),
		restoreToken = tokens.createPreviewableQrToken({ muridId: 999999, tokenVersion: 37, issuedAt });
	const restoreRow = {
		...row,
		NIS: 'QRRESTORE',
		'UID Kaganga': restoreUid,
		'Nama Peserta Didik': 'Anak Cadangan QR',
		'Kode QR Murid': restoreToken
	};
	const restoreParsed = await parse([restoreRow]);
	plan = await exchange.previewStudentExchange(restoreParsed, context);
	assert.equal(plan.rows[0].action, 'new', plan.rows[0].message);
	await exchange.commitStudentExchange(restoreParsed, context, plan.token, [2], { locals });
	const restored = Number(
		(await get('SELECT murid_id FROM murid_identity_link WHERE identity_uid=?', [restoreUid]))[0]
			.murid_id
	);
	assert.equal((await qr.loadActivePrintableQr(restored)).token, restoreToken);
	assert.equal((await get('SELECT kelas_id FROM murid WHERE id=?', [restored]))[0].kelas_id, null);
	// Passive keeps the code; existing attendance placement guard still applies.
	await exec('UPDATE murid SET kelas_id=NULL WHERE id=?', [currentId]);
	assert.equal((await runScan()).status, 409);
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, original);
	await exec('UPDATE murid SET kelas_id=? WHERE id=?', [classB, currentId]);
	const { syncMuridGovernance } = await vite.ssrLoadModule('/src/lib/server/murid-lifecycle.ts');
	await syncMuridGovernance(schoolId, [currentId]);
	for (const status of ['pindah', 'keluar', 'alumni']) {
		await exec('UPDATE murid_lifecycle SET status=? WHERE sekolah_id=? AND identity_key=?', [
			status,
			schoolId,
			'uid:' + uid
		]);
		assert.equal((await runScan()).status, 403, status);
	}
	await exec("UPDATE murid_lifecycle SET status='aktif' WHERE sekolah_id=? AND identity_key=?", [
		schoolId,
		'uid:' + uid
	]);
	// Unrelated child with the same display name cannot inherit a QR.
	await exec('UPDATE murid SET nama=? WHERE id=?', ['Anak Tetap QR', otherId]);
	assert.equal((await qr.loadActivePrintableQr(otherId)).status, 'missing');
	await exec('UPDATE murid SET nama=? WHERE id=?', ['Anak Lain QR', otherId]);
	// Opaque historical cards are recoverable after authorized scanning.
	const opaque = tokens.createQrToken();
	await exec('UPDATE qr_murid SET token_hash=?,token_value=NULL WHERE id=?', [
		tokens.hashQrToken(opaque),
		originalQrId
	]);
	assert.equal((await qr.loadActivePrintableQr(currentId)).status, 'not_printable');
	assert.equal((await runScan(opaque)).status, 200);
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, opaque);
	// Multiple active cards and inconsistent UID links require review.
	const conflicting = await insert('qr_murid', {
		murid_id: currentId,
		token_hash: tokens.hashQrToken(tokens.createQrToken()),
		issued_at: issuedAt
	});
	assert.equal((await qr.loadActivePrintableQr(currentId)).status, 'not_printable');
	await assert.rejects(
		() => runScan(opaque),
		(e) => e.status === 409
	);
	await assert.rejects(
		() => manage(),
		(e) => e.status === 409
	);
	await exec('UPDATE murid SET nama=? WHERE id=?', ['Identitas Rusak', oldId]);
	await assert.rejects(
		() => qr.loadActivePrintableQr(currentId),
		(e) => e.status === 409
	);
	await exec('UPDATE murid SET nama=? WHERE id=?', ['Anak Tetap QR', oldId]);
	const beforeRotation = await parse([{ ...row, 'Kode QR Murid': opaque }]);
	const stale = await exchange.previewStudentExchange(beforeRotation, context);
	const replacement = await db.transaction((tx) =>
		qr.issuePersonalQr(schoolId, currentId, true, tx)
	);
	assert.notEqual(replacement.token, opaque);
	assert.equal(
		(await get('SELECT revoked_at FROM qr_murid WHERE id=?', [conflicting]))[0].revoked_at !== null,
		true
	);
	assert.equal((await runScan(opaque)).status, 410);
	assert.equal((await qr.loadActivePrintableQr(currentId)).token, replacement.token);
	assert.equal((await preview([{ ...row, 'Kode QR Murid': opaque }])).rows[0].action, 'blocked');
	await assert.rejects(
		() => exchange.commitStudentExchange(beforeRotation, context, stale.token, [2], { locals }),
		/pratinjau ulang/
	);
	// Transaction rollback does not leave a new pupil or QR behind.
	const rollback = {
		...restoreRow,
		NIS: 'QRROLLBACK',
		'UID Kaganga': randomUUID(),
		'Nama Peserta Didik': 'Rollback QR',
		'Kode QR Murid': tokens.createQrToken()
	};
	const rollbackParsed = await parse([rollback]);
	plan = await exchange.previewStudentExchange(rollbackParsed, context);
	await exec(
		"CREATE TRIGGER qa_fail_qr BEFORE INSERT ON qr_murid BEGIN SELECT RAISE(ABORT,'qa rollback QR'); END"
	);
	await assert.rejects(
		() => exchange.commitStudentExchange(rollbackParsed, context, plan.token, [2], { locals }),
		(error) => String(error.cause?.message).includes('qa rollback QR')
	);
	await exec('DROP TRIGGER qa_fail_qr');
	assert.equal((await get('SELECT id FROM murid WHERE nis=?', ['QRROLLBACK'])).length, 0);
	assert.deepEqual(await get('SELECT * FROM murid WHERE id=?', [oldId]), snapshotHistory);
	await writeFile(path.join(directory, 'qr-backup.csv'), csv);
	await writeFile(path.join(directory, 'qr-backup.xlsx'), xlsx);
	console.log(
		'PASS: original QR across semesters, current class and dorm, actual scan and print, no implicit rotation, secret change, passive/archive guards, exact CSV/XLSX restore, conflict/RBAC/revocation/stale/rollback checks. Synthetic writes only; live database untouched.'
	);
} finally {
	connection?.default.$client.close();
	client.close();
	await vite.close();
}
