import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tablePegawai } from '$lib/server/db/schema';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { writeAuditLog } from '$lib/server/audit-log';
import type { Actions, PageServerLoad } from './$types';

async function ownProfile(locals: App.Locals) {
	if (!locals.user?.pegawaiId || !locals.sekolah?.id)
		throw error(403, 'Akun belum terhubung dengan pegawai.');
	await ensurePegawaiSchema();
	const profile = await db.query.tablePegawai.findFirst({
		where: and(
			eq(tablePegawai.id, locals.user.pegawaiId),
			eq(tablePegawai.sekolahId, locals.sekolah.id)
		)
	});
	if (!profile) throw error(404, 'Profil pegawai tidak ditemukan.');
	return profile;
}

export const load: PageServerLoad = async ({ locals }) => ({
	meta: { title: 'Profil Pegawai Saya' },
	profile: await ownProfile(locals)
});

const editable = [
	'telepon',
	'email',
	'alamat',
	'tempatLahir',
	'tanggalLahir',
	'kontakDaruratNama',
	'kontakDaruratHubungan',
	'kontakDaruratTelepon'
] as const;
export const actions: Actions = {
	default: async ({ locals, request }) => {
		const before = await ownProfile(locals);
		const form = await request.formData();
		if (
			[...form.keys()].some(
				(key) => ![...editable, 'updatedAt'].includes(key as (typeof editable)[number])
			)
		)
			return fail(400, { message: 'Form profil memuat kolom yang tidak diizinkan.' });
		const values = Object.fromEntries(
			editable.map((key) => [key, String(form.get(key) ?? '').trim()])
		) as Record<(typeof editable)[number], string>;
		if (Object.values(values).some((value) => value.length > 1000))
			return fail(400, { message: 'Isian terlalu panjang.' });
		if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
			return fail(400, { message: 'Email tidak valid.' });
		if (values.tanggalLahir) {
			const date = new Date(values.tanggalLahir + 'T00:00:00Z');
			if (
				!/^\d{4}-\d{2}-\d{2}$/.test(values.tanggalLahir) ||
				!Number.isFinite(date.getTime()) ||
				date.toISOString().slice(0, 10) !== values.tanggalLahir ||
				date > new Date()
			)
				return fail(400, { message: 'Tanggal lahir tidak valid.' });
		}
		await ensureDataGovernanceSchema();
		return db.transaction(async (tx) => {
			const rows = await tx
				.update(tablePegawai)
				.set({ ...values, updatedAt: new Date().toISOString() })
				.where(
					and(
						eq(tablePegawai.id, before.id),
						eq(tablePegawai.sekolahId, locals.sekolah!.id),
						eq(tablePegawai.updatedAt, String(form.get('updatedAt') ?? ''))
					)
				)
				.returning({ id: tablePegawai.id });
			if (!rows.length)
				return fail(409, { message: 'Profil telah berubah. Muat ulang sebelum menyimpan.' });
			await writeAuditLog(
				{
					locals,
					request,
					action: 'update',
					entityType: 'pegawai',
					entityId: before.id,
					summary: 'Pegawai memperbarui profil pribadi',
					before: Object.fromEntries(editable.map((key) => [key, before[key]])),
					after: values
				},
				tx
			);
			return { success: true, message: 'Profil berhasil disimpan.' };
		});
	}
};
