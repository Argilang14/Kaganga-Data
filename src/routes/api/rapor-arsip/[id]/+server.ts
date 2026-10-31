import { error, json } from '@sveltejs/kit';
import { reportSelection } from '$lib/report-archive';
import { runningReportJobs as running } from '$lib/server/report-archive-request';
import {
	archivedReportPdf,
	previewOrFinalizeReport,
	requireArchiveAccess
} from '$lib/server/report-archive';
import type { RequestHandler } from './$types';
function selection(url: URL, id: string | undefined) {
	const historyId = Number(id);
	if (!Number.isSafeInteger(historyId) || historyId < 1)
		throw error(400, 'ID riwayat tidak valid.');
	try {
		return {
			historyId,
			...reportSelection(url.searchParams.get('jenis'), url.searchParams.get('periode') ?? 'ras')
		};
	} catch {
		throw error(400, 'Pilihan jenis/periode rapor tidak valid.');
	}
}
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export const GET: RequestHandler = async ({ locals, url, params }) => {
	const { historyId, kind, period } = selection(url, params.id);
	const bytes = await archivedReportPdf(
		locals,
		historyId,
		kind,
		period,
		url.searchParams.get('versi')
	);
	return new Response(new Blob([bytes as BlobPart], { type: 'application/pdf' }), {
		headers: {
			...headers,
			'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="Rapor_${kind}_${historyId}_${period}_final.pdf"`
		}
	});
};
export const POST: RequestHandler = async ({ locals, url, params, request }) => {
	const { historyId, kind, period } = selection(url, params.id);
	requireArchiveAccess(locals, kind);
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
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(raw);
		if (
			!body ||
			typeof body !== 'object' ||
			Array.isArray(body) ||
			!['preview', 'finalize', 'revise-preview', 'revise-finalize'].includes(String(body.action))
		)
			throw new Error();
	} catch {
		throw error(400, 'Permintaan dokumen tidak valid.');
	}
	const key = `${locals.sekolah!.id}:${locals.user!.id}`;
	if (running.has(key)) throw error(429, 'Pembuatan dokumen sebelumnya masih berjalan.');
	running.add(key);
	try {
		const result = await previewOrFinalizeReport(locals, historyId, kind, period, body, request);
		if (result.final) return json({ message: 'Rapor final berhasil disimpan.' }, { headers });
		return new Response(new Blob([result.bytes as BlobPart], { type: 'application/pdf' }), {
			headers: {
				...headers,
				'X-Report-Source-Hash': result.hash,
				'Content-Disposition': `inline; filename="Rapor_${kind}_${historyId}_${period}_draf.pdf"`
			}
		});
	} catch (cause) {
		if (cause instanceof Error && !('status' in cause)) {
			console.error('[rapor-arsip]', cause.message);
			throw error(500, 'Dokumen belum berhasil dibuat. Periksa log server atau hubungi operator.');
		}
		throw cause;
	} finally {
		running.delete(key);
	}
};
