import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import db from '$lib/server/db';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import {
	tableDinasLuarBukti,
	tablePegawai,
	tableSppd,
	tableSppdPegawai,
	tableSppdPengikut
} from '$lib/server/db/schema';
import { deleteDinasLuarFile } from '$lib/server/dinas-luar';
import { parseSppdForm, replaceSppdDetails, updateSppd } from '$lib/server/sppd';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

const STATUS = ['draft', 'terbit', 'selesai'] as const;

function positiveId(value: FormDataEntryValue | null) {
	const id = Number(value?.toString() ?? '');
	return Number.isInteger(id) && id > 0 ? id : null;
}

export async function load({ locals }) {
	authority('surat_sppd');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureSuratMenyuratSchema();

	const [pegawai, daftar] = await Promise.all([
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, nip: true, jenis: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
			orderBy: asc(tablePegawai.nama)
		}),
		db.query.tableSppd.findMany({
			with: {
				pegawai: { columns: { id: true, nama: true, nip: true } },
				pelaksana: { with: { pegawai: { columns: { id: true, nama: true, nip: true } } } },
				pengikut: true,
				bukti: true
			},
			where: eq(tableSppd.sekolahId, sekolahId),
			orderBy: [desc(tableSppd.tanggalBerangkat), desc(tableSppd.id)]
		})
	]);

	return {
		meta: { title: 'SPPD' } satisfies PageMeta,
		pegawai,
		daftar
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		authority('surat_sppd');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		await ensureSuratMenyuratSchema();

		const parsed = await parseSppdForm(await request.formData(), sekolahId);
		if ('error' in parsed) return fail(400, { fail: parsed.error });
		const academic = await resolveSekolahAcademicContext(sekolahId);
		const [inserted] = await db
			.insert(tableSppd)
			.values({
				sekolahId,
				tahunAjaranId: academic?.activeTahunAjaranId ?? null,
				semesterId: academic?.activeSemesterId ?? null,
				status: 'draft',
				...parsed.values
			})
			.returning({ id: tableSppd.id });
		await replaceSppdDetails(inserted.id, parsed.employees, parsed.followers);
		return { message: 'Draft SPPD berhasil ditambahkan.' };
	},
	update: async ({ request, locals }) => {
		authority('surat_sppd');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = positiveId(formData.get('id'));
		if (!id) return fail(400, { fail: 'SPPD tidak valid.' });
		const message = await updateSppd(id, sekolahId, formData);
		if (message) return fail(400, { fail: message });
		return { message: 'SPPD berhasil diperbarui.' };
	},
	setStatus: async ({ request, locals }) => {
		authority('surat_sppd');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = positiveId(formData.get('id'));
		const status = formData.get('status')?.toString() as (typeof STATUS)[number];
		if (!id || !STATUS.includes(status)) return fail(400, { fail: 'Status SPPD tidak valid.' });
		await db
			.update(tableSppd)
			.set({ status, updatedAt: new Date().toISOString() })
			.where(and(eq(tableSppd.id, id), eq(tableSppd.sekolahId, sekolahId)));
		return { message: 'Status SPPD berhasil diperbarui.' };
	},
	delete: async ({ request, locals }) => {
		authority('surat_sppd');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const id = positiveId((await request.formData()).get('id'));
		if (!id) return fail(400, { fail: 'SPPD tidak valid.' });
		const existing = await db.query.tableSppd.findFirst({
			columns: { status: true, undanganFile: true },
			with: { bukti: { columns: { namaFile: true } } },
			where: and(eq(tableSppd.id, id), eq(tableSppd.sekolahId, sekolahId))
		});
		if (!existing || existing.status !== 'draft') {
			return fail(409, { fail: 'Hanya draft SPPD yang dapat dihapus.' });
		}
		for (const proof of existing.bukti) await deleteDinasLuarFile(proof.namaFile);
		await deleteDinasLuarFile(existing.undanganFile);
		await db.delete(tableDinasLuarBukti).where(eq(tableDinasLuarBukti.sppdId, id));
		await db.delete(tableSppdPegawai).where(eq(tableSppdPegawai.sppdId, id));
		await db.delete(tableSppdPengikut).where(eq(tableSppdPengikut.sppdId, id));
		await db.delete(tableSppd).where(and(eq(tableSppd.id, id), eq(tableSppd.sekolahId, sekolahId)));
		return { message: 'Draft SPPD berhasil dihapus.' };
	}
};
