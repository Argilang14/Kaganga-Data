import { randomUUID } from 'node:crypto';
import db from '$lib/server/db';
import { tableMurid } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Login diperlukan');
	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan');

	const muridId = Number(params.id);
	if (!Number.isInteger(muridId) || muridId <= 0) throw error(400, 'ID murid tidak valid');

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true, qrToken: true },
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
	});
	if (!murid) throw error(404, 'Murid tidak ditemukan');

	let token = murid.qrToken;
	if (!token) {
		token = randomUUID();
		await db
			.update(tableMurid)
			.set({ qrToken: token, updatedAt: new Date().toISOString() })
			.where(eq(tableMurid.id, murid.id));
	}

	const payload = JSON.stringify({ type: 'rapkumer-absensi', token });
	const svg = await QRCode.toString(payload, {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 1,
		width: 320
	});

	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'cache-control': 'no-store',
			'content-disposition': `inline; filename="qr-absensi-${murid.id}.svg"`
		}
	});
};
