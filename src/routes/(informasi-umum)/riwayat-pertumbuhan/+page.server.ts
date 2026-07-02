import db from '$lib/server/db';
import { ensureKesehatanMuridSchema } from '$lib/server/db/ensure-kesehatan-murid';
import { tableKelas, tableKesehatanMurid, tableMurid } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, gte, inArray, like, lte, or, type SQL } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { Actions, PageServerLoad } from './$types';

const statusList = ['gizi_buruk', 'gizi_kurang', 'normal', 'gizi_lebih', 'obesitas'] as const;

type StatusGizi = (typeof statusList)[number];

function statusValue(raw: string | null): StatusGizi | null {
	return raw && statusList.includes(raw as StatusGizi) ? (raw as StatusGizi) : null;
}

async function parseWorkbook(file: File) {
	if (!file.size) return [];
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(await file.arrayBuffer());
	const sheet = workbook.worksheets[0];
	if (!sheet) return [];
	const rows: Array<Record<string, string>> = [];
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		const get = (index: number) => row.getCell(index).text?.trim() ?? '';
		const nis = get(1);
		const tanggalPengukuran = get(3);
		if (!nis || !tanggalPengukuran) return;
		rows.push({
			nis,
			tanggalPengukuran,
			tinggiBadan: get(4),
			beratBadan: get(5),
			zScore: get(6),
			statusGizi: get(7),
			kondisiFisik: get(8),
			ukuranBaju: get(9),
			ukuranCelana: get(10),
			ukuranSepatu: get(11),
			catatan: get(12)
		});
	});
	return rows;
}

function excelNumber(value: string | undefined) {
	if (!value) return null;
	const parsed = Number(value.replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	await ensureKesehatanMuridSchema();
	if (!locals.user) throw redirect(303, '/login');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');

	const kelasId = Number(url.searchParams.get('kelasId') ?? '');
	const q = url.searchParams.get('q')?.trim() ?? '';
	const start = url.searchParams.get('start')?.trim() ?? '';
	const end = url.searchParams.get('end')?.trim() ?? '';

	const kelas = await db.query.tableKelas.findMany({
		where: eq(tableKelas.sekolahId, sekolahId),
		orderBy: asc(tableKelas.nama),
		columns: { id: true, nama: true, fase: true }
	});

	let allowedMuridIds: number[] | null = null;
	if ((Number.isFinite(kelasId) && kelasId > 0) || q) {
		const muridFilters: SQL[] = [eq(tableMurid.sekolahId, sekolahId)];
		if (Number.isFinite(kelasId) && kelasId > 0) muridFilters.push(eq(tableMurid.kelasId, kelasId));
		if (q) {
			const search = or(like(tableMurid.nama, `%${q}%`), like(tableMurid.nis, `%${q}%`));
			if (search) muridFilters.push(search);
		}
		const muridList = await db.query.tableMurid.findMany({
			where: and(...muridFilters),
			columns: { id: true }
		});
		allowedMuridIds = muridList.map((item) => item.id);
	}

	const filters: SQL[] = [eq(tableKesehatanMurid.sekolahId, sekolahId)];
	if (start) filters.push(gte(tableKesehatanMurid.tanggalPengukuran, start));
	if (end) filters.push(lte(tableKesehatanMurid.tanggalPengukuran, end));
	if (allowedMuridIds) {
		if (!allowedMuridIds.length) filters.push(eq(tableKesehatanMurid.id, -1));
		else filters.push(inArray(tableKesehatanMurid.muridId, allowedMuridIds));
	}

	const riwayat = await db.query.tableKesehatanMurid.findMany({
		where: and(...filters),
		orderBy: [desc(tableKesehatanMurid.tanggalPengukuran), desc(tableKesehatanMurid.id)],
		with: { murid: { with: { kelas: true } }, petugas: { columns: { username: true } } }
	});

	return {
		meta: { title: 'Riwayat Pertumbuhan' },
		kelas,
		riwayat,
		filter: {
			kelasId: Number.isFinite(kelasId) && kelasId > 0 ? String(kelasId) : '',
			q,
			start,
			end
		}
	};
};

export const actions: Actions = {
	import: async ({ request, locals }) => {
		await ensureKesehatanMuridSchema();
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { fail: 'Pilih file Excel.' });

		const rows = await parseWorkbook(file);
		let inserted = 0;
		let updated = 0;
		let skipped = 0;
		for (const row of rows) {
			const murid = await db.query.tableMurid.findFirst({
				where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.nis, row.nis)),
				columns: { id: true, semesterId: true }
			});
			if (!murid) {
				skipped += 1;
				continue;
			}
			const payload = {
				sekolahId,
				muridId: murid.id,
				semesterId: murid.semesterId,
				tanggalPengukuran: row.tanggalPengukuran,
				tinggiBadan: excelNumber(row.tinggiBadan),
				beratBadan: excelNumber(row.beratBadan),
				zScore: excelNumber(row.zScore),
				statusGizi: statusValue(row.statusGizi),
				kondisiFisik: row.kondisiFisik || null,
				ukuranBaju: row.ukuranBaju || null,
				ukuranCelana: row.ukuranCelana || null,
				ukuranSepatu: row.ukuranSepatu || null,
				catatan: row.catatan || null,
				petugasUserId: locals.user.id ?? null,
				updatedAt: new Date().toISOString()
			};
			const existing = await db.query.tableKesehatanMurid.findFirst({
				where: and(
					eq(tableKesehatanMurid.muridId, murid.id),
					eq(tableKesehatanMurid.tanggalPengukuran, row.tanggalPengukuran)
				),
				columns: { id: true }
			});
			if (existing) {
				await db
					.update(tableKesehatanMurid)
					.set(payload)
					.where(eq(tableKesehatanMurid.id, existing.id));
				updated += 1;
			} else {
				await db.insert(tableKesehatanMurid).values(payload);
				inserted += 1;
			}
		}
		return {
			message: `Import selesai. ${inserted} baru, ${updated} diperbarui, ${skipped} dilewati.`
		};
	}
};
