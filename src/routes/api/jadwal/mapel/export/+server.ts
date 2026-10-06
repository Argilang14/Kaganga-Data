import { buildJadwalMapelWorkbook } from '$lib/server/jadwal-mapel-excel';
import db from '$lib/server/db';
import { tableJadwalMapel, tablePegawai } from '$lib/server/db/schema';
import { ensureJadwalKurikulumSchema } from '$lib/server/db/ensure-jadwal-kurikulum';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';

export async function GET({ locals }) {
	await ensureJadwalKurikulumSchema();
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');
	const [rows, guruList] = await Promise.all([
		db.query.tableJadwalMapel.findMany({
			where: eq(tableJadwalMapel.sekolahId, sekolahId),
			orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
		}),
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, nip: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
			orderBy: asc(tablePegawai.nama)
		})
	]);
	const workbook = buildJadwalMapelWorkbook({ rows, guruList });
	const buffer = await workbook.xlsx.writeBuffer();
	const date = new Date().toISOString().slice(0, 10);
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="data-mata-pelajaran-${date}.xlsx"`,
			'Cache-Control': 'no-store'
		}
	});
}
