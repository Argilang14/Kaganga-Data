import db from '$lib/server/db';
import { tableAiSettings } from '$lib/server/db/schema';
import {
	parseGeneratedTpPayload,
	validateAiBaseUrl,
	type AiProvider,
	type GeneratedTpGroup
} from '$lib/ai-utils';
import { eq } from 'drizzle-orm';

export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_AI_BASE_URL = 'https://generativelanguage.googleapis.com';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 1_000_000;

export type AiSettings = {
	provider: AiProvider;
	apiKey: string;
	model: string;
	baseUrl: string;
};

export async function getStoredAiSettings(sekolahId: number): Promise<AiSettings | null> {
	const row = await db.query.tableAiSettings.findFirst({
		where: eq(tableAiSettings.sekolahId, sekolahId)
	});
	if (!row?.apiKey) return null;
	return {
		provider: row.provider,
		apiKey: row.apiKey,
		model: row.model,
		baseUrl: row.baseUrl
	};
}

export async function getAiSettings(sekolahId: number): Promise<AiSettings | null> {
	const stored = await getStoredAiSettings(sekolahId);
	if (stored) return stored;
	const apiKey = process.env.GEMINI_API_KEY?.trim();
	return apiKey
		? {
				provider: 'gemini',
				apiKey,
				model: process.env.GEMINI_MODEL?.trim() || DEFAULT_AI_MODEL,
				baseUrl: DEFAULT_AI_BASE_URL
			}
		: null;
}

export async function saveAiSettings(
	sekolahId: number,
	settings: Omit<AiSettings, 'baseUrl'> & { baseUrl: string }
) {
	const validated = validateAiBaseUrl(settings.baseUrl);
	if (!validated.valid) throw new Error(validated.message);
	const now = new Date().toISOString();
	const existing = await db.query.tableAiSettings.findFirst({
		columns: { id: true },
		where: eq(tableAiSettings.sekolahId, sekolahId)
	});
	const values = {
		provider: settings.provider,
		apiKey: settings.apiKey,
		model: settings.model,
		baseUrl: validated.url,
		updatedAt: now
	};
	if (existing) {
		await db.update(tableAiSettings).set(values).where(eq(tableAiSettings.id, existing.id));
	} else {
		await db.insert(tableAiSettings).values({ sekolahId, ...values, createdAt: now });
	}
}

export async function clearAiSettings(sekolahId: number) {
	await db.delete(tableAiSettings).where(eq(tableAiSettings.sekolahId, sekolahId));
}

export function maskApiKey(apiKey: string) {
	const value = apiKey.trim();
	return value.length <= 8 ? '********' : `${value.slice(0, 4)}********${value.slice(-4)}`;
}

const requestWindows = new Map<string, number[]>();
export function consumeAiRateLimit(key: string, now = Date.now()) {
	const cutoff = now - 10 * 60_000;
	const recent = (requestWindows.get(key) ?? []).filter((entry) => entry > cutoff);
	if (recent.length >= 6) return false;
	recent.push(now);
	requestWindows.set(key, recent);
	return true;
}

type GenerateInput = AiSettings & {
	capaianPembelajaran: string;
	mapelNama: string;
	kelasLabel: string;
	semesterAktif: string;
	maxLingkupMateri: number;
	maxTujuanPembelajaran: number;
};

async function readJsonResponse(response: Response) {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
		throw new Error('Respons layanan AI terlalu besar.');
	}
	const raw = await response.text();
	if (raw.length > MAX_RESPONSE_BYTES) throw new Error('Respons layanan AI terlalu besar.');
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		throw new Error('Gagal membaca respons layanan AI.');
	}
}

export async function generateTujuanPembelajaran(input: GenerateInput): Promise<GeneratedTpGroup[]> {
	const checkedUrl = validateAiBaseUrl(input.baseUrl);
	if (!checkedUrl.valid) throw new Error(checkedUrl.message);
	const prompt = `${input.capaianPembelajaran}\n\nBerdasarkan capaian pembelajaran untuk ${input.mapelNama}, ${input.kelasLabel}, ${input.semesterAktif}, susun maksimal ${input.maxLingkupMateri} lingkup materi. Setiap lingkup memuat maksimal ${input.maxTujuanPembelajaran} tujuan pembelajaran. Awali tujuan dengan huruf kecil, tanpa titik di akhir, dan maksimal 100 karakter. Jawab hanya JSON: {"lingkupMateri":[{"nama":"nama lingkup","tujuanPembelajaran":["tujuan"]}]}`;
	const schema = {
		type: 'object',
		properties: {
			lingkupMateri: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						nama: { type: 'string' },
						tujuanPembelajaran: { type: 'array', items: { type: 'string' } }
					},
					required: ['nama', 'tujuanPembelajaran']
				}
			}
		},
		required: ['lingkupMateri']
	};
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	let response: Response;
	try {
		if (input.provider === 'gemini') {
			response = await fetch(
				`${checkedUrl.url}/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
					signal: controller.signal,
					body: JSON.stringify({
						contents: [{ parts: [{ text: prompt }] }],
						generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
					})
				}
			);
		} else {
			response = await fetch(`${checkedUrl.url}/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
				signal: controller.signal,
				body: JSON.stringify({
					model: input.model,
					messages: [{ role: 'user', content: prompt }],
					response_format: { type: 'json_object' }
				})
			});
		}
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error('Waktu permintaan AI habis. Kurangi jumlah hasil lalu coba lagi.');
		}
		throw new Error('Layanan AI tidak dapat dihubungi.');
	} finally {
		clearTimeout(timeout);
	}

	const data = await readJsonResponse(response);
	if (!response.ok) {
		const apiError = data.error as { message?: string } | undefined;
		if ([400, 401, 403, 429].includes(response.status)) {
			throw new Error('Kunci API, model, atau kuota layanan AI perlu diperiksa kembali.');
		}
		throw new Error(apiError?.message || `Layanan AI merespons status ${response.status}.`);
	}
	const text =
		input.provider === 'gemini'
			? ((data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]
					?.content?.parts?.map((part) => part.text ?? '').join('') ?? '')
			: ((data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message
					?.content ?? '');
	if (!text.trim()) throw new Error('AI tidak mengembalikan hasil.');
	return parseGeneratedTpPayload(text, {
		maxGroups: input.maxLingkupMateri,
		maxItemsPerGroup: input.maxTujuanPembelajaran
	});
}
