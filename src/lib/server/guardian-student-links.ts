import db from './db';
import { tableAuthUserMurid, tableMurid } from './db/schema';
import { and, eq } from 'drizzle-orm';
import { ensureDataGovernanceSchema } from './db/ensure-data-governance';
import { assertMuridIdentityConsistent } from './murid-identity-service';

export async function guardianStudentLinks(
	userId: number,
	school: number,
	semester: number | null
) {
	await ensureDataGovernanceSchema();
	const links = await db
		.select({
			id: tableMurid.id,
			semesterId: tableMurid.semesterId,
			hubungan: tableAuthUserMurid.hubungan
		})
		.from(tableAuthUserMurid)
		.innerJoin(tableMurid, eq(tableMurid.id, tableAuthUserMurid.muridId))
		.where(and(eq(tableAuthUserMurid.authUserId, userId), eq(tableMurid.sekolahId, school)));
	const seen = new Set<number>();
	const result = [];
	for (const link of links) {
		if (seen.has(link.id)) continue;
		const identity = await db.query.tableMuridIdentityLink.findFirst({
			where: (row, { and, eq }) => and(eq(row.muridId, link.id), eq(row.sekolahId, school))
		});
		const members = identity
			? await assertMuridIdentityConsistent(db, school, identity.identityUid, link.id)
			: [{ id: link.id, semesterId: link.semesterId }];
		const ids = members.map((row) => row.id);
		ids.forEach((id) => seen.add(id));
		const active = members.find((row) => row.semesterId === semester);
		const latest =
			active ?? members.toSorted((a, b) => b.semesterId - a.semesterId || b.id - a.id)[0];
		if (!latest) continue;
		const student = await db.query.tableMurid.findFirst({
			where: and(eq(tableMurid.id, latest.id), eq(tableMurid.sekolahId, school)),
			with: { kelas: true }
		});
		if (!student) continue;
		result.push({
			muridId: student.id,
			nama: student.nama,
			nis: student.nis,
			kelas: active
				? (student.kelas?.nama ?? 'Belum memiliki kelas')
				: 'Belum ditempatkan pada periode aktif',
			fase: active ? (student.kelas?.fase ?? null) : null,
			hubungan: link.hubungan,
			memberIds: ids,
			activeId: active?.id ?? null
		});
	}
	return result;
}
