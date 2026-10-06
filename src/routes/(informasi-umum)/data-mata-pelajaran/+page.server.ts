// @ts-nocheck
import { parsePositiveInteger } from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { ensureJadwalKurikulumSchema } from '$lib/server/db/ensure-jadwal-kurikulum';
import { tableJadwalMapel, tableJadwalPelajaran, tablePegawai } from '$lib/server/db/schema';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { JADWAL_MAPEL_EXCEL_HEADERS } from '$lib/server/jadwal-mapel-excel';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';

const JENJANG_OPTIONS = ['semua', 'srd', 'srmp', 'srma'] as const;
type JenjangOption = (typeof JENJANG_OPTIONS)[number];
const KATEGORI_OPTIONS = [
	'semua',
	'masa_persiapan',
	'akademik',
	'kokurikuler',
	'keasramaan',
	'muatan_lokal'
] as const;
type KategoriFilter = (typeof KATEGORI_OPTIONS)[number];
type KategoriOption = Exclude<KategoriFilter, 'semua'>;
type ExcelColorLike = { argb?: string; rgb?: string; indexed?: number; theme?: number };
type ExcelCellLike = {
	value?: unknown;
	text?: string;
	fill?: { type?: string; pattern?: string; fgColor?: ExcelColorLike; bgColor?: ExcelColorLike };
};
type ExcelRowLike = { getCell(index: number): ExcelCellLike };

const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

function normalizeText(value: FormDataEntryValue | null) {
	const raw = value?.toString().trim() ?? '';
	return raw.length ? raw : null;
}

function normalizeJenjang(value: FormDataEntryValue | string | null): JenjangOption {
	const raw = value?.toString() ?? 'semua';
	return JENJANG_OPTIONS.includes(raw as JenjangOption) ? (raw as JenjangOption) : 'semua';
}

function normalizeKategoriFilter(value: FormDataEntryValue | string | null): KategoriFilter {
	const raw =
		value
			?.toString()
			.trim()
			.toLowerCase()
			.replace(/[\s-]+/g, '_') ?? 'semua';
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

function normalizeHexColor(value: unknown) {
	const raw = cellText(value).replace(/^#/, '').toUpperCase();
	if (/^[0-9A-F]{3}$/.test(raw)) return '#' + raw.replace(/./g, (digit) => digit + digit);
	if (/^[0-9A-F]{6}$/.test(raw)) return '#' + raw;
	if (/^[0-9A-F]{8}$/.test(raw)) return '#' + raw.slice(2);
	return null;
}

function excelCellColor(cell: ExcelCellLike) {
	const typedColor = normalizeHexColor(cell.value) ?? normalizeHexColor(cell.text);
	if (typedColor) return typedColor;
	const fill = cell.fill;
	if (!fill || fill.pattern === 'none') return '#DBEAFE';
	for (const color of [fill.fgColor, fill.bgColor]) {
		const direct = normalizeHexColor(color?.argb ?? color?.rgb);
		if (direct) return direct;
		if (color?.indexed === 9) return '#FFFFFF';
		if (color?.indexed === 10) return '#FF0000';
		if (color?.indexed === 11) return '#00FF00';
		if (color?.indexed === 12) return '#0000FF';
	}
	return '#DBEAFE';
}
function normalizeBoolean(value: unknown) {
	const raw = cellText(value).toLowerCase();
	return !['nonaktif', 'tidak', 'false', '0'].includes(raw);
}
function normalizeNonNegativeInteger(value: FormDataEntryValue | string | null | undefined) {
	const raw = value?.toString().trim() ?? '';
	if (!raw) return 0;
	const number = Number(raw);
	return Number.isInteger(number) && number >= 0 ? number : 0;
}

async function parseMapelWorkbook(file: File) {
	const ExcelJSModule = await import('exceljs');
	const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
	const sheet = workbook.worksheets[0];
	if (!sheet) return [];
	const actualHeaders = JADWAL_MAPEL_EXCEL_HEADERS.map((_, index) =>
		cellText(sheet.getRow(1).getCell(index + 1).value)
	);
	const invalidHeader = JADWAL_MAPEL_EXCEL_HEADERS.findIndex(
		(header, index) => actualHeaders[index].toLowerCase() !== header.toLowerCase()
	);
	if (invalidHeader >= 0) {
		throw new Error(
			`Kolom ${invalidHeader + 1} harus bernama "${JADWAL_MAPEL_EXCEL_HEADERS[invalidHeader]}". Gunakan template terbaru.`
		);
	}

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
		jpPerMinggu: number;
	}> = [];
	sheet.eachRow((rawRow, rowNumber) => {
		const row = rawRow as ExcelRowLike;
		if (rowNumber === 1) return;
		const kode = cellText(row.getCell(1).value).toUpperCase();
		const nama = cellText(row.getCell(2).value);
		if (!kode || !nama) return;
		const rawJenjang = cellText(row.getCell(3).value).toLowerCase();
		const rawKategori = cellText(row.getCell(5).value)
			.toLowerCase()
			.replace(/[\s-]+/g, '_');
		if (!JENJANG_OPTIONS.includes(rawJenjang as JenjangOption)) {
			throw new Error(`Baris ${rowNumber}: jenjang "${rawJenjang}" tidak valid.`);
		}
		if (!KATEGORI_OPTIONS.includes(rawKategori as KategoriFilter) || rawKategori === 'semua') {
			throw new Error(`Baris ${rowNumber}: kategori "${rawKategori}" tidak valid.`);
		}
		const guruRaw = cellText(row.getCell(6).value);
		const guruPegawaiId = Number.parseInt(guruRaw, 10);
		if (guruRaw && (!Number.isInteger(guruPegawaiId) || guruPegawaiId <= 0)) {
			throw new Error(`Baris ${rowNumber}: ID Guru harus berupa angka positif.`);
		}
		const jpRaw = cellText(row.getCell(7).value);
		const jpPerMinggu = Number.parseInt(jpRaw, 10);
		if (jpRaw && (!Number.isInteger(jpPerMinggu) || jpPerMinggu < 0)) {
			throw new Error(`Baris ${rowNumber}: JP per Minggu harus berupa bilangan bulat minimal 0.`);
		}
		rows.push({
			kode,
			nama,
			jenjang: rawJenjang as JenjangOption,
			fase: cellText(row.getCell(4).value) || null,
			kategori: rawKategori as KategoriOption,
			guruPegawaiId: Number.isInteger(guruPegawaiId) && guruPegawaiId > 0 ? guruPegawaiId : null,
			jpPerMinggu: Number.isInteger(jpPerMinggu) && jpPerMinggu >= 0 ? jpPerMinggu : 0,
			warna: excelCellColor(row.getCell(8)),
			aktif: normalizeBoolean(row.getCell(9).value),
			catatan: cellText(row.getCell(10).value) || null
		});
	});
	return rows;
}

export async function load({ locals, url }) {
	await ensureJadwalKurikulumSchema();
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
		const jpPerMinggu = normalizeNonNegativeInteger(formData.get('jpPerMinggu'));
		const warna = normalizeHexColor(formData.get('warna')) ?? '#DBEAFE';
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
			jpPerMinggu,
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
		if (!file.name.toLowerCase().endsWith('.xlsx')) {
			return fail(400, { fail: 'Format file harus .xlsx.' });
		}
		if (file.size > MAX_IMPORT_SIZE) {
			return fail(400, { fail: 'Ukuran file Excel maksimal 5 MB.' });
		}

		let rows: Awaited<ReturnType<typeof parseMapelWorkbook>>;
		try {
			rows = await parseMapelWorkbook(file);
		} catch (error) {
			return fail(400, {
				fail: error instanceof Error ? error.message : 'File Excel tidak dapat dibaca.'
			});
		}
		if (!rows.length)
			return fail(400, { fail: 'Tidak ada data mata pelajaran valid di file Excel.' });

		const duplicateCodes = rows
			.map((row) => row.kode)
			.filter((kode, index, all) => all.indexOf(kode) !== index);
		if (duplicateCodes.length) {
			return fail(400, {
				fail: `Kode ganda di file Excel: ${[...new Set(duplicateCodes)].join(', ')}.`
			});
		}
		const requestedGuruIds = [
			...new Set(rows.map((row) => row.guruPegawaiId).filter((id): id is number => id !== null))
		];
		const validGuruIds = requestedGuruIds.length
			? new Set(
					(
						await db.query.tablePegawai.findMany({
							columns: { id: true },
							where: and(
								eq(tablePegawai.sekolahId, sekolahId),
								eq(tablePegawai.status, 'aktif'),
								inArray(tablePegawai.id, requestedGuruIds)
							)
						})
					).map((guru) => guru.id)
				)
			: new Set<number>();
		const invalidGuruIds = requestedGuruIds.filter((id) => !validGuruIds.has(id));
		if (invalidGuruIds.length) {
			return fail(400, {
				fail: `ID Guru tidak ditemukan atau tidak aktif: ${invalidGuruIds.join(', ')}.`
			});
		}

		let inserted = 0;
		let updated = 0;
		const now = new Date().toISOString();
		for (const row of rows) {
			const existing = await db.query.tableJadwalMapel.findFirst({
				columns: { id: true },
				where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.kode, row.kode))
			});
			const payload = { sekolahId, ...row, updatedAt: now };
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
