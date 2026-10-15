import { loadMonitor } from '$lib/server/class-monitoring';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => ({
	meta: { title: 'Monitoring Kelas' },
	monitoring: await loadMonitor(locals, url.searchParams)
});
