import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import { tablePegawaiDokumen } from '$lib/server/db/schema';
import { readPegawaiDocument, safeDocumentFilename } from '$lib/server/pegawai-documents';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	authority('sekolah_manage');
	if (!locals.user) throw error(401, 'Sesi tidak valid.');
	await ensurePegawaiSchema();
	const id = Number(params.id);
	const sekolahId = locals.sekolah?.id;
	if (!Number.isInteger(id) || id <= 0 || !sekolahId) throw error(404, 'Dokumen tidak ditemukan.');
	const document = await db.query.tablePegawaiDokumen.findFirst({
		where: and(eq(tablePegawaiDokumen.id, id), eq(tablePegawaiDokumen.sekolahId, sekolahId))
	});
	const filename = safeDocumentFilename(document?.filePath);
	if (!document || !filename) throw error(404, 'Dokumen tidak ditemukan.');
	try {
		const file = await readPegawaiDocument(filename);
		return new Response(file, {
			headers: {
				'Content-Type': document.mimeType || 'application/octet-stream',
				'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.nama)}`,
				'Cache-Control': 'private, max-age=300',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch {
		throw error(404, 'Berkas dokumen tidak ditemukan.');
	}
};
