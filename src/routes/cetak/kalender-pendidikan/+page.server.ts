import { getKalenderPendidikanPreviewPayload } from './preview-data';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, url }) => {
	return await getKalenderPendidikanPreviewPayload({ locals, url });
}) satisfies PageServerLoad;
