import { randomUUID } from 'node:crypto';
import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { ensureInventarisPengumumanSchema } from '$lib/server/db/ensure-inventaris-pengumuman';
import {
	tableDocumentAttachment,
	tableInventaris,
	tableInventarisPeminjaman,
	tableInventarisPerawatan,
	tablePegawai
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, like, or, sql } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

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
	const kategori = url.searchParams.get('kategori')?.trim() ?? '';
	const kondisiValue = url.searchParams.get('kondisi') ?? '';
	const kondisi = CONDITIONS.includes(kondisiValue as (typeof CONDITIONS)[number])
		? kondisiValue
		: '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const search = `%${q}%`;
	const where = and(
		eq(tableInventaris.sekolahId, sekolahId),
		q
			? or(
					like(tableInventaris.kode, search),
					like(tableInventaris.nama, search),
					like(tableInventaris.lokasi, search)
				)
			: undefined,
		kategori ? eq(tableInventaris.kategori, kategori) : undefined,
		kondisi ? eq(tableInventaris.kondisi, kondisi as (typeof CONDITIONS)[number]) : undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableInventaris)
		.where(where);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);
	const assets = await db
		.select({
			id: tableInventaris.id,
			kode: tableInventaris.kode,
			nama: tableInventaris.nama,
			kategori: tableInventaris.kategori,
			lokasi: tableInventaris.lokasi,
			kondisi: tableInventaris.kondisi,
			jumlah: tableInventaris.jumlah,
			satuan: tableInventaris.satuan,
			sumberDana: tableInventaris.sumberDana,
			tahunPerolehan: tableInventaris.tahunPerolehan,
			nilaiPerolehan: tableInventaris.nilaiPerolehan,
			penanggungJawabId: tableInventaris.penanggungJawabId,
			penanggungJawab: tablePegawai.nama,
			catatan: tableInventaris.catatan,
			jumlahDipinjam: sql<number>`coalesce((select sum(p.jumlah) from inventaris_peminjaman p where p.inventaris_id = ${tableInventaris.id} and p.status = 'dipinjam'), 0)`,
			jumlahBerkas: sql<number>`(select count(*) from document_attachment d where d.sekolah_id = ${sekolahId} and d.entity_type = 'inventaris' and d.entity_id = cast(${tableInventaris.id} as text))`
		})
		.from(tableInventaris)
		.leftJoin(tablePegawai, eq(tableInventaris.penanggungJawabId, tablePegawai.id))
		.where(where)
		.orderBy(asc(tableInventaris.kode), asc(tableInventaris.nama))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);

	const [employees, categories] = await Promise.all([
		db
			.select({ id: tablePegawai.id, nama: tablePegawai.nama, nip: tablePegawai.nip })
			.from(tablePegawai)
			.where(and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')))
			.orderBy(asc(tablePegawai.nama)),
		db
			.selectDistinct({ kategori: tableInventaris.kategori })
			.from(tableInventaris)
			.where(eq(tableInventaris.sekolahId, sekolahId))
			.orderBy(asc(tableInventaris.kategori))
	]);

	return {
		meta: { title: 'Inventaris dan Sarana Prasarana' } satisfies PageMeta,
		assets: assets.map((item) => ({
			...item,
			jumlahDipinjam: Number(item.jumlahDipinjam),
			jumlahBerkas: Number(item.jumlahBerkas)
		})),
		employees,
		categories: categories.map((item) => item.kategori),
		conditions: CONDITIONS,
		canManage: canManage(locals),
		filters: { q, kategori, kondisi },
		page: { currentPage: page, totalPages, totalItems }
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola inventaris.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const kode = textValue(form, 'kode');
		const nama = textValue(form, 'nama');
		const kategori = textValue(form, 'kategori');
		const jumlah = positiveInt(textValue(form, 'jumlah'));
		if (!kode || !nama || !kategori || jumlah < 1)
			return fail(400, { fail: 'Kode, nama, kategori, dan jumlah aset wajib valid.' });
		const kondisi = textValue(form, 'kondisi');
		if (!CONDITIONS.includes(kondisi as (typeof CONDITIONS)[number]))
			return fail(400, { fail: 'Kondisi aset tidak valid.' });
		try {
			const [created] = await db
				.insert(tableInventaris)
				.values({
					sekolahId,
					kode,
					nama,
					kategori,
					lokasi: optionalText(form, 'lokasi'),
					kondisi: kondisi as (typeof CONDITIONS)[number],
					jumlah,
					satuan: optionalText(form, 'satuan') ?? 'unit',
					sumberDana: optionalText(form, 'sumberDana'),
					tahunPerolehan: positiveInt(textValue(form, 'tahunPerolehan')) || null,
					nilaiPerolehan: Number(textValue(form, 'nilaiPerolehan')) || null,
					penanggungJawabId: positiveInt(textValue(form, 'penanggungJawabId')) || null,
					qrToken: randomUUID(),
					catatan: optionalText(form, 'catatan')
				})
				.returning();
			await writeAuditLog({
				locals,
				request,
				action: 'create',
				entityType: 'inventaris',
				entityId: created.id,
				summary: `Aset ${kode} - ${nama} ditambahkan.`,
				after: created
			});
			return { message: 'Aset berhasil ditambahkan.' };
		} catch (error) {
			if (String(error).includes('UNIQUE'))
				return fail(409, { fail: 'Kode aset sudah digunakan pada sekolah ini.' });
			throw error;
		}
	},
	update: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola inventaris.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = positiveInt(textValue(form, 'id'));
		if (!sekolahId || !id) return fail(400, { fail: 'Aset tidak valid.' });
		const before = await ownedAsset(sekolahId, id);
		if (!before) return fail(404, { fail: 'Aset tidak ditemukan.' });
		const kode = textValue(form, 'kode');
		const nama = textValue(form, 'nama');
		const kategori = textValue(form, 'kategori');
		const jumlah = positiveInt(textValue(form, 'jumlah'));
		const activeLoan = await db
			.select({ total: sql<number>`coalesce(sum(${tableInventarisPeminjaman.jumlah}), 0)` })
			.from(tableInventarisPeminjaman)
			.where(
				and(
					eq(tableInventarisPeminjaman.inventarisId, id),
					eq(tableInventarisPeminjaman.status, 'dipinjam')
				)
			);
		if (!kode || !nama || !kategori || jumlah < Number(activeLoan[0]?.total ?? 0))
			return fail(400, {
				fail: 'Jumlah aset tidak boleh lebih kecil dari jumlah yang sedang dipinjam.'
			});
		const kondisi = textValue(form, 'kondisi');
		if (!CONDITIONS.includes(kondisi as (typeof CONDITIONS)[number]))
			return fail(400, { fail: 'Kondisi aset tidak valid.' });
		const changes = {
			kode,
			nama,
			kategori,
			lokasi: optionalText(form, 'lokasi'),
			kondisi: kondisi as (typeof CONDITIONS)[number],
			jumlah,
			satuan: optionalText(form, 'satuan') ?? 'unit',
			sumberDana: optionalText(form, 'sumberDana'),
			tahunPerolehan: positiveInt(textValue(form, 'tahunPerolehan')) || null,
			nilaiPerolehan: Number(textValue(form, 'nilaiPerolehan')) || null,
			penanggungJawabId: positiveInt(textValue(form, 'penanggungJawabId')) || null,
			catatan: optionalText(form, 'catatan'),
			updatedAt: new Date().toISOString()
		};
		try {
			await db
				.update(tableInventaris)
				.set(changes)
				.where(and(eq(tableInventaris.id, id), eq(tableInventaris.sekolahId, sekolahId)));
		} catch (error) {
			if (String(error).includes('UNIQUE'))
				return fail(409, { fail: 'Kode aset sudah digunakan pada sekolah ini.' });
			throw error;
		}
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'inventaris',
			entityId: id,
			summary: `Aset ${kode} - ${nama} diperbarui.`,
			before,
			after: changes
		});
		return { message: 'Aset berhasil diperbarui.' };
	},
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
					.innerJoin(
						tableInventaris,
						eq(tableInventarisPeminjaman.inventarisId, tableInventaris.id)
					)
					.where(
						and(eq(tableInventarisPeminjaman.id, id), eq(tableInventaris.sekolahId, sekolahId))
					)
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
		await db
			.update(tableInventarisPeminjaman)
			.set(changes)
			.where(eq(tableInventarisPeminjaman.id, id));
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
	},
	maintenance: async ({ request, locals }) => {
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
				.set({
					kondisi: nextCondition as (typeof CONDITIONS)[number],
					updatedAt: new Date().toISOString()
				})
				.where(eq(tableInventaris.id, inventarisId));
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
	},
	delete: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus inventaris.' });
		const sekolahId = locals.sekolah?.id;
		const id = positiveInt(textValue(await request.formData(), 'id'));
		const before = sekolahId ? await ownedAsset(sekolahId, id) : null;
		if (!before) return fail(404, { fail: 'Aset tidak ditemukan.' });
		const [dependency] = await db
			.select({
				loans: sql<number>`count(distinct ${tableInventarisPeminjaman.id})`,
				attachments: sql<number>`count(distinct ${tableDocumentAttachment.id})`
			})
			.from(tableInventaris)
			.leftJoin(
				tableInventarisPeminjaman,
				eq(tableInventarisPeminjaman.inventarisId, tableInventaris.id)
			)
			.leftJoin(
				tableDocumentAttachment,
				and(
					eq(tableDocumentAttachment.sekolahId, sekolahId!),
					eq(tableDocumentAttachment.entityType, 'inventaris'),
					eq(tableDocumentAttachment.entityId, String(id))
				)
			)
			.where(eq(tableInventaris.id, id));
		if (Number(dependency?.loans ?? 0) > 0 || Number(dependency?.attachments ?? 0) > 0)
			return fail(409, {
				fail: 'Aset memiliki riwayat peminjaman atau berkas. Pertahankan aset sebagai arsip.'
			});
		await db
			.delete(tableInventaris)
			.where(and(eq(tableInventaris.id, id), eq(tableInventaris.sekolahId, sekolahId!)));
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'inventaris',
			entityId: id,
			summary: `Aset ${before.kode} - ${before.nama} dihapus.`,
			before
		});
		return { message: 'Aset berhasil dihapus.' };
	}
};
