import ExcelJS from 'exceljs';

export type JadwalMapelExcelRow = {
	kode: string;
	nama: string;
	jenjang: string;
	fase: string | null;
	kategori: string;
	guruPegawaiId: number | null;
	jpPerMinggu: number;
	warna: string | null;
	aktif: boolean;
	catatan: string | null;
};

export type JadwalMapelGuruReference = {
	id: number;
	nama: string;
	nip: string;
};

const MAPEL_COLUMNS = [
	{ header: 'Kode', key: 'kode', width: 16 },
	{ header: 'Nama Mata Pelajaran', key: 'nama', width: 30 },
	{ header: 'Jenjang', key: 'jenjang', width: 18 },
	{ header: 'Fase', key: 'fase', width: 16 },
	{ header: 'Kategori', key: 'kategori', width: 20 },
	{ header: 'ID Guru', key: 'guruPegawaiId', width: 12 },
	{ header: 'JP per Minggu', key: 'jpPerMinggu', width: 16 },
	{ header: 'Warna', key: 'warna', width: 14 },
	{ header: 'Aktif', key: 'aktif', width: 12 },
	{ header: 'Catatan', key: 'catatan', width: 32 }
] as const;

function normalizeArgb(color: string | null) {
	const value = color?.replace('#', '').toUpperCase() ?? '';
	return /^[0-9A-F]{6}$/.test(value) ? `FF${value}` : 'FFDBEAFE';
}

function styleHeader(sheet: any) {
	const header = sheet.getRow(1);
	header.height = 28;
	header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
	header.alignment = { vertical: 'middle', horizontal: 'center' };
	header.eachCell((cell: any) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
		cell.border = {
			top: { style: 'thin', color: { argb: 'FF1E3A8A' } },
			left: { style: 'thin', color: { argb: 'FF1E3A8A' } },
			bottom: { style: 'thin', color: { argb: 'FF1E3A8A' } },
			right: { style: 'thin', color: { argb: 'FF1E3A8A' } }
		};
	});
}

function configureMapelSheet(sheet: any) {
	sheet.columns = [...MAPEL_COLUMNS];
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	sheet.autoFilter = 'A1:J1';
	styleHeader(sheet);
	for (let row = 2; row <= 1001; row += 1) {
		sheet.getCell(row, 3).dataValidation = {
			type: 'list',
			allowBlank: false,
			formulae: ['"semua,srd,srmp,srma"']
		};
		sheet.getCell(row, 5).dataValidation = {
			type: 'list',
			allowBlank: false,
			formulae: ['"masa_persiapan,akademik,kokurikuler,keasramaan,muatan_lokal"']
		};
		sheet.getCell(row, 7).dataValidation = {
			type: 'whole',
			operator: 'greaterThanOrEqual',
			allowBlank: false,
			formulae: [0]
		};
		sheet.getCell(row, 9).dataValidation = {
			type: 'list',
			allowBlank: false,
			formulae: ['"Aktif,Nonaktif"']
		};
	}
}

function addMapelRows(sheet: any, rows: JadwalMapelExcelRow[]) {
	for (const item of rows) {
		const row = sheet.addRow({
			...item,
			fase: item.fase ?? '',
			guruPegawaiId: item.guruPegawaiId ?? '',
			warna: item.warna ?? '#DBEAFE',
			aktif: item.aktif ? 'Aktif' : 'Nonaktif',
			catatan: item.catatan ?? ''
		});
		row.getCell(8).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: normalizeArgb(item.warna) }
		};
	}
}

function addGuruReference(workbook: any, guruList: JadwalMapelGuruReference[]) {
	const sheet = workbook.addWorksheet('Referensi Guru');
	sheet.columns = [
		{ header: 'ID Guru', key: 'id', width: 14 },
		{ header: 'Nama Guru', key: 'nama', width: 32 },
		{ header: 'NIP', key: 'nip', width: 24 }
	];
	styleHeader(sheet);
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	for (const guru of guruList) sheet.addRow(guru);
}

function addInstructions(workbook: any) {
	const sheet = workbook.addWorksheet('Petunjuk');
	sheet.columns = [{ width: 26 }, { width: 90 }];
	sheet.addRows([
		['Kolom', 'Petunjuk pengisian'],
		['Kode', 'Wajib dan unik dalam satu sekolah. Kode yang sudah ada akan diperbarui.'],
		['Jenjang', 'Pilih semua, srd, srmp, atau srma.'],
		['Kategori', 'Pilih masa_persiapan, akademik, kokurikuler, keasramaan, atau muatan_lokal.'],
		['ID Guru', 'Opsional. Salin ID dari lembar Referensi Guru.'],
		['JP per Minggu', 'Bilangan bulat minimal 0 dan dihitung untuk setiap kelas.'],
		['Warna', 'Kode warna heksadesimal, misalnya #DBEAFE. Warna isi sel juga akan dibaca.'],
		['Aktif', 'Isi Aktif atau Nonaktif.'],
		['Catatan', 'Opsional. Jangan mengubah nama atau urutan kolom pada lembar pertama.']
	]);
	styleHeader(sheet);
}

export function buildJadwalMapelWorkbook(options: {
	rows?: JadwalMapelExcelRow[];
	guruList: JadwalMapelGuruReference[];
	includeExample?: boolean;
}) {
	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();
	const sheet = workbook.addWorksheet('Data Mata Pelajaran');
	configureMapelSheet(sheet);
	addMapelRows(sheet, options.rows ?? []);
	if (options.includeExample) {
		const example = workbook.addWorksheet('Contoh Pengisian');
		configureMapelSheet(example);
		addMapelRows(example, [
			{
				kode: 'BIND',
				nama: 'Bahasa Indonesia',
				jenjang: 'semua',
				fase: '',
				kategori: 'akademik',
				guruPegawaiId: null,
				jpPerMinggu: 5,
				warna: '#DBEAFE',
				aktif: true,
				catatan: ''
			}
		]);
	}
	addGuruReference(workbook, options.guruList);
	addInstructions(workbook);
	return workbook;
}

export const JADWAL_MAPEL_EXCEL_HEADERS = MAPEL_COLUMNS.map((column) => column.header);
