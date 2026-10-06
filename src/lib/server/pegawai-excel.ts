import ExcelJS from 'exceljs';

export const PEGAWAI_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const PEGAWAI_IMPORT_MAX_ROWS = 2000;

export const PEGAWAI_JENIS = [
	'guru',
	'kepala_sekolah',
	'operator',
	'tu',
	'kebersihan',
	'keamanan',
	'wali_asuh',
	'wali_asrama',
	'tim_dapur',
	'lainnya'
] as const;
export const PEGAWAI_STATUS = ['aktif', 'nonaktif'] as const;
export const PEGAWAI_JENIS_KELAMIN = ['laki-laki', 'perempuan'] as const;

export type PegawaiJenis = (typeof PEGAWAI_JENIS)[number];
export type PegawaiStatus = (typeof PEGAWAI_STATUS)[number];
export type PegawaiJenisKelamin = (typeof PEGAWAI_JENIS_KELAMIN)[number];

export type PegawaiExcelValues = {
	kodePegawai: string | null;
	nama: string;
	nip: string;
	nik: string | null;
	nomorIndukPppk: string | null;
	nuptk: string | null;
	jenis: PegawaiJenis;
	jabatan: string | null;
	status: PegawaiStatus;
	jenisKelamin: PegawaiJenisKelamin | null;
	tempatLahir: string | null;
	tanggalLahir: string | null;
	agama: string | null;
	statusPerkawinan: string | null;
	telepon: string | null;
	email: string | null;
	alamat: string | null;
	desa: string | null;
	kecamatan: string | null;
	kabupaten: string | null;
	provinsi: string | null;
	kodePos: string | null;
	kontakDaruratNama: string | null;
	kontakDaruratHubungan: string | null;
	kontakDaruratTelepon: string | null;
	statusKepegawaian: string | null;
	tanggalMulaiKerja: string | null;
	unitPenempatan: string | null;
	pangkatGolongan: string | null;
	nomorSk: string | null;
	tanggalSk: string | null;
	catatan: string | null;
};

export type PegawaiExcelKey = keyof PegawaiExcelValues;

const PEGAWAI_EXCEL_GROUP_COLORS: ReadonlyArray<{
	keys: readonly PegawaiExcelKey[];
	color: string;
}> = [
	{
		keys: [
			'nama', 'nip', 'nik', 'nuptk', 'jenis', 'jabatan', 'status', 'jenisKelamin',
			'tempatLahir', 'tanggalLahir', 'agama', 'statusPerkawinan'
		],
		color: 'FF245EA8'
	},
	{
		keys: [
			'telepon', 'email', 'alamat', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kodePos',
			'kontakDaruratNama', 'kontakDaruratHubungan', 'kontakDaruratTelepon'
		],
		color: 'FF0F766E'
	},
	{
		keys: [
			'statusKepegawaian', 'tanggalMulaiKerja', 'unitPenempatan', 'pangkatGolongan',
			'nomorSk', 'tanggalSk'
		],
		color: 'FFA16207'
	},
	{ keys: ['catatan'], color: 'FF475569' }
];

type ColumnDefinition = {
	key: PegawaiExcelKey;
	header: string;
	width: number;
	required?: boolean;
	aliases?: string[];
	identifier?: boolean;
};

export const PEGAWAI_EXCEL_COLUMNS: readonly ColumnDefinition[] = [
	{ key: 'nama', header: 'Nama', width: 30, required: true, aliases: ['nama lengkap'] },
	{ key: 'nip', header: 'NIP', width: 22, identifier: true },
	{ key: 'nik', header: 'NIK', width: 20, identifier: true },
	{ key: 'nuptk', header: 'NUPTK', width: 20, identifier: true },
	{ key: 'jenis', header: 'Jenis', width: 18, required: true },
	{ key: 'jabatan', header: 'Jabatan', width: 28 },
	{ key: 'status', header: 'Status', width: 14, required: true },
	{ key: 'jenisKelamin', header: 'Jenis Kelamin', width: 18, aliases: ['jk'] },
	{ key: 'tempatLahir', header: 'Tempat Lahir', width: 20 },
	{ key: 'tanggalLahir', header: 'Tanggal Lahir', width: 16 },
	{ key: 'agama', header: 'Agama', width: 16 },
	{ key: 'statusPerkawinan', header: 'Status Perkawinan', width: 20 },
	{ key: 'telepon', header: 'Telepon', width: 18, aliases: ['no telepon', 'nomor telepon'] },
	{ key: 'email', header: 'Email', width: 28 },
	{ key: 'alamat', header: 'Alamat', width: 34 },
	{ key: 'desa', header: 'Desa/Kelurahan', width: 20, aliases: ['desa', 'kelurahan'] },
	{ key: 'kecamatan', header: 'Kecamatan', width: 20 },
	{ key: 'kabupaten', header: 'Kabupaten/Kota', width: 20, aliases: ['kabupaten', 'kota'] },
	{ key: 'provinsi', header: 'Provinsi', width: 20 },
	{ key: 'kodePos', header: 'Kode Pos', width: 12, identifier: true },
	{ key: 'kontakDaruratNama', header: 'Nama Kontak Darurat', width: 24 },
	{ key: 'kontakDaruratHubungan', header: 'Hubungan Kontak Darurat', width: 24 },
	{ key: 'kontakDaruratTelepon', header: 'Telepon Kontak Darurat', width: 22 },
	{ key: 'statusKepegawaian', header: 'Status Kepegawaian', width: 22 },
	{ key: 'tanggalMulaiKerja', header: 'Tanggal Mulai Kerja', width: 18 },
	{ key: 'unitPenempatan', header: 'Unit Penempatan', width: 22 },
	{ key: 'pangkatGolongan', header: 'Pangkat/Golongan', width: 20 },
	{ key: 'nomorSk', header: 'Nomor SK', width: 22, identifier: true },
	{ key: 'tanggalSk', header: 'Tanggal SK', width: 16 },
	{ key: 'catatan', header: 'Catatan', width: 36 }
] as const;

// Header lama tetap dikenali untuk membaca backup/template terdahulu, tetapi tidak diekspor lagi.
const LEGACY_PEGAWAI_EXCEL_COLUMNS: readonly ColumnDefinition[] = [
	{ key: 'kodePegawai', header: 'Kode Pegawai', width: 20, aliases: ['kode'], identifier: true },
	{
		key: 'nomorIndukPppk',
		header: 'Nomor Induk PPPK',
		width: 22,
		aliases: ['ni pppk'],
		identifier: true
	}
] as const;

export type ParsedPegawaiRow = {
	rowNumber: number;
	values: PegawaiExcelValues;
	errors: string[];
};

export type ParsedPegawaiWorkbook = {
	rows: ParsedPegawaiRow[];
	providedColumns: Set<PegawaiExcelKey>;
	legacyFormat: boolean;
};

export type ExistingPegawaiIdentity = {
	id: number;
	kodePegawai: string | null;
	nip: string;
	nik: string | null;
};

export type PegawaiImportResolution = {
	row: ParsedPegawaiRow;
	existingId: number | null;
	action: 'baru' | 'perbarui' | 'bermasalah';
};

function normalizeHeader(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value: unknown) {
	const text = String(value ?? '').trim();
	return text || null;
}

function usableIdentity(value: string | null | undefined) {
	const normalized = value?.trim().toLowerCase() ?? '';
	return normalized && normalized !== '-' ? normalized : null;
}

export function resolvePegawaiImportRows(
	parsed: ParsedPegawaiWorkbook,
	existingRows: ExistingPegawaiIdentity[]
): PegawaiImportResolution[] {
	const indexes = {
		kodePegawai: new Map<string, Set<number>>(),
		nip: new Map<string, Set<number>>(),
		nik: new Map<string, Set<number>>()
	};
	for (const existing of existingRows) {
		for (const key of ['kodePegawai', 'nip', 'nik'] as const) {
			const value = usableIdentity(existing[key]);
			if (!value) continue;
			const ids = indexes[key].get(value) ?? new Set<number>();
			ids.add(existing.id);
			indexes[key].set(value, ids);
		}
	}

	return parsed.rows.map((row) => {
		const matches = new Set<number>();
		for (const key of ['kodePegawai', 'nip', 'nik'] as const) {
			const value = usableIdentity(row.values[key]);
			if (!value) continue;
			for (const id of indexes[key].get(value) ?? []) matches.add(id);
		}
		if (matches.size > 1) {
			row.errors.push('Identitas pada file mengarah ke pegawai lama yang berbeda.');
		}
		const existingId = matches.size === 1 ? [...matches][0] : null;
		return {
			row,
			existingId,
			action: row.errors.length ? 'bermasalah' : existingId ? 'perbarui' : 'baru'
		};
	});
}

export function buildPegawaiImportUpdatePayload(
	values: PegawaiExcelValues,
	providedColumns: Set<PegawaiExcelKey>
) {
	const payload: Partial<PegawaiExcelValues> & { updatedAt: string } = {
		updatedAt: new Date().toISOString()
	};
	for (const column of PEGAWAI_EXCEL_COLUMNS) {
		if (!providedColumns.has(column.key)) continue;
		(payload as Record<string, unknown>)[column.key] = values[column.key];
	}
	return payload;
}

function cellText(cell: any) {
	if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
	return cell.text?.trim() ?? normalizeText(cell.value) ?? '';
}

function normalizeCode(value: string | null) {
	const code = value?.toUpperCase().replace(/\s+/g, '-') ?? null;
	return code?.replace(/[^A-Z0-9._/-]/g, '') || null;
}

function normalizeDate(value: string | null) {
	if (!value) return null;
	const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const indonesia = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	const normalized = iso
		? value
		: indonesia
			? `${indonesia[3]}-${indonesia[2].padStart(2, '0')}-${indonesia[1].padStart(2, '0')}`
			: null;
	if (!normalized) return null;
	const [year, month, day] = normalized.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
		? normalized
		: null;
}

function emptyValues(): PegawaiExcelValues {
	return {
		kodePegawai: null,
		nama: '',
		nip: '-',
		nik: null,
		nomorIndukPppk: null,
		nuptk: null,
		jenis: 'guru',
		jabatan: null,
		status: 'aktif',
		jenisKelamin: null,
		tempatLahir: null,
		tanggalLahir: null,
		agama: null,
		statusPerkawinan: null,
		telepon: null,
		email: null,
		alamat: null,
		desa: null,
		kecamatan: null,
		kabupaten: null,
		provinsi: null,
		kodePos: null,
		kontakDaruratNama: null,
		kontakDaruratHubungan: null,
		kontakDaruratTelepon: null,
		statusKepegawaian: null,
		tanggalMulaiKerja: null,
		unitPenempatan: null,
		pangkatGolongan: null,
		nomorSk: null,
		tanggalSk: null,
		catatan: null
	};
}

export async function parsePegawaiWorkbook(file: File): Promise<ParsedPegawaiWorkbook> {
	if (!file.size) throw new Error('File Excel pegawai kosong.');
	if (!file.name.toLowerCase().endsWith('.xlsx'))
		throw new Error('File pegawai harus berformat XLSX.');
	if (file.size > PEGAWAI_IMPORT_MAX_BYTES) throw new Error('Ukuran file Excel maksimal 5 MB.');

	const workbook: any = new ExcelJS.Workbook();
	await workbook.xlsx.load(await file.arrayBuffer());
	const sheet = workbook.worksheets[0];
	if (!sheet) throw new Error('File Excel tidak memiliki lembar data.');
	if (sheet.actualRowCount - 1 > PEGAWAI_IMPORT_MAX_ROWS) {
		throw new Error(`Import dibatasi maksimal ${PEGAWAI_IMPORT_MAX_ROWS} pegawai per file.`);
	}

	const headerLookup = new Map<string, PegawaiExcelKey>();
	for (const column of [...PEGAWAI_EXCEL_COLUMNS, ...LEGACY_PEGAWAI_EXCEL_COLUMNS]) {
		for (const label of [column.header, column.key, ...(column.aliases ?? [])]) {
			headerLookup.set(normalizeHeader(label), column.key);
		}
	}
	const columnIndexes = new Map<PegawaiExcelKey, number>();
	sheet.getRow(1).eachCell((cell: any, columnNumber: number) => {
		const key = headerLookup.get(normalizeHeader(cellText(cell)));
		if (key && !columnIndexes.has(key)) columnIndexes.set(key, columnNumber);
	});
	if (!columnIndexes.has('nama')) throw new Error('Kolom Nama tidak ditemukan pada file Excel.');

	const providedColumns = new Set(columnIndexes.keys());
	const rows: ParsedPegawaiRow[] = [];
	for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
		const row = sheet.getRow(rowNumber);
		const raw = (key: PegawaiExcelKey) => {
			const index = columnIndexes.get(key);
			return index ? normalizeText(cellText(row.getCell(index))) : null;
		};
		if (![...providedColumns].some((key) => raw(key))) continue;

		const values = emptyValues();
		for (const key of providedColumns) (values[key] as string | null) = raw(key);
		values.kodePegawai = normalizeCode(values.kodePegawai);
		values.nama = raw('nama') ?? '';
		values.nip = raw('nip') ?? '-';
		values.jenis = (raw('jenis') ?? 'guru').toLowerCase() as PegawaiJenis;
		values.status = (raw('status') ?? 'aktif').toLowerCase() as PegawaiStatus;
		values.jenisKelamin = raw('jenisKelamin')?.toLowerCase() as PegawaiJenisKelamin | null;

		const errors: string[] = [];
		if (!values.nama) errors.push('Nama wajib diisi.');
		if (!PEGAWAI_JENIS.includes(values.jenis)) errors.push(`Jenis "${values.jenis}" tidak valid.`);
		if (!PEGAWAI_STATUS.includes(values.status))
			errors.push(`Status "${values.status}" tidak valid.`);
		if (values.jenisKelamin && !PEGAWAI_JENIS_KELAMIN.includes(values.jenisKelamin)) {
			errors.push(`Jenis kelamin "${values.jenisKelamin}" tidak valid.`);
		}
		for (const key of ['tanggalLahir', 'tanggalMulaiKerja', 'tanggalSk'] as const) {
			const original = values[key];
			values[key] = normalizeDate(original);
			if (original && !values[key]) errors.push(`${key} harus berformat YYYY-MM-DD.`);
		}
		if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
			errors.push('Format email tidak valid.');
		}
		for (const key of ['telepon', 'kontakDaruratTelepon'] as const) {
			if (values[key] && !/^[0-9+() .-]{6,24}$/.test(values[key])) {
				errors.push(`Format ${key} tidak valid.`);
			}
		}
		rows.push({ rowNumber, values, errors });
	}

	const seen = new Map<string, number>();
	for (const row of rows) {
		for (const [label, value] of [
			['kode pegawai', row.values.kodePegawai],
			['NIP', row.values.nip === '-' ? null : row.values.nip],
			['NIK', row.values.nik]
		] as const) {
			if (!value) continue;
			const key = `${label}:${value.toLowerCase()}`;
			const firstRow = seen.get(key);
			if (firstRow) row.errors.push(`${label} sama dengan baris ${firstRow}.`);
			else seen.set(key, row.rowNumber);
		}
	}

	if (!rows.length) throw new Error('Tidak ada data pegawai pada file Excel.');
	return {
		rows,
		providedColumns,
		legacyFormat:
			providedColumns.has('kodePegawai') ||
			providedColumns.has('nomorIndukPppk') ||
			providedColumns.size <= 8
	};
}

export function configurePegawaiSheet(sheet: any) {
	sheet.columns = PEGAWAI_EXCEL_COLUMNS.map((column) => ({
		header: column.header,
		key: column.key,
		width: column.width
	}));
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(PEGAWAI_EXCEL_COLUMNS.length).letter}1` };
	const header = sheet.getRow(1);
	header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
	header.alignment = { vertical: 'middle', horizontal: 'center' };
	header.height = 24;
	for (const group of PEGAWAI_EXCEL_GROUP_COLORS) {
		for (const key of group.keys) {
			header.getCell(sheet.getColumn(key).number).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: group.color }
			};
		}
	}
	sheet.properties.tabColor = { argb: 'FF245EA8' };
	for (const column of PEGAWAI_EXCEL_COLUMNS) {
		if (column.identifier) sheet.getColumn(column.key).numFmt = '@';
	}
	const lastImportRow = PEGAWAI_IMPORT_MAX_ROWS + 1;
	const rangeFor = (key: PegawaiExcelKey) =>
		`${sheet.getColumn(key).letter}2:${sheet.getColumn(key).letter}${lastImportRow}`;
	sheet.dataValidations.add(rangeFor('jenis'), {
		type: 'list',
		allowBlank: false,
		formulae: [`"${PEGAWAI_JENIS.join(',')}"`]
	});
	sheet.dataValidations.add(rangeFor('status'), {
		type: 'list',
		allowBlank: false,
		formulae: [`"${PEGAWAI_STATUS.join(',')}"`]
	});
	sheet.dataValidations.add(rangeFor('jenisKelamin'), {
		type: 'list',
		allowBlank: true,
		formulae: [`"${PEGAWAI_JENIS_KELAMIN.join(',')}"`]
	});
	for (const key of ['tanggalLahir', 'tanggalMulaiKerja', 'tanggalSk']) {
		sheet.getColumn(key).numFmt = 'yyyy-mm-dd';
	}
}

export function addPegawaiExampleSheet(workbook: any) {
	const sheet = workbook.addWorksheet('Contoh Pengisian');
	configurePegawaiSheet(sheet);
	sheet.addRow({
		nama: 'Contoh Pegawai',
		nip: '198001012006041001',
		nik: '1701010101800001',
		nuptk: '0012345678901234',
		jenis: 'guru',
		jabatan: 'Guru Matematika',
		status: 'aktif',
		jenisKelamin: 'laki-laki',
		tempatLahir: 'Bengkulu',
		tanggalLahir: '1980-01-01',
		agama: 'Islam',
		statusPerkawinan: 'Kawin',
		telepon: '081234567890',
		email: 'contoh@sekolah.id',
		alamat: 'Jl. Pendidikan No. 1',
		desa: 'Contoh Kelurahan',
		kecamatan: 'Contoh Kecamatan',
		kabupaten: 'Kota Bengkulu',
		provinsi: 'Bengkulu',
		kodePos: '38225',
		kontakDaruratNama: 'Keluarga Pegawai',
		kontakDaruratHubungan: 'Suami/Istri',
		kontakDaruratTelepon: '081234567891',
		statusKepegawaian: 'PNS',
		tanggalMulaiKerja: '2006-04-01',
		unitPenempatan: 'SRMA',
		pangkatGolongan: 'III/c',
		nomorSk: 'SK-001/2006',
		tanggalSk: '2006-04-01',
		catatan: 'Hapus atau abaikan lembar contoh ini saat mengisi data.'
	});
	sheet.getRow(2).alignment = { vertical: 'top', wrapText: true };
	return sheet;
}

export function addPegawaiInfoSheet(workbook: any) {
	const sheet = workbook.addWorksheet('Petunjuk');
	sheet.columns = [
		{ header: 'Bagian', key: 'bagian', width: 24 },
		{ header: 'Keterangan', key: 'keterangan', width: 90 }
	];
	sheet.addRows([
		{
			bagian: 'Kelompok warna',
			keterangan:
				'Biru: data pegawai, hijau: kontak dan alamat, kuning: kepegawaian, abu-abu: catatan.'
		},
		{
			bagian: 'Kunci pembaruan',
			keterangan: 'Urutan pencocokan: NIP, lalu NIK. Data tanpa keduanya dianggap pegawai baru.'
		},
		{ bagian: 'Jenis', keterangan: PEGAWAI_JENIS.join(', ') },
		{ bagian: 'Status', keterangan: PEGAWAI_STATUS.join(', ') },
		{ bagian: 'Jenis Kelamin', keterangan: `${PEGAWAI_JENIS_KELAMIN.join(', ')} atau kosong` },
		{ bagian: 'Tanggal', keterangan: 'Gunakan format YYYY-MM-DD, contoh 1990-08-17.' },
		{
			bagian: 'Nomor identitas',
			keterangan:
				'Gunakan template ini agar angka nol di depan NIP, NIK, NUPTK, dan nomor lain tidak hilang.'
		},
		{
			bagian: 'Batas import',
			keterangan: `Maksimal ${PEGAWAI_IMPORT_MAX_ROWS} baris dan 5 MB per file.`
		},
		{
			bagian: 'Format lama',
			keterangan:
				'Template pegawai versi lama tetap dapat dibaca tanpa mengosongkan biodata yang sudah tersimpan.'
		}
	]);
	sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
	sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245EA8' } };
	sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}
