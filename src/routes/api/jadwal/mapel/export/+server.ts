import db from '$lib/server/db';
import { tableJadwalMapel } from '$lib/server/db/schema';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET({ locals }) {
	try {
		requireJadwalManageAccess(locals.user);
	} catch {
		throw error(403, 'Anda tidak memiliki izin mengunduh Data Mata Pelajaran.');
	}
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(401, 'Sesi sekolah tidak valid.');

	const rows = await db.query.tableJadwalMapel.findMany({
		where: eq(tableJadwalMapel.sekolahId, sekolahId),
		with: { guru: { columns: { id: true, nama: true, nip: true } } },
		orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
	});
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Data Mata Pelajaran');
	sheet.columns = [
		{ header: 'Kode', key: 'kode', width: 16 },
		{ header: 'Nama', key: 'nama', width: 30 },
		{ header: 'Jenjang', key: 'jenjang', width: 14 },
		{ header: 'Fase', key: 'fase', width: 16 },
		{ header: 'Kategori', key: 'kategori', width: 16 },
		{ header: 'ID Guru Pegawai', key: 'guruPegawaiId', width: 16 },
		{ header: 'Nama Guru', key: 'guruNama', width: 28 },
		{ header: 'Warna', key: 'warna', width: 14 },
		{ header: 'Status', key: 'status', width: 14 },
		{ header: 'Catatan', key: 'catatan', width: 34 }
	];
	for (const row of rows) {
		sheet.addRow({
			kode: row.kode,
			nama: row.nama,
			jenjang: row.jenjang,
			fase: row.fase ?? '',
			kategori: row.kategori ?? 'akademik',
			guruPegawaiId: row.guruPegawaiId ?? '',
			guruNama: row.guru?.nama ?? '',
			warna: row.warna ?? '',
			status: row.aktif ? 'aktif' : 'nonaktif',
			catatan: row.catatan ?? ''
		});
	}
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];

	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="data-mata-pelajaran.xlsx"'
		}
	});
}
