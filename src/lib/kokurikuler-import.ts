export type KokurikulerImportRow = {
	baris: number;
	kode: string;
	dimensi: string[];
	kegiatan: string;
	masalah: string | null;
};

const cell = (value: unknown) => String(value ?? '').trim();

export function parseKokurikulerRows(
	rows: Array<Array<string | number>>,
	dimensions: ReadonlyArray<{ readonly key: string; readonly label: string }>,
	existingCodes: Iterable<string>
): KokurikulerImportRow[] {
	const header = rows[0]?.map((value) => cell(value).toLowerCase()) ?? [];
	if (header[0] !== 'kode' || header[1] !== 'dimensi' || header[2] !== 'kegiatan')
		throw new Error('Kolom pertama harus Kode, Dimensi, Kegiatan sesuai template.');
	const dimensionMap = new Map<string, string>();
	for (const dimension of dimensions) {
		dimensionMap.set(dimension.key.toLowerCase(), dimension.key);
		dimensionMap.set(dimension.label.toLowerCase(), dimension.key);
	}
	const seen = new Set(Array.from(existingCodes, (code) => code.trim().toLowerCase()));
	return rows.slice(1).map((row, index) => {
		const kode = cell(row[0]).toUpperCase();
		const rawDimensions = cell(row[1]).split(',').map((value) => value.trim()).filter(Boolean);
		const dimensi = [...new Set(rawDimensions.map((value) => dimensionMap.get(value.toLowerCase())).filter((value): value is string => Boolean(value)))];
		const kegiatan = cell(row[2]);
		const key = kode.toLowerCase();
		let masalah: string | null = null;
		if (!kode || !kegiatan || !dimensi.length || rawDimensions.some((value) => !dimensionMap.has(value.toLowerCase())))
			masalah = 'Kode, dimensi, atau kegiatan tidak valid';
		else if (seen.has(key)) masalah = 'Kode sudah digunakan';
		if (!masalah) seen.add(key);
		return { baris: index + 2, kode, dimensi, kegiatan, masalah };
	});
}
