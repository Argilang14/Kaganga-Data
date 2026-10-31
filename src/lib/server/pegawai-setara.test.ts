import assert from 'node:assert/strict';
import test from 'node:test';
const { parsePegawaiWorkbook, resolvePegawaiImportRows, buildPegawaiImportUpdatePayload } =
	(await import('./pegawai-excel' + '.ts')) as typeof import('./pegawai-excel');

const header = [
	'Nama Tendik',
	'NIP',
	'NIK',
	'NUPTK',
	'Jenis Kelamin',
	'Tanggal Lahir',
	'Jenis SDM',
	'No. HP',
	'Agama',
	'Tanggal SK',
	'NRG',
	'RT',
	'RW'
];
const record = [
	'Pegawai Uji',
	'0',
	'0012345678901234',
	'0',
	'Perempuan',
	'30-10-1990',
	'Wali Asuh',
	'081234567890',
	'Belum ditentukan',
	'01-01-1900',
	'0',
	'01',
	'02'
];
function csv(rows = [record], labels = header, delimiter = ';') {
	const quoted = (row: string[]) => row.map((v) => `"${v.replaceAll('"', '""')}"`).join(delimiter);
	return new File(['\ufeff' + [labels, ...rows].map(quoted).join('\r\n')], 'setara.csv');
}
test('CSV Setara mempertahankan digit identitas dan membaca placeholder/tanggal/peran', async () => {
	const parsed = await parsePegawaiWorkbook(csv());
	assert.equal(parsed.sourceFormat, 'setara-tendik');
	assert.equal(parsed.rows[0].values.nik, '0012345678901234');
	assert.equal(parsed.rows[0].values.nip, '-');
	assert.equal(parsed.rows[0].values.nuptk, null);
	assert.equal(parsed.rows[0].values.agama, null);
	assert.equal(parsed.rows[0].values.tanggalLahir, '1990-10-30');
	assert.equal(parsed.rows[0].values.tanggalSk, '1900-01-01');
	assert.equal(parsed.rows[0].warnings?.length, 1);
	assert.equal(parsed.rows[0].values.jenis, 'wali_asuh');
	assert.match(parsed.rows[0].values.catatan!, /RT: 01/);
	assert.deepEqual(parsed.rows[0].errors, []);
});
test('CSV guru koma, kutipan, teks multiline dan mapel dibaca tanpa konversi angka', async () => {
	const labels = header.map((v) =>
		v === 'Nama Tendik' ? 'Nama Guru' : v === 'Jenis SDM' ? 'Mata Pelajaran' : v
	);
	const row = [...record];
	row[0] = 'Guru, "Uji"\nContoh';
	row[1] = '001234567890123456';
	row[6] = 'Matematika';
	row[10] = '001234';
	const parsed = await parsePegawaiWorkbook(csv([row], labels, ','));
	assert.equal(parsed.rows[0].values.nama, row[0]);
	assert.equal(parsed.rows[0].values.nip, row[1]);
	assert.equal(parsed.rows[0].values.jenis, 'guru');
	assert.match(parsed.rows[0].values.catatan!, /NRG: 001234/);
	assert.match(parsed.rows[0].values.catatan!, /Mata pelajaran: Matematika/);
});
test('pemetaan seluruh jenis SDM dan nama tidak dikenal tidak ditebak', async () => {
	const jobs = {
		Bendahara: 'lainnya',
		'Cleaning Service': 'kebersihan',
		'Juru Masak': 'tim_dapur',
		'Operator Sekolah': 'operator',
		Satpam: 'keamanan',
		'Tata Usaha': 'tu',
		'Wali Asrama': 'wali_asrama',
		'Wali Asuh': 'wali_asuh'
	};
	for (const [job, jenis] of Object.entries(jobs)) {
		const row = [...record];
		row[6] = job;
		assert.equal((await parsePegawaiWorkbook(csv([row]))).rows[0].values.jenis, jenis);
	}
	const row = [...record];
	row[6] = 'Tamu';
	assert.match((await parsePegawaiWorkbook(csv([row]))).rows[0].errors.join(' '), /Jenis/);
});
test('format rusak, kolom ganda/hilang, UTF-8 salah dan batas ukuran ditolak', async () => {
	await assert.rejects(
		parsePegawaiWorkbook(new File(['Nama Tendik;NIP;NIK;Jenis SDM\n"rusak'], 'x.csv'))
	);
	await assert.rejects(parsePegawaiWorkbook(csv([record], [...header, 'NIK'])), /ganda/);
	await assert.rejects(
		parsePegawaiWorkbook(
			csv(
				[record],
				header.map((v) => (v === 'NIK' ? 'x' : v))
			)
		),
		/NIK/
	);
	await assert.rejects(parsePegawaiWorkbook(csv([[...record, 'kelebihan']])), /Jumlah kolom/);
	await assert.rejects(parsePegawaiWorkbook(new File([new Uint8Array([0xff])], 'x.csv')), /UTF-8/);
	await assert.rejects(
		parsePegawaiWorkbook(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.csv')),
		/5 MB/
	);
});
test('NIP/NIK salah dan identitas ganda ditolak; NIP kosong tidak dianggap duplikat', async () => {
	const second = [...record];
	second[2] = '0012345678901235';
	const parsed = await parsePegawaiWorkbook(csv([record, second]));
	assert.deepEqual(
		parsed.rows.map((r) => r.errors),
		[[], []]
	);
	second[2] = record[2];
	assert.match(
		(await parsePegawaiWorkbook(csv([record, second]))).rows[1].errors.join(' '),
		/sama dengan/
	);
	second[1] = '1.234E+17';
	second[2] = '0';
	assert.match((await parsePegawaiWorkbook(csv([second]))).rows[0].errors.join(' '), /18 digit/);
	assert.match((await parsePegawaiWorkbook(csv([second]))).rows[0].errors.join(' '), /16 digit/);
});
test('identitas bertentangan, nama sama tanpa identitas cocok dan target baris ganda diblokir', async () => {
	const parsed = await parsePegawaiWorkbook(csv());
	const old = {
		id: 1,
		nama: 'Pegawai Uji',
		kodePegawai: 'PGW-1',
		nip: '001234567890123456',
		nik: record[2]
	};
	assert.equal(resolvePegawaiImportRows(parsed, [old])[0].existingId, 1);
	assert.equal(
		resolvePegawaiImportRows(parsed, [{ ...old, nik: '0012345678909999' }])[0].action,
		'bermasalah'
	);
	parsed.rows[0].values.nip = '001234567890999999';
	assert.equal(resolvePegawaiImportRows(parsed, [old])[0].action, 'bermasalah');
	assert.equal(
		resolvePegawaiImportRows(parsed, [
			old,
			{ ...old, id: 2, nik: null, nip: parsed.rows[0].values.nip }
		])[0].action,
		'bermasalah'
	);
	assert.deepEqual(parsed.rows[0].errors, [], 'resolver tidak merusak sumber pratinjau');
});
test('pembaruan CSV mempertahankan klasifikasi, status dan isian kosong; catatan tidak berulang', async () => {
	const parsed = await parsePegawaiWorkbook(csv());
	const values = parsed.rows[0].values;
	const old = {
		nama: 'Nama Lama',
		nip: '001234567890123456',
		jenis: 'kepala_sekolah' as const,
		jabatan: 'Kepala Sekolah',
		status: 'nonaktif' as const,
		agama: 'Islam',
		catatan: 'Catatan sekolah'
	};
	const payload = buildPegawaiImportUpdatePayload(values, parsed.providedColumns, {
		setara: true,
		existing: old
	});
	for (const key of ['nip', 'jenis', 'jabatan', 'status', 'nama', 'agama'])
		assert.equal(key in payload, false);
	assert.match(payload.catatan!, /^Catatan sekolah/);
	const second = buildPegawaiImportUpdatePayload(values, parsed.providedColumns, {
		setara: true,
		existing: { ...old, ...payload }
	});
	assert.equal(second.catatan, payload.catatan);
	assert.equal(payload.telepon, record[7]);
});
