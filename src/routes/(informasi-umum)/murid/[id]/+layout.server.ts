import db from '$lib/server/db/index.js';
import { ensureKesehatanMuridSchema } from '$lib/server/db/ensure-kesehatan-murid';
import { ensureMuridWaliAsramaSchema } from '$lib/server/db/ensure-murid-wali-asrama';
import { tableKesehatanMurid, tableMurid } from '$lib/server/db/schema.js';
import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	await ensureMuridWaliAsramaSchema();
	await ensureKesehatanMuridSchema();

	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(400, 'Sekolah aktif tidak ditemukan');
	const muridId = Number(params.id);
	if (!Number.isInteger(muridId) || muridId <= 0) error(400, 'Data murid tidak valid');

	const murid = await db.query.tableMurid.findFirst({
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId)),
		with: { kelas: true, alamat: true, ibu: true, ayah: true, wali: true }
	});
	if (!murid) error(404, `Data murid tidak ditemukan`);

	const kesehatanMurid = await db.query.tableKesehatanMurid.findMany({
		where: and(
			eq(tableKesehatanMurid.muridId, murid.id),
			eq(tableKesehatanMurid.sekolahId, murid.sekolahId)
		),
		orderBy: [desc(tableKesehatanMurid.tanggalPengukuran), desc(tableKesehatanMurid.id)],
		with: { petugas: { columns: { id: true, username: true } } }
	});

	return {
		murid,
		kesehatanTerbaru: kesehatanMurid.at(0) ?? null,
		kesehatanRiwayat: kesehatanMurid,
		meta: { title: 'Detail Murid' }
	};
};
import type { LayoutServerLoad } from './$types';
