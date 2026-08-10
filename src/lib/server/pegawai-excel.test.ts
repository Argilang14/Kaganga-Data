import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';

const {
	buildPegawaiImportUpdatePayload,
	configurePegawaiSheet,
	parsePegawaiWorkbook,
	resolvePegawaiImportRows
} = (await import('./pegawai-excel' + '.ts')) as typeof import('./pegawai-excel');

async function workbookFile(workbook: any, name = 'pegawai.xlsx') {
	const buffer = await workbook.xlsx.writeBuffer();
	return new File([buffer], name, {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
}

test('template lengkap dapat dibaca kembali tanpa kehilangan nomor identitas', async () => {
	const workbook: any = new ExcelJS.Workbook();
	const sheet: any = workbook.addWorksheet('Pegawai');
	configurePegawaiSheet(sheet);
	sheet.addRow({
		nama: 'Guru Contoh',
		nip: '001234567890',
		nik: '0017010101010001',
		jenis: 'guru',
		status: 'aktif',
		jenisKelamin: 'perempuan',
		tanggalLahir: '1990-08-17',
		email: 'guru@example.test',
		telepon: '081234567890'
	});

	const parsed = await parsePegawaiWorkbook(await workbookFile(workbook));
	assert.equal(parsed.legacyFormat, false);
	assert.equal(parsed.rows.length, 1);
	assert.equal(parsed.rows[0]?.values.nip, '001234567890');
	assert.equal(parsed.rows[0]?.values.nik, '0017010101010001');
	assert.equal(parsed.rows[0]?.values.tanggalLahir, '1990-08-17');
	assert.deepEqual(parsed.rows[0]?.errors, []);
	const headers = (sheet.getRow(1).values as unknown[]).map(String);
	assert.equal(headers.includes('Kode Pegawai'), false);
	assert.equal(headers.includes('Nomor Induk PPPK'), false);
});

test('template delapan kolom lama tetap dikenali tanpa mengada-adakan kolom baru', async () => {
	const workbook: any = new ExcelJS.Workbook();
	const sheet: any = workbook.addWorksheet('Pegawai');
	sheet.columns = [
		{ header: 'Nama', key: 'nama' },
		{ header: 'NIP', key: 'nip' },
		{ header: 'Jenis', key: 'jenis' },
		{ header: 'Jabatan', key: 'jabatan' },
		{ header: 'Status', key: 'status' },
		{ header: 'Telepon', key: 'telepon' },
		{ header: 'Email', key: 'email' },
		{ header: 'Catatan', key: 'catatan' }
	];
	sheet.addRow({ nama: 'Guru Lama', nip: '-', jenis: 'guru', status: 'aktif' });

	const parsed = await parsePegawaiWorkbook(await workbookFile(workbook, 'pegawai-lama.xlsx'));
	assert.equal(parsed.legacyFormat, true);
	assert.equal(parsed.providedColumns.size, 8);
	assert.equal(parsed.providedColumns.has('nik'), false);
	assert.deepEqual(parsed.rows[0]?.errors, []);
});

test('duplikasi identitas dan tanggal tidak valid ditandai sebelum import', async () => {
	const workbook: any = new ExcelJS.Workbook();
	const sheet: any = workbook.addWorksheet('Pegawai');
	configurePegawaiSheet(sheet);
	sheet.addRow({ nama: 'Pegawai Satu', nip: '123', jenis: 'guru', status: 'aktif' });
	sheet.addRow({
		nama: 'Pegawai Dua',
		nip: '123',
		jenis: 'guru',
		status: 'aktif',
		tanggalLahir: '31-31-2020'
	});

	const parsed = await parsePegawaiWorkbook(await workbookFile(workbook));
	assert.equal(parsed.rows.length, 2);
	assert.match(parsed.rows[1]?.errors.join(' ') ?? '', /sama dengan baris 2/);
	assert.match(parsed.rows[1]?.errors.join(' ') ?? '', /tanggalLahir/);
});

test('pencocokan import tidak mencampur dua pegawai dan format lama tidak menghapus biodata baru', async () => {
	const workbook: any = new ExcelJS.Workbook();
	const sheet: any = workbook.addWorksheet('Pegawai');
	sheet.columns = [
		{ header: 'Nama', key: 'nama' },
		{ header: 'NIP', key: 'nip' },
		{ header: 'Jenis', key: 'jenis' },
		{ header: 'Jabatan', key: 'jabatan' },
		{ header: 'Status', key: 'status' },
		{ header: 'Telepon', key: 'telepon' },
		{ header: 'Email', key: 'email' },
		{ header: 'Catatan', key: 'catatan' }
	];
	sheet.addRow({ nama: 'Guru Diperbarui', nip: '111', jenis: 'guru', status: 'aktif' });
	const parsed = await parsePegawaiWorkbook(await workbookFile(workbook, 'pegawai-lama.xlsx'));
	const resolved = resolvePegawaiImportRows(parsed, [
		{ id: 1, kodePegawai: 'PGW-1', nip: '111', nik: '999' },
		{ id: 2, kodePegawai: 'PGW-2', nip: '222', nik: '888' }
	]);
	assert.equal(resolved[0]?.existingId, 1);
	assert.equal(resolved[0]?.action, 'perbarui');

	const payload = buildPegawaiImportUpdatePayload(parsed.rows[0]!.values, parsed.providedColumns);
	assert.equal(payload.nama, 'Guru Diperbarui');
	assert.equal('nik' in payload, false);
	assert.equal('statusKepegawaian' in payload, false);

	parsed.rows[0]!.values.kodePegawai = 'PGW-2';
	const conflict = resolvePegawaiImportRows(parsed, [
		{ id: 1, kodePegawai: 'PGW-1', nip: '111', nik: '999' },
		{ id: 2, kodePegawai: 'PGW-2', nip: '222', nik: '888' }
	]);
	assert.equal(conflict[0]?.action, 'bermasalah');
	assert.match(conflict[0]?.row.errors.join(' ') ?? '', /pegawai lama yang berbeda/);
});

test('format lama tetap terbaca tetapi identitas internal tidak ikut diperbarui', async () => {
	const workbook: any = new ExcelJS.Workbook();
	const sheet: any = workbook.addWorksheet('Pegawai');
	sheet.columns = [
		{ header: 'Kode Pegawai', key: 'kodePegawai' },
		{ header: 'Nama', key: 'nama' },
		{ header: 'NIP', key: 'nip' },
		{ header: 'NIK', key: 'nik' },
		{ header: 'Nomor Induk PPPK', key: 'nomorIndukPppk' },
		{ header: 'Jenis', key: 'jenis' },
		{ header: 'Status', key: 'status' }
	];
	sheet.addRow({
		kodePegawai: 'PGW-LAMA',
		nama: 'Guru Lama',
		nip: '123',
		nik: '456',
		nomorIndukPppk: 'PPPK-LAMA',
		jenis: 'guru',
		status: 'aktif'
	});

	const parsed = await parsePegawaiWorkbook(await workbookFile(workbook, 'pegawai-lama.xlsx'));
	const payload = buildPegawaiImportUpdatePayload(parsed.rows[0]!.values, parsed.providedColumns);
	assert.equal(parsed.legacyFormat, true);
	assert.equal(parsed.rows[0]?.values.kodePegawai, 'PGW-LAMA');
	assert.equal('kodePegawai' in payload, false);
	assert.equal('nomorIndukPppk' in payload, false);
});
