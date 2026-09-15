export function getSchoolPrintFormat(school?: { jenjangPendidikan?: string | null; jenjangVariant?: string | null } | null): 'sr' | 'default' | null {
	const level = school?.jenjangPendidikan?.trim().toLowerCase() ?? '';
	const variant = school?.jenjangVariant?.trim().toLowerCase() ?? '';
	if (['srd', 'srmp', 'srma', 'srt'].includes(level) || ['srd', 'srmp', 'srma', 'srt'].includes(variant)) return 'sr';
	return ['sd', 'smp', 'sma', 'slb', 'pkbm'].includes(level) ? 'default' : null;
}

export const generalPrintDocuments = ['kartu-absensi', 'jadwal-pelajaran', 'kalender-pendidikan', 'jurnal-mengajar', 'buku-tamu'] as const;
