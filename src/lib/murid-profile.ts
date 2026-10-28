export const studentProfilePermissions = [
	'murid_profil_lihat',
	'murid_profil_manage',
	'murid_profil_cetak'
] as const;

export type StudentProfileAction = 'read' | 'edit' | 'print';
export type StudentProfileUser = {
	type?: string | null;
	sekolahId?: number | null;
	permissions?: readonly string[] | null;
	mustChangePassword?: boolean;
};

export function canUseStudentProfile(
	user: StudentProfileUser | null | undefined,
	sekolahId: number,
	action: StudentProfileAction
) {
	if (
		!user ||
		user.mustChangePassword ||
		!Number.isSafeInteger(sekolahId) ||
		sekolahId < 1 ||
		!['read', 'edit', 'print'].includes(action)
	)
		return false;
	if (user.type === 'admin') return true;
	if (
		user.sekolahId !== sekolahId ||
		!['user', 'wali_kelas', 'wali_asuh', 'wali_asrama'].includes(user.type ?? '')
	)
		return false;
	const granted = user.permissions ?? [];
	if (action === 'read')
		return granted.includes('murid_profil_lihat') || granted.includes('murid_profil_manage');
	return granted.includes(action === 'edit' ? 'murid_profil_manage' : 'murid_profil_cetak');
}

export const housingStatuses = ['milik_sendiri', 'sewa', 'menumpang', 'dinas', 'lainnya'] as const;
export const certificateStatuses = ['ada', 'tidak_ada', 'tidak_diketahui'] as const;
export const assistanceStatuses = ['menerima', 'tidak_menerima'] as const;
export const assistanceKinds = ['pkh', 'sembako', 'pip', 'lainnya'] as const;
export const studentProfilePhotoKinds = ['murid_tambahan', 'rumah', 'orang_tua'] as const;

export type StudentProfileValues = {
	nomorKk: string | null;
	desilDtsen: number | null;
	statusBansos: (typeof assistanceStatuses)[number] | null;
	jenisBansos: (typeof assistanceKinds)[number][];
	bansosLainnya: string | null;
	penghasilanKeluarga: string | null;
	jumlahTanggungan: number | null;
	rt: string | null;
	rw: string | null;
	statusHunian: (typeof housingStatuses)[number] | null;
	luasTempatTinggal: number | null;
	statusSertifikat: (typeof certificateStatuses)[number] | null;
	pemilikRumah: string | null;
	bersediaAsrama: boolean | null;
	suratPernyataanDitandatangani: boolean | null;
	tanggalSuratPernyataan: string | null;
	petugasPendataanId: number | null;
	tanggalPendataan: string | null;
	catatanPetugas: string | null;
};

export const emptyStudentProfile: Readonly<StudentProfileValues> = {
	nomorKk: null,
	desilDtsen: null,
	statusBansos: null,
	jenisBansos: [],
	bansosLainnya: null,
	penghasilanKeluarga: null,
	jumlahTanggungan: null,
	rt: null,
	rw: null,
	statusHunian: null,
	luasTempatTinggal: null,
	statusSertifikat: null,
	pemilikRumah: null,
	bersediaAsrama: null,
	suratPernyataanDitandatangani: null,
	tanggalSuratPernyataan: null,
	petugasPendataanId: null,
	tanggalPendataan: null,
	catatanPetugas: null
};

export class StudentProfileValidationError extends Error {}

export function studentProfileDate(value: unknown, label: string): string | null {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw new StudentProfileValidationError(`${label} harus menggunakan tanggal yang valid.`);
	const date = new Date(`${value}T00:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
		throw new StudentProfileValidationError(`${label} tidak valid. Periksa kembali tanggalnya.`);
	return value;
}

// Partial updates must not clear fields omitted by a later form or photo action.
export function validateStudentProfilePatch(input: unknown): Partial<StudentProfileValues> {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		throw new StudentProfileValidationError('Data profil tidak valid. Muat ulang formulir.');
	const raw = input as Record<string, unknown>;
	const output: Record<string, unknown> = {};
	const textLimits: Record<string, number> = {
		nomorKk: 16,
		bansosLainnya: 200,
		penghasilanKeluarga: 100,
		rt: 3,
		rw: 3,
		pemilikRumah: 200,
		catatanPetugas: 2000
	};
	const numbers: Record<string, [number, number, boolean]> = {
		desilDtsen: [1, 10, true],
		jumlahTanggungan: [0, 100, true],
		luasTempatTinggal: [0, 1000000, false],
		petugasPendataanId: [1, Number.MAX_SAFE_INTEGER, true]
	};
	const selections: Record<string, readonly string[]> = {
		statusBansos: assistanceStatuses,
		statusHunian: housingStatuses,
		statusSertifikat: certificateStatuses
	};
	for (const [key, value] of Object.entries(raw)) {
		if (!Object.hasOwn(emptyStudentProfile, key))
			throw new StudentProfileValidationError(
				`Kolom ${key} tidak dapat diubah melalui profil tambahan.`
			);
		if (Object.hasOwn(textLimits, key)) {
			if (value !== null && typeof value !== 'string')
				throw new StudentProfileValidationError(`Kolom ${key} harus berupa teks.`);
			const text = typeof value === 'string' ? value.trim() : '';
			if (text.length > textLimits[key])
				throw new StudentProfileValidationError(
					`Kolom ${key} maksimal ${textLimits[key]} karakter.`
				);
			if (key === 'nomorKk' && text && !/^\d{16}$/.test(text))
				throw new StudentProfileValidationError('Nomor KK harus berisi 16 digit atau dikosongkan.');
			if (['rt', 'rw'].includes(key) && text && !/^\d{1,3}$/.test(text))
				throw new StudentProfileValidationError(
					`${key.toUpperCase()} harus berisi 1 sampai 3 digit.`
				);
			output[key] = text || null;
		} else if (Object.hasOwn(numbers, key)) {
			const [min, max, whole] = numbers[key];
			if (value === null || value === '') output[key] = null;
			else {
				if (
					typeof value !== 'number' ||
					!Number.isFinite(value) ||
					value < min ||
					value > max ||
					(whole && !Number.isSafeInteger(value))
				)
					throw new StudentProfileValidationError(
						`Kolom ${key} harus berupa angka ${min} sampai ${max}.`
					);
				output[key] = value;
			}
		} else if (Object.hasOwn(selections, key)) {
			if (value !== null && value !== '' && !selections[key].includes(value as string))
				throw new StudentProfileValidationError(`Pilihan ${key} tidak valid.`);
			output[key] = value === '' ? null : value;
		} else if (key === 'jenisBansos') {
			if (
				!Array.isArray(value) ||
				value.length > assistanceKinds.length ||
				value.some((kind) => !assistanceKinds.includes(kind))
			)
				throw new StudentProfileValidationError(
					'Jenis bantuan sosial tidak valid. Pilih dari daftar yang tersedia.'
				);
			output[key] = [...new Set(value)];
		} else if (key === 'bersediaAsrama' || key === 'suratPernyataanDitandatangani') {
			if (value !== null && typeof value !== 'boolean')
				throw new StudentProfileValidationError(
					`Pilihan ${key} harus Ya, Tidak, atau Belum diisi.`
				);
			output[key] = value;
		} else
			output[key] = studentProfileDate(
				value,
				key === 'tanggalPendataan' ? 'Tanggal pendataan' : 'Tanggal surat pernyataan'
			);
	}
	return output as Partial<StudentProfileValues>;
}

export function validateStudentProfileConsistency(values: StudentProfileValues) {
	if (values.jenisBansos.length && values.statusBansos !== 'menerima')
		throw new StudentProfileValidationError(
			'Pilih status Menerima sebelum mengisi jenis bantuan sosial.'
		);
	if (values.bansosLainnya && !values.jenisBansos.includes('lainnya'))
		throw new StudentProfileValidationError('Pilih bantuan Lainnya sebelum mengisi keterangannya.');
	if (values.tanggalSuratPernyataan && values.suratPernyataanDitandatangani !== true)
		throw new StudentProfileValidationError(
			'Tanggal surat hanya dapat diisi jika surat sudah ditandatangani.'
		);
}
