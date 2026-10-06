import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import { tableDinasLuarBukti, tableDinasLuarPermohonan, tableSppd } from '$lib/server/db/schema';
import { readDinasLuarFile } from '$lib/server/dinas-luar';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Harus login terlebih dahulu.');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');
	const storedPath = params.path ?? '';
	await ensureSuratMenyuratSchema();

	const [requestRow, sppdRow, proofRow] = await Promise.all([
		db.query.tableDinasLuarPermohonan.findFirst({
			columns: { sekolahId: true },
			where: eq(tableDinasLuarPermohonan.undanganFile, storedPath)
		}),
		db.query.tableSppd.findFirst({
			columns: { sekolahId: true },
			where: eq(tableSppd.undanganFile, storedPath)
		}),
		db.query.tableDinasLuarBukti.findFirst({
			columns: { id: true },
			with: { sppd: { columns: { sekolahId: true } } },
			where: eq(tableDinasLuarBukti.namaFile, storedPath)
		})
	]);
	const ownerSchoolId = requestRow?.sekolahId ?? sppdRow?.sekolahId ?? proofRow?.sppd.sekolahId;
	if (!ownerSchoolId || ownerSchoolId !== sekolahId) throw error(404, 'Berkas tidak ditemukan.');
	const file = await readDinasLuarFile(storedPath);
	if (!file) throw error(404, 'Berkas tidak ditemukan.');
	const lower = storedPath.toLowerCase();
	const contentType = lower.endsWith('.pdf')
		? 'application/pdf'
		: lower.endsWith('.png')
			? 'image/png'
			: lower.endsWith('.webp')
				? 'image/webp'
				: 'image/jpeg';
	return new Response(new Uint8Array(file), {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; sandbox"
		}
	});
};
