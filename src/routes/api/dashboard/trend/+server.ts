import { json } from '@sveltejs/kit';
import { loadDashboardTrend } from '$lib/server/dashboard-trend';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) =>
	json(await loadDashboardTrend(locals, url.searchParams), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
