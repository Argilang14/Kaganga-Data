import { error } from '@sveltejs/kit';
import { reportSelection } from '$lib/report-archive';
import { historicalReportInfo, requireArchiveAction } from '$lib/server/report-archive';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url, params, depends }) => {
	depends('app:rapor-arsip');
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id < 1) throw error(400, 'ID riwayat tidak valid.');
	let selected;
	try {
		selected = reportSelection(
			url.searchParams.get('jenis') ?? 'sekolah',
			url.searchParams.get('periode') ?? 'ras'
		);
	} catch {
		throw error(400, 'Jenis/periode rapor tidak valid.');
	}
	const revision = url.searchParams.get('revisi') === '1';
	if (revision) {
		requireArchiveAction(locals, 'finalisasi');
		requireArchiveAction(locals, 'revisi');
	}
	const report = await historicalReportInfo(locals, id, selected.kind, selected.period, revision);
	if (revision && !report.archived) throw error(409, 'Rapor awal belum tersedia untuk direvisi.');
	return {
		report,
		revision,
		meta: { title: 'Riwayat Pendidikan - Rapor' }
	};
};
