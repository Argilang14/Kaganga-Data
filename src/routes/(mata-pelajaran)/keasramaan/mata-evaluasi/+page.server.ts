import { loadDormMasterPage, mutateDormMasterPage } from '$lib/server/dorm-evaluation-pages';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = loadDormMasterPage;
export const actions: Actions = {
	create: (e) => mutateDormMasterPage(e, 'create'),
	save: (e) => mutateDormMasterPage(e, 'save'),
	bulkDelete: (e) => mutateDormMasterPage(e, 'bulkDelete')
};
