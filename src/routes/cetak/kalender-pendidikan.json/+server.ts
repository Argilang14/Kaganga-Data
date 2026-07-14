import { json } from '@sveltejs/kit';
import { getKalenderPendidikanPreviewPayload } from '../kalender-pendidikan/preview-data';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	return json(await getKalenderPendidikanPreviewPayload({ locals, url }));
}) satisfies RequestHandler;
