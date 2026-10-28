import { error, json } from '@sveltejs/kit';
import { careDetail } from '$lib/server/pengasuhan';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, params }) => {
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id < 1) error(400, 'Nomor catatan tidak valid.');
	return json(await careDetail(locals, id), { headers: { 'cache-control': 'private, no-store' } });
};
