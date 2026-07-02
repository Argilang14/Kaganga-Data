import { requireJadwalAccess } from '$lib/server/jadwal';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
	requireJadwalAccess(locals.user);
	if (!locals.sekolah?.id) throw redirect(303, '/login');

	return {
		meta: { title: 'Jadwal' } satisfies PageMeta
	};
}
