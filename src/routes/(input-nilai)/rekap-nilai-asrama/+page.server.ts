import { loadDormRecapPage } from '$lib/server/dorm-evaluation-pages';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = loadDormRecapPage;
