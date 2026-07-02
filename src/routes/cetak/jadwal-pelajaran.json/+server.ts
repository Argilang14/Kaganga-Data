import { json } from '@sveltejs/kit';
import { getJadwalPelajaranPreviewPayload } from '../jadwal-pelajaran/preview-data';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	return json(await getJadwalPelajaranPreviewPayload({ locals, url }));
}) satisfies RequestHandler;
