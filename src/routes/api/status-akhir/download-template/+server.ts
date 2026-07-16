import db from '$lib/server/db';
import { ensureCatatanWaliSchema } from '$lib/server/db/ensure-catatan-wali';
import { tableMurid } from '$lib/server/db/schema';
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

const STATUS_OPTIONS = ['Naik Kelas', 'Tinggal Kelas', 'Lulus', 'Tidak Lulus', 'Belum Ditetapkan'];

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

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true },
		with: { kelas: { columns: { nama: true, fase: true } } },
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId)),
		orderBy: asc(tableMurid.nama)
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const worksheet: any = workbook.addWorksheet('Template Status Akhir');
	worksheet.views = [{ state: 'frozen', ySplit: 1 }];
	worksheet.addRow(HEADERS);

	for (const murid of muridList) {
		worksheet.addRow([murid.id, murid.nama, murid.nis, murid.nisn, '', '', '']);
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

	const widths = [10, 32, 16, 18, 28, 24, 60];
	widths.forEach((width, index) => {
		const column = worksheet.getColumn(index + 1);
		column.width = width;
		column.alignment = { vertical: 'middle', wrapText: true };
	});

	for (let row = 2; row <= Math.max(500, muridList.length + 20); row += 1) {
		worksheet.dataValidations.add(`E${row}`, {
			type: 'list',
			allowBlank: true,
			formulae: [`"${STATUS_OPTIONS.join(',')}"`],
			showErrorMessage: true,
			errorTitle: 'Status tidak valid',
			error: `Gunakan salah satu: ${STATUS_OPTIONS.join(', ')}.`
		});
		worksheet.dataValidations.add(`F${row}`, {
			type: 'date',
			allowBlank: true,
			operator: 'greaterThan',
			formulae: [new Date(2000, 0, 1)],
			showErrorMessage: true,
			errorTitle: 'Tanggal tidak valid',
			error: 'Isi tanggal penetapan rapor.'
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const infoSheet: any = workbook.addWorksheet('Petunjuk');
	infoSheet.columns = [{ width: 30 }, { width: 90 }];
	infoSheet.addRows([
		['Cara pakai', 'Isi status, tanggal penetapan, dan catatan wali kelas.'],
		['Murid ID', 'Jangan diubah. Kolom ini dipakai sistem untuk mencocokkan murid.'],
		['Status', `Pilihan valid: ${STATUS_OPTIONS.join(', ')}.`],
		['Tanggal', 'Gunakan format tanggal Excel atau yyyy-mm-dd.'],
		[
			'Mengosongkan data',
			'Kosongkan status, tanggal, dan catatan untuk menghapus status akhir murid.'
		],
		['Catatan', 'Sheet yang dibaca saat import adalah sheet pertama: Template Status Akhir.']
	]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	infoSheet.getColumn(1).eachCell((cell: any) => {
		cell.font = { bold: true };
	});

	const kelasNama = muridList[0]?.kelas
		? `${muridList[0].kelas.nama}${muridList[0].kelas.fase ? `-${muridList[0].kelas.fase}` : ''}`
		: 'kelas';
	const buffer = await workbook.xlsx.writeBuffer();
	const body = new Uint8Array(buffer as ArrayBuffer);

	return new Response(body, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="template-status-akhir-${sanitizeFilename(kelasNama)}.xlsx"`,
			'Content-Length': String(body.byteLength)
		}
	});
}
