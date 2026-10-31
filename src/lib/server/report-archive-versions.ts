import { and, asc, eq } from 'drizzle-orm';
import db from './db';
import {
	tableRaporArsip,
	tableRaporArsipRevisi,
	tableRaporMartikulasiArsip,
	tableRaporMartikulasiRevisi
} from './db/schema';
import type { ArchiveKind } from '../report-archive';

export function reportArchiveTables(kind: ArchiveKind) {
	return kind === 'martikulasi'
		? { base: tableRaporMartikulasiArsip, revisions: tableRaporMartikulasiRevisi }
		: { base: tableRaporArsip, revisions: tableRaporArsipRevisi };
}

export async function reportVersions(
	schoolId: number,
	historyId: number,
	kind: ArchiveKind,
	period: 'rts' | 'ras',
	reader: typeof db | DBTransaction = db
) {
	const tables = reportArchiveTables(kind),
		t = tables.base,
		r = tables.revisions;
	const [base] = await reader
		.select()
		.from(t)
		.where(
			and(
				eq(t.sekolahId, schoolId),
				eq(t.historyId, historyId),
				eq(t.jenis, kind),
				eq(t.periode, period)
			)
		)
		.limit(1);
	if (!base) return [];
	const revisions = await reader
		.select()
		.from(r)
		.where(eq(r.arsipId, base.id))
		.orderBy(asc(r.nomor));
	return [
		{ ...base, arsipId: base.id, nomor: 1, alasan: 'Finalisasi awal', sebelumnyaId: null },
		...revisions
	];
}
export type ReportVersion = Awaited<ReturnType<typeof reportVersions>>[number];
export function publicReportVersion(row: ReportVersion) {
	return {
		id: row.id,
		baseId: row.arsipId,
		number: row.nomor,
		reason: row.alasan,
		createdAt: row.createdAt,
		sha256: row.sha256,
		sizeBytes: row.sizeBytes
	};
}
