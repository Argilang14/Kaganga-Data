import db from '$lib/server/db';
import { ensureKesehatanMuridSchema } from '$lib/server/db/ensure-kesehatan-murid';
import { tableKesehatanMurid, tableMurid } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions } from './$types';

function textValue(form: FormData, key: string) {
	const value = form.get(key)?.toString().trim() ?? '';
	return value.length ? value : null;
}

function numberValue(form: FormData, key: string) {
	const value = textValue(form, key);
	if (!value) return null;
	const parsed = Number(value.replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : null;
}

const allowedStatusGizi = [
	'gizi_buruk',
	'gizi_kurang',
	'normal',
	'gizi_lebih',
	'obesitas'
] as const;

type StatusGizi = (typeof allowedStatusGizi)[number];

function statusValue(form: FormData): StatusGizi | null {
	const value = textValue(form, 'statusGizi');
	return value && allowedStatusGizi.includes(value as StatusGizi) ? (value as StatusGizi) : null;
}

export const actions: Actions = {
	'save-kesehatan': async ({ request, params, locals }) => {
		await ensureKesehatanMuridSchema();
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });

		const muridId = Number(params.id);
		if (!Number.isInteger(muridId) || muridId <= 0) {
			return fail(400, { fail: 'Data murid tidak valid.' });
		}

		const murid = await db.query.tableMurid.findFirst({
			where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId)),
			columns: { id: true, sekolahId: true, semesterId: true }
		});
		if (!murid) return fail(404, { fail: 'Data murid tidak ditemukan.' });

		const form = await request.formData();
		const tanggalPengukuran = textValue(form, 'tanggalPengukuran');
		if (!tanggalPengukuran) return fail(400, { fail: 'Tanggal pengukuran wajib diisi.' });

		const payload = {
			sekolahId,
			muridId,
			semesterId: murid.semesterId,
			tanggalPengukuran,
			tinggiBadan: numberValue(form, 'tinggiBadan'),
			beratBadan: numberValue(form, 'beratBadan'),
			zScore: numberValue(form, 'zScore'),
			statusGizi: statusValue(form),
			kondisiFisik: textValue(form, 'kondisiFisik'),
			ukuranBaju: textValue(form, 'ukuranBaju'),
			ukuranCelana: textValue(form, 'ukuranCelana'),
			ukuranSepatu: textValue(form, 'ukuranSepatu'),
			catatan: textValue(form, 'catatan'),
			petugasUserId: locals.user.id ?? null,
			updatedAt: new Date().toISOString()
		};

		const existing = await db.query.tableKesehatanMurid.findFirst({
			where: and(
				eq(tableKesehatanMurid.muridId, muridId),
				eq(tableKesehatanMurid.tanggalPengukuran, tanggalPengukuran)
			),
			columns: { id: true }
		});

		if (existing) {
			await db
				.update(tableKesehatanMurid)
				.set(payload)
				.where(eq(tableKesehatanMurid.id, existing.id));
		} else {
			await db.insert(tableKesehatanMurid).values(payload);
		}

		return { message: 'Data kesehatan murid tersimpan.' };
	}
};
