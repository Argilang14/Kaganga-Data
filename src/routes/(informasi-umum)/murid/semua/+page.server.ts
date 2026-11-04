import { canManageStudentArchive } from '$lib/murid-permissions';
import { loadStudentRegistry } from '$lib/server/student-registry';
import { loadStudentArchive, studentArchiveActions } from '$lib/server/student-archive';
import type { PageServerLoad } from './$types';

export const load = (async (event) => {
	const canManageArchive = canManageStudentArchive(event.locals.user);
	if (event.url.searchParams.get('view') === 'arsip') {
		const archive = await loadStudentArchive(event);
		return { meta: archive.meta, archive, registry: null, canManageArchive };
	}
	return { ...(await loadStudentRegistry(event, 'semua')), archive: null, canManageArchive };
}) satisfies PageServerLoad;

export const actions = studentArchiveActions;
