import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import { tablePegawai } from '$lib/server/db/schema';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { addPegawaiInfoSheet, configurePegawaiSheet } from '$lib/server/pegawai-excel';

export const GET: RequestHandler = async ({ locals }) => {
	await ensurePegawaiSchema();
	if (!isAuthorizedUser(['sekolah_manage'], locals.user)) {
		throw error(403, 'Anda tidak memiliki izin mengunduh data pegawai.');
	}

	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');

	const rows = await db.query.tablePegawai.findMany({
		where: eq(tablePegawai.sekolahId, sekolahId),
		orderBy: asc(tablePegawai.nama)
	});
	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();
	const sheet: any = workbook.addWorksheet('Pegawai');
	configurePegawaiSheet(sheet);
	for (const row of rows) {
		sheet.addRow({
			nama: row.nama,
			nip: row.nip,
			nik: row.nik ?? '',
			nuptk: row.nuptk ?? '',
			jenis: row.jenis,
			jabatan: row.jabatan ?? '',
			status: row.status,
			jenisKelamin: row.jenisKelamin ?? '',
			tempatLahir: row.tempatLahir ?? '',
			tanggalLahir: row.tanggalLahir ?? '',
			agama: row.agama ?? '',
			statusPerkawinan: row.statusPerkawinan ?? '',
			telepon: row.telepon ?? '',
			email: row.email ?? '',
			alamat: row.alamat ?? '',
			desa: row.desa ?? '',
			kecamatan: row.kecamatan ?? '',
			kabupaten: row.kabupaten ?? '',
			provinsi: row.provinsi ?? '',
			kodePos: row.kodePos ?? '',
			kontakDaruratNama: row.kontakDaruratNama ?? '',
			kontakDaruratHubungan: row.kontakDaruratHubungan ?? '',
			kontakDaruratTelepon: row.kontakDaruratTelepon ?? '',
			statusKepegawaian: row.statusKepegawaian ?? '',
			tanggalMulaiKerja: row.tanggalMulaiKerja ?? '',
			unitPenempatan: row.unitPenempatan ?? '',
			pangkatGolongan: row.pangkatGolongan ?? '',
			nomorSk: row.nomorSk ?? '',
			tanggalSk: row.tanggalSk ?? '',
			catatan: row.catatan ?? ''
		});
	}
	addPegawaiInfoSheet(workbook);

	const buffer = await workbook.xlsx.writeBuffer();
	const exportDate = new Date().toISOString().slice(0, 10);
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="data-pegawai-${exportDate}.xlsx"`,
			'cache-control': 'no-store'
		}
	});
};
