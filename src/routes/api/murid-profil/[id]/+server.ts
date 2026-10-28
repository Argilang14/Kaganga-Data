import { error, isHttpError, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import {
	canUseStudentProfile,
	emptyStudentProfile,
	StudentProfileValidationError
} from '$lib/murid-profile';
import { loadStudentProfile, saveStudentProfile } from '$lib/server/murid-profile';
import db from '$lib/server/db';
import { tableMurid, tablePegawai } from '$lib/server/db/schema';
import { activeMuridFilter } from '$lib/server/murid-query';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'private, no-store' };
export const GET: RequestHandler = async ({ locals, params }) => {
	const result = await loadStudentProfile(locals, Number(params.id));
	const active = await db
		.select({ id: tableMurid.id })
		.from(tableMurid)
		.where(
			and(
				eq(tableMurid.id, Number(params.id)),
				eq(tableMurid.sekolahId, locals.sekolah!.id),
				activeMuridFilter()
			)
		);
	const staff = await db
		.select({ id: tablePegawai.id, nama: tablePegawai.nama })
		.from(tablePegawai)
		.where(and(eq(tablePegawai.sekolahId, locals.sekolah!.id), eq(tablePegawai.status, 'aktif')))
		.orderBy(tablePegawai.nama);
	return json(
		{
			values: Object.fromEntries(
				Object.keys(emptyStudentProfile).map((key) => [
					key,
					result.profile?.[key as keyof typeof emptyStudentProfile] ??
						emptyStudentProfile[key as keyof typeof emptyStudentProfile]
				])
			),
			revisi: result.profile?.revisi ?? 0,
			photos: result.photos,
			health: result.health,
			staff,
			surveyorName: result.profile?.petugasPendataanNama ?? null,
			editable: canUseStudentProfile(locals.user, locals.sekolah!.id, 'edit') && active.length > 0
		},
		{ headers }
	);
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	try {
		if (!request.headers.get('content-type')?.startsWith('application/json'))
			error(415, 'Format permintaan tidak didukung. Muat ulang profil.');
		const input = await request
			.json()
			.catch(() => error(400, 'Data formulir tidak terbaca. Periksa isian lalu coba lagi.'));
		if (!input || typeof input !== 'object' || Array.isArray(input))
			error(400, 'Data formulir tidak valid. Muat ulang profil.');
		const saved = await saveStudentProfile(
			locals,
			Number(params.id),
			input.values,
			input.revisi,
			request
		);
		return json(saved, { headers });
	} catch (cause) {
		if (cause instanceof StudentProfileValidationError)
			return json({ message: cause.message }, { status: 400, headers });
		if (isHttpError(cause))
			return json({ message: cause.body.message }, { status: cause.status, headers });
		throw cause;
	}
};
