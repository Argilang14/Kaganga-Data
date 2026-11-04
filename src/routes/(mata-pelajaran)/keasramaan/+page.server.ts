import { mutateDormEvaluation } from '$lib/server/dorm-evaluation';
import { loadDormMasterPage, importDormMasterPage } from '$lib/server/dorm-evaluation-pages';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = loadDormMasterPage;
export const actions: Actions = {
	copy_legacy: mutateDormEvaluation,
	import_matev: importDormMasterPage
};
