import { inferSummaryLevel } from './attendance-summary.ts';

export const educationLevels = ['sd', 'smp', 'sma'] as const;
export type EducationLevel = (typeof educationLevels)[number];
export type EducationIdentity = {
	nama: string;
	npsn: string;
	jenjang: string;
	satuanId: number | null;
};

export function isIntegratedSchool(school: {
	jenjangPendidikan?: string | null;
	jenjangVariant?: string | null;
}) {
	return school.jenjangPendidikan === 'srt' || school.jenjangVariant === 'srt';
}

export function resolveSchoolFormNpsn(
	school: {
		jenjangPendidikan?: string | null;
		jenjangVariant?: string | null;
		npsn?: string | null;
	},
	previousNpsn?: string | null
) {
	if (isIntegratedSchool(school)) return previousNpsn ?? '';
	const npsn = String(school.npsn ?? '').trim();
	if (!/^\d{8}$/.test(npsn))
		throw new Error('NPSN wajib terdiri dari 8 digit untuk sekolah satu jenjang.');
	return npsn;
}

export function suggestedEducationLevel(kelas: { nama: string; fase?: string | null }) {
	const level = inferSummaryLevel(kelas);
	return level === 'unknown' ? null : level;
}

export function validateEducationUnit(input: { nama: string; npsn: string; jenjang: string }) {
	if (!educationLevels.includes(input.jenjang as EducationLevel)) return 'Jenjang tidak valid.';
	if (!input.nama.trim() || input.nama.trim().length > 200)
		return 'Nama resmi wajib diisi (maksimal 200 karakter).';
	if (!/^\d{8}$/.test(input.npsn)) return 'NPSN wajib terdiri dari 8 digit.';
	return null;
}

export function resolveEducationIdentity(
	school: { nama: string; npsn: string; jenjangPendidikan: string; jenjangVariant?: string | null },
	mapping: EducationIdentity | null,
	className: string
): EducationIdentity {
	if (isIntegratedSchool(school)) {
		if (mapping) return mapping;
		throw new Error(
			`Satuan pendidikan kelas ${className} belum dipetakan. Lengkapi Data Sekolah - Satuan Pendidikan terlebih dahulu.`
		);
	}
	return {
		nama: school.nama,
		npsn: school.npsn,
		jenjang: school.jenjangPendidikan,
		satuanId: null
	};
}
