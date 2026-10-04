import db from '$lib/server/db/index.js';
import { tableMurid } from '$lib/server/db/schema.js';
import { writeAuditLog } from '$lib/server/audit-log';
import { syncMuridGovernance } from '$lib/server/murid-lifecycle';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { canManageMurid } from '$lib/murid-permissions';
import { getKelasContextForUser } from '$lib/server/route-utils';
import { fail } from '@sveltejs/kit';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';

export const load: PageServerLoad = async () => {
	return { meta: { title: 'Arsipkan Murid' } };
};

export const actions: Actions = {
	async delete({ params, locals, request, url }) {
		await ensureDataGovernanceSchema();
		if (!canManageMurid(locals.user))
			return fail(403, { fail: 'Tidak memiliki izin mengarsipkan murid.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return { message: 'Sekolah aktif tidak ditemukan.' };
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) return fail(400, { fail: 'ID murid tidak valid.' });
		const murid = await db.query.tableMurid.findFirst({
			where: and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, sekolahId))
		});
		if (!murid) return { message: 'Data murid tidak ditemukan.' };
		if (!(await getKelasContextForUser(locals, url, String(id))).hasAccess)
			return fail(403, { fail: 'Tidak memiliki akses ke kelas murid.' });
		await db.transaction(async (tx) => {
			await syncMuridGovernance(
				sekolahId,
				[id],
				'keluar',
				{
					tanggalStatus: new Date().toISOString().slice(0, 10),
					alasan: 'Data murid dihapus dari daftar aktif.'
				},
				tx
			);
			await writeAuditLog(
				{
					locals,
					request,
					action: 'archive',
					entityType: 'murid',
					entityId: id,
					summary: `Data murid ${murid.nama} diarsipkan tanpa menghapus nilai dan presensi.`,
					before: murid
				},
				tx
			);
		});
		return { message: 'Murid diarsipkan; nilai dan presensi tetap tersimpan.' };
	}
};
