import db from '$lib/server/db';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import { tableDinasLuarPermohonan, tablePegawai } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

const STATUS = ['diajukan', 'disetujui', 'ditolak', 'selesai'] as const;

function text(formData: FormData, key: string) {
	const value = formData.get(key)?.toString().trim() ?? '';
	return value || null;
}

function positiveId(value: FormDataEntryValue | null) {
	const id = Number(value?.toString() ?? '');
	return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value: string | null) {
	return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function load({ locals }) {
	authority('surat_dinas_luar');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureSuratMenyuratSchema();

	const [pegawai, daftar] = await Promise.all([
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, nip: true, jenis: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
			orderBy: asc(tablePegawai.nama)
		}),
		db.query.tableDinasLuarPermohonan.findMany({
			with: {
				pegawai: { columns: { id: true, nama: true, nip: true } },
				sppd: { columns: { id: true, nomorSurat: true, status: true } }
			},
			where: eq(tableDinasLuarPermohonan.sekolahId, sekolahId),
			orderBy: [desc(tableDinasLuarPermohonan.tanggalBerangkat), desc(tableDinasLuarPermohonan.id)]
		})
	]);

	return {
		meta: { title: 'Dinas Luar' } satisfies PageMeta,
		pegawai,
		daftar,
		pegawaiAktifId: locals.user?.pegawaiId ?? null,
		isAdmin: locals.user?.type === 'admin'
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		await ensureSuratMenyuratSchema();

		const formData = await request.formData();
		const selectedPegawaiId = positiveId(formData.get('pegawaiId'));
		const pegawaiId = locals.user.type === 'admin' ? selectedPegawaiId : locals.user.pegawaiId;
		const maksud = text(formData, 'maksud');
		const tempatTujuan = text(formData, 'tempatTujuan');
		const tanggalBerangkat = text(formData, 'tanggalBerangkat');
		const tanggalKembali = text(formData, 'tanggalKembali');
		if (!pegawaiId || !maksud || !tempatTujuan) {
			return fail(400, { fail: 'Pegawai, maksud perjalanan, dan tujuan wajib diisi.' });
		}
		if (!validDate(tanggalBerangkat) || !validDate(tanggalKembali)) {
			return fail(400, { fail: 'Tanggal berangkat dan kembali wajib diisi.' });
		}
		if (tanggalKembali! < tanggalBerangkat!) {
			return fail(400, { fail: 'Tanggal kembali tidak boleh sebelum tanggal berangkat.' });
		}

		const pegawai = await db.query.tablePegawai.findFirst({
			columns: { id: true },
			where: and(eq(tablePegawai.id, Number(pegawaiId)), eq(tablePegawai.sekolahId, sekolahId))
		});
		if (!pegawai) return fail(404, { fail: 'Pegawai tidak ditemukan pada sekolah aktif.' });

		await db.insert(tableDinasLuarPermohonan).values({
			sekolahId,
			pegawaiId: Number(pegawaiId),
			maksud,
			tempatTujuan,
			tanggalBerangkat: tanggalBerangkat!,
			tanggalKembali: tanggalKembali!,
			status: 'diajukan',
			catatan: text(formData, 'catatan')
		});
		return { message: 'Pengajuan dinas luar berhasil ditambahkan.' };
	},
	setStatus: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = positiveId(formData.get('id'));
		const status = formData.get('status')?.toString() as (typeof STATUS)[number];
		if (!id || !STATUS.includes(status))
			return fail(400, { fail: 'Status pengajuan tidak valid.' });
		await db
			.update(tableDinasLuarPermohonan)
			.set({ status, updatedAt: new Date().toISOString() })
			.where(
				and(eq(tableDinasLuarPermohonan.id, id), eq(tableDinasLuarPermohonan.sekolahId, sekolahId))
			);
		return { message: 'Status dinas luar berhasil diperbarui.' };
	},
	delete: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const id = positiveId((await request.formData()).get('id'));
		if (!id) return fail(400, { fail: 'Pengajuan tidak valid.' });
		await db
			.delete(tableDinasLuarPermohonan)
			.where(
				and(
					eq(tableDinasLuarPermohonan.id, id),
					eq(tableDinasLuarPermohonan.sekolahId, sekolahId),
					eq(tableDinasLuarPermohonan.status, 'diajukan')
				)
			);
		return { message: 'Pengajuan dinas luar berhasil dihapus.' };
	}
};
