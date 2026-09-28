import db from '$lib/server/db/index.js';
import { tableMurid } from '$lib/server/db/schema.js';
import { writeAuditLog } from '$lib/server/audit-log';
import { syncMuridGovernance } from '$lib/server/murid-lifecycle';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { meta: { title: 'Hapus Murid' } };
};

export const actions: Actions = {
	async delete({ params, locals, request }) {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return { message: 'Sekolah aktif tidak ditemukan.' };
		const id = Number(params.id);
		const murid = await db.query.tableMurid.findFirst({
			where: and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, sekolahId))
		});
		if (!murid) return { message: 'Data murid tidak ditemukan.' };
		await syncMuridGovernance(sekolahId, [id], 'keluar', {
			tanggalStatus: new Date().toISOString().slice(0, 10),
			alasan: 'Data murid dihapus dari daftar aktif.'
		});
		await db
			.delete(tableMurid)
			.where(and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, sekolahId)));
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'murid',
			entityId: id,
			summary: `Data murid ${murid.nama} dihapus.`,
			before: murid
		});
		return { message: 'Data murid berhasil dihapus' };
	}
};
