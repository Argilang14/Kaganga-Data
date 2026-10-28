export const MAX_INFORMATION_STUDENTS = 60;
export type InformationPrintOptions = {
	kelasId: number;
	muridId: number | null;
	maskIdentity: boolean;
	background: 'default' | 'custom' | 'none';
};
export type InformationPrintContext = {
	classes: Array<{ id: number; nama: string; students: Array<{ id: number; nama: string }> }>;
};
export type InformationRow = [label: string, value: string];
export type StudentInformationPage = {
	nama: string;
	sekolah: string;
	kelas: string;
	jenjang: string;
	logo: string | null;
	photos: Array<{ label: string; src: string | null }>;
	murid: InformationRow[];
	orangTua: InformationRow[];
	alamat: InformationRow[];
	asrama: InformationRow[];
	perlengkapan: InformationRow[];
	petugas: InformationRow[];
	hunian: InformationRow[];
	catatan: string;
	maskIdentity: boolean;
};

export function parseInformationPrintOptions(input: unknown): InformationPrintOptions {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		throw new Error('Pilihan cetak tidak valid. Pilih kembali kelas dan murid.');
	const value = input as Record<string, unknown>;
	if (
		Object.keys(value).some(
			(key) => !['kelasId', 'muridId', 'maskIdentity', 'background'].includes(key)
		)
	)
		throw new Error('Pilihan cetak tidak dikenal. Muat ulang halaman cetak.');
	const positive = (n: unknown): n is number =>
		typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
	if (!positive(value.kelasId) || (value.muridId !== null && !positive(value.muridId)))
		throw new Error('Pilih kelas dan murid yang valid.');
	if (
		typeof value.maskIdentity !== 'boolean' ||
		!['default', 'custom', 'none'].includes(String(value.background))
	)
		throw new Error('Pilihan identitas atau latar tidak valid. Periksa kembali pilihan cetak.');
	return value as InformationPrintOptions;
}

export function maskInformationIdentity(value: string | null | undefined, masked: boolean) {
	if (!value?.trim()) return '-';
	const text = value.trim();
	if (!masked) return text;
	return text.length > 4 ? '*'.repeat(text.length - 4) + text.slice(-4) : '*'.repeat(text.length);
}

export function safeInformationImage(value: string | null | undefined) {
	return value && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
		? value
		: null;
}
