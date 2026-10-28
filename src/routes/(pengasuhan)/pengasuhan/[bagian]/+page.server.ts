import { error } from '@sveltejs/kit';
import { careSections, type CareSection } from '$lib/pengasuhan';
import { loadCare, mutateCare } from '$lib/server/pengasuhan';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = (event) => {
	if (!Object.hasOwn(careSections, event.params.bagian))
		error(404, 'Halaman pengasuhan tidak ditemukan.');
	return loadCare(event, event.params.bagian as CareSection);
};
export const actions: Actions = {
	create: (event) => mutateCare(event, 'create'),
	followup: (event) => mutateCare(event, 'followup'),
	report: (event) => mutateCare(event, 'report')
};
