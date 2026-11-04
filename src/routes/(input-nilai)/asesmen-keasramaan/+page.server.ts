import { mutateDormEvaluation } from '$lib/server/dorm-evaluation';
import { loadDormInputPage } from '$lib/server/dorm-evaluation-pages';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = loadDormInputPage;
export const actions: Actions = { default: mutateDormEvaluation };
