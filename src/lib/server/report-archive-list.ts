import { and, asc, eq } from 'drizzle-orm';
import db from './db';
import { tableMuridRiwayatKelas, tableMurid } from './db/schema';
import { studentAccessCondition, accessibleClassIds } from './student-access';
import { tableKelas } from './db/schema';
import { historicalReportInfo, requireArchiveAccess, canArchiveAction } from './report-archive';
import {
	archiveKinds,
	archivePrintPermission,
	type ArchiveKind,
	type ArchivePeriod
} from '../report-archive';
import { isAuthorizedUser } from '../../routes/pengguna/permissions';
import { reportArchiveFilters, type ReportArchiveFilterInput } from '../report-archive-filters';
import { resolveSekolahAcademicContext } from './db/academic';

export async function reportArchiveList(
	locals: App.Locals,
	kind: ArchiveKind,
	period: ArchivePeriod,
	classId: number,
	page: number,
	filters: Omit<ReportArchiveFilterInput, 'classId'> = {}
) {
	requireArchiveAccess(locals, kind);
	const ids = await accessibleClassIds(locals.user, locals.sekolah!.id, undefined, 'assigned');
	const all = await db.query.tableKelas.findMany({
		where: eq(tableKelas.sekolahId, locals.sekolah!.id),
		with: { semester: true, tahunAjaran: true },
		orderBy: asc(tableKelas.nama)
	});
	const classOptions = all
		.filter((v) => ids.includes(v.id))
		.map((v) => ({
			id: v.id,
			label: v.nama,
			yearId: v.tahunAjaranId,
			yearLabel: v.tahunAjaran?.nama ?? '',
			semesterId: v.semesterId,
			semesterLabel:
				v.semester?.tipe === 'ganjil'
					? 'Ganjil'
					: v.semester?.tipe === 'genap'
						? 'Genap'
						: (v.semester?.nama ?? ''),
			semesterType: v.semester?.tipe ?? ''
		}));
	const academic = await resolveSekolahAcademicContext(locals.sekolah!.id);
	const selection = reportArchiveFilters(
		classOptions,
		{ classId, ...filters },
		{ yearId: academic.activeTahunAjaranId, semesterId: academic.activeSemesterId }
	);
	const selected = selection.classId;
	const histories = selected
		? await db
				.select({ id: tableMuridRiwayatKelas.id, name: tableMuridRiwayatKelas.namaSnapshot })
				.from(tableMuridRiwayatKelas)
				.innerJoin(tableMurid, eq(tableMuridRiwayatKelas.muridId, tableMurid.id))
				.where(
					and(
						eq(tableMuridRiwayatKelas.sekolahId, locals.sekolah!.id),
						eq(tableMuridRiwayatKelas.kelasId, selected),
						await studentAccessCondition(locals.user, locals.sekolah!.id, undefined, 'assigned')
					)
				)
				.orderBy(asc(tableMuridRiwayatKelas.namaSnapshot), asc(tableMuridRiwayatKelas.id))
				.limit(21)
				.offset((page - 1) * 20)
		: [];
	const items = [];
	for (const h of histories.slice(0, 20)) {
		try {
			const info = await historicalReportInfo(locals, h.id, kind, period);
			items.push({ id: h.id, name: h.name, info, problem: '' });
		} catch (cause) {
			if (!(cause && typeof cause === 'object' && 'status' in cause)) throw cause;
			items.push({
				id: h.id,
				name: h.name,
				info: null,
				problem: 'Sumber riwayat perlu diperiksa.'
			});
		}
	}
	return {
		...selection,
		classOptions,
		page,
		hasNext: histories.length > 20,
		kind,
		period,
		items,
		availableKinds: archiveKinds.filter((k) =>
			isAuthorizedUser([archivePrintPermission(k)], locals.user)
		),
		canBulk: canArchiveAction(locals, 'massal') && canArchiveAction(locals, 'finalisasi')
	};
}
