export const presensiPegawaiStatuses = ['hadir', 'izin', 'sakit', 'dinas_luar', 'cuti'] as const;
export type PresensiPegawaiStatus = (typeof presensiPegawaiStatuses)[number];

export const pegawaiJenisLabels = {
	guru: 'Guru', kepala_sekolah: 'Kepala Sekolah', operator: 'Operator', tu: 'Tata Usaha',
	kebersihan: 'Kebersihan', keamanan: 'Keamanan', wali_asuh: 'Wali Asuh', wali_asrama: 'Wali Asrama', lainnya: 'Lainnya'
} as const;
export type PegawaiJenis = keyof typeof pegawaiJenisLabels;
export function normalizePegawaiJenis(value: string | null): PegawaiJenis | '' {
	return value && Object.hasOwn(pegawaiJenisLabels, value) ? value as PegawaiJenis : '';
}
export function pegawaiJenisLabel(value: string) {
	return pegawaiJenisLabels[value as PegawaiJenis] ?? value.replaceAll('_', ' ');
}

export function isPresensiPegawaiStatus(value: unknown): value is PresensiPegawaiStatus {
	return typeof value === 'string' && presensiPegawaiStatuses.includes(value as PresensiPegawaiStatus);
}

export function enumerateMonthDates(year: number, month: number) {
	const count = new Date(year, month, 0).getDate();
	return Array.from({ length: count }, (_, index) =>
		`${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
	);
}

export function statusLabel(status: PresensiPegawaiStatus | null) {
	return status
		? ({ hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', dinas_luar: 'Dinas Luar', cuti: 'Cuti' } as const)[status]
		: 'Belum Diisi';
}
