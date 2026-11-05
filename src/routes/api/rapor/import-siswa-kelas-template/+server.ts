import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	requireStudentExchangeAccess,
	studentExchangeWorkbook,
	studentExchangeCsv,
	StudentExchangeError
} from '$lib/server/student-exchange';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		requireStudentExchangeAccess(locals);
		const csv = url.searchParams.get('format') === 'csv';
		const body = csv
			? studentExchangeCsv([])
			: await studentExchangeWorkbook(
					[],
					'Template kosong. Isi baris kedua dan seterusnya pada sheet Data Siswa.'
				);
		return new Response(body, {
			headers: {
				'Content-Type': csv
					? 'text/csv; charset=utf-8'
					: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="template-siswa-setara-kaganga.${csv ? 'csv' : 'xlsx'}"`,
				'Cache-Control': 'private, no-store'
			}
		});
	} catch (cause) {
		if (cause instanceof StudentExchangeError) error(cause.status, cause.message);
		throw cause;
	}
};
