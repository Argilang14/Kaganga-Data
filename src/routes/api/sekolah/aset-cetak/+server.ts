import { json } from '@sveltejs/kit';
import { requirePrintAssetAccess } from '$lib/server/print-asset-access';
import { printAssetStatus } from '$lib/server/print-assets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { schoolId, scope } = await requirePrintAssetAccess(locals, url);
	return json(await printAssetStatus(schoolId, scope), {
		headers: { 'cache-control': 'private, no-store' }
	});
};
