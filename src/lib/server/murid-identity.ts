export function muridIdentityKey(murid: { identityUid?: string | null; id?: number }) {
	if (murid.identityUid?.trim()) return `uid:${murid.identityUid.trim()}`;
	if (Number.isInteger(murid.id) && Number(murid.id) > 0) return `record:${murid.id}`;
	throw new Error('Identitas internal murid tidak tersedia.');
}

export function normalizedIdentityText(value: unknown) {
	return String(value ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

export function normalizedNisn(value: unknown) {
	const text = String(value ?? '').trim();
	return !text || /^0+$/.test(text) || /^(-|belum(?:[ -].*)?|tidak ada)$/i.test(text) ? '' : text;
}

export function validNisn(value: unknown) {
	const text = normalizedNisn(value);
	return /^\d{10}$/.test(text) && !/^0+$/.test(text);
}

export function sameMuridPerson(
	a: { nis: string; nama: string; tanggalLahir: string },
	b: { nis: string; nama: string; tanggalLahir: string }
) {
	return (
		Boolean(normalizedIdentityText(a.nis)) &&
		normalizedIdentityText(a.nis) === normalizedIdentityText(b.nis) &&
		normalizedIdentityText(a.nama) === normalizedIdentityText(b.nama) &&
		a.tanggalLahir === b.tanggalLahir
	);
}

export function resolveMuridImportIdentity<
	T extends { id: number; nama: string; nis?: string; nisn?: string | null }
>(rows: T[], input: { id?: number | null; nis?: string; nisn?: string; nama?: string }) {
	const nis = normalizedIdentityText(input.nis);
	const nisn = normalizedNisn(input.nisn);
	const nama = normalizedIdentityText(input.nama);
	let candidates = input.id
		? rows.filter((row) => row.id === input.id)
		: nis
			? rows.filter((row) => normalizedIdentityText(row.nis) === nis)
			: validNisn(nisn)
				? rows.filter((row) => normalizedNisn(row.nisn) === nisn)
				: nama
					? rows.filter((row) => normalizedIdentityText(row.nama) === nama)
					: [];
	if (nis) candidates = candidates.filter((row) => normalizedIdentityText(row.nis) === nis);
	if (validNisn(nisn)) candidates = candidates.filter((row) => normalizedNisn(row.nisn) === nisn);
	if (nama) candidates = candidates.filter((row) => normalizedIdentityText(row.nama) === nama);
	return candidates.length === 1 ? candidates[0] : undefined;
}
