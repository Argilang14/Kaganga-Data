import { redirect } from '@sveltejs/kit';
import { legacyDashboardHref } from '$lib/dashboard-leadership';
import { authority } from '../pengguna/utils.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	authority('pimpinan_lihat');
	throw redirect(303, legacyDashboardHref(url.searchParams));
};
