import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadAttendanceMonitoring } from '$lib/server/attendance-monitoring';

export const GET: RequestHandler = async ({ locals, url }) =>
	json(await loadAttendanceMonitoring(locals, url.searchParams), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
