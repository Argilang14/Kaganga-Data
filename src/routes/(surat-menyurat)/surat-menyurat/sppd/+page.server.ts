import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import db from '$lib/server/db';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import { tablePegawai, tableSppd } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

const STATUS = ['draft', 'terbit', 'selesai'] as const;

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
			with: { pegawai: { columns: { id: true, nama: true, nip: true } } },
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

		const formData = await request.formData();
		const pegawaiId = positiveId(formData.get('pegawaiId'));
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
			where: and(eq(tablePegawai.id, pegawaiId), eq(tablePegawai.sekolahId, sekolahId))
		});
		if (!pegawai) return fail(404, { fail: 'Pegawai tidak ditemukan pada sekolah aktif.' });

		const academic = await resolveSekolahAcademicContext(sekolahId);
		await db.insert(tableSppd).values({
			sekolahId,
			pegawaiId,
			tahunAjaranId: academic?.activeTahunAjaranId ?? null,
			semesterId: academic?.activeSemesterId ?? null,
			nomorSurat: text(formData, 'nomorSurat'),
			tanggalSurat: text(formData, 'tanggalSurat'),
			dasarSurat: text(formData, 'dasarSurat'),
			maksud,
			alatAngkut: text(formData, 'alatAngkut'),
			tempatBerangkat: text(formData, 'tempatBerangkat'),
			tempatTujuan,
			tanggalBerangkat: tanggalBerangkat!,
			tanggalKembali: tanggalKembali!,
			status: 'draft',
			keterangan: text(formData, 'keterangan')
		});
		return { message: 'Draft SPPD berhasil ditambahkan.' };
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
		await db
			.delete(tableSppd)
			.where(
				and(eq(tableSppd.id, id), eq(tableSppd.sekolahId, sekolahId), eq(tableSppd.status, 'draft'))
			);
		return { message: 'Draft SPPD berhasil dihapus.' };
	}
};
