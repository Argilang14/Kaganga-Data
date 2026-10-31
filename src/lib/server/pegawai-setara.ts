import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

// The project's ExcelJS declarations cover only a subset of the CSV API.
type CsvSheet = {
	actualRowCount: number;
	columns: Array<{ header: string; key: string }>;
	getRow(index: number): {
		values: unknown[];
		cellCount: number;
		getCell(index: number): { text: string };
	};
	addRow(values: Record<string, string | null>): void;
};
type CsvWorkbook = {
	addWorksheet(name: string): CsvSheet;
	csv: {
		read(
			stream: Readable,
			options: {
				map(value: string): string;
				parserOptions: { delimiter: string; ignoreEmpty: boolean };
			}
		): Promise<CsvSheet>;
	};
};

const columns: Record<string, string> = {
	NIP: 'nip',
	NIK: 'nik',
	NUPTK: 'nuptk',
	'Jenis Kelamin': 'jenisKelamin',
	'Tempat Lahir': 'tempatLahir',
	'Tanggal Lahir': 'tanggalLahir',
	Agama: 'agama',
	'Status Kepegawaian': 'statusKepegawaian',
	'Status Pernikahan': 'statusPerkawinan',
	Alamat: 'alamat',
	'Kelurahan/Desa': 'desa',
	Kecamatan: 'kecamatan',
	'Kabupaten/Kota': 'kabupaten',
	Provinsi: 'provinsi',
	'No. HP': 'telepon',
	Email: 'email',
	'No. SK': 'nomorSk',
	'Tanggal SK': 'tanggalSk',
	'TMT SK': 'tanggalMulaiKerja',
	'Sekolah Utama': 'unitPenempatan'
};
const staffKinds: Record<string, string> = {
	bendahara: 'lainnya',
	'cleaning service': 'kebersihan',
	'juru masak': 'tim_dapur',
	'operator sekolah': 'operator',
	satpam: 'keamanan',
	'tata usaha': 'tu',
	'wali asrama': 'wali_asrama',
	'wali asuh': 'wali_asuh'
};

function text(value: unknown) {
	const result = String(value ?? '').trim();
	return !result || /^(?:0+|-|belum ditentukan)$/i.test(result) ? null : result;
}

export async function readSetaraPegawaiCsv(file: File, maxRows: number) {
	let contents: string;
	try {
		contents = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
	} catch {
		throw new Error('CSV harus memakai UTF-8. Ekspor ulang file dari Setara.');
	}
	let source: CsvSheet | undefined;
	let headers: string[] = [];
	for (const delimiter of [';', ',']) {
		try {
			const workbook = new ExcelJS.Workbook() as unknown as CsvWorkbook;
			const sheet = await workbook.csv.read(Readable.from([contents]), {
				map: (value: string) => value,
				parserOptions: { delimiter, ignoreEmpty: true }
			});
			const labels = (sheet.getRow(1).values as string[]).slice(1).map((v) => v.trim());
			if (labels.includes('Nama Guru') || labels.includes('Nama Tendik')) {
				source = sheet;
				headers = labels;
				break;
			}
		} catch {
			/* Try the other supported separator. */
		}
	}
	if (!source)
		throw new Error(
			'CSV Setara tidak dikenali. Gunakan ekspor Guru/Tendik dengan pemisah titik koma atau koma.'
		);
	if (new Set(headers).size !== headers.length)
		throw new Error('CSV memiliki nama kolom ganda. Periksa header file.');
	const guru = headers.includes('Nama Guru');
	if (guru && headers.includes('Nama Tendik'))
		throw new Error('CSV tidak boleh mencampur kolom Nama Guru dan Nama Tendik.');
	const nameHeader = guru ? 'Nama Guru' : 'Nama Tendik';
	for (const label of [nameHeader, 'NIP', 'NIK', guru ? 'Mata Pelajaran' : 'Jenis SDM']) {
		if (!headers.includes(label))
			throw new Error(`Kolom ${label} tidak ditemukan pada CSV Setara.`);
	}
	if (source.actualRowCount - 1 > maxRows)
		throw new Error(`Import dibatasi maksimal ${maxRows} pegawai per file.`);
	const workbook = new ExcelJS.Workbook() as unknown as CsvWorkbook;
	const sheet = workbook.addWorksheet('Pegawai');
	const mappings = Object.entries(columns).filter(([label]) => headers.includes(label));
	sheet.columns = ['nama', ...mappings.map(([, key]) => key), 'jenis', 'jabatan', 'catatan'].map(
		(key) => ({ header: key, key })
	);
	const warnings = new Map<number, string[]>();
	for (let i = 2; i <= source.actualRowCount; i++) {
		const row = source.getRow(i);
		if (row.cellCount !== headers.length)
			throw new Error(`Jumlah kolom pada baris ${i} tidak sesuai header. Periksa CSV.`);
		const raw = (label: string) => text(row.getCell(headers.indexOf(label) + 1).text);
		const values: Record<string, string | null> = { nama: raw(nameHeader) };
		for (const [label, key] of mappings) values[key] = raw(label);
		const job = raw(guru ? 'Mata Pelajaran' : 'Jenis SDM');
		values.jenis = guru ? 'guru' : (staffKinds[job?.toLowerCase() ?? ''] ?? job ?? 'tidak_dikenal');
		values.jabatan = guru ? (job ? `Guru ${job}` : 'Guru') : job;
		const notes = [
			['Sumber', guru ? 'Guru Setara' : 'Tendik Setara'],
			['NRG', headers.includes('NRG') ? raw('NRG') : null],
			['Mata pelajaran', guru ? job : null],
			['Jenis SDM', guru ? null : job],
			['RT', headers.includes('RT') ? raw('RT') : null],
			['RW', headers.includes('RW') ? raw('RW') : null]
		]
			.filter(([, value]) => value)
			.map(([label, value]) => `Setara - ${label}: ${value}`);
		values.catatan = notes.join('\n');
		sheet.addRow(values);
		const messages: string[] = [];
		for (const label of ['Tanggal SK', 'TMT SK']) {
			if (headers.includes(label) && /(?:1990|1900)$/.test(raw(label) ?? '')) {
				messages.push(`${label} masih ${raw(label)} dari sumber; periksa kebenarannya.`);
			}
		}
		if (messages.length) warnings.set(i, messages);
	}
	return {
		sheet,
		sourceFormat: guru ? ('setara-guru' as const) : ('setara-tendik' as const),
		warnings
	};
}
