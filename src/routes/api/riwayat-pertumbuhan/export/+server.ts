import db from '$lib/server/db';
import { ensureKesehatanMuridSchema } from '$lib/server/db/ensure-kesehatan-murid';
import { tableKesehatanMurid, tableMurid } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, desc, eq, gte, inArray, like, lte, or, type SQL } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const statusLabels: Record<string, string> = {
	gizi_buruk: 'Gizi Buruk',
	gizi_kurang: 'Gizi Kurang',
	normal: 'Normal',
	gizi_lebih: 'Gizi Lebih',
	obesitas: 'Obesitas'
};

function formatStatus(value: string | null) {
	return value ? (statusLabels[value] ?? value) : '';
}

export async function GET({ locals, url }) {
	await ensureKesehatanMuridSchema();
	if (!locals.user) throw error(401, 'Sesi tidak valid.');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');

	const kelasId = Number(url.searchParams.get('kelasId') ?? '');
	const q = url.searchParams.get('q')?.trim() ?? '';
	const start = url.searchParams.get('start')?.trim() ?? '';
	const end = url.searchParams.get('end')?.trim() ?? '';

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

	const rows = await db.query.tableKesehatanMurid.findMany({
		where: and(...filters),
		orderBy: [desc(tableKesehatanMurid.tanggalPengukuran), desc(tableKesehatanMurid.id)],
		with: { murid: { with: { kelas: true } }, petugas: { columns: { username: true } } }
	});

	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Riwayat Pertumbuhan');
	sheet.columns = [
		{ header: 'Tanggal Pengukuran', key: 'tanggalPengukuran', width: 20 },
		{ header: 'NIS', key: 'nis', width: 18 },
		{ header: 'Nama Murid', key: 'nama', width: 28 },
		{ header: 'Kelas', key: 'kelas', width: 18 },
		{ header: 'Tinggi Badan', key: 'tinggiBadan', width: 16 },
		{ header: 'Berat Badan', key: 'beratBadan', width: 16 },
		{ header: 'Z-Score', key: 'zScore', width: 12 },
		{ header: 'Status Gizi', key: 'statusGizi', width: 18 },
		{ header: 'Kondisi Fisik', key: 'kondisiFisik', width: 18 },
		{ header: 'Ukuran Baju', key: 'ukuranBaju', width: 14 },
		{ header: 'Ukuran Celana', key: 'ukuranCelana', width: 16 },
		{ header: 'Ukuran Sepatu', key: 'ukuranSepatu', width: 16 },
		{ header: 'Catatan', key: 'catatan', width: 34 },
		{ header: 'Petugas', key: 'petugas', width: 18 }
	];
	for (const row of rows) {
		sheet.addRow({
			tanggalPengukuran: row.tanggalPengukuran,
			nis: row.murid?.nis ?? '',
			nama: row.murid?.nama ?? '',
			kelas: row.murid?.kelas?.nama ?? '',
			tinggiBadan: row.tinggiBadan ?? '',
			beratBadan: row.beratBadan ?? '',
			zScore: row.zScore ?? '',
			statusGizi: formatStatus(row.statusGizi),
			kondisiFisik: row.kondisiFisik ?? '',
			ukuranBaju: row.ukuranBaju ?? '',
			ukuranCelana: row.ukuranCelana ?? '',
			ukuranSepatu: row.ukuranSepatu ?? '',
			catatan: row.catatan ?? '',
			petugas: row.petugas?.username ?? ''
		});
	}
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="riwayat-pertumbuhan.xlsx"'
		}
	});
}
