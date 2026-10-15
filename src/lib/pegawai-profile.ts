export type ProfileField = {
	key: string;
	label: string;
	type?: 'text' | 'tel' | 'email' | 'date' | 'textarea';
	options?: readonly string[];
	wide?: boolean;
};

export const profileGroups = [
	{
		title: 'Identitas pribadi',
		fields: [
			{ key: 'nama', label: 'Nama lengkap' },
			{ key: 'jenisKelamin', label: 'Jenis kelamin', options: ['laki-laki', 'perempuan'] },
			{ key: 'tempatLahir', label: 'Tempat lahir' },
			{ key: 'tanggalLahir', label: 'Tanggal lahir', type: 'date' },
			{ key: 'agama', label: 'Agama' },
			{ key: 'statusPerkawinan', label: 'Status perkawinan' },
			{ key: 'nik', label: 'NIK' },
			{ key: 'nip', label: 'NIP' },
			{ key: 'nomorIndukPppk', label: 'Nomor induk PPPK' },
			{ key: 'nuptk', label: 'NUPTK' },
			{ key: 'dapodikPtkId', label: 'ID PTK Dapodik' }
		]
	},
	{
		title: 'Alamat dan kontak',
		fields: [
			{ key: 'telepon', label: 'Nomor telepon', type: 'tel' },
			{ key: 'email', label: 'Email', type: 'email' },
			{ key: 'alamat', label: 'Alamat lengkap', type: 'textarea', wide: true },
			{ key: 'desa', label: 'Desa / kelurahan' },
			{ key: 'kecamatan', label: 'Kecamatan' },
			{ key: 'kabupaten', label: 'Kabupaten / kota' },
			{ key: 'provinsi', label: 'Provinsi' },
			{ key: 'kodePos', label: 'Kode pos' }
		]
	},
	{
		title: 'Kontak darurat',
		fields: [
			{ key: 'kontakDaruratNama', label: 'Nama kontak darurat' },
			{ key: 'kontakDaruratHubungan', label: 'Hubungan' },
			{ key: 'kontakDaruratTelepon', label: 'Nomor telepon darurat', type: 'tel' }
		]
	},
	{
		title: 'Biodata kepegawaian',
		fields: [
			{ key: 'statusKepegawaian', label: 'Status kepegawaian' },
			{ key: 'tanggalMulaiKerja', label: 'Tanggal mulai kerja', type: 'date' },
			{ key: 'unitPenempatan', label: 'Unit penempatan' },
			{ key: 'pangkatGolongan', label: 'Pangkat / golongan' },
			{ key: 'nomorSk', label: 'Nomor SK' },
			{ key: 'tanggalSk', label: 'Tanggal SK', type: 'date' },
			{ key: 'catatan', label: 'Catatan biodata', type: 'textarea', wide: true }
		]
	}
] as const;

export type ProfileKey = (typeof profileGroups)[number]['fields'][number]['key'];
export const editableProfileKeys = profileGroups.flatMap((group) =>
	group.fields.map((field) => field.key)
);

export function validateProfileForm(form: FormData) {
	const fields: readonly ProfileField[] = profileGroups.flatMap((group) => [...group.fields]);
	const allowed = new Set<string>([...editableProfileKeys, 'updatedAt']);
	for (const [key, value] of form) {
		if (!allowed.has(key) || typeof value !== 'string' || form.getAll(key).length !== 1)
			return { error: 'Form profil memuat kolom yang tidak diizinkan. Muat ulang halaman.' };
	}
	const values = Object.fromEntries(
		editableProfileKeys.map((key) => [key, String(form.get(key) ?? '').trim()])
	) as Record<ProfileKey, string>;
	if (!values.nama) return { error: 'Nama lengkap wajib diisi.' };
	if (!values.nip) return { error: "NIP wajib diisi. Gunakan '-' jika belum memiliki NIP." };
	for (const field of fields) {
		const value = values[field.key as ProfileKey];
		if (value.length > (field.type === 'textarea' ? 1000 : 255))
			return { error: `${field.label} terlalu panjang.` };
		if (field.options && value && !field.options.includes(value))
			return { error: `${field.label} tidak valid.` };
		if (field.type === 'date' && value) {
			const date = new Date(value + 'T00:00:00Z');
			if (
				!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
				!Number.isFinite(date.getTime()) ||
				date.toISOString().slice(0, 10) !== value
			)
				return { error: `${field.label} tidak valid.` };
			if (field.key === 'tanggalLahir' && date > new Date())
				return { error: 'Tanggal lahir tidak boleh melewati hari ini.' };
		}
	}
	if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
		return { error: 'Email tidak valid.' };
	return { values };
}
