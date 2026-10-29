import { error, json } from '@sveltejs/kit';
import { loadDashboardDaily } from '$lib/server/dashboard-daily';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { cookieNames } from '$lib/utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	if (!locals.user || !locals.sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	const academic = await resolveSekolahAcademicContext(locals.sekolah.id);
	const classCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID);
	const activeClassId = classCookie ? Number(classCookie) : null;
	return json(await loadDashboardDaily(locals, academic, url.searchParams, true, activeClassId), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
};
