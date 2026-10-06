import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import ExcelJS from 'exceljs';

const HEADERS = [
	'Nama',
	'NIPD',
	'NISN',
	'Rombel',
	'JK',
	'Tempat Lahir',
	'Tanggal Lahir',
	'Agama',
	'Alamat',
	'Kelurahan',
	'Kecamatan',
	'Kabupaten/Kota',
	'Kode Pos',
	'Sekolah Asal',
	'No HP',
	'Kontak Orang Tua',
	'Nama Ayah',
	'Pekerjaan Ayah',
	'Kontak Ayah',
	'Nama Ibu',
	'Pekerjaan Ibu',
	'Kontak Ibu',
	'Nama Wali',
	'Pekerjaan Wali',
	'Kontak Wali',
	'Wali Asrama',
	'NIP Wali Asrama',
	'Wali Asuh',
	'NIP Wali Asuh'
] as const;

const EXAMPLE_ROWS = [
	[
		'ABRILLIA',
		'12345',
		'0012345678',
		'X-1',
		'P',
		'Bengkulu',
		'2010-07-10',
		'Islam',
		'Jl. Salak GG Damai',
		'Timur Indah',
		'Singaran Pati',
		'Kota Bengkulu',
		'38229',
		'SMP Contoh',
		'081234567890',
		'081234567891',
		'Weliansyah',
		'Buruh Harian Lepas',
		'081234567891',
		'Siti Aminah',
		'Ibu Rumah Tangga',
		'081234567892',
		'',
		'',
		'',
		'Joti Mahulfa, S.Sos',
		'198604142025212057',
		'Hertika',
		'123456789'
	],
	[
		'BUDI SETIAWAN',
		'12346',
		'0012345679',
		'X-1',
		'L',
		'Bengkulu',
		'2010-11-02',
		'Islam',
		'Jl. Raden Fatah',
		'Sumur Dewa',
		'Selebar',
		'Kota Bengkulu',
		'38211',
		'SMP Contoh',
		'081234567893',
		'081234567894',
		'Rahmat',
		'Wiraswasta',
		'081234567894',
		'Dewi',
		'Ibu Rumah Tangga',
		'081234567895',
		'',
		'',
		'',
		'Joti Mahulfa, S.Sos',
		'198604142025212057',
		'Hertika',
		'123456789'
	]
] as const;

function asColumnLetter(index: number) {
	let current = index;
	let letter = '';
	while (current > 0) {
		const remainder = (current - 1) % 26;
		letter = String.fromCharCode(65 + remainder) + letter;
		current = Math.floor((current - 1) / 26);
	}
	return letter;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const workbook: any = new ExcelJS.Workbook();

	// Tipe ExcelJS di workspace ini tidak memuat semua method runtime.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const worksheet: any = workbook.addWorksheet('Template Siswa Kelas');
	worksheet.views = [{ state: 'frozen', ySplit: 1 }];

	worksheet.addRow([...HEADERS]);
	for (const row of EXAMPLE_ROWS) {
		worksheet.addRow([...row]);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	worksheet.getRow(1).eachCell((cell: any) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3D5E' } };
		cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
		cell.border = {
			top: { style: 'thin' },
			left: { style: 'thin' },
			bottom: { style: 'thin' },
			right: { style: 'thin' }
		};
	});
	worksheet.getRow(1).height = 26;

	HEADERS.forEach((header, index) => {
		const column = worksheet.getColumn(index + 1);
		const exampleMax = EXAMPLE_ROWS.reduce(
			(max, row) => Math.max(max, String(row[index] ?? '').length),
			header.length
		);
		column.width = Math.min(Math.max(exampleMax + 3, 12), 26);
		column.alignment = { vertical: 'top', wrapText: true };
	});

	const dateColumn = HEADERS.indexOf('Tanggal Lahir') + 1;
	worksheet.getColumn(dateColumn).numFmt = 'yyyy-mm-dd';

	const jkColumn = asColumnLetter(HEADERS.indexOf('JK') + 1);
	worksheet.dataValidations.add(`${jkColumn}2:${jkColumn}500`, {
		type: 'list',
		allowBlank: false,
		formulae: ['"L,P"'],
		showErrorMessage: true,
		errorTitle: 'Jenis Kelamin tidak valid',
		error: 'Isi dengan L atau P.'
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const infoSheet: any = workbook.addWorksheet('Petunjuk');
	infoSheet.columns = [{ width: 34 }, { width: 90 }];
	infoSheet.addRows([
		['Kolom wajib', 'Nama, NIPD/NIS, dan Rombel wajib diisi. Rombel akan dibuat sebagai kelas.'],
		['Jenis kelamin', 'Isi L untuk laki-laki atau P untuk perempuan.'],
		['Tanggal lahir', 'Gunakan format yyyy-mm-dd, contoh 2010-07-10.'],
		[
			'Wali asrama/asuh',
			'Kolom ini akan masuk ke data murid dan dipakai untuk TTD rapor keasramaan.'
		],
		[
			'Catatan',
			'Baris contoh boleh dihapus sebelum import. Sheet yang dibaca adalah sheet pertama.'
		]
	]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	infoSheet.getRow(1).eachCell((cell: any) => {
		cell.font = { bold: true };
	});

	const buffer = await workbook.xlsx.writeBuffer();
	const body = new Uint8Array(buffer as ArrayBuffer);

	return new Response(body, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="template-import-siswa-kelas.xlsx"',
			'Content-Length': String(body.byteLength)
		}
	});
};
