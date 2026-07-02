import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import ExcelJS from 'exceljs';

export async function GET({ locals }) {
	try {
		requireJadwalManageAccess(locals.user);
	} catch {
		throw error(403, 'Anda tidak memiliki izin mengunduh template Data Mata Pelajaran.');
	}

	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Template Mata Pelajaran');
	sheet.columns = [
		{ header: 'Kode', key: 'kode', width: 16 },
		{ header: 'Nama', key: 'nama', width: 30 },
		{ header: 'Jenjang', key: 'jenjang', width: 14 },
		{ header: 'Fase', key: 'fase', width: 16 },
		{ header: 'Kategori', key: 'kategori', width: 16 },
		{ header: 'ID Guru Pegawai', key: 'guruPegawaiId', width: 16 },
		{ header: 'Warna', key: 'warna', width: 14 },
		{ header: 'Status', key: 'status', width: 14 },
		{ header: 'Catatan', key: 'catatan', width: 34 }
	];
	sheet.addRow({
		kode: 'BIND',
		nama: 'Bahasa Indonesia',
		jenjang: 'srma',
		fase: 'Fase E',
		kategori: 'akademik',
		guruPegawaiId: '',
		warna: '#dbeafe',
		status: 'aktif',
		catatan: ''
	});
	sheet.getRow(1).font = { bold: true };

	const infoSheet = workbook.addWorksheet('Keterangan');
	infoSheet.addRows([
		['Kolom', 'Keterangan'],
		['Jenjang', 'semua, srd, srmp, atau srma'],
		['Fase', 'Opsional. Contoh: Fase A, Fase D, Fase E'],
		['Kategori', 'akademik, kokurikuler, keasramaan, atau muatan_lokal'],
		['ID Guru Pegawai', 'Opsional. Lihat ID pada export Data Pegawai jika diperlukan.'],
		['Status', 'aktif atau nonaktif'],
		['Kode', 'Dipakai sebagai kunci update saat import. Jika sama, data lama diperbarui.']
	]);
	infoSheet.getRow(1).font = { bold: true };

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="template-data-mata-pelajaran.xlsx"'
		}
	});
}
