import { loadDormitoryPage, dormitoryActions } from '$lib/server/dormitory-page';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = loadDormitoryPage;
export const actions: Actions = dormitoryActions;
