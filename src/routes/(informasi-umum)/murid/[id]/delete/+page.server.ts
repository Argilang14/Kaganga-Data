import { passivateStudents } from '$lib/server/student-passive';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async () => ({ meta: { title: 'Jadikan murid pasif' } });
export const actions: Actions = { delete: passivateStudents };
