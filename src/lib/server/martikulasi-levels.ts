import db from './db';
import { tableKelas, tableMartikulasiHasil } from './db/schema';
import { ensureMartikulasiSchema } from './db/ensure-martikulasi';
import { muridIdentityIds } from './murid-identity-service';
import { martikulasiLevelLabel } from '$lib/martikulasi';
import { and, desc, eq, inArray } from 'drizzle-orm';

/** Resolve the student's level within the class's academic year, including linked semester records. */
export async function getMartikulasiResults(
	sekolahId: number,
	kelasId: number,
	muridIds: number[]
) {
	const levels = new Map<
		number,
		{ level: string | null; capaian: Record<string, string | null> }
	>();
	if (!muridIds.length) return levels;
	const kelas = await db.query.tableKelas.findFirst({
		columns: { tahunAjaranId: true },
		where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!kelas) return levels;
	await ensureMartikulasiSchema();
	const members = await Promise.all(
		muridIds.map(async (id) => ({ id, ids: await muridIdentityIds(db, sekolahId, id) }))
	);
	const results = await db.query.tableMartikulasiHasil.findMany({
		columns: { muridId: true, levelPenempatan: true },
		with: {
			nilai: {
				columns: { aspekKode: true, capaianAkhir: true, deskripsiCapaian: true, kelompok: true }
			}
		},
		where: and(
			eq(tableMartikulasiHasil.sekolahId, sekolahId),
			eq(tableMartikulasiHasil.tahunAjaranId, kelas.tahunAjaranId),
			inArray(tableMartikulasiHasil.muridId, [...new Set(members.flatMap((row) => row.ids))])
		),
		orderBy: desc(tableMartikulasiHasil.updatedAt)
	});
	for (const member of members) {
		const result =
			results.find((row) => row.muridId === member.id) ??
			results.find((row) => member.ids.includes(row.muridId));
		levels.set(member.id, {
			level: martikulasiLevelLabel(result?.levelPenempatan),
			capaian: Object.fromEntries(
				(result?.nilai ?? []).map((nilai) => [
					nilai.aspekKode,
					nilai.kelompok === 'akademik' ? nilai.capaianAkhir : nilai.deskripsiCapaian
				])
			)
		});
	}
	return levels;
}

export async function getMartikulasiLevels(sekolahId: number, kelasId: number, muridIds: number[]) {
	return new Map(
		[...(await getMartikulasiResults(sekolahId, kelasId, muridIds))].map(([id, result]) => [
			id,
			result.level
		])
	);
}
