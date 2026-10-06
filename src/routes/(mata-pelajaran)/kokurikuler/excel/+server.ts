import db from '$lib/server/db';
import { canManageKelas } from '$lib/server/kelas-manage';
import { tableKelas, tableKokurikuler } from '$lib/server/db/schema';
import { profilPelajarPancasilaDimensionLabelByKey, type DimensiProfilLulusanKey } from '$lib/statics';
import { cookieNames } from '$lib/utils';
import { writeAoaToBuffer } from '$lib/utils/excel.js';
import { and, asc, eq } from 'drizzle-orm';

export async function GET({ cookies, locals, url }) {
	const kelasId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID));
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !Number.isInteger(kelasId) || !(await canManageKelas(locals.user, sekolahId, kelasId)))
		return new Response('Kelas aktif tidak diizinkan.', { status: 403 });
	const kelas = await db.query.tableKelas.findFirst({
		columns: { nama: true },
		where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!kelas) return new Response('Kelas tidak ditemukan.', { status: 404 });
	const template = url.searchParams.has('template');
	const rows: (string | number)[][] = [['Kode', 'Dimensi', 'Kegiatan']];
	if (!template) {
		const items = await db.query.tableKokurikuler.findMany({
			where: eq(tableKokurikuler.kelasId, kelasId), orderBy: asc(tableKokurikuler.kode)
		});
		for (const item of items) rows.push([
			item.kode,
			(item.dimensi as DimensiProfilLulusanKey[]).map((key) => profilPelajarPancasilaDimensionLabelByKey[key] ?? key).join(', '),
			item.tujuan
		]);
	}
	const buffer = await writeAoaToBuffer(rows);
	const label = kelas.nama.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || String(kelasId);
	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${template ? 'template-' : ''}kokurikuler-${label}.xlsx"`,
			'Cache-Control': 'no-store'
		}
	});
}
