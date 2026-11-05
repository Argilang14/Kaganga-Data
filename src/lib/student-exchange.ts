/** The first 52 columns follow the Setara student export, in its original order. */
export const setaraStudentHeaders = [
	'Nama Peserta Didik',
	'NIK',
	'NISN',
	'No. KK',
	'Jenis Kelamin',
	'Tempat Lahir',
	'Tanggal Lahir',
	'Agama',
	'Anak Ke',
	'Jumlah Saudara',
	'NIK Ayah',
	'Nama Ayah',
	'Pekerjaan Ayah',
	'Keterangan Pekerjaan Ayah',
	'NIK Ibu Kandung',
	'Nama Ibu Kandung',
	'Pekerjaan Ibu',
	'Keterangan Pekerjaan Ibu',
	'NIK Wali',
	'Nama Wali',
	'Pekerjaan Wali',
	'Keterangan Pekerjaan Wali',
	'Alamat KK',
	'RT KK',
	'RW KK',
	'Kelurahan/Desa KK',
	'Kecamatan KK',
	'Kabupaten/Kota KK',
	'Provinsi KK',
	'Alamat Domisili',
	'RT Domisili',
	'RW Domisili',
	'Kelurahan/Desa Domisili',
	'Kecamatan Domisili',
	'Kabupaten/Kota Domisili',
	'Provinsi Domisili',
	'Latitude',
	'Longitude',
	'Email',
	'Sekolah',
	'NPSN Sekolah',
	'Jenjang Pendidikan',
	'Rombongan Belajar',
	'Desil',
	'Sembako',
	'PKH',
	'PBI',
	'PPSE',
	'YAPI',
	'Atensi',
	'Tanggal Dibuat',
	'Tanggal Diperbarui'
] as const;

export const kagangaStudentHeaders = [
	'NIS',
	'Jenis NIS',
	'UID Kaganga',
	'Status Murid',
	'Kelas Aktif',
	'Asrama Aktif',
	'Wali Asuh',
	'NIP Wali Asuh',
	'Sekolah Asal',
	'Tanggal Masuk',
	'Kode Pos',
	'Kontak Ayah',
	'Kontak Ibu',
	'Kontak Wali',
	'Kode QR Murid'
] as const;
export const studentExchangeHeaders = [...setaraStudentHeaders, ...kagangaStudentHeaders];
export type StudentExchangeFields = Record<string, string>;
export type StudentImportPreview = {
	token: string;
	semester: string;
	filename: string;
	rows: Array<{
		row: number;
		name: string;
		nis: string;
		temporary: boolean;
		action: 'new' | 'update' | 'blocked';
		message: string;
	}>;
};

export function exchangeText(value: unknown): string {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	const result = String(value ?? '').trim();
	return result === '-' ? '' : result;
}

export function exchangeHeader(value: unknown): string {
	return exchangeText(value)
		.replace(/^\uFEFF/, '')
		.toLowerCase()
		.replace(/[.\s_/-]+/g, '');
}

const aliases: Record<string, string> = {
	nama: 'Nama Peserta Didik',
	nipd: 'NIS',
	jk: 'Jenis Kelamin',
	rombel: 'Rombongan Belajar',
	namaibu: 'Nama Ibu Kandung',
	nikibu: 'NIK Ibu Kandung',
	alamat: 'Alamat Domisili',
	kelurahan: 'Kelurahan/Desa Domisili',
	kecamatan: 'Kecamatan Domisili',
	kabupatenkota: 'Kabupaten/Kota Domisili',
	provinsi: 'Provinsi Domisili',
	npsnsatuan: 'NPSN Sekolah'
};
export function canonicalStudentHeader(value: unknown) {
	const key = exchangeHeader(value);
	return studentExchangeHeaders.find((header) => exchangeHeader(header) === key) ?? aliases[key];
}

export function exchangeGender(value: unknown): 'L' | 'P' | null {
	const text = exchangeText(value).toLowerCase().replace(/[\s-]/g, '');
	if (['l', 'lakilaki'].includes(text)) return 'L';
	if (['p', 'perempuan'].includes(text)) return 'P';
	return null;
}

/** Never guess dates or replace an invalid birthday with an invented date. */
export function exchangeDate(value: unknown): string | null {
	const text = exchangeText(value);
	let parts: string[] | null = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!parts) {
		const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
		if (dmy) parts = [dmy[0], dmy[3], dmy[2], dmy[1]];
	}
	if (!parts) return null;
	const date = `${parts[1]}-${parts[2]}-${parts[3]}`;
	const parsed = new Date(`${date}T00:00:00Z`);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
		? date
		: null;
}
