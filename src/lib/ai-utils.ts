export type AiProvider = 'gemini' | 'openai_compatible';

export type GeneratedTpGroup = {
	lingkupMateri: string;
	deskripsi: string[];
};

const PRIVATE_IPV4 = [
	/^10\./,
	/^127\./,
	/^169\.254\./,
	/^192\.168\./,
	/^172\.(1[6-9]|2\d|3[01])\./
];

export function validateAiBaseUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		return { valid: false as const, message: 'Base URL tidak valid.' };
	}
	if (url.protocol !== 'https:') {
		return { valid: false as const, message: 'Base URL harus menggunakan HTTPS.' };
	}
	if (url.username || url.password) {
		return { valid: false as const, message: 'Base URL tidak boleh memuat kredensial.' };
	}
	const host = url.hostname.toLowerCase();
	if (
		host === 'localhost' ||
		host.endsWith('.local') ||
		host === '::1' ||
		PRIVATE_IPV4.some((pattern) => pattern.test(host))
	) {
		return { valid: false as const, message: 'Base URL tidak boleh menuju jaringan lokal.' };
	}
	return { valid: true as const, url: url.toString().replace(/\/+$/, '') };
}

function normalizeGeneratedText(value: string, maxLength: number) {
	return value.trim().replace(/\s+/g, ' ').replace(/\.$/, '').slice(0, maxLength).trim();
}

export function parseGeneratedTpPayload(
	text: string,
	limits: { maxGroups: number; maxItemsPerGroup: number }
): GeneratedTpGroup[] {
	const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		throw new Error('AI mengembalikan format yang tidak valid.');
	}
	const rawGroups = Array.isArray(parsed)
		? parsed
		: (parsed as { lingkupMateri?: unknown } | null)?.lingkupMateri;
	if (!Array.isArray(rawGroups)) throw new Error('AI tidak menghasilkan lingkup materi.');

	const groups: GeneratedTpGroup[] = [];
	for (const raw of rawGroups.slice(0, limits.maxGroups)) {
		const item = raw as {
			nama?: unknown;
			lingkupMateri?: unknown;
			tujuanPembelajaran?: unknown;
		};
		const nameValue = typeof item.nama === 'string' ? item.nama : item.lingkupMateri;
		const lingkupMateri =
			typeof nameValue === 'string' ? normalizeGeneratedText(nameValue, 150) : '';
		const rawTujuan = Array.isArray(item.tujuanPembelajaran)
			? item.tujuanPembelajaran.slice(0, limits.maxItemsPerGroup)
			: [];
		const deskripsi = rawTujuan
			.map((value) => (typeof value === 'string' ? normalizeGeneratedText(value, 100) : ''))
			.filter(Boolean);
		if (lingkupMateri && deskripsi.length) groups.push({ lingkupMateri, deskripsi });
	}
	if (!groups.length) throw new Error('AI tidak menghasilkan tujuan pembelajaran yang valid.');
	return groups;
}
