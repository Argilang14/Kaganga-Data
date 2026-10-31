import { error } from '@sveltejs/kit';
export const runningReportJobs = new Set<string>();
export async function reportRequest(request: Request) {
	if (Number(request.headers.get('content-length') ?? 0) > 16384)
		throw error(413, 'Isian dokumen terlalu besar.');
	let raw = '',
		received = 0;
	const reader = request.body?.getReader();
	if (reader) {
		const decoder = new TextDecoder();
		try {
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				received += chunk.value.byteLength;
				if (received > 16384) {
					await reader.cancel();
					throw error(413, 'Isian dokumen terlalu besar.');
				}
				raw += decoder.decode(chunk.value, { stream: true });
			}
			raw += decoder.decode();
		} finally {
			reader.releaseLock();
		}
	}
	try {
		const body = JSON.parse(raw);
		if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
		return body as Record<string, unknown>;
	} catch {
		throw error(400, 'Permintaan dokumen tidak valid.');
	}
}
export async function withReportJob<T>(locals: App.Locals, job: () => Promise<T>) {
	const key = `${locals.sekolah!.id}:${locals.user!.id}`;
	if (runningReportJobs.has(key)) throw error(429, 'Pembuatan dokumen sebelumnya masih berjalan.');
	runningReportJobs.add(key);
	try {
		return await job();
	} catch (cause) {
		if (cause instanceof Error && !('status' in cause)) {
			console.error('[rapor-arsip]', cause.message);
			throw error(500, 'Dokumen belum berhasil dibuat. Periksa log server atau hubungi operator.');
		}
		throw cause;
	} finally {
		runningReportJobs.delete(key);
	}
}
export const reportHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
