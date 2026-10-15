import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import db from '$lib/server/db';
import {
	tablePegawai,
	tablePegawaiDokumen,
	tablePegawaiPendidikan,
	tablePegawaiSertifikasi
} from '$lib/server/db/schema';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { writeAuditLog } from '$lib/server/audit-log';
import { editableProfileKeys, validateProfileForm } from '$lib/pegawai-profile';
import { createPegawaiPersonalActions } from '$lib/server/pegawai-personal-actions';
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

export const load: PageServerLoad = async ({ locals }) => {
	const profile = await ownProfile(locals);
	const [pendidikan, sertifikasi, dokumen] = await Promise.all([
		db.query.tablePegawaiPendidikan.findMany({
			where: and(
				eq(tablePegawaiPendidikan.pegawaiId, profile.id),
				eq(tablePegawaiPendidikan.sekolahId, locals.sekolah!.id)
			),
			orderBy: [desc(tablePegawaiPendidikan.isTerakhir), desc(tablePegawaiPendidikan.tahunLulus)]
		}),
		db.query.tablePegawaiSertifikasi.findMany({
			where: and(
				eq(tablePegawaiSertifikasi.pegawaiId, profile.id),
				eq(tablePegawaiSertifikasi.sekolahId, locals.sekolah!.id)
			),
			orderBy: [desc(tablePegawaiSertifikasi.tanggalSelesai)]
		}),
		db.query.tablePegawaiDokumen.findMany({
			where: and(
				eq(tablePegawaiDokumen.pegawaiId, profile.id),
				eq(tablePegawaiDokumen.sekolahId, locals.sekolah!.id)
			),
			orderBy: [asc(tablePegawaiDokumen.jenis), asc(tablePegawaiDokumen.nama)]
		})
	]);
	return { meta: { title: 'Profil Pegawai Saya' }, profile, pendidikan, sertifikasi, dokumen };
};
export const actions: Actions = {
	saveProfile: async ({ locals, request }) => {
		const before = await ownProfile(locals);
		const form = await request.formData();
		if (String(form.get('updatedAt') ?? '') !== (before.updatedAt ?? ''))
			return fail(409, { fail: 'Profil telah berubah. Muat ulang sebelum menyimpan.' });
		const parsed = validateProfileForm(form);
		if (!parsed.values) return fail(400, { fail: parsed.error });
		const values = parsed.values;
		await ensureDataGovernanceSchema();
		return db.transaction(async (tx) => {
			for (const key of ['nip', 'nik'] as const) {
				if (!values[key] || values[key] === '-') continue;
				const duplicate = await tx
					.select({ id: tablePegawai.id })
					.from(tablePegawai)
					.where(
						and(
							eq(tablePegawai.sekolahId, locals.sekolah!.id),
							ne(tablePegawai.id, before.id),
							eq(tablePegawai[key], values[key])
						)
					)
					.limit(1);
				if (duplicate.length)
					return fail(400, {
						fail: `${key.toUpperCase()} sudah digunakan pegawai lain. Periksa kembali isian Anda.`
					});
			}
			const rows = await tx
				.update(tablePegawai)
				.set({
					...values,
					jenisKelamin:
						values.jenisKelamin === 'laki-laki' || values.jenisKelamin === 'perempuan'
							? values.jenisKelamin
							: null,
					updatedAt: new Date().toISOString()
				})
				.where(
					and(
						eq(tablePegawai.id, before.id),
						eq(tablePegawai.sekolahId, locals.sekolah!.id),
						before.updatedAt === null
							? isNull(tablePegawai.updatedAt)
							: eq(tablePegawai.updatedAt, String(form.get('updatedAt') ?? ''))
					)
				)
				.returning({ id: tablePegawai.id });
			if (!rows.length)
				return fail(409, { fail: 'Profil telah berubah. Muat ulang sebelum menyimpan.' });
			await writeAuditLog(
				{
					locals,
					request,
					action: 'update',
					entityType: 'pegawai',
					entityId: before.id,
					summary: 'Pegawai memperbarui profil pribadi',
					before: Object.fromEntries(editableProfileKeys.map((key) => [key, before[key]])),
					after: values
				},
				tx
			);
			return { message: 'Biodata berhasil disimpan.' };
		});
	},
	...createPegawaiPersonalActions(async ({ locals }) => {
		const profile = await ownProfile(locals);
		return { sekolahId: locals.sekolah!.id, pegawaiId: profile.id };
	})
};
