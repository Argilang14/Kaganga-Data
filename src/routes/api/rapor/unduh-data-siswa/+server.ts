import { canAttendance } from '$lib/attendance-access';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	exportStudentExchange,
	requireStudentExchangeAccess,
	studentExchangeWorkbook,
	studentExchangeCsv,
	StudentExchangeError
} from '$lib/server/student-exchange';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const schoolId = requireStudentExchangeAccess(locals);
		const semesterId = url.searchParams.has('semesterId')
			? Number(url.searchParams.get('semesterId'))
			: (await resolveSekolahAcademicContext(schoolId)).activeSemesterId;
		if (!semesterId || !Number.isInteger(semesterId))
			throw new StudentExchangeError('Pilih semester terlebih dahulu.');
		const data = await exportStudentExchange({
			schoolId,
			semesterId,
			qrManage: canAttendance(locals.user, 'qr_manage')
		});
		const csv = url.searchParams.get('format') === 'csv';
		const body = csv
			? studentExchangeCsv(data.records)
			: await studentExchangeWorkbook(
					data.records,
					`${data.school} | ${data.semester} | ${data.records.length} siswa`
				);
		return new Response(body, {
			headers: {
				'Content-Type': csv
					? 'text/csv; charset=utf-8'
					: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="data-siswa-setara-kaganga.${csv ? 'csv' : 'xlsx'}"`,
				'Cache-Control': 'private, no-store'
			}
		});
	} catch (cause) {
		if (cause instanceof StudentExchangeError) error(cause.status, cause.message);
		throw cause;
	}
};
