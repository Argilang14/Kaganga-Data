import db from '$lib/server/db';
import { ensureCatatanWaliSchema } from '$lib/server/db/ensure-catatan-wali';
import { tableMurid, tableStatusAkhirRapor } from '$lib/server/db/schema';
import { cookieNames } from '$lib/utils';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const HEADERS = [
	'Murid ID',
	'Nama',
	'NIS',
	'NISN',
	'Status Kenaikan / Kelulusan',
	'Tanggal Penetapan Rapor',
	'Catatan Wali Kelas'
];

function sanitizeFilename(value: string) {
	return (
		value
			.replace(/[\\/:*?"<>|]+/g, '-')
			.replace(/\s+/g, ' ')
			.trim() || 'kelas'
	);
}

export async function GET({ locals, cookies }) {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (
		locals.user.type !== 'admin' &&
		locals.user.type !== 'wali_kelas' &&
		locals.user.permissions?.includes('rapor_manage') !== true
	) {
		throw error(403, 'Anda tidak memiliki izin mengakses data status akhir');
	}
	const sekolahId = locals.sekolah?.id ?? null;
	const kelasId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID));
	if (!sekolahId || !Number.isInteger(kelasId) || kelasId <= 0) {
		throw error(400, 'Pilih kelas aktif terlebih dahulu.');
	}

	await ensureCatatanWaliSchema();

	const rows = await db
		.select({
			id: tableMurid.id,
			nama: tableMurid.nama,
			nis: tableMurid.nis,
			nisn: tableMurid.nisn,
			status: tableStatusAkhirRapor.status,
			tanggalPenetapan: tableStatusAkhirRapor.tanggalPenetapan,
			catatan: tableStatusAkhirRapor.catatan
		})
		.from(tableMurid)
		.leftJoin(tableStatusAkhirRapor, eq(tableMurid.id, tableStatusAkhirRapor.muridId))
		.where(and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId)))
		.orderBy(asc(tableMurid.nama));

	const kelas = await db.query.tableMurid.findFirst({
		columns: { id: true },
		with: { kelas: { columns: { nama: true, fase: true } } },
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId))
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const worksheet: any = workbook.addWorksheet('Status Akhir');
	worksheet.views = [{ state: 'frozen', ySplit: 1 }];
	worksheet.addRow(HEADERS);

	for (const row of rows) {
		worksheet.addRow([
			row.id,
			row.nama,
			row.nis,
			row.nisn,
			row.status ?? '',
			row.tanggalPenetapan ?? '',
			row.catatan ?? ''
		]);
	}

	worksheet.getRow(1).height = 28;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	worksheet.getRow(1).eachCell((cell: any) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3D5E' } };
		cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
		cell.border = {
			top: { style: 'thin' },
			left: { style: 'thin' },
			bottom: { style: 'thin' },
			right: { style: 'thin' }
		};
	});
	[10, 32, 16, 18, 28, 24, 60].forEach((width, index) => {
		const column = worksheet.getColumn(index + 1);
		column.width = width;
		column.alignment = { vertical: 'middle', wrapText: true };
	});

	const kelasNama = kelas?.kelas
		? `${kelas.kelas.nama}${kelas.kelas.fase ? `-${kelas.kelas.fase}` : ''}`
		: 'kelas';
	const buffer = await workbook.xlsx.writeBuffer();
	const body = new Uint8Array(buffer as ArrayBuffer);

	return new Response(body, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="status-akhir-${sanitizeFilename(kelasNama)}.xlsx"`,
			'Content-Length': String(body.byteLength)
		}
	});
}
