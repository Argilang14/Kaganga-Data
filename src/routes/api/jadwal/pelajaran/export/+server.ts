import { buildJadwalWorkbook, loadJadwalExcelContext } from '$lib/server/jadwal-excel';
import { requireJadwalAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';

export async function GET({ locals, url }) {
	requireJadwalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Pilih sekolah terlebih dahulu.');
	const data = await loadJadwalExcelContext(sekolahId, {
		tahunAjaranId: url.searchParams.get('tahunAjaranId'),
		jenis: url.searchParams.get('jenis')
	});
	const workbook = await buildJadwalWorkbook(data, 'export');
	const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
	const safeYear = data.tahunAjaranNama.replace(/[^0-9A-Za-z-]+/g, '-');
	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Jadwal_Pelajaran_${safeYear}_${data.context.jenis}.xlsx"`,
			'Cache-Control': 'no-store'
		}
	});
}
