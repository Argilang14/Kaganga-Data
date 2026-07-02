import { parsePositiveInteger } from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { tableJadwalMapel, tableJadwalPelajaran, tablePegawai } from '$lib/server/db/schema';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';

const JENJANG_OPTIONS = ['semua', 'srd', 'srmp', 'srma'] as const;
type JenjangOption = (typeof JENJANG_OPTIONS)[number];
const KATEGORI_OPTIONS = [
	'semua',
	'akademik',
	'kokurikuler',
	'keasramaan',
	'muatan_lokal'
] as const;
type KategoriFilter = (typeof KATEGORI_OPTIONS)[number];
type KategoriOption = Exclude<KategoriFilter, 'semua'>;
type ExcelRowLike = { getCell(index: number): { value?: unknown; text?: string } };

function normalizeText(value: FormDataEntryValue | null) {
	const raw = value?.toString().trim() ?? '';
	return raw.length ? raw : null;
}

function normalizeJenjang(value: FormDataEntryValue | string | null): JenjangOption {
	const raw = value?.toString() ?? 'semua';
	return JENJANG_OPTIONS.includes(raw as JenjangOption) ? (raw as JenjangOption) : 'semua';
}

function normalizeKategoriFilter(value: FormDataEntryValue | string | null): KategoriFilter {
	const raw = value?.toString() ?? 'semua';
	return KATEGORI_OPTIONS.includes(raw as KategoriFilter) ? (raw as KategoriFilter) : 'semua';
}

function normalizeKategori(value: FormDataEntryValue | string | null): KategoriOption {
	const raw = normalizeKategoriFilter(value);
	return raw === 'semua' ? 'akademik' : raw;
}

function cellText(value: unknown) {
	if (value == null) return '';
	if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
	return String(value).trim();
}

function normalizeBoolean(value: unknown) {
	const raw = cellText(value).toLowerCase();
	return !['nonaktif', 'tidak', 'false', '0'].includes(raw);
}

async function parseMapelWorkbook(file: File) {
	const ExcelJSModule = await import('exceljs');
	const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
	const sheet = workbook.worksheets[0];
	if (!sheet) return [];

	const rows: Array<{
		kode: string;
		nama: string;
		jenjang: JenjangOption;
		fase: string | null;
		kategori: KategoriOption;
		guruPegawaiId: number | null;
		warna: string | null;
		aktif: boolean;
		catatan: string | null;
	}> = [];
	sheet.eachRow((rawRow, rowNumber) => {
		const row = rawRow as ExcelRowLike;
		if (rowNumber === 1) return;
		const kode = cellText(row.getCell(1).value).toUpperCase();
		const nama = cellText(row.getCell(2).value);
		if (!kode || !nama) return;
		const guruPegawaiId = Number.parseInt(cellText(row.getCell(6).value), 10);
		rows.push({
			kode,
			nama,
			jenjang: normalizeJenjang(cellText(row.getCell(3).value)),
			fase: cellText(row.getCell(4).value) || null,
			kategori: normalizeKategori(cellText(row.getCell(5).value)),
			guruPegawaiId: Number.isInteger(guruPegawaiId) && guruPegawaiId > 0 ? guruPegawaiId : null,
			warna: cellText(row.getCell(7).value) || '#dbeafe',
			aktif: normalizeBoolean(row.getCell(8).value),
			catatan: cellText(row.getCell(9).value) || null
		});
	});
	return rows;
}

export async function load({ locals, url }) {
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const q = url.searchParams.get('q')?.trim() ?? '';
	const jenjang = normalizeJenjang(url.searchParams.get('jenjang'));
	const kategori = normalizeKategoriFilter(url.searchParams.get('kategori'));
	const editId = parsePositiveInteger(url.searchParams.get('edit'));

	const filters = [eq(tableJadwalMapel.sekolahId, sekolahId)];
	if (q)
		filters.push(or(like(tableJadwalMapel.nama, `%${q}%`), like(tableJadwalMapel.kode, `%${q}%`))!);
	if (jenjang !== 'semua') filters.push(eq(tableJadwalMapel.jenjang, jenjang));
	if (kategori !== 'semua') filters.push(eq(tableJadwalMapel.kategori, kategori));

	const [mapelList, guruList, usageRows, editMapel] = await Promise.all([
		db.query.tableJadwalMapel.findMany({
			where: and(...filters),
			with: { guru: { columns: { id: true, nama: true, nip: true } } },
			orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
		}),
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, nip: true, jenis: true, status: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
			orderBy: asc(tablePegawai.nama)
		}),
		db
			.select({ jadwalMapelId: tableJadwalPelajaran.jadwalMapelId, total: sql<number>`count(*)` })
			.from(tableJadwalPelajaran)
			.where(eq(tableJadwalPelajaran.sekolahId, sekolahId))
			.groupBy(tableJadwalPelajaran.jadwalMapelId),
		editId
			? db.query.tableJadwalMapel.findFirst({
					where: and(eq(tableJadwalMapel.id, editId), eq(tableJadwalMapel.sekolahId, sekolahId))
				})
			: null
	]);

	const usageMap = new Map<number, number>();
	for (const row of usageRows) {
		if (row.jadwalMapelId) usageMap.set(row.jadwalMapelId, row.total ?? 0);
	}

	return {
		meta: { title: 'Data Mata Pelajaran' } satisfies PageMeta,
		filter: { q, jenjang, kategori },
		options: { jenjang: JENJANG_OPTIONS, kategori: KATEGORI_OPTIONS },
		mapelList: mapelList.map((item) => ({ ...item, totalSlot: usageMap.get(item.id) ?? 0 })),
		guruList,
		editMapel
	};
}

export const actions = {
	save: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const id = parsePositiveInteger(formData.get('id'));
		const kode = normalizeText(formData.get('kode'));
		const nama = normalizeText(formData.get('nama'));
		const jenjang = normalizeJenjang(formData.get('jenjang'));
		const fase = normalizeText(formData.get('fase'));
		const kategori = normalizeKategori(formData.get('kategori'));
		const guruPegawaiId = parsePositiveInteger(formData.get('guruPegawaiId')) ?? null;
		const warna = normalizeText(formData.get('warna'));
		const catatan = normalizeText(formData.get('catatan'));
		const aktif = formData.get('aktif') === 'on';

		if (!kode || !nama) return fail(400, { fail: 'Kode dan nama mata pelajaran wajib diisi.' });
		if (guruPegawaiId) {
			const guru = await db.query.tablePegawai.findFirst({
				columns: { id: true },
				where: and(
					eq(tablePegawai.id, guruPegawaiId),
					eq(tablePegawai.sekolahId, sekolahId),
					eq(tablePegawai.status, 'aktif')
				)
			});
			if (!guru)
				return fail(400, { fail: 'Guru mapel harus dipilih dari Data Pegawai sekolah aktif.' });
		}
		const now = new Date().toISOString();
		const payload = {
			sekolahId,
			kode: kode.toUpperCase(),
			nama,
			jenjang,
			fase,
			kategori,
			guruPegawaiId,
			warna,
			aktif,
			catatan,
			updatedAt: now
		};

		const duplicate = await db.query.tableJadwalMapel.findFirst({
			columns: { id: true },
			where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.kode, payload.kode))
		});
		if (duplicate && duplicate.id !== id) {
			return fail(400, { fail: `Kode ${payload.kode} sudah dipakai pada Data Mata Pelajaran.` });
		}

		if (id) {
			await db
				.update(tableJadwalMapel)
				.set(payload)
				.where(and(eq(tableJadwalMapel.id, id), eq(tableJadwalMapel.sekolahId, sekolahId)));
			return { message: 'Data mata pelajaran berhasil diperbarui.' };
		}

		await db.insert(tableJadwalMapel).values({ ...payload, createdAt: now });
		return { message: 'Data mata pelajaran berhasil ditambahkan.' };
	},

	delete: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const id = parsePositiveInteger(formData.get('id'));
		if (!id) return fail(400, { fail: 'Data mata pelajaran tidak valid.' });

		const usage = await db
			.select({ total: sql<number>`count(*)` })
			.from(tableJadwalPelajaran)
			.where(
				and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.jadwalMapelId, id)
				)
			);
		if ((usage[0]?.total ?? 0) > 0) {
			return fail(400, {
				fail: 'Mata pelajaran sudah dipakai di jadwal. Nonaktifkan saja jika tidak dipakai lagi.'
			});
		}

		await db
			.delete(tableJadwalMapel)
			.where(and(eq(tableJadwalMapel.id, id), eq(tableJadwalMapel.sekolahId, sekolahId)));
		return { message: 'Data mata pelajaran berhasil dihapus.' };
	},

	deleteBulk: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const ids = formData
			.getAll('ids')
			.map((value) => parsePositiveInteger(value))
			.filter((id): id is number => Boolean(id));
		if (!ids.length) return fail(400, { fail: 'Pilih minimal satu mata pelajaran untuk dihapus.' });

		const existingRows = await db.query.tableJadwalMapel.findMany({
			columns: { id: true, kode: true, nama: true },
			where: and(eq(tableJadwalMapel.sekolahId, sekolahId), inArray(tableJadwalMapel.id, ids))
		});
		if (!existingRows.length) return fail(404, { fail: 'Data mata pelajaran tidak ditemukan.' });

		let deleted = 0;
		let skipped = 0;
		for (const row of existingRows) {
			const usage = await db
				.select({ total: sql<number>`count(*)` })
				.from(tableJadwalPelajaran)
				.where(
					and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.jadwalMapelId, row.id)
					)
				);
			if ((usage[0]?.total ?? 0) > 0) {
				skipped += 1;
				continue;
			}
			await db
				.delete(tableJadwalMapel)
				.where(and(eq(tableJadwalMapel.id, row.id), eq(tableJadwalMapel.sekolahId, sekolahId)));
			deleted += 1;
		}

		if (!deleted && skipped) {
			return fail(400, {
				fail: 'Tidak ada mata pelajaran yang dihapus. Data terpilih masih dipakai di jadwal pelajaran.'
			});
		}

		return {
			message: `Hapus massal selesai. Terhapus: ${deleted}${skipped ? `, dilewati karena masih dipakai: ${skipped}` : ''}.`
		};
	},
	importExcel: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || !file.size) {
			return fail(400, { fail: 'Pilih file Excel Data Mata Pelajaran terlebih dahulu.' });
		}

		const rows = await parseMapelWorkbook(file);
		if (!rows.length)
			return fail(400, { fail: 'Tidak ada data mata pelajaran valid di file Excel.' });

		let inserted = 0;
		let updated = 0;
		const now = new Date().toISOString();
		for (const row of rows) {
			const existing = await db.query.tableJadwalMapel.findFirst({
				columns: { id: true },
				where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.kode, row.kode))
			});
			const guruPegawaiId = row.guruPegawaiId
				? await db.query.tablePegawai
						.findFirst({
							columns: { id: true },
							where: and(
								eq(tablePegawai.id, row.guruPegawaiId),
								eq(tablePegawai.sekolahId, sekolahId),
								eq(tablePegawai.status, 'aktif')
							)
						})
						.then((guru) => guru?.id ?? null)
				: null;
			const payload = { sekolahId, ...row, guruPegawaiId, updatedAt: now };
			if (existing) {
				await db.update(tableJadwalMapel).set(payload).where(eq(tableJadwalMapel.id, existing.id));
				updated += 1;
			} else {
				await db.insert(tableJadwalMapel).values({ ...payload, createdAt: now });
				inserted += 1;
			}
		}

		return {
			message: `Import Data Mata Pelajaran selesai. Baru: ${inserted}, diperbarui: ${updated}.`
		};
	}
};
