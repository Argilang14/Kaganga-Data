import {
	personalQrTransaction,
	issuePersonalQr,
	loadActivePrintableQr,
	preparePersonalQr
} from '$lib/server/student-qr';
import { canAttendance } from '$lib/attendance-access';
import { assertStudentAccess } from '$lib/server/attendance-student-access';
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

	if (
		!canAttendance(locals.user, 'lihat') ||
		!(await assertStudentAccess(locals.user, sekolahId, murid.id, true))
	)
		throw error(403, 'Murid di luar penugasan akun.');
	await preparePersonalQr();
	const current = await loadActivePrintableQr(murid.id);
	if (current.status === 'not_printable')
		throw error(409, 'QR perlu diperiksa melalui Kartu Absensi.');
	let token = current.status === 'ready' ? current.token : murid.qrToken;
	if (!token) {
		if (!canAttendance(locals.user, 'qr_manage'))
			throw error(403, 'Izin pengelolaan QR diperlukan.');
		token = (await personalQrTransaction((tx) => issuePersonalQr(sekolahId, murid.id, false, tx)))
			.token;
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
