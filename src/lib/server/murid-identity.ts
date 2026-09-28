export function muridIdentityKey(murid: { nis: string; nisn?: string | null }) {
	const nisn = murid.nisn?.trim().toLowerCase();
	return nisn ? `nisn:${nisn}` : `nis:${murid.nis.trim().toLowerCase()}`;
}
