import {
	emptyStudentProfile,
	validateStudentProfilePatch,
	validateStudentProfileConsistency,
	type StudentProfileValues
} from './murid-profile.ts';

type Field = {
	key: keyof StudentProfileValues;
	label: string;
	type?: 'number' | 'date' | 'textarea';
	max?: number;
	min?: number;
	step?: string;
	maxLength?: number;
	pattern?: string;
	options?: readonly (readonly [string, string])[];
};
export const studentProfileGroups: { title: string; fields: Field[] }[] = [
	{
		title: 'Keluarga & bantuan sosial',
		fields: [
			{ key: 'nomorKk', label: 'Nomor kartu keluarga', maxLength: 16, pattern: '[0-9]{16}' },
			{ key: 'desilDtsen', label: 'Desil DTSEN', type: 'number', min: 1, max: 10 },
			{
				key: 'statusBansos',
				label: 'Status bantuan sosial',
				options: [
					['menerima', 'Menerima'],
					['tidak_menerima', 'Tidak menerima']
				]
			},
			{ key: 'bansosLainnya', label: 'Keterangan bantuan lainnya', maxLength: 200 },
			{ key: 'penghasilanKeluarga', label: 'Penghasilan keluarga per bulan', maxLength: 100 },
			{ key: 'jumlahTanggungan', label: 'Jumlah tanggungan', type: 'number', min: 0, max: 100 }
		]
	},
	{
		title: 'Tempat tinggal',
		fields: [
			{ key: 'rt', label: 'RT', maxLength: 3, pattern: '[0-9]{1,3}' },
			{ key: 'rw', label: 'RW', maxLength: 3, pattern: '[0-9]{1,3}' },
			{
				key: 'statusHunian',
				label: 'Status hunian',
				options: [
					['milik_sendiri', 'Milik sendiri'],
					['sewa', 'Sewa'],
					['menumpang', 'Menumpang'],
					['dinas', 'Rumah dinas'],
					['lainnya', 'Lainnya']
				]
			},
			{
				key: 'luasTempatTinggal',
				label: 'Luas tempat tinggal (m2)',
				type: 'number',
				min: 0,
				max: 1000000,
				step: '0.01'
			},
			{
				key: 'statusSertifikat',
				label: 'Sertifikat rumah',
				options: [
					['ada', 'Ada'],
					['tidak_ada', 'Tidak ada'],
					['tidak_diketahui', 'Tidak diketahui']
				]
			},
			{ key: 'pemilikRumah', label: 'Nama pemilik rumah', maxLength: 200 }
		]
	},
	{
		title: 'Asrama & pendataan',
		fields: [
			{
				key: 'bersediaAsrama',
				label: 'Bersedia tinggal di asrama',
				options: [
					['true', 'Ya'],
					['false', 'Tidak']
				]
			},
			{
				key: 'suratPernyataanDitandatangani',
				label: 'Surat pernyataan ditandatangani',
				options: [
					['true', 'Ya'],
					['false', 'Tidak']
				]
			},
			{ key: 'tanggalSuratPernyataan', label: 'Tanggal surat pernyataan', type: 'date' },
			{ key: 'tanggalPendataan', label: 'Tanggal pendataan', type: 'date' },
			{ key: 'petugasPendataanId', label: 'Petugas pendataan', options: [] },
			{ key: 'catatanPetugas', label: 'Catatan petugas', type: 'textarea', maxLength: 2000 }
		]
	}
];

export function studentProfileDraft(values: StudentProfileValues) {
	return Object.fromEntries(
		Object.entries(values)
			.filter(([key]) => key !== 'jenisBansos')
			.map(([key, value]) => [key, value === null ? '' : String(value)])
	);
}

export function parseStudentProfileDraft(draft: Record<string, string>, kinds: string[]) {
	const values: Record<string, unknown> = { jenisBansos: kinds };
	const numeric = ['desilDtsen', 'jumlahTanggungan', 'luasTempatTinggal', 'petugasPendataanId'];
	for (const key of Object.keys(emptyStudentProfile)) {
		if (key === 'jenisBansos') continue;
		const value = draft[key] ?? '';
		values[key] =
			value === ''
				? null
				: numeric.includes(key)
					? Number(value)
					: ['bersediaAsrama', 'suratPernyataanDitandatangani'].includes(key)
						? value === 'true'
							? true
							: value === 'false'
								? false
								: value
						: value;
	}
	const result = validateStudentProfilePatch(values) as StudentProfileValues;
	validateStudentProfileConsistency(result);
	return result;
}

export function studentProfileCompleteness(values: StudentProfileValues, photoCount: number) {
	const keys: (keyof StudentProfileValues)[] = [
		'nomorKk',
		'desilDtsen',
		'statusBansos',
		'penghasilanKeluarga',
		'jumlahTanggungan',
		'rt',
		'rw',
		'statusHunian',
		'luasTempatTinggal',
		'statusSertifikat',
		'pemilikRumah',
		'bersediaAsrama',
		'suratPernyataanDitandatangani',
		'tanggalPendataan',
		'petugasPendataanId'
	];
	return {
		filled: keys.filter((key) => values[key] !== null && values[key] !== '').length + photoCount,
		total: keys.length + 3
	};
}
