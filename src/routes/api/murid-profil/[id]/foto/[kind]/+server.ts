import { error, isHttpError, json } from '@sveltejs/kit';
import {
	changeStudentProfilePhoto,
	readStudentProfilePhoto
} from '$lib/server/student-profile-photos';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'private, no-store' };
export const GET: RequestHandler = ({ locals, params }) =>
	readStudentProfilePhoto(locals, Number(params.id), params.kind);
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const data = await request.formData();
		const file = data.get('foto');
		const rawRevision = data.get('revisi');
		if (!(file instanceof File) || typeof rawRevision !== 'string' || !/^\d+$/.test(rawRevision))
			error(400, 'Foto atau versi profil belum dipilih. Muat ulang profil lalu coba lagi.');
		return json(
			await changeStudentProfilePhoto(
				locals,
				Number(params.id),
				params.kind,
				Number(rawRevision),
				file,
				request
			),
			{ headers }
		);
	} catch (cause) {
		if (isHttpError(cause))
			return json({ message: cause.body.message }, { status: cause.status, headers });
		throw cause;
	}
};
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	try {
		const data = await request
			.json()
			.catch(() => error(400, 'Permintaan hapus tidak terbaca. Coba lagi.'));
		return json(
			await changeStudentProfilePhoto(
				locals,
				Number(params.id),
				params.kind,
				data.revisi,
				null,
				request
			),
			{ headers }
		);
	} catch (cause) {
		if (isHttpError(cause))
			return json({ message: cause.body.message }, { status: cause.status, headers });
		throw cause;
	}
};
