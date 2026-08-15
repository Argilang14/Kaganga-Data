import { isAuthorizedUser } from '../../../pengguna/permissions';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import ExcelJS from 'exceljs';
import {
	addPegawaiExampleSheet,
	addPegawaiInfoSheet,
	configurePegawaiSheet
} from '$lib/server/pegawai-excel';

export const GET: RequestHandler = async ({ locals }) => {
	if (!isAuthorizedUser(['sekolah_manage'], locals.user)) {
		throw error(403, 'Anda tidak memiliki izin mengunduh template pegawai.');
	}

	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();
	const sheet: any = workbook.addWorksheet('Data Pegawai');
	configurePegawaiSheet(sheet);
	addPegawaiExampleSheet(workbook);
	addPegawaiInfoSheet(workbook);

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="template-data-pegawai.xlsx"',
			'cache-control': 'no-store'
		}
	});
};
