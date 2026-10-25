export const completionStatuses = ['hadir', 'sakit', 'izin', 'alfa', 'pulang'] as const;
export type CompletionStatus = (typeof completionStatuses)[number];
export type CompletionEntry = { muridId: number; status: CompletionStatus; catatan: string };

export function parseCompletionEntries(value: unknown): CompletionEntry[] {
	if (!Array.isArray(value) || !value.length || value.length > 100)
		throw new Error('Pilih 1 sampai 100 murid untuk disimpan.');
	const seen = new Set<number>();
	return value.map((item) => {
		if (
			!item ||
			typeof item !== 'object' ||
			!Number.isSafeInteger(item.muridId) ||
			item.muridId <= 0 ||
			seen.has(item.muridId) ||
			!completionStatuses.includes(item.status)
		)
			throw new Error('Pilihan murid atau status tidak valid. Perbarui daftar lalu coba lagi.');
		seen.add(item.muridId);
		if (typeof item.catatan !== 'string' || item.catatan.length > 500)
			throw new Error('Keterangan maksimal 500 karakter.');
		return { muridId: item.muridId, status: item.status, catatan: item.catatan.trim() };
	});
}
