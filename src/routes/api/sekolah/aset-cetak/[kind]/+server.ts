import { error, json } from '@sveltejs/kit';
import { requirePrintAssetAccess } from '$lib/server/print-asset-access';
import {
	PRINT_ASSET_MAX_BYTES,
	readPrintAsset,
	savePrintAsset,
	removePrintAsset
} from '$lib/server/print-assets';
import { writeAuditLog } from '$lib/server/audit-log';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, params }) => {
	const { schoolId, scope, kind } = await requirePrintAssetAccess(locals, url, params.kind);
	const data = await readPrintAsset(schoolId, scope, kind);
	if (!data) throw error(404, 'Aset belum diunggah.');
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};

export const POST: RequestHandler = async ({ locals, url, params, request }) => {
	const { schoolId, scope, kind } = await requirePrintAssetAccess(locals, url, params.kind);
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || !file.size || file.size > PRINT_ASSET_MAX_BYTES)
		throw error(400, 'Pilih gambar PNG, maksimal 2 MB.');
	try {
		await savePrintAsset(schoolId, scope, kind, Buffer.from(await file.arrayBuffer()), file.type);
	} catch (cause) {
		if (cause instanceof Error && !('code' in cause)) throw error(400, cause.message);
		throw cause;
	}
	await writeAuditLog({
		locals,
		request,
		action: 'update',
		entityType: 'sekolah',
		entityId: schoolId,
		summary: `Mengunggah aset cetak ${kind} untuk ${scope}.`
	});
	return json({ message: 'Aset cetak berhasil disimpan.' });
};

export const DELETE: RequestHandler = async ({ locals, url, params, request }) => {
	const { schoolId, scope, kind } = await requirePrintAssetAccess(locals, url, params.kind);
	await removePrintAsset(schoolId, scope, kind);
	await writeAuditLog({
		locals,
		request,
		action: 'delete',
		entityType: 'sekolah',
		entityId: schoolId,
		summary: `Menghapus aset cetak ${kind} untuk ${scope}.`
	});
	return json({ message: 'Aset cetak berhasil dihapus.' });
};
