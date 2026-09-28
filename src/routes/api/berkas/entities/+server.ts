import db from '$lib/server/db';
import { tableInventaris, tableMurid, tablePegawai, tableSuratArsip } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, asc, eq, like, or } from 'drizzle-orm';

export async function GET({ locals, url }) {
	if (!locals.user) return json({ message: 'Tidak terautentikasi.' }, { status: 401 });
	if (locals.user.type !== 'admin' && !locals.user.permissions?.includes('berkas_manage'))
		return json({ message: 'Tidak diizinkan.' }, { status: 403 });
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) return json({ items: [] });
	const type = url.searchParams.get('type');
	const q = `%${url.searchParams.get('q')?.trim() ?? ''}%`;
	if (type === 'murid') {
		const rows = await db
			.select({ id: tableMurid.id, nama: tableMurid.nama, nomor: tableMurid.nis })
			.from(tableMurid)
			.where(
				and(
					eq(tableMurid.sekolahId, sekolahId),
					or(like(tableMurid.nama, q), like(tableMurid.nis, q))
				)
			)
			.orderBy(asc(tableMurid.nama))
			.limit(20);
		return json({
			items: rows.map((row) => ({ id: String(row.id), label: `${row.nama} (${row.nomor})` }))
		});
	}
	if (type === 'pegawai') {
		const rows = await db
			.select({ id: tablePegawai.id, nama: tablePegawai.nama, nomor: tablePegawai.nip })
			.from(tablePegawai)
			.where(
				and(
					eq(tablePegawai.sekolahId, sekolahId),
					or(like(tablePegawai.nama, q), like(tablePegawai.nip, q))
				)
			)
			.orderBy(asc(tablePegawai.nama))
			.limit(20);
		return json({
			items: rows.map((row) => ({ id: String(row.id), label: `${row.nama} (${row.nomor || '-'})` }))
		});
	}
	if (type === 'surat') {
		const rows = await db
			.select({
				id: tableSuratArsip.id,
				perihal: tableSuratArsip.perihal,
				nomor: tableSuratArsip.nomorSurat
			})
			.from(tableSuratArsip)
			.where(
				and(
					eq(tableSuratArsip.sekolahId, sekolahId),
					or(like(tableSuratArsip.perihal, q), like(tableSuratArsip.nomorSurat, q))
				)
			)
			.orderBy(asc(tableSuratArsip.perihal))
			.limit(20);
		return json({
			items: rows.map((row) => ({
				id: String(row.id),
				label: `${row.nomor || 'Tanpa nomor'} - ${row.perihal}`
			}))
		});
	}
	if (type === 'inventaris') {
		const rows = await db
			.select({ id: tableInventaris.id, kode: tableInventaris.kode, nama: tableInventaris.nama })
			.from(tableInventaris)
			.where(
				and(
					eq(tableInventaris.sekolahId, sekolahId),
					or(like(tableInventaris.kode, q), like(tableInventaris.nama, q))
				)
			)
			.orderBy(asc(tableInventaris.nama))
			.limit(20);
		return json({
			items: rows.map((row) => ({ id: String(row.id), label: `${row.kode} - ${row.nama}` }))
		});
	}
	return json({
		items: [{ id: String(sekolahId), label: locals.sekolah?.nama ?? 'Dokumen sekolah' }]
	});
}
