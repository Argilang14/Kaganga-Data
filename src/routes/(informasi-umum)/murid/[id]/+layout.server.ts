import db from '$lib/server/db/index.js';
import { ensureKesehatanMuridSchema } from '$lib/server/db/ensure-kesehatan-murid';
import { ensureMuridWaliAsramaSchema } from '$lib/server/db/ensure-murid-wali-asrama';
import {
	tableKesehatanMurid,
	tableMurid,
	tableMuridIdentityLink,
	tableAsramaPenempatan,
	tableAsramaKamar,
	tableAsrama
} from '$lib/server/db/schema.js';
import { dormToday } from '$lib/dormitory';
import { error } from '@sveltejs/kit';
import { and, desc, eq, isNull, lte, inArray } from 'drizzle-orm';
import { muridIdentityIds } from '$lib/server/murid-identity-service';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	await ensureMuridWaliAsramaSchema();
	await ensureKesehatanMuridSchema();
	await ensureDataGovernanceSchema();

	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(400, 'Sekolah aktif tidak ditemukan');
	const muridId = Number(params.id);
	if (!Number.isInteger(muridId) || muridId <= 0) error(400, 'Data murid tidak valid');

	const murid = await db.query.tableMurid.findFirst({
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId)),
		with: { kelas: true, alamat: true, ibu: true, ayah: true, wali: true }
	});
	if (!murid) error(404, `Data murid tidak ditemukan`);
	const [placement] = await db
		.select({ asrama: tableAsrama.nama, kamar: tableAsramaKamar.nama })
		.from(tableAsramaPenempatan)
		.innerJoin(
			tableMuridIdentityLink,
			and(
				eq(tableMuridIdentityLink.identityUid, tableAsramaPenempatan.identityUid),
				eq(tableMuridIdentityLink.sekolahId, tableAsramaPenempatan.sekolahId)
			)
		)
		.innerJoin(tableAsramaKamar, eq(tableAsramaKamar.id, tableAsramaPenempatan.kamarId))
		.innerJoin(tableAsrama, eq(tableAsrama.id, tableAsramaKamar.asramaId))
		.where(
			and(
				eq(tableMuridIdentityLink.muridId, murid.id),
				eq(tableAsramaPenempatan.sekolahId, sekolahId),
				isNull(tableAsramaPenempatan.selesai),
				lte(tableAsramaPenempatan.mulai, dormToday())
			)
		)
		.orderBy(desc(tableAsramaPenempatan.mulai), desc(tableAsramaPenempatan.id))
		.limit(1);

	const kesehatanMurid = await db.query.tableKesehatanMurid.findMany({
		where: and(
			inArray(tableKesehatanMurid.muridId, await muridIdentityIds(db, sekolahId, murid.id)),
			eq(tableKesehatanMurid.sekolahId, murid.sekolahId)
		),
		orderBy: [desc(tableKesehatanMurid.tanggalPengukuran), desc(tableKesehatanMurid.id)],
		with: { petugas: { columns: { id: true, username: true } } }
	});

	return {
		murid,
		asrama: placement
			? placement.asrama === placement.kamar
				? placement.asrama
				: `${placement.asrama} / ${placement.kamar}`
			: null,
		kesehatanTerbaru: kesehatanMurid.at(0) ?? null,
		kesehatanRiwayat: kesehatanMurid,
		meta: { title: 'Detail Murid' }
	};
};
import type { LayoutServerLoad } from './$types';
