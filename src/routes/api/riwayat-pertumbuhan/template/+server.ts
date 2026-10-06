import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Sesi tidak valid.');
	if (!locals.sekolah?.id) throw error(400, 'Sekolah aktif tidak ditemukan.');

	const workbook: any = new ExcelJS.Workbook();
	const sheet: any = workbook.addWorksheet('Template Pertumbuhan');
	sheet.columns = [
		{ header: 'NIS', key: 'nis', width: 18 },
		{ header: 'Nama Murid', key: 'nama', width: 28 },
		{ header: 'Tanggal Pengukuran', key: 'tanggalPengukuran', width: 20 },
		{ header: 'Tinggi Badan', key: 'tinggiBadan', width: 16 },
		{ header: 'Berat Badan', key: 'beratBadan', width: 16 },
		{ header: 'Z-Score', key: 'zScore', width: 12 },
		{ header: 'Status Gizi', key: 'statusGizi', width: 18 },
		{ header: 'Kondisi Fisik', key: 'kondisiFisik', width: 18 },
		{ header: 'Ukuran Baju', key: 'ukuranBaju', width: 14 },
		{ header: 'Ukuran Celana', key: 'ukuranCelana', width: 16 },
		{ header: 'Ukuran Sepatu', key: 'ukuranSepatu', width: 16 },
		{ header: 'Catatan', key: 'catatan', width: 34 }
	];
	sheet.addRow({
		nis: '253006001',
		nama: 'Contoh Murid',
		tanggalPengukuran: '2026-07-01',
		tinggiBadan: 154,
		beratBadan: 60,
		zScore: 1.3,
		statusGizi: 'gizi_lebih',
		kondisiFisik: 'Sehat',
		ukuranBaju: 'XL',
		ukuranCelana: '29',
		ukuranSepatu: '38',
		catatan: ''
	});
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];

	const infoSheet = workbook.addWorksheet('Keterangan');
	infoSheet.addRows([
		['Kolom', 'Keterangan'],
		['NIS', 'Wajib. Dipakai untuk mencocokkan murid pada sekolah aktif.'],
		['Tanggal Pengukuran', 'Wajib. Format aman: yyyy-mm-dd, contoh 2026-07-01.'],
		['Tinggi Badan', 'Angka dalam cm.'],
		['Berat Badan', 'Angka dalam kg.'],
		['Status Gizi', 'gizi_buruk, gizi_kurang, normal, gizi_lebih, obesitas.'],
		['Kondisi Fisik', 'Contoh: Sehat, Sakit, Cedera ringan.'],
		['Nama Murid', 'Opsional untuk bantuan baca; sistem tetap mencocokkan berdasarkan NIS.']
	]);
	infoSheet.getRow(1).font = { bold: true };

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="template-riwayat-pertumbuhan.xlsx"'
		}
	});
};
