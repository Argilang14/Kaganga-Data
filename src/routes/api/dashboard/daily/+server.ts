import { error, json } from '@sveltejs/kit';
import { loadDashboardDaily } from '$lib/server/dashboard-daily';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user || !locals.sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	const academic = await resolveSekolahAcademicContext(locals.sekolah.id);
	return json(await loadDashboardDaily(locals, academic, url.searchParams), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
};
