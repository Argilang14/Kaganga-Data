import db from './db';
import { tableSemester, tableTahunAjaran } from './db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { writeAuditLog } from './audit-log';

const identifier = (name: string) => sql.raw(`"${name.replaceAll('"', '""')}"`);

export async function deleteEmptyAcademicYears(
	locals: App.Locals,
	request: Request,
	school: number,
	requestedIds: number[]
) {
	const ids = [...new Set(requestedIds)];
	if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
		error(400, 'Pilih tahun ajaran yang valid.');
	if (!locals.user || (locals.user.type !== 'admin' && locals.user.sekolahId !== school))
		error(403, 'Tahun ajaran berada di luar sekolah akun ini.');
	return db.transaction(async (tx) => {
		const years = await tx.query.tableTahunAjaran.findMany({
			where: and(eq(tableTahunAjaran.sekolahId, school), inArray(tableTahunAjaran.id, ids))
		});
		if (years.length !== ids.length) error(404, 'Tahun ajaran tidak ditemukan di sekolah ini.');
		if (years.some((year) => year.isAktif)) error(409, 'Tahun ajaran aktif tidak dapat dihapus.');
		const semesters = await tx.query.tableSemester.findMany({
			columns: { id: true },
			where: inArray(tableSemester.tahunAjaranId, ids)
		});
		const semesterIds = semesters.map((row) => row.id);
		// Inspect every period-bearing table, including optional modules, before any cascade runs.
		const tables = await tx.all<{ name: string }>(
			sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
		);
		for (const { name } of tables) {
			if (name === 'tahun_ajaran' || name === 'semester') continue;
			const columns = await tx.all<{ name: string }>(sql`PRAGMA table_info(${identifier(name)})`);
			for (const [column, values] of [
				['tahun_ajaran_id', ids],
				['semester_id', semesterIds]
			] as const) {
				if (!values.length || !columns.some((item) => item.name === column)) continue;
				const found = await tx.all(
					sql`SELECT 1 FROM ${identifier(name)} WHERE ${identifier(column)} IN (${sql.join(
						values.map((id) => sql`${id}`),
						sql`,`
					)}) LIMIT 1`
				);
				if (found.length)
					error(
						409,
						'Tahun ajaran masih memiliki data atau riwayat. Pertahankan tahun lama; aktifkan periode tujuan melalui Data Rapor.'
					);
			}
		}
		await tx.delete(tableTahunAjaran).where(inArray(tableTahunAjaran.id, ids));
		await writeAuditLog(
			{
				locals,
				request,
				action: 'delete',
				entityType: 'tahun_ajaran',
				entityId: ids.join(','),
				summary: 'Tahun ajaran kosong dihapus setelah pemeriksaan retensi.',
				before: years
			},
			tx
		);
	});
}
