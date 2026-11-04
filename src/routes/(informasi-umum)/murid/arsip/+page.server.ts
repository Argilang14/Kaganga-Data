import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export { studentArchiveActions as actions } from '$lib/server/student-archive';

export const load: PageServerLoad = ({ url }) => {
	const params = new URLSearchParams(url.searchParams);
	params.set('view', 'arsip');
	redirect(303, `/murid/semua?${params}`);
};
