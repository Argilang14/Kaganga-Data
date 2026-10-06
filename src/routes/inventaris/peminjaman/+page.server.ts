import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { ensureInventarisPengumumanSchema } from '$lib/server/db/ensure-inventaris-pengumuman';
import { tableInventaris, tableInventarisPeminjaman, tablePegawai } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { authority } from '../../pengguna/utils.server';

const PAGE_SIZE = 20;
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
	const statusValue = url.searchParams.get('status') ?? '';
	const status = statusValue === 'dipinjam' || statusValue === 'dikembalikan' ? statusValue : '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const search = `%${q}%`;
	const where = and(
		eq(tableInventaris.sekolahId, sekolahId),
		q
			? or(
					like(tableInventaris.kode, search),
					like(tableInventaris.nama, search),
					like(tableInventarisPeminjaman.peminjamNama, search)
				)
			: undefined,
		status ? eq(tableInventarisPeminjaman.status, status) : undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableInventarisPeminjaman)
		.innerJoin(tableInventaris, eq(tableInventarisPeminjaman.inventarisId, tableInventaris.id))
		.where(where);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);

	const [loans, employees, assets] = await Promise.all([
		db
			.select({
				id: tableInventarisPeminjaman.id,
				kode: tableInventaris.kode,
				namaAset: tableInventaris.nama,
				satuan: tableInventaris.satuan,
				peminjamNama: tableInventarisPeminjaman.peminjamNama,
				jumlah: tableInventarisPeminjaman.jumlah,
				tanggalPinjam: tableInventarisPeminjaman.tanggalPinjam,
				rencanaKembali: tableInventarisPeminjaman.rencanaKembali,
				tanggalKembali: tableInventarisPeminjaman.tanggalKembali,
				status: tableInventarisPeminjaman.status,
				kondisiKembali: tableInventarisPeminjaman.kondisiKembali,
				catatan: tableInventarisPeminjaman.catatan
			})
			.from(tableInventarisPeminjaman)
			.innerJoin(tableInventaris, eq(tableInventarisPeminjaman.inventarisId, tableInventaris.id))
			.where(where)
			.orderBy(
				sql`case when ${tableInventarisPeminjaman.status} = 'dipinjam' then 0 else 1 end`,
				desc(tableInventarisPeminjaman.tanggalPinjam),
				desc(tableInventarisPeminjaman.id)
			)
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		db
			.select({ id: tablePegawai.id, nama: tablePegawai.nama })
			.from(tablePegawai)
			.where(and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')))
			.orderBy(asc(tablePegawai.nama)),
		db
			.select({
				id: tableInventaris.id,
				kode: tableInventaris.kode,
				nama: tableInventaris.nama,
				jumlah: tableInventaris.jumlah,
				satuan: tableInventaris.satuan,
				jumlahDipinjam: sql<number>`coalesce((select sum(p.jumlah) from inventaris_peminjaman p where p.inventaris_id = ${tableInventaris.id} and p.status = 'dipinjam'), 0)`
			})
			.from(tableInventaris)
			.where(eq(tableInventaris.sekolahId, sekolahId))
			.orderBy(asc(tableInventaris.kode), asc(tableInventaris.nama))
	]);

	return {
		meta: { title: 'Peminjaman Inventaris' } satisfies PageMeta,
		loans,
		employees,
		assets: assets.map((item) => ({ ...item, jumlahDipinjam: Number(item.jumlahDipinjam) })),
		canManage: canManage(locals),
		filters: { q, status },
		page: { currentPage: page, totalPages, totalItems }
	};
}

export const actions = {
	borrow: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola peminjaman.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const inventarisId = positiveInt(textValue(form, 'inventarisId'));
		const jumlah = positiveInt(textValue(form, 'jumlah'));
		const asset = sekolahId ? await ownedAsset(sekolahId, inventarisId) : null;
		if (!asset || jumlah < 1) return fail(400, { fail: 'Aset dan jumlah peminjaman tidak valid.' });
		const [{ used }] = await db
			.select({ used: sql<number>`coalesce(sum(${tableInventarisPeminjaman.jumlah}), 0)` })
			.from(tableInventarisPeminjaman)
			.where(
				and(
					eq(tableInventarisPeminjaman.inventarisId, inventarisId),
					eq(tableInventarisPeminjaman.status, 'dipinjam')
				)
			);
		if (jumlah > asset.jumlah - Number(used ?? 0))
			return fail(409, { fail: 'Jumlah yang dipinjam melebihi stok tersedia.' });
		const peminjamPegawaiId = positiveInt(textValue(form, 'peminjamPegawaiId')) || null;
		const employee = peminjamPegawaiId
			? await db.query.tablePegawai.findFirst({
					columns: { nama: true },
					where: and(eq(tablePegawai.id, peminjamPegawaiId), eq(tablePegawai.sekolahId, sekolahId!))
				})
			: null;
		const peminjamNama = employee?.nama ?? textValue(form, 'peminjamNama');
		const tanggalPinjam = textValue(form, 'tanggalPinjam');
		if (!peminjamNama || !tanggalPinjam)
			return fail(400, { fail: 'Nama peminjam dan tanggal pinjam wajib diisi.' });
		const [created] = await db
			.insert(tableInventarisPeminjaman)
			.values({
				inventarisId,
				peminjamPegawaiId,
				peminjamNama,
				jumlah,
				tanggalPinjam,
				rencanaKembali: optionalText(form, 'rencanaKembali'),
				catatan: optionalText(form, 'catatan')
			})
			.returning();
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'inventaris_peminjaman',
			entityId: created.id,
			summary: `${peminjamNama} meminjam ${jumlah} ${asset.satuan} ${asset.nama}.`,
			after: created
		});
		return { message: 'Peminjaman berhasil dicatat.' };
	},
	returnLoan: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola peminjaman.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = positiveInt(textValue(form, 'id'));
		const before = sekolahId
			? await db
					.select({ loan: tableInventarisPeminjaman, asset: tableInventaris })
					.from(tableInventarisPeminjaman)
					.innerJoin(tableInventaris, eq(tableInventarisPeminjaman.inventarisId, tableInventaris.id))
					.where(and(eq(tableInventarisPeminjaman.id, id), eq(tableInventaris.sekolahId, sekolahId)))
					.limit(1)
			: [];
		if (!before[0] || before[0].loan.status !== 'dipinjam')
			return fail(404, { fail: 'Peminjaman aktif tidak ditemukan.' });
		const changes = {
			status: 'dikembalikan' as const,
			tanggalKembali: textValue(form, 'tanggalKembali') || new Date().toISOString().slice(0, 10),
			kondisiKembali: optionalText(form, 'kondisiKembali'),
			updatedAt: new Date().toISOString()
		};
		await db.update(tableInventarisPeminjaman).set(changes).where(eq(tableInventarisPeminjaman.id, id));
		await writeAuditLog({
			locals,
			request,
			action: 'status_change',
			entityType: 'inventaris_peminjaman',
			entityId: id,
			summary: `${before[0].asset.nama} dikembalikan oleh ${before[0].loan.peminjamNama}.`,
			before: before[0].loan,
			after: changes
		});
		return { message: 'Pengembalian berhasil dicatat.' };
	}
};
