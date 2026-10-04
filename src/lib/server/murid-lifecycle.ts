import db from '$lib/server/db';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import {
	tableKelas,
	tableMurid,
	tableMuridLifecycle,
	tableMuridRiwayatKelas,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { muridIdentityKey } from '$lib/server/murid-identity';
import { linkMuridIdentity } from '$lib/server/murid-identity-service';

export const muridLifecycleStatuses = ['aktif', 'pindah', 'keluar', 'alumni'] as const;
export type MuridLifecycleStatus = (typeof muridLifecycleStatuses)[number];

export async function syncMuridGovernance(
	sekolahId: number,
	muridIds: number[],
	status?: MuridLifecycleStatus,
	detail: { tanggalStatus?: string | null; alasan?: string | null } = {},
	transaction?: DBTransaction
) {
	if (!transaction) {
		await ensureDataGovernanceSchema();
		return db.transaction(async (tx): Promise<void> => {
			await syncMuridGovernance(sekolahId, muridIds, status, detail, tx);
		});
	}
	const reader = transaction;
	const uniqueIds = [...new Set(muridIds.filter((id) => Number.isInteger(id) && id > 0))];
	if (!uniqueIds.length) return;

	const rows = await reader
		.select({
			id: tableMurid.id,
			sekolahId: tableMurid.sekolahId,
			nis: tableMurid.nis,
			nisn: tableMurid.nisn,
			nama: tableMurid.nama,
			tanggalLahir: tableMurid.tanggalLahir,
			kelasId: tableMurid.kelasId,
			semesterId: tableMurid.semesterId,
			tahunAjaranId: tableKelas.tahunAjaranId,
			kelasNama: tableKelas.nama,
			fase: tableKelas.fase,
			semesterNama: tableSemester.nama,
			tahunAjaranNama: tableTahunAjaran.nama
		})
		.from(tableMurid)
		.innerJoin(tableKelas, eq(tableMurid.kelasId, tableKelas.id))
		.innerJoin(tableSemester, eq(tableMurid.semesterId, tableSemester.id))
		.innerJoin(tableTahunAjaran, eq(tableKelas.tahunAjaranId, tableTahunAjaran.id))
		.where(and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, uniqueIds)));

	const now = new Date().toISOString();
	for (const row of rows) {
		const identityUid = await linkMuridIdentity(reader, sekolahId, row);
		const identityKey = muridIdentityKey({ identityUid });
		await reader
			.insert(tableMuridLifecycle)
			.values({
				sekolahId,
				identityKey,
				nis: row.nis,
				nisn: row.nisn?.trim() || null,
				namaSnapshot: row.nama,
				status: status ?? 'aktif',
				tanggalStatus: status ? (detail.tanggalStatus ?? now.slice(0, 10)) : null,
				alasan: status ? detail.alasan?.trim() || null : null,
				lastMuridId: row.id,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [tableMuridLifecycle.sekolahId, tableMuridLifecycle.identityKey],
				set: {
					nis: row.nis,
					nisn: row.nisn?.trim() || null,
					namaSnapshot: row.nama,
					lastMuridId: row.id,
					updatedAt: now,
					...(status
						? {
								status,
								tanggalStatus: detail.tanggalStatus ?? now.slice(0, 10),
								alasan: detail.alasan?.trim() || null
							}
						: {})
				}
			});

		await reader
			.insert(tableMuridRiwayatKelas)
			.values({
				sekolahId,
				identityKey,
				muridId: row.id,
				tahunAjaranId: row.tahunAjaranId,
				semesterId: row.semesterId,
				kelasId: row.kelasId,
				namaSnapshot: row.nama,
				nisSnapshot: row.nis,
				nisnSnapshot: row.nisn?.trim() || null,
				tahunAjaranSnapshot: row.tahunAjaranNama,
				semesterSnapshot: row.semesterNama,
				kelasSnapshot: row.kelasNama,
				faseSnapshot: row.fase,
				statusSnapshot: status ?? 'aktif'
			})
			.onConflictDoUpdate({
				target: tableMuridRiwayatKelas.muridId,
				set: {
					identityKey,
					nisSnapshot: row.nis,
					nisnSnapshot: row.nisn?.trim() || null,
					tahunAjaranId: row.tahunAjaranId,
					semesterId: row.semesterId,
					kelasId: row.kelasId,
					namaSnapshot: row.nama,
					tahunAjaranSnapshot: row.tahunAjaranNama,
					semesterSnapshot: row.semesterNama,
					kelasSnapshot: row.kelasNama,
					faseSnapshot: row.fase,
					...(status ? { statusSnapshot: status } : {})
				}
			});
	}
}
