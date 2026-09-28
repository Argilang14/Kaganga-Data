import db from '$lib/server/db';
import { ensureInventarisPengumumanSchema } from '$lib/server/db/ensure-inventaris-pengumuman';
import { tableInventaris, tablePegawai } from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { authority } from '../../pengguna/utils.server';

export async function load({ locals, url }) {
	authority('inventaris_lihat', 'inventaris_manage');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	const id = Number(url.searchParams.get('id'));
	if (!Number.isInteger(id)) throw error(400, 'Aset tidak valid.');
	await ensureInventarisPengumumanSchema();
	const [asset] = await db
		.select({
			id: tableInventaris.id,
			kode: tableInventaris.kode,
			nama: tableInventaris.nama,
			kategori: tableInventaris.kategori,
			lokasi: tableInventaris.lokasi,
			kondisi: tableInventaris.kondisi,
			jumlah: tableInventaris.jumlah,
			satuan: tableInventaris.satuan,
			penanggungJawab: tablePegawai.nama
		})
		.from(tableInventaris)
		.leftJoin(tablePegawai, eq(tableInventaris.penanggungJawabId, tablePegawai.id))
		.where(and(eq(tableInventaris.id, id), eq(tableInventaris.sekolahId, sekolahId)))
		.limit(1);
	if (!asset) throw error(404, 'Aset tidak ditemukan.');
	return {
		meta: { title: `Label Inventaris ${asset.kode}` } satisfies PageMeta,
		asset,
		schoolName: locals.sekolah?.nama ?? 'Sekolah'
	};
}
