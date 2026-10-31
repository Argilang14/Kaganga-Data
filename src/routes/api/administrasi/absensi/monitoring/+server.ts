import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadAttendanceMonitoring } from '$lib/server/attendance-monitoring';

export const GET: RequestHandler = async ({ locals, url, cookies }) =>
	json(await loadAttendanceMonitoring(locals, url.searchParams,cookies), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
