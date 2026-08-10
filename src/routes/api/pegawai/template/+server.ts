import { isAuthorizedUser } from '../../../pengguna/permissions';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import ExcelJS from 'exceljs';
import {
	addPegawaiInfoSheet,
	configurePegawaiSheet,
	PEGAWAI_EXCEL_COLUMNS
} from '$lib/server/pegawai-excel';

export const GET: RequestHandler = async ({ locals }) => {
	if (!isAuthorizedUser(['sekolah_manage'], locals.user)) {
		throw error(403, 'Anda tidak memiliki izin mengunduh template pegawai.');
	}

	const workbook: any = new ExcelJS.Workbook();
	const sheet: any = workbook.addWorksheet('Template Pegawai');
	configurePegawaiSheet(sheet);
	sheet.addRow({
		nama: 'Contoh Pegawai',
		nip: '198001012006041001',
		nik: '1701010101800001',
		jenis: 'guru',
		jabatan: 'Guru Matematika',
		status: 'aktif',
		jenisKelamin: 'laki-laki',
		tempatLahir: 'Bengkulu',
		tanggalLahir: '1980-01-01',
		agama: 'Islam',
		telepon: '081234567890',
		email: 'contoh@sekolah.id',
		statusKepegawaian: 'PNS',
		tanggalMulaiKerja: '2006-04-01',
		unitPenempatan: 'SRMA',
		catatan: ''
	});
	for (const column of PEGAWAI_EXCEL_COLUMNS) {
		if (['tanggalLahir', 'tanggalMulaiKerja', 'tanggalSk'].includes(column.key)) {
			sheet.getColumn(column.key).numFmt = 'yyyy-mm-dd';
		}
	}
	addPegawaiInfoSheet(workbook);

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="template-pegawai.xlsx"'
		}
	});
};
