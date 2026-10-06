import type { PageServerLoad } from './$types';
import { loadAttendanceMonitoring } from '$lib/server/attendance-monitoring';

export const load: PageServerLoad = async ({ locals, url }) => ({
	meta: { title: 'Monitoring & Rekap Absensi' } satisfies PageMeta,
	monitoring: await loadAttendanceMonitoring(locals, url.searchParams)
});
