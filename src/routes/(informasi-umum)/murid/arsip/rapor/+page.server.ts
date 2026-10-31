import { error } from '@sveltejs/kit';
import { reportSelection } from '$lib/report-archive';
import { reportArchiveList } from '$lib/server/report-archive-list';
import { isAuthorizedUser } from '../../../../pengguna/permissions';
import { reportFilterId } from '$lib/report-archive-filters';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:rapor-arsip');
	let selected;
	try {
		selected = reportSelection(
			url.searchParams.get('jenis') ??
				(isAuthorizedUser(['cetak_akademik'], locals.user) ? 'sekolah' : 'asrama'),
			url.searchParams.get('periode') ?? 'ras'
		);
	} catch {
		throw error(400, 'Jenis/periode rapor tidak valid.');
	}
	const classId = Number(url.searchParams.get('kelas_id') ?? 0),
		page = Number(url.searchParams.get('page') ?? 1);
	if (
		!Number.isSafeInteger(classId) ||
		classId < 0 ||
		!Number.isSafeInteger(page) ||
		page < 1 ||
		page > 10000
	)
		throw error(400, 'Filter riwayat rapor tidak valid.');
	let yearId, semesterId;
	try {
		yearId = reportFilterId(url.searchParams.get('tahun_ajaran_id'));
		semesterId = reportFilterId(url.searchParams.get('semester_id'));
	} catch {
		throw error(400, 'Filter tahun pelajaran atau semester tidak valid.');
	}
	return {
		...(await reportArchiveList(locals, selected.kind, selected.period, classId, page, {
			yearId,
			semesterId
		})),
		meta: { title: 'Riwayat Rapor' }
	};
};
