import { error } from '@sveltejs/kit';
import { reportSelection } from '$lib/report-archive';
import { requireArchiveAccess, requireArchiveAction } from '$lib/server/report-archive';
import { previewReportBatch } from '$lib/server/report-archive-batch';
import { reportRequest, withReportJob, reportHeaders } from '$lib/server/report-archive-request';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ locals, url, request }) => {
	let selected;
	try {
		selected = reportSelection(url.searchParams.get('jenis'), url.searchParams.get('periode'));
	} catch {
		throw error(400, 'Jenis/periode rapor tidak valid.');
	}
	requireArchiveAccess(locals, selected.kind);
	requireArchiveAction(locals, 'massal');
	const body = await reportRequest(request);
	return withReportJob(locals, async () => {
		const result = await previewReportBatch(locals, selected.kind, selected.period, body, request);
		return new Response(new Blob([result.bytes as BlobPart], { type: 'application/pdf' }), {
			headers: {
				...reportHeaders,
				'X-Report-Batch-Plan': JSON.stringify(result.plan),
				'Content-Disposition': 'inline; filename="Rapor_draf_gabungan.pdf"'
			}
		});
	});
};
