import db from '$lib/server/db';
import { tablePegawai } from '$lib/server/db/schema';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET({ locals }) {
	if (!isAuthorizedUser(['sekolah_manage'], locals.user)) {
		throw error(403, 'Anda tidak memiliki izin mengunduh data pegawai.');
	}

	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');

	const rows = await db.query.tablePegawai.findMany({
		where: eq(tablePegawai.sekolahId, sekolahId),
		orderBy: asc(tablePegawai.nama)
	});
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Pegawai');
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
	for (const row of rows) {
		sheet.addRow({
			nama: row.nama,
			nip: row.nip,
			jenis: row.jenis,
			jabatan: row.jabatan ?? '',
			status: row.status,
			telepon: row.telepon ?? '',
			email: row.email ?? '',
			catatan: row.catatan ?? ''
		});
	}
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="data-pegawai.xlsx"'
		}
	});
}
