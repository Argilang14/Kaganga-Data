import { error } from '@sveltejs/kit';
import { classMonitoringCapabilities } from '$lib/class-monitoring';
import { getClassQrCards, loadClassQrPrintContext } from '$lib/server/class-monitoring';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { renderClassQrHTML } from '$lib/server/pdf/templates/qr-kelas';
import { pdfDisposition, pdfFilename } from '$lib/pdf-filename';
import QRCode from 'qrcode';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Silakan masuk kembali.');
	if (!classMonitoringCapabilities(locals.user).canManage)
		throw error(403, 'Tidak memiliki izin mencetak QR kelas.');
	const body: unknown = await request.json().catch(() => null);
	const ids = body && typeof body === 'object' && 'kelasIds' in body ? body.kelasIds : null;
	if (
		!Array.isArray(ids) ||
		!ids.length ||
		ids.length > 500 ||
		ids.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
	)
		throw error(400, 'Pilih setidaknya satu kelas yang valid.');
	const context = await loadClassQrPrintContext(locals);
	const { cards } = await getClassQrCards(locals, [...new Set(ids)], request);
	const rendered = await Promise.all(
		cards.map(async (card) => ({
			nama: card.nama,
			image: await QRCode.toDataURL(card.payload, {
				scale: 12,
				margin: 4,
				errorCorrectionLevel: 'M'
			})
		}))
	);
	const pdf = Buffer.from(await renderPDF(renderClassQrHTML({ ...context, cards: rendered })));
	return new Response(new Blob([pdf], { type: 'application/pdf' }), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': pdfDisposition(
				pdfFilename('QR Kelas', `${cards.length} Kelas`, context.contextLabel)
			),
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
