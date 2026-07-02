import db from '$lib/server/db';
import { tableJadwalJam } from '$lib/server/db/schema';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET({ locals }) {
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(401, 'Sesi sekolah tidak valid.');
	const rows = await db.query.tableJadwalJam.findMany({
		where: eq(tableJadwalJam.sekolahId, sekolahId),
		orderBy: [asc(tableJadwalJam.urutan), asc(tableJadwalJam.jamKe)]
	});
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Jam Jadwal');
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
	for (const row of rows) {
		sheet.addRow({
			hari: row.hari,
			jamKe: row.jamKe,
			pukulMulai: row.pukulMulai,
			pukulSelesai: row.pukulSelesai,
			tipe: row.tipe,
			label: row.label ?? '',
			namaDefault: row.namaDefault ?? '',
			aktif: row.aktif ? 'aktif' : 'nonaktif'
		});
	}
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	const buffer = await workbook.xlsx.writeBuffer();
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="data-jam-jadwal.xlsx"'
		}
	});
}
