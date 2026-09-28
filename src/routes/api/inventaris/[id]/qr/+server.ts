import db from '$lib/server/db';
import { ensureInventarisPengumumanSchema } from '$lib/server/db/ensure-inventaris-pengumuman';
import { tableInventaris } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';

export async function GET({ locals, params }) {
	if (!locals.user) throw error(401, 'Tidak terautentikasi.');
	if (
		locals.user.type !== 'admin' &&
		!locals.user.permissions?.some((permission) =>
			['inventaris_lihat', 'inventaris_manage'].includes(permission)
		)
	)
		throw error(403, 'Tidak diizinkan.');
	const sekolahId = locals.sekolah?.id;
	const id = Number(params.id);
	if (!sekolahId || !Number.isInteger(id)) throw error(400, 'Aset tidak valid.');
	await ensureInventarisPengumumanSchema();
	const asset = await db.query.tableInventaris.findFirst({
		columns: { id: true, qrToken: true },
		where: and(eq(tableInventaris.id, id), eq(tableInventaris.sekolahId, sekolahId))
	});
	if (!asset) throw error(404, 'Aset tidak ditemukan.');
	const svg = await QRCode.toString(`KAGANGA-INVENTARIS:${asset.id}:${asset.qrToken}`, {
		type: 'svg',
		margin: 1,
		errorCorrectionLevel: 'M',
		width: 320
	});
	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'cache-control': 'private, max-age=300'
		}
	});
}
