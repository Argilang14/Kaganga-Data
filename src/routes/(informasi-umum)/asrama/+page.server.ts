import { redirect } from '@sveltejs/kit';
import { dormPageHref } from '$lib/dormitory';
import { dormitoryActions } from '$lib/server/dormitory-page';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) =>
	redirect(303, dormPageHref(url.searchParams.get('view') ?? 'kamar', url.searchParams));
export const actions: Actions = dormitoryActions;
