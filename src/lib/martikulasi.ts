export const martikulasiAspekAkademik = [
	{ kode: 'literasi', label: 'Literasi' },
	{ kode: 'numerasi', label: 'Numerasi' },
	{ kode: 'sains', label: 'Sains' },
	{ kode: 'bahasa_inggris', label: 'Bahasa Inggris' }
] as const;

export const martikulasiAspekKarakter = [
	{ kode: 'keagamaan_akhlak', label: 'Keagamaan & akhlak mulia' },
	{ kode: 'kepemimpinan_kesamaptaan', label: 'Kepemimpinan & kesamaptaan' },
	{ kode: 'sosial_kepribadian', label: 'Keterampilan sosial & kepribadian' },
	{ kode: 'kemandirian_keasramaan', label: 'Kemandirian & keasramaan' }
] as const;

export const martikulasiAspek = [
	...martikulasiAspekAkademik.map((aspek) => ({ ...aspek, kelompok: 'akademik' as const })),
	...martikulasiAspekKarakter.map((aspek) => ({ ...aspek, kelompok: 'karakter' as const }))
];

export const martikulasiKetuntasanOptions = [
	{ value: 'tuntas', label: 'Tuntas' },
	{ value: 'belum_tuntas', label: 'Belum Tuntas' },
	{ value: 'perlu_pendampingan', label: 'Perlu Pendampingan' }
] as const;

export const martikulasiLevelOptions = [
	{ value: 'dasar', label: 'Level Dasar' },
	{ value: 'madya', label: 'Level Madya' },
	{ value: 'mahir', label: 'Level Mahir' }
] as const;

export type MartikulasiKetuntasan = (typeof martikulasiKetuntasanOptions)[number]['value'];
export type MartikulasiLevel = (typeof martikulasiLevelOptions)[number]['value'];

export function isMartikulasiKetuntasan(value: string): value is MartikulasiKetuntasan {
	return martikulasiKetuntasanOptions.some((option) => option.value === value);
}

export function isMartikulasiLevel(value: string): value is MartikulasiLevel {
	return martikulasiLevelOptions.some((option) => option.value === value);
}

const martikulasiLegacyLevelMap: Record<string, MartikulasiLevel> = {
	perlu_penguatan: 'dasar',
	siap_dengan_pendampingan: 'madya',
	siap: 'mahir'
};

export function normalizeMartikulasiLevel(
	value: string | null | undefined
): MartikulasiLevel | null {
	if (!value) return null;
	if (isMartikulasiLevel(value)) return value;
	return martikulasiLegacyLevelMap[value] ?? null;
}

export function martikulasiLevelLabel(value: string | null | undefined): string | null {
	const normalized = normalizeMartikulasiLevel(value);
	return normalized
		? (martikulasiLevelOptions.find((option) => option.value === normalized)?.label ?? null)
		: null;
}

export function hitungStatusKelengkapanMartikulasi(input: {
	akademik: Array<{
		capaianAwal: string | null;
		capaianAkhir: string | null;
		ketuntasan: MartikulasiKetuntasan | null;
	}>;
	karakter: Array<{ deskripsiCapaian: string | null }>;
	levelPenempatan: MartikulasiLevel | null;
}) {
	const akademikLengkap = input.akademik.every(
		(item) => item.capaianAwal && item.capaianAkhir && item.ketuntasan
	);
	const karakterLengkap = input.karakter.every((item) => item.deskripsiCapaian);
	return akademikLengkap && karakterLengkap && input.levelPenempatan
		? ('lengkap' as const)
		: ('belum_lengkap' as const);
}

const bulanRomawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function formatNomorSttm(
	format: string,
	input: { urut: number; tanggal: string; tahunAjaran: string; nis?: string | null }
): string {
	const tanggal = new Date(`${input.tanggal}T00:00:00`);
	const validTanggal = !Number.isNaN(tanggal.getTime());
	return format
		.replaceAll('{urut}', String(input.urut).padStart(3, '0'))
		.replaceAll('{tahun}', validTanggal ? String(tanggal.getFullYear()) : '')
		.replaceAll('{bulan_romawi}', validTanggal ? bulanRomawi[tanggal.getMonth()] : '')
		.replaceAll('{tahun_ajaran}', input.tahunAjaran.replaceAll('/', '-'))
		.replaceAll('{nis}', input.nis?.trim() || '-');
}

export function isFormatNomorSttmValid(format: string): boolean {
	return format.includes('{urut}') && format.length <= 160;
}
