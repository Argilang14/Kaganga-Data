import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ url }) => {
	const params = new URLSearchParams(url.search);
	params.set('bagian', 'asrama');
	params.delete('kelas_id');
	redirect(303, `/cetak-raport?${params}`);
};
