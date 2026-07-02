import { isAuthorizedUser } from '../../../pengguna/permissions';
import { error } from '@sveltejs/kit';
import ExcelJS from 'exceljs';

export async function GET({ locals }) {
	if (!isAuthorizedUser(['sekolah_manage'], locals.user)) {
		throw error(403, 'Anda tidak memiliki izin mengunduh template pegawai.');
	}

	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Template Pegawai');
	sheet.columns = [
		{ header: 'Nama', key: 'nama', width: 28 },
		{ header: 'NIP', key: 'nip', width: 22 },
		{ header: 'Jenis', key: 'jenis', width: 18 },
		{ header: 'Jabatan', key: 'jabatan', width: 28 },
		{ header: 'Status', key: 'status', width: 14 },
		{ header: 'Telepon', key: 'telepon', width: 18 },
		{ header: 'Email', key: 'email', width: 26 },
		{ header: 'Catatan', key: 'catatan', width: 34 }
	];
	sheet.addRow({
		nama: 'Contoh Pegawai',
		nip: '198001012006041001',
		jenis: 'guru',
		jabatan: 'Guru Matematika',
		status: 'aktif',
		telepon: '081234567890',
		email: 'contoh@sekolah.id',
		catatan: ''
	});
	sheet.getRow(1).font = { bold: true };
	const infoSheet = workbook.addWorksheet('Keterangan');
	infoSheet.addRows([
		['Kolom', 'Keterangan'],
		[
			'Jenis',
			'guru, kepala_sekolah, operator, tu, kebersihan, keamanan, wali_asuh, wali_asrama, lainnya'
		],
		['Status', 'aktif atau nonaktif'],
		['NIP', 'Dipakai sebagai kunci update saat import. Jika sama, data lama diperbarui.']
	]);
	infoSheet.getRow(1).font = { bold: true };

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="template-pegawai.xlsx"'
		}
	});
}
