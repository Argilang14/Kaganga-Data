import { json } from '@sveltejs/kit';
import { getKartuAbsensiPreviewPayload } from '../kartu-absensi/preview-data';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	return json(await getKartuAbsensiPreviewPayload({ locals, url }));
}) satisfies RequestHandler;
