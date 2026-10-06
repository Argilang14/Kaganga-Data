import { buildJadwalMapelWorkbook } from '$lib/server/jadwal-mapel-excel';
import db from '$lib/server/db';
import { tablePegawai } from '$lib/server/db/schema';
import { ensureJadwalKurikulumSchema } from '$lib/server/db/ensure-jadwal-kurikulum';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';

export async function GET({ locals }) {
	await ensureJadwalKurikulumSchema();
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');
	const guruList = await db.query.tablePegawai.findMany({
		columns: { id: true, nama: true, nip: true },
		where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
		orderBy: asc(tablePegawai.nama)
	});
	const workbook = buildJadwalMapelWorkbook({ guruList, includeExample: true });
	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="template-data-mata-pelajaran.xlsx"',
			'Cache-Control': 'no-store'
		}
	});
}
