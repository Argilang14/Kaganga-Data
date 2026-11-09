import { error, isHttpError, json } from '@sveltejs/kit';
import { parseRosterOptions } from '$lib/caregiver-roster';
import {
	loadCaregiverRoster,
	requireRosterAccess,
	selectRoster
} from '$lib/server/caregiver-roster';
import { renderCaregiverRosterHTML } from '$lib/server/pdf/templates/daftar-wali-asuh';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { composeAlamat, getLogoSrc, getLogoDinasSrc } from '$lib/server/pdf/preview-utils';
import { getSchoolPrintAssets } from '$lib/server/print-assets';
import { writeAuditLog } from '$lib/server/audit-log';
import { pdfDisposition, pdfFilename } from '$lib/pdf-filename';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
let generating = false;
export const GET: RequestHandler = async ({ locals }) =>
	json((await loadCaregiverRoster(locals)).context, { headers });
export const POST: RequestHandler = async ({ locals, request }) => {
	await requireRosterAccess(locals);
	if (generating) error(429, 'Daftar lain sedang dicetak. Tunggu sebentar lalu coba lagi.');
	generating = true;
	try {
		if (!request.headers.get('content-type')?.startsWith('application/json'))
			error(415, 'Format cetak tidak sesuai. Muat ulang halaman.');
		let options;
		try {
			options = parseRosterOptions(await request.json());
		} catch (cause) {
			error(
				400,
				cause instanceof SyntaxError
					? 'Pilihan tidak terbaca. Pilih kembali kelompok cetak.'
					: (cause as Error).message
			);
		}
		const data = await loadCaregiverRoster(locals);
		const selected = selectRoster(data, options);
		const [logoUrl, logoDinasUrl, assets] = await Promise.all([
			getLogoSrc(data.school.id),
			getLogoDinasSrc(data.school.id),
			getSchoolPrintAssets(data.school.id, 'induk', 'portrait')
		]);
		const pdf = await renderPDF(
			renderCaregiverRosterHTML({
				options,
				students: selected.students,
				group: selected.group.nama,
				period: data.context.period,
				school: {
					nama: data.school.nama,
					naungan: data.school.naungan,
					email: data.school.email,
					alamat: composeAlamat(data.school),
					logoUrl,
					logoDinasUrl,
					customLetterheadUrl: assets.customLetterheadUrl
				}
			})
		);
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'daftar_wali_asuh_pdf',
			summary: 'PDF daftar murid dan wali asuh dibuat',
			after: { ...options, count: selected.students.length, period: data.context.period }
		});
		return new Response(new Blob([Buffer.from(pdf)], { type: 'application/pdf' }), {
			headers: {
				...headers,
				'content-type': 'application/pdf',
				'content-disposition': pdfDisposition(
					pdfFilename('Daftar Murid dan Wali Asuh', selected.group.nama, data.context.period)
				)
			}
		});
	} catch (cause) {
		if (isHttpError(cause))
			return json({ message: cause.body.message }, { status: cause.status, headers });
		console.error('[caregiver-roster-pdf]', cause instanceof Error ? cause.name : 'UnknownError');
		return json(
			{
				message:
					'PDF belum dapat dibuat. Minta admin memeriksa browser cetak server lalu coba lagi.'
			},
			{ status: 500, headers }
		);
	} finally {
		generating = false;
	}
};
