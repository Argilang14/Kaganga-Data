import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { ensureInventarisPengumumanSchema } from '$lib/server/db/ensure-inventaris-pengumuman';
import { tableInventaris, tableInventarisPerawatan, tablePegawai } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { authority } from '../../pengguna/utils.server';

const PAGE_SIZE = 20;
const CONDITIONS = ['baik', 'rusak_ringan', 'rusak_berat', 'hilang'] as const;
const canManage = (locals: App.Locals) =>
	locals.user?.type === 'admin' || locals.user?.permissions?.includes('inventaris_manage') === true;
const textValue = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const optionalText = (form: FormData, key: string) => textValue(form, key) || null;
const positiveInt = (value: string, fallback = 0) => {
	const number = Number(value);
	return Number.isInteger(number) && number >= 0 ? number : fallback;
};

async function ownedAsset(sekolahId: number, id: number) {
	return db.query.tableInventaris.findFirst({
		where: and(eq(tableInventaris.id, id), eq(tableInventaris.sekolahId, sekolahId))
	});
}

export async function load({ locals, url }) {
	authority('inventaris_lihat', 'inventaris_manage');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureInventarisPengumumanSchema();
	const q = url.searchParams.get('q')?.trim() ?? '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const search = `%${q}%`;
	const where = and(
		eq(tableInventaris.sekolahId, sekolahId),
		q
			? or(
					like(tableInventaris.kode, search),
					like(tableInventaris.nama, search),
					like(tableInventarisPerawatan.jenis, search)
				)
			: undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableInventarisPerawatan)
		.innerJoin(tableInventaris, eq(tableInventarisPerawatan.inventarisId, tableInventaris.id))
		.where(where);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);
	const [maintenance, employees, assets] = await Promise.all([
		db
			.select({
				id: tableInventarisPerawatan.id,
				kode: tableInventaris.kode,
				namaAset: tableInventaris.nama,
				tanggal: tableInventarisPerawatan.tanggal,
				jenis: tableInventarisPerawatan.jenis,
				biaya: tableInventarisPerawatan.biaya,
				keterangan: tableInventarisPerawatan.keterangan,
				pegawai: tablePegawai.nama
			})
			.from(tableInventarisPerawatan)
			.innerJoin(tableInventaris, eq(tableInventarisPerawatan.inventarisId, tableInventaris.id))
			.leftJoin(tablePegawai, eq(tableInventarisPerawatan.pegawaiId, tablePegawai.id))
			.where(where)
			.orderBy(desc(tableInventarisPerawatan.tanggal), desc(tableInventarisPerawatan.id))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		db
			.select({ id: tablePegawai.id, nama: tablePegawai.nama })
			.from(tablePegawai)
			.where(and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')))
			.orderBy(asc(tablePegawai.nama)),
		db
			.select({ id: tableInventaris.id, kode: tableInventaris.kode, nama: tableInventaris.nama })
			.from(tableInventaris)
			.where(eq(tableInventaris.sekolahId, sekolahId))
			.orderBy(asc(tableInventaris.kode), asc(tableInventaris.nama))
	]);
	return {
		meta: { title: 'Perawatan Inventaris' } satisfies PageMeta,
		maintenance,
		employees,
		assets,
		conditions: CONDITIONS,
		canManage: canManage(locals),
		filters: { q },
		page: { currentPage: page, totalPages, totalItems }
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola perawatan.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const inventarisId = positiveInt(textValue(form, 'inventarisId'));
		const asset = sekolahId ? await ownedAsset(sekolahId, inventarisId) : null;
		const tanggal = textValue(form, 'tanggal');
		const jenis = textValue(form, 'jenis');
		if (!asset || !tanggal || !jenis)
			return fail(400, { fail: 'Aset, tanggal, dan jenis perawatan wajib diisi.' });
		const [created] = await db
			.insert(tableInventarisPerawatan)
			.values({
				inventarisId,
				tanggal,
				jenis,
				biaya: Number(textValue(form, 'biaya')) || null,
				keterangan: optionalText(form, 'keterangan'),
				pegawaiId: positiveInt(textValue(form, 'pegawaiId')) || null
			})
			.returning();
		const nextCondition = textValue(form, 'kondisi');
		if (CONDITIONS.includes(nextCondition as (typeof CONDITIONS)[number]))
			await db
				.update(tableInventaris)
				.set({ kondisi: nextCondition as (typeof CONDITIONS)[number], updatedAt: new Date().toISOString() })
				.where(and(eq(tableInventaris.id, inventarisId), eq(tableInventaris.sekolahId, sekolahId!)));
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'inventaris_perawatan',
			entityId: created.id,
			summary: `Perawatan ${asset.nama} dicatat: ${jenis}.`,
			after: created
		});
		return { message: 'Riwayat perawatan berhasil ditambahkan.' };
	}
};
