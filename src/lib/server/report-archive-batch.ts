import { error } from '@sveltejs/kit';
import { PDFDocument } from 'pdf-lib';
import {
	reportHistoryIds,
	verifiedReportMetadata,
	type ArchiveKind,
	type ArchivePeriod
} from '../report-archive';
import {
	historicalReportInfo,
	previewOrFinalizeReport,
	requireArchiveAccess,
	requireArchiveAction
} from './report-archive';
import db from './db';
import { tableMuridRiwayatKelas } from './db/schema';
import { and, eq } from 'drizzle-orm';

export async function previewReportBatch(
	locals: App.Locals,
	kind: ArchiveKind,
	period: ArchivePeriod,
	body: Record<string, unknown>,
	request: Request
) {
	requireArchiveAccess(locals, kind);
	requireArchiveAction(locals, 'finalisasi');
	requireArchiveAction(locals, 'massal');
	let ids: number[];
	try {
		ids = reportHistoryIds(body.historyIds);
		verifiedReportMetadata(body.metadata);
	} catch (cause) {
		throw error(400, (cause as Error).message);
	}
	if (body.confirmMetadata !== true)
		throw error(400, 'Konfirmasikan identitas untuk seluruh dokumen terpilih.');
	let classId: number | null = null;
	const caregivers = new Set<string>();
	for (const id of ids) {
		const info = await historicalReportInfo(locals, id, kind, period, true);
		const context = await db.query.tableMuridRiwayatKelas.findFirst({
			where: and(
				eq(tableMuridRiwayatKelas.id, id),
				eq(tableMuridRiwayatKelas.sekolahId, locals.sekolah!.id)
			)
		});
		if (!context?.kelasId || (classId !== null && classId !== context.kelasId))
			throw error(400, 'Satu proses massal hanya boleh memuat satu kelas dan periode.');
		classId = context.kelasId;
		if (kind === 'asrama')
			caregivers.add(info.metadata.caregiverName.trim().toLocaleLowerCase('id-ID'));
		if (caregivers.size > 1)
			throw error(
				409,
				'Murid terpilih memiliki Wali Asuh berbeda. Pisahkan kelompok penandatangan.'
			);
		if (info.archived || info.coverage.status !== 'nilai_inti_lengkap')
			throw error(409, `${info.studentName}: rapor sudah final atau nilai inti belum lengkap.`);
	}
	const merged = await PDFDocument.create(),
		plan: { id: number; hash: string }[] = [];
	let size = 0;
	for (const id of ids) {
		const item = await previewOrFinalizeReport(
			locals,
			id,
			kind,
			period,
			{ action: 'preview', metadata: body.metadata, confirmMetadata: true, bulkPreview: true },
			request
		);
		size += item.bytes.length;
		if (size > 25 * 1024 * 1024)
			throw error(413, 'PDF gabungan terlalu besar. Kurangi jumlah murid.');
		const pdf = await PDFDocument.load(item.bytes);
		const pages = await merged.copyPages(pdf, pdf.getPageIndices());
		for (const p of pages) merged.addPage(p);
		plan.push({ id, hash: item.hash });
	}
	return { bytes: await merged.save(), plan };
}
