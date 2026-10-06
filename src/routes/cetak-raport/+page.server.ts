import { loadCetakContext } from '$lib/server/cetak-context';
import { loadCetakBawaan } from '$lib/server/cetak-bawaan';
import { getSchoolPrintFormat } from '$lib/school-print-format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const format = getSchoolPrintFormat(event.locals.sekolah);
	return { ...(format === 'sr' ? await loadCetakContext(event) : format === 'default' ? await loadCetakBawaan(event) : {}), format };
};
