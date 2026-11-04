import { mutateDormEvaluation } from '$lib/server/dorm-evaluation';
import { loadDormNotesPage } from '$lib/server/dorm-evaluation-pages';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = loadDormNotesPage;
export const actions: Actions = {
	save: (event) => mutateDormEvaluation(event, 'save'),
	fillAll: (event) => mutateDormEvaluation(event, 'fillAll')
};
