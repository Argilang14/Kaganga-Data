import {
	ABSENSI_KEGIATAN_KATEGORI_LABELS,
	loadKegiatanAbsensiOptions,
	requireAbsensiKegiatanSettingsAccess
} from '$lib/server/absensi-kegiatan';
import { parsePositiveInteger } from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { tableKegiatanAbsensi } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

function normalizeTime(value: FormDataEntryValue | null) {
	const raw = value?.toString().trim() ?? '';
	return /^\d{2}:\d{2}$/.test(raw) ? raw : null;
}

export async function load({ locals }) {
	requireAbsensiKegiatanSettingsAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	return {
		meta: { title: 'Pengaturan Kegiatan' } satisfies PageMeta,
		kegiatanList: await loadKegiatanAbsensiOptions(sekolahId, false),
		kategoriLabels: ABSENSI_KEGIATAN_KATEGORI_LABELS
	};
}

export const actions = {
	updateKegiatan: async ({ request, locals }) => {
		requireAbsensiKegiatanSettingsAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const kegiatanId = parsePositiveInteger(formData.get('kegiatanId'));
		const nama = formData.get('nama')?.toString().trim();
		if (!kegiatanId || !nama) return fail(400, { fail: 'Nama kegiatan wajib diisi.' });

		const existing = await db.query.tableKegiatanAbsensi.findFirst({
			columns: { id: true },
			where: and(
				eq(tableKegiatanAbsensi.id, kegiatanId),
				eq(tableKegiatanAbsensi.sekolahId, sekolahId)
			)
		});
		if (!existing) return fail(404, { fail: 'Kegiatan tidak ditemukan.' });

		await db
			.update(tableKegiatanAbsensi)
			.set({
				nama,
				jamMulai: normalizeTime(formData.get('jamMulai')),
				batasTerlambat: normalizeTime(formData.get('batasTerlambat')),
				jamSelesai: normalizeTime(formData.get('jamSelesai')),
				autoAlfa: formData.get('autoAlfa') === 'on',
				aktif: formData.get('aktif') === 'on',
				updatedAt: new Date().toISOString()
			})
			.where(eq(tableKegiatanAbsensi.id, kegiatanId));

		return { message: 'Pengaturan kegiatan berhasil disimpan.' };
	}
};
