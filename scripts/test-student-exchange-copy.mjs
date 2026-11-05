import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import ExcelJS from 'exceljs';

await mkdir('tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('tmp/student-exchange-'));
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
	const { migrateUnassignedMurid } = await vite.ssrLoadModule(
		'/src/lib/server/db/murid-unassigned.ts'
	);
	await migrateUnassignedMurid(connection.default.$client);
	const exchange = await vite.ssrLoadModule('/src/lib/server/student-exchange.ts');
	const contract = await vite.ssrLoadModule('/src/lib/student-exchange.ts');
	await exchange.prepareStudentExchange();
	assert.equal(contract.setaraStudentHeaders.length, 52);
	assert.equal(contract.studentExchangeHeaders.length, 67);
	assert.equal(contract.exchangeDate('09-09-2015'), '2015-09-09');
	assert.equal(contract.exchangeDate('31-02-2015'), null);
	assert.equal(contract.exchangeGender('Perempuan'), 'P');
	assert.equal(contract.exchangeGender('Laki-laki'), 'L');
	const address = await insert('alamat', {
		jalan: 'Alamat uji',
		desa: 'Desa',
		kecamatan: 'Kecamatan',
		kabupaten: 'Kabupaten'
	});
	const principal = await insert('pegawai', {
		nama: 'Kepsek Uji',
		nip: 'QA-EXCHANGE',
		jenis: 'kepala_sekolah'
	});
	const schoolId = await insert('sekolah', {
		nama: 'Sekolah Uji Impor',
		npsn: '77777001',
		jenjang_pendidikan: 'sma',
		alamat_id: address,
		kepala_sekolah_id: principal
	});
	const year = await insert('tahun_ajaran', {
		sekolah_id: schoolId,
		nama: '2026/2027',
		is_aktif: 1
	});
	const semesterId = await insert('semester', {
		tahun_ajaran_id: year,
		nama: 'Ganjil',
		tipe: 'ganjil',
		is_aktif: 1
	});
	const context = { schoolId, semesterId, qrManage: true };
	const adminId = Number(
		(await client.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0].id
	);
	const actor = {
		locals: {
			user: { id: adminId, type: 'admin', username: 'QA Admin', permissions: [] },
			sekolah: { id: schoolId }
		}
	};
	assert.equal(exchange.requireStudentExchangeAccess(actor.locals), schoolId);
	assert.throws(
		() => exchange.requireStudentExchangeAccess({ ...actor.locals, user: null }),
		/masuk/
	);
	assert.throws(
		() =>
			exchange.requireStudentExchangeAccess({
				...actor.locals,
				user: { type: 'wali_kelas', permissions: [] }
			}),
		/izin/
	);
	const fields = {
		...Object.fromEntries(contract.setaraStudentHeaders.map((header) => [header, ''])),
		'Nama Peserta Didik': 'Siswa Uji, Impor',
		NIK: '0000000000000001',
		NISN: '0012345678',
		'No. KK': '0000000000000002',
		'Jenis Kelamin': 'Perempuan',
		'Tanggal Lahir': '09-09-2015',
		'Tempat Lahir': 'Kota Uji',
		Agama: 'Islam',
		'Anak Ke': '2',
		'Jumlah Saudara': '3',
		'NIK Ayah': '0000000000000003',
		'Nama Ayah': 'Ayah Uji',
		'Pekerjaan Ayah': 'Petani',
		'Keterangan Pekerjaan Ayah': 'Kebun; milik keluarga',
		'NIK Ibu Kandung': '0000000000000004',
		'Nama Ibu Kandung': 'Ibu Uji',
		'Pekerjaan Ibu': 'Pedagang',
		'Keterangan Pekerjaan Ibu': 'Usaha',
		'NIK Wali': '0000000000000005',
		'Nama Wali': 'Wali Uji',
		'Pekerjaan Wali': 'Guru',
		'Keterangan Pekerjaan Wali': 'Wali keluarga',
		'Alamat KK': 'Jl KK',
		'RT KK': '001',
		'RW KK': '002',
		'Kelurahan/Desa KK': 'Desa KK',
		'Kecamatan KK': 'Kec KK',
		'Kabupaten/Kota KK': 'Kab KK',
		'Provinsi KK': 'Prov KK',
		'Alamat Domisili': 'Jl Domisili\nNomor 7',
		'RT Domisili': '003',
		'RW Domisili': '004',
		'Kelurahan/Desa Domisili': 'Desa D',
		'Kecamatan Domisili': 'Kec D',
		'Kabupaten/Kota Domisili': 'Kab D',
		'Provinsi Domisili': 'Prov D',
		Latitude: '-3.8',
		Longitude: '102.2',
		Email: 'qa@example.invalid',
		Sekolah: 'Sekolah Uji Impor',
		'NPSN Sekolah': '77777001',
		'Jenjang Pendidikan': 'SMA',
		'Rombongan Belajar': 'X.3, XI.1.IPA, X.3',
		Desil: '3',
		Sembako: 'Ya',
		PKH: 'Tidak',
		PBI: 'Ya',
		PPSE: 'Tidak',
		YAPI: 'Tidak',
		Atensi: 'Ya',
		'Tanggal Dibuat': '01-01-2025',
		'Tanggal Diperbarui': '05-11-2026'
	};
	const csv = (records, delimiter = ';', headers = contract.studentExchangeHeaders) =>
		new File(
			[
				'\uFEFF' +
					[headers, ...records.map((row) => headers.map((header) => row[header] ?? ''))]
						.map((row) =>
							row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(delimiter)
						)
						.join('\r\n')
			],
			'siswa-uji.csv',
			{ type: 'text/csv' }
		);
	const parse = (records) => exchange.readStudentExchange(csv(records));
	const preview = async (records) => exchange.previewStudentExchange(await parse(records), context);
	const commit = (
		parsed,
		plan,
		rows = plan.rows.filter((row) => row.action !== 'blocked').map((row) => row.row)
	) => exchange.commitStudentExchange(parsed, context, plan.token, rows, actor);
	const get = async (sql, args = []) => (await client.execute({ sql, args })).rows;
	const parsed = await parse([fields]);
	assert.equal(parsed.rows[0].fields.NISN, '0012345678');
	assert.equal(parsed.rows[0].fields['Alamat Domisili'], fields['Alamat Domisili']);
	assert.equal(
		(await exchange.readStudentExchange(csv([fields], ','))).rows[0].fields.NIK,
		fields.NIK
	);
	const first = await exchange.previewStudentExchange(parsed, context);
	assert.equal(first.rows[0].action, 'new', first.rows[0].message);
	assert.match(first.rows[0].nis, /^TMP-/);
	await assert.rejects(() => commit(parsed, first, [999]), /Pilihan/);
	await commit(parsed, first);
	const student = (
		await get('SELECT * FROM murid WHERE sekolah_id=? AND semester_id=?', [schoolId, semesterId])
	)[0];
	assert.equal(student.kelas_id, null);
	assert.equal(student.jenis_kelamin, 'P');
	assert.equal(student.tanggal_lahir, '2015-09-09');
	assert.equal(
		(await get('SELECT * FROM asrama_penempatan WHERE sekolah_id=?', [schoolId])).length,
		0
	);
	assert.equal(
		(await get('SELECT status FROM murid_lifecycle WHERE sekolah_id=?', [schoolId]))[0].status,
		'aktif'
	);
	assert.equal((await preview([fields])).rows[0].action, 'update');
	await assert.rejects(() => commit(parsed, first), /pratinjau ulang/);

	// Updating biodata must preserve every placement and operational record.
	const uid = (
		await get('SELECT identity_uid FROM murid_identity_link WHERE murid_id=?', [student.id])
	)[0].identity_uid;
	const kelas = await insert('kelas', {
		sekolah_id: schoolId,
		semester_id: semesterId,
		tahun_ajaran_id: year,
		nama: 'X QA',
		fase: 'Fase E',
		wali_kelas_id: principal
	});
	const dorm = await insert('asrama', {
		sekolah_id: schoolId,
		nama: 'Asrama Uji',
		nama_key: 'asrama uji',
		kategori: 'putri',
		aktif: 1
	});
	const room = await insert('asrama_kamar', {
		sekolah_id: schoolId,
		asrama_id: dorm,
		nama: 'Kamar Uji',
		nama_key: 'kamar uji',
		kapasitas: 10,
		aktif: 1
	});
	await insert('asrama_penempatan', {
		sekolah_id: schoolId,
		kamar_id: room,
		identity_uid: uid,
		murid_id: student.id,
		mulai: '2026-01-01',
		alasan: 'uji',
		nama_snapshot: student.nama,
		kelas_snapshot: 'X QA'
	});
	await client.execute({
		sql: 'UPDATE murid SET kelas_id=?, wali_asuh_nama=?, foto=?, qr_token=?, tanggal_masuk=? WHERE id=?',
		args: [kelas, 'Pengasuh Uji', 'foto-uji', 'qr-uji', '2025-01-01', student.id]
	});
	const { syncMuridGovernance } = await vite.ssrLoadModule('/src/lib/server/murid-lifecycle.ts');
	await syncMuridGovernance(schoolId, [Number(student.id)]);
	const subject = await insert('mata_pelajaran', {
		kelas_id: kelas,
		nama: 'Mapel Uji',
		jenis: 'wajib'
	});
	await insert('asesmen_sumatif', {
		murid_id: student.id,
		mata_pelajaran_id: subject,
		nilai_akhir: 87
	});
	const gradesBefore = await get('SELECT * FROM asesmen_sumatif WHERE murid_id=?', [student.id]);
	const historyBefore = await get('SELECT * FROM murid_riwayat_kelas WHERE murid_id=?', [
		student.id
	]);
	const dormBefore = await get('SELECT * FROM asrama_penempatan WHERE murid_id=?', [student.id]);
	const updateFields = {
		...fields,
		Agama: 'Kristen',
		'Nama Ayah': '-',
		'Rombongan Belajar': 'XI.2, XII.1',
		'Alamat Domisili': 'Alamat Baru'
	};
	const updateParsed = await parse([updateFields]);
	const updatePlan = await exchange.previewStudentExchange(updateParsed, context);
	assert.equal(updatePlan.rows[0].action, 'update', updatePlan.rows[0].message);
	await commit(updateParsed, updatePlan);
	const updated = (await get('SELECT * FROM murid WHERE id=?', [student.id]))[0];
	for (const key of [
		'kelas_id',
		'wali_asuh_nama',
		'foto',
		'qr_token',
		'tanggal_masuk',
		'ayah_id',
		'ibu_id',
		'wali_id'
	])
		assert.equal(
			updated[key],
			{
				...student,
				kelas_id: kelas,
				wali_asuh_nama: 'Pengasuh Uji',
				foto: 'foto-uji',
				qr_token: 'qr-uji',
				tanggal_masuk: '2025-01-01'
			}[key]
		);
	assert.equal(updated.agama, 'Kristen');
	assert.deepEqual(
		await get('SELECT * FROM murid_riwayat_kelas WHERE murid_id=?', [student.id]),
		historyBefore
	);
	assert.deepEqual(
		await get('SELECT * FROM asrama_penempatan WHERE murid_id=?', [student.id]),
		dormBefore
	);
	assert.deepEqual(
		await get('SELECT * FROM asesmen_sumatif WHERE murid_id=?', [student.id]),
		gradesBefore
	);
	const exported = await exchange.exportStudentExchange(context);
	assert.equal(exported.records.length, 1);
	assert.equal(exported.records[0]['Nama Ayah'], 'Ayah Uji');
	assert.equal(exported.records[0]['Kelas Aktif'], 'X QA');
	assert.equal(exported.records[0]['Asrama Aktif'], 'Kamar Uji');
	const expectedSetara = {
		...fields,
		...updateFields,
		'Nama Ayah': fields['Nama Ayah'],
		'Tanggal Lahir': '2015-09-09'
	};
	for (const header of contract.setaraStudentHeaders)
		assert.equal(exported.records[0][header], expectedSetara[header], `Roundtrip: ${header}`);

	const bookBytes = await exchange.studentExchangeWorkbook(exported.records, 'QA');
	await writeFile(path.join(directory, 'roundtrip.xlsx'), bookBytes);
	const book = new ExcelJS.Workbook();
	await book.xlsx.load(bookBytes);
	assert.deepEqual(book.worksheets[0].getRow(1).values.slice(1), contract.studentExchangeHeaders);
	assert.equal(book.worksheets[0].getCell('B2').value, fields.NIK);
	assert.equal(book.worksheets[0].getCell('B2').numFmt, '@');
	const roundtrip = await exchange.readStudentExchange(new File([bookBytes], 'roundtrip.xlsx'));
	const roundtripPlan = await exchange.previewStudentExchange(roundtrip, context);
	assert.equal(roundtripPlan.rows[0].action, 'update', roundtripPlan.rows[0].message);
	await commit(roundtrip, roundtripPlan);
	const official = { ...exported.records[0], NIS: 'NIS-RESMI-01' };
	const officialParsed = await parse([official]);
	const officialPlan = await exchange.previewStudentExchange(officialParsed, context);
	assert.equal(officialPlan.rows[0].action, 'update', officialPlan.rows[0].message);
	await commit(officialParsed, officialPlan);
	assert.equal((await exchange.exportStudentExchange(context)).records[0]['Jenis NIS'], 'Sekolah');
	assert.equal((await preview([fields])).rows[0].nis, 'NIS-RESMI-01');
	assert.equal((await get('SELECT COUNT(*) n FROM murid WHERE sekolah_id=?', [schoolId]))[0].n, 1);

	const noIds = {
		'Nama Peserta Didik': 'Tanpa Nomor Uji',
		'Tanggal Lahir': '2014-02-01',
		'Jenis Kelamin': 'L'
	};
	const noIdsParsed = await parse([noIds]);
	await commit(noIdsParsed, await exchange.previewStudentExchange(noIdsParsed, context));
	assert.equal((await preview([noIds])).rows[0].action, 'update');
	assert.equal((await preview([{ ...noIds, NISN: '0000000000' }])).rows[0].action, 'update');
	const duplicates = await preview([fields, { ...fields, 'Nama Peserta Didik': 'Anak Berbeda' }]);
	assert(duplicates.rows.every((row) => row.action === 'blocked'));
	assert((await preview([noIds, noIds])).rows.every((row) => row.action === 'blocked'));
	assert.equal(
		(await preview([{ ...fields, 'NPSN Sekolah': '99999999' }])).rows[0].action,
		'blocked'
	);
	await insert('sekolah_satuan_pendidikan', {
		sekolah_id: schoolId,
		nama: 'SD Uji',
		jenjang: 'sd',
		npsn: '77777002'
	});
	assert.equal(
		(await preview([{ ...fields, 'NPSN Sekolah': '77777002' }])).rows[0].action,
		'update'
	);
	const foreignUid = await preview([{ ...fields, 'UID Kaganga': 'uid-sekolah-lain' }]);
	assert.equal(foreignUid.rows[0].action, 'blocked');
	assert.equal(
		(await preview([{ ...fields, 'Tanggal Lahir': '31-02-2015' }])).rows[0].action,
		'blocked'
	);
	const fresh = {
		...fields,
		'Nama Peserta Didik': 'Siswa Kedua Uji',
		NIK: '0000000000000021',
		NISN: '0012345699'
	};
	const combinedParsed = await parse([fresh, { ...fields, NISN: 'invalid' }]);
	const combinedPlan = await exchange.previewStudentExchange(combinedParsed, context);
	assert.equal(combinedPlan.rows[0].action, 'new');
	assert.equal(combinedPlan.rows[1].action, 'blocked');
	await assert.rejects(
		() =>
			commit(
				combinedParsed,
				combinedPlan,
				combinedPlan.rows.map((row) => row.row)
			),
		/bermasalah/
	);
	assert.equal((await get('SELECT COUNT(*) n FROM murid WHERE sekolah_id=?', [schoolId]))[0].n, 2);
	await commit(combinedParsed, combinedPlan, [combinedPlan.rows[0].row]);
	await client.execute({
		sql: "UPDATE murid_lifecycle SET status='alumni' WHERE sekolah_id=? AND identity_key=?",
		args: [schoolId, `uid:${uid}`]
	});
	assert.equal((await preview([fields])).rows[0].action, 'blocked');
	const archivedExport = await exchange.exportStudentExchange(context);
	assert.equal(
		archivedExport.records.find((row) => row['UID Kaganga'] === uid)['Status Murid'],
		'alumni'
	);
	await assert.rejects(
		() => exchange.previewStudentExchange(parsed, { schoolId: schoolId + 99999, semesterId }),
		/Semester/
	);

	// Force a failure after writes and prove all student/source/audit mutations roll back.
	const rollbackFields = {
		...fresh,
		'Nama Peserta Didik': 'Rollback Uji',
		NIK: '0000000000000041',
		NISN: '0012345641'
	};
	const rollbackParsed = await parse([rollbackFields]);
	const rollbackPlan = await exchange.previewStudentExchange(rollbackParsed, context);
	await client.execute(
		`CREATE TRIGGER qa_exchange_rollback BEFORE INSERT ON audit_log WHEN NEW.entity_type='murid_setara' BEGIN SELECT RAISE(ABORT,'QA rollback'); END`
	);
	await assert.rejects(
		() => commit(rollbackParsed, rollbackPlan),
		(cause) => /QA rollback/.test(cause.cause?.message ?? '')
	);
	assert.equal((await get('SELECT COUNT(*) n FROM murid WHERE sekolah_id=?', [schoolId]))[0].n, 3);
	await client.execute('DROP TRIGGER qa_exchange_rollback');
	const legacyHeaders = ['Nama', 'NIPD', 'NISN', 'JK', 'Tanggal Lahir', 'Rombel'];
	const legacy = await exchange.readStudentExchange(
		csv(
			[
				{
					Nama: 'Siswa Format Lama',
					NIPD: '123',
					NISN: '',
					JK: 'P',
					'Tanggal Lahir': '2015-01-01',
					Rombel: 'X Baru'
				}
			],
			';',
			legacyHeaders
		)
	);
	assert.equal((await exchange.previewStudentExchange(legacy, context)).rows[0].action, 'new');

	// Operational CSV is parsed only; never committed to this database or the live school.
	const realPath = 'C:/Users/gurus/Downloads/peserta-didik_05-11-2026_112122.csv';
	try {
		const real = await exchange.readStudentExchange(
			new File([await readFile(realPath)], 'setara-operasional.csv')
		);
		assert.equal(real.rows.length, 141);
		assert.equal(Object.keys(real.rows[0].fields).length, 52);
		assert(real.rows.filter((row) => !row.fields.NISN).length >= 17);
		console.log('Operational CSV: parse-only passed (141 rows, 52 columns; no data saved).');
	} catch (cause) {
		if (cause.code !== 'ENOENT') throw cause;
	}
	await writeFile(
		path.join(directory, 'ui-preview.csv'),
		Buffer.from(await csv([fresh, { ...fresh, NISN: 'bad' }]).arrayBuffer())
	);
	console.log(
		'PASS: student exchange, identity conflicts, RBAC, passive placement, idempotence, unchanged placements/history, full workbook roundtrip, source retention, stale preview, selection, archive protection, and rollback.'
	);
} finally {
	connection?.default.$client.close();
	client.close();
	await vite.close();
}
