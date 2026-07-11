import db from '$lib/server/db';
import { ensureMuridWaliAsramaSchema } from '$lib/server/db/ensure-murid-wali-asrama';
import { tableMurid, tableSemester } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const HEADERS = [
	'Nama',
	'NIPD',
	'NISN',
	'Rombel',
	'JK',
	'Tempat Lahir',
	'Tanggal Lahir',
	'Agama',
	'Alamat',
	'Kelurahan',
	'Kecamatan',
	'Kabupaten/Kota',
	'Kode Pos',
	'Sekolah Asal',
	'No HP',
	'Kontak Orang Tua',
	'Nama Ayah',
	'Pekerjaan Ayah',
	'Kontak Ayah',
	'Nama Ibu',
	'Pekerjaan Ibu',
	'Kontak Ibu',
	'Nama Wali',
	'Pekerjaan Wali',
	'Kontak Wali',
	'Wali Asrama',
	'NIP Wali Asrama',
	'Wali Asuh',
	'NIP Wali Asuh'
] as const;

function sanitizeFilename(value: string) {
	return (
		value
			.replace(/[\\/:*?"<>|]+/g, '-')
			.replace(/\s+/g, ' ')
			.trim() || 'data-siswa'
	);
}

function formatDate(value: string | null | undefined) {
	if (!value) return '';
	return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

function firstFilled(...values: Array<string | null | undefined>) {
	return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

export const GET: RequestHandler = async ({ locals, url }) => {
	await ensureMuridWaliAsramaSchema();
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		throw error(400, 'Pilih sekolah terlebih dahulu.');
	}

	const user = locals.user as { type?: string; permissions?: string[] };
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	if (user.type !== 'admin' && !permissions.includes('rapor_manage')) {
		throw error(403, 'Anda tidak memiliki izin untuk mengunduh data siswa.');
	}

	const semesterIdParam = Number(url.searchParams.get('semesterId'));
	let semesterId =
		Number.isFinite(semesterIdParam) && semesterIdParam > 0 ? semesterIdParam : undefined;

	if (!semesterId) {
		const activeSemester = await db.query.tableSemester.findFirst({
			where: eq(tableSemester.isAktif, true),
			with: { tahunAjaran: true }
		});
		if (activeSemester?.tahunAjaran && activeSemester.tahunAjaran.sekolahId === sekolahId) {
			semesterId = activeSemester.id;
		}
	}

	if (!semesterId) {
		throw error(400, 'Pilih semester terlebih dahulu.');
	}

	const semester = await db.query.tableSemester.findFirst({
		where: eq(tableSemester.id, semesterId),
		with: { tahunAjaran: true }
	});

	if (!semester || semester.tahunAjaran.sekolahId !== sekolahId) {
		throw error(404, 'Semester tidak ditemukan untuk sekolah aktif.');
	}

	const muridList = await db.query.tableMurid.findMany({
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, semester.id)),
		with: {
			kelas: { columns: { nama: true } },
			alamat: true,
			ayah: true,
			ibu: true,
			wali: true
		},
		orderBy: [asc(tableMurid.kelasId), asc(tableMurid.nama)]
	});

	// Tipe ExcelJS di workspace ini tidak memuat seluruh API runtime.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const worksheet: any = workbook.addWorksheet('Data Siswa');
	worksheet.views = [{ state: 'frozen', ySplit: 1 }];
	worksheet.addRow([...HEADERS]);

	for (const murid of muridList) {
		const kontakOrangTua = firstFilled(murid.ayah?.kontak, murid.ibu?.kontak, murid.wali?.kontak);
		worksheet.addRow([
			murid.nama,
			murid.nis,
			murid.nisn,
			murid.kelas?.nama ?? '',
			murid.jenisKelamin,
			murid.tempatLahir,
			formatDate(murid.tanggalLahir),
			murid.agama,
			murid.alamat?.jalan ?? '',
			murid.alamat?.desa ?? '',
			murid.alamat?.kecamatan ?? '',
			murid.alamat?.kabupaten ?? '',
			murid.alamat?.kodePos ?? '',
			murid.pendidikanSebelumnya,
			firstFilled(kontakOrangTua),
			kontakOrangTua,
			murid.ayah?.nama ?? '',
			murid.ayah?.pekerjaan ?? '',
			murid.ayah?.kontak ?? '',
			murid.ibu?.nama ?? '',
			murid.ibu?.pekerjaan ?? '',
			murid.ibu?.kontak ?? '',
			murid.wali?.nama ?? '',
			murid.wali?.pekerjaan ?? '',
			murid.wali?.kontak ?? '',
			murid.waliAsramaNama ?? '',
			murid.waliAsramaNip ?? '',
			murid.waliAsuhNama ?? '',
			murid.waliAsuhNip ?? ''
		]);
	}

	worksheet.getRow(1).height = 26;
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

	HEADERS.forEach((header, index) => {
		const column = worksheet.getColumn(index + 1);
		column.width = Math.min(Math.max(header.length + 5, 12), 28);
		column.alignment = { vertical: 'top', wrapText: true };
	});
	worksheet.getColumn(7).numFmt = 'yyyy-mm-dd';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const infoSheet: any = workbook.addWorksheet('Info');
	infoSheet.columns = [{ width: 28 }, { width: 80 }];
	infoSheet.addRows([
		['Sekolah', locals.sekolah?.nama ?? ''],
		['Tahun ajaran', semester.tahunAjaran.nama],
		['Semester', semester.nama],
		['Jumlah siswa', String(muridList.length)],
		['Catatan', 'Sheet Data Siswa memakai format yang sama dengan template import siswa dan kelas.']
	]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	infoSheet.getColumn(1).eachCell((cell: any) => {
		cell.font = { bold: true };
	});

	const buffer = await workbook.xlsx.writeBuffer();
	const body = new Uint8Array(buffer as ArrayBuffer);
	const filename = sanitizeFilename(
		`data-siswa-${locals.sekolah?.nama ?? 'sekolah'}-${semester.tahunAjaran.nama}-${semester.nama}`
	);

	return new Response(body, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
			'Content-Length': String(body.byteLength)
		}
	});
};
