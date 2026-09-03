import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableBukuTamu } from '$lib/server/db/schema';
import { readBukuTamuSignature } from '$lib/server/buku-tamu-signature';
import { isAuthorizedUser } from '../../../../pengguna/permissions';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, params }) => {
	if (!isAuthorizedUser(['administrasi_buku_tamu'], locals.user)) throw error(403, 'Forbidden');
	const sekolahId = locals.sekolah?.id;
	const id = Number(params.id);
	if (!sekolahId || !Number.isInteger(id)) throw error(400, 'Permintaan tidak valid.');
	const row = await db.query.tableBukuTamu.findFirst({
		columns: { tandaTangan: true },
		where: and(eq(tableBukuTamu.id, id), eq(tableBukuTamu.sekolahId, sekolahId))
	});
	const image = await readBukuTamuSignature(row?.tandaTangan);
	if (!image) throw error(404, 'Tanda tangan tidak ditemukan.');
	return new Response(image, {
		headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=300' }
	});
}) satisfies RequestHandler;
