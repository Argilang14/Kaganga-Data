import db from '$lib/server/db';
import { tableDocumentAttachment } from '$lib/server/db/schema';
import { readAttachment } from '$lib/server/document-attachments';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

export async function GET({ locals, params, url }) {
	if (!locals.user) throw error(401, 'Tidak terautentikasi.');
	if (locals.user.type !== 'admin' && !locals.user.permissions?.some((permission) => permission === 'berkas_lihat' || permission === 'berkas_manage')) throw error(403, 'Tidak diizinkan.');
	const sekolahId = locals.sekolah?.id;
	const id = Number(params.id);
	if (!sekolahId || !Number.isInteger(id)) throw error(400, 'Berkas tidak valid.');
	const row = await db.query.tableDocumentAttachment.findFirst({ where: and(eq(tableDocumentAttachment.id, id), eq(tableDocumentAttachment.sekolahId, sekolahId)) });
	if (!row) throw error(404, 'Berkas tidak ditemukan.');
	const buffer = await readAttachment(row.storedPath);
	if (!buffer) throw error(404, 'File fisik tidak ditemukan.');
	const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
	const safeName = row.originalName.replace(/[\r\n"\\]/g, '_');
	return new Response(buffer, { headers: { 'content-type': row.mimeType, 'content-length': String(buffer.length), 'content-disposition': `${disposition}; filename="${safeName}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' } });
}
