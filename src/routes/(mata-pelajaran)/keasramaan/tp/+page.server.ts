import { loadDormGoalsPage, mutateDormMasterPage } from '$lib/server/dorm-evaluation-pages';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = loadDormGoalsPage;
export const actions: Actions = {
	create: (e) => mutateDormMasterPage(e, 'goal-create'),
	update: (e) => mutateDormMasterPage(e, 'goal-update'),
	delete: (e) => mutateDormMasterPage(e, 'goal-delete')
};
