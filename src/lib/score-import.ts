/** Sel kosong tidak sama dengan nilai nol; sel nonangka tidak boleh menghapus nilai. */
export function parseImportedScore(value: unknown): number | null {
	if (value == null || (typeof value === 'string' && !value.trim())) return null;
	if (typeof value !== 'number' && typeof value !== 'string') {
		throw new Error('Nilai harus berupa angka 0-100.');
	}
	const text = String(value).trim().replace(',', '.');
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
		throw new Error('Nilai harus berupa angka 0-100.');
	}
	const number = Number(text);
	if (!Number.isFinite(number) || number < 0 || number > 100) {
		throw new Error('Nilai harus berada di antara 0 dan 100.');
	}
	return Math.round(number * 100) / 100;
}
