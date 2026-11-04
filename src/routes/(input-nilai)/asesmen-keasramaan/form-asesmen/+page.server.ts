import { loadDormGradePage, saveDormGradePage } from '$lib/server/dorm-evaluation-pages';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = loadDormGradePage;
export const actions: Actions = { save: saveDormGradePage };
