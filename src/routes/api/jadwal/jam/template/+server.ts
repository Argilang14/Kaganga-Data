/* eslint-disable @typescript-eslint/no-explicit-any -- Tipe ExcelJS di workspace ini tidak memuat semua API runtime. */
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import ExcelJS from 'exceljs';

const hariOptions = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
const tipeOptions = ['pelajaran', 'kegiatan', 'istirahat', 'kosong'];

export async function GET({ locals }) {
	requireJadwalManageAccess(locals.user);
	if (!locals.sekolah?.id) throw error(401, 'Sesi sekolah tidak valid.');
	const workbook = new ExcelJS.Workbook() as any;
	workbook.creator = 'Kaganga';
	const sheet = workbook.addWorksheet('Jam Jadwal') as any;
	sheet.columns = [
		{ header: 'Hari', key: 'hari', width: 14 },
		{ header: 'Jam Ke', key: 'jamKe', width: 10 },
		{ header: 'Pukul Mulai', key: 'pukulMulai', width: 14 },
		{ header: 'Pukul Selesai', key: 'pukulSelesai', width: 14 },
		{ header: 'Tipe', key: 'tipe', width: 14 },
		{ header: 'Label', key: 'label', width: 18 },
		{ header: 'Nama Default', key: 'namaDefault', width: 24 },
		{ header: 'Aktif', key: 'aktif', width: 10 }
	];
	sheet.addRow({
		hari: 'senin',
		jamKe: 1,
		pukulMulai: '07:15',
		pukulSelesai: '08:00',
		tipe: 'kegiatan',
		label: 'Jam 1',
		namaDefault: 'Upacara',
		aktif: 'aktif'
	});
	sheet.getRow(1).font = { bold: true };
	for (let rowNumber = 2; rowNumber <= 250; rowNumber += 1) {
		sheet.getCell(rowNumber, 1).dataValidation = {
			type: 'list',
			allowBlank: false,
			formulae: [`"${hariOptions.join(',')}"`]
		};
		sheet.getCell(rowNumber, 5).dataValidation = {
			type: 'list',
			allowBlank: false,
			formulae: [`"${tipeOptions.join(',')}"`]
		};
	}
	const ref = workbook.addWorksheet('Panduan');
	ref.addRows([
		['Hari', hariOptions.join(', ')],
		['Tipe', tipeOptions.join(', ')],
		['Aktif', 'aktif / nonaktif / ya / tidak / 1 / 0'],
		['Catatan', 'Hari + Jam Ke yang sama akan memperbarui jam yang sudah ada.']
	]);
	ref.columns = [{ width: 18 }, { width: 80 }];
	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="template-jam-jadwal.xlsx"'
		}
	});
}
