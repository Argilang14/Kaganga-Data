import { error, isHttpError, json } from '@sveltejs/kit';
import { parseInformationPrintOptions } from '$lib/student-profile-print';
import {
	buildStudentInformationPages,
	loadInformationPrintContext,
	requireInformationPrintAccess
} from '$lib/server/student-information-print';
import { normalizeStudentProfileImage } from '$lib/server/student-profile-image';
import { renderStudentInformationHTML } from '$lib/server/pdf/templates/informasi-siswa';
import { renderStudentInformationPDF } from '$lib/server/pdf/student-information-pdf';
import { writeAuditLog } from '$lib/server/audit-log';
import { pdfDisposition, pdfFilename } from '$lib/pdf-filename';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
let generating = false;

export const GET: RequestHandler = async ({ locals }) => {
	return json(await loadInformationPrintContext(locals), { headers });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	await requireInformationPrintAccess(locals);
	if (generating)
		error(429, 'PDF Informasi Siswa lain sedang diproses. Tunggu sebentar lalu coba lagi.');
	generating = true;
	try {
		if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
			error(415, 'Format permintaan tidak sesuai. Muat ulang halaman cetak.');
		const form = await request.formData().catch(() => null);
		if (!form) error(400, 'Pilihan cetak tidak terbaca. Pilih kembali kelas dan murid.');
		let options;
		try {
			options = parseInformationPrintOptions(JSON.parse(String(form.get('options'))));
		} catch (cause) {
			error(
				400,
				cause instanceof SyntaxError
					? 'Pilihan cetak tidak terbaca. Muat ulang halaman.'
					: (cause as Error).message
			);
		}
		const students = await buildStudentInformationPages(locals, options);
		let backgroundImage: string | null = null;
		if (options.background === 'custom') {
			const file = form.get('background');
			if (!(file instanceof File))
				error(400, 'Background kustom belum dipilih. Pilih gambar terlebih dahulu.');
			const bytes = await normalizeStudentProfileImage(file);
			backgroundImage = `data:image/jpeg;base64,${bytes.toString('base64')}`;
		}
		const pdf = await renderStudentInformationPDF(
			renderStudentInformationHTML(students, { background: options.background, backgroundImage })
		);
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'murid_profil_pdf',
			summary: 'PDF Informasi Siswa dibuat',
			after: {
				count: students.length,
				masked: options.maskIdentity,
				background: options.background
			}
		});
		return new Response(new Blob([Buffer.from(pdf)], { type: 'application/pdf' }), {
			headers: {
				...headers,
				'content-type': 'application/pdf',
				'content-disposition': pdfDisposition(
					pdfFilename(
						'Informasi Siswa',
						students.length === 1 ? students[0].nama : `${students.length} Murid`,
						students[0].kelas
					)
				)
			}
		});
	} catch (cause) {
		if (isHttpError(cause))
			return json({ message: cause.body.message }, { status: cause.status, headers });
		console.error(
			'[student-information-pdf] generation failed',
			cause instanceof Error ? cause.name : 'UnknownError'
		);
		return json(
			{
				message: 'PDF belum dapat dibuat. Minta admin memeriksa Chrome/Edge server lalu coba lagi.'
			},
			{ status: 500, headers }
		);
	} finally {
		generating = false;
	}
};
