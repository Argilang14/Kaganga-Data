import { redirect } from '@sveltejs/kit';

export function load({ url }) {
	throw redirect(303, `/data-mata-pelajaran${url.search}`);
}
