import { error, isHttpError, json } from '@sveltejs/kit';
import { parseBulkUserRole } from '$lib/bulk-user';
import { buildBulkUserPreview, createBulkUsers, requireBulkUserAdmin } from '$lib/server/bulk-user';
import { ensurePenggunaIdentitySchema } from '$lib/server/db/ensure-pengguna';

const privateHeaders = {
	'cache-control': 'no-store, private',
	pragma: 'no-cache',
	'x-content-type-options': 'nosniff'
};

export async function GET({ locals, url }) {
	const sekolahId = requireBulkUserAdmin(locals);
	await ensurePenggunaIdentitySchema();
	const role = parseBulkUserRole(url.searchParams.get('role'));
	if (!role) throw error(400, 'Role akun massal tidak valid.');
	return json(await buildBulkUserPreview(sekolahId, role), { headers: privateHeaders });
}

export async function POST({ locals, request }) {
	requireBulkUserAdmin(locals);
	if (
		request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
	)
		return json(
			{ message: 'Permintaan akun massal harus menggunakan JSON.' },
			{
				status: 415,
				headers: privateHeaders
			}
		);
	const body = await request.json().catch(() => null);
	const role = parseBulkUserRole(body?.role);
	if (
		!role ||
		!Array.isArray(body?.selected) ||
		!Array.isArray(body?.reviewedIds) ||
		body?.confirm !== true
	)
		return json(
			{ message: 'Pratinjau dan konfirmasi pembuatan akun diperlukan.' },
			{ status: 400, headers: privateHeaders }
		);
	if (
		body.selected.some(
			(item: unknown) =>
				!item ||
				typeof item !== 'object' ||
				typeof (item as { fingerprint?: unknown }).fingerprint !== 'string'
		)
	)
		return json(
			{ message: 'Pilihan pegawai tidak valid.' },
			{ status: 400, headers: privateHeaders }
		);
	try {
		const result = await createBulkUsers({
			locals,
			request,
			role,
			selected: body.selected.map((item: { pegawaiId: unknown; fingerprint: string }) => ({
				pegawaiId: Number(item.pegawaiId),
				fingerprint: item.fingerprint
			})),
			reviewedIds: body.reviewedIds.map(Number)
		});
		return json(result, { headers: privateHeaders });
	} catch (cause) {
		if (isHttpError(cause))
			return json(
				{ message: cause.body.message },
				{ status: cause.status, headers: privateHeaders }
			);
		// Never serialize the result or credentials into diagnostics.
		return json(
			{
				message:
					'Pembuatan dibatalkan; tidak ada akun baru disimpan. Muat ulang pratinjau lalu coba kembali.'
			},
			{ status: 409, headers: privateHeaders }
		);
	}
}
