import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKelas, tableSemester, tableTahunAjaran } from '$lib/server/db/schema';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import db from '$lib/server/db';

const JENIS_OPTIONS = [
	['hari_efektif', 'Hari Efektif'],
	['libur_nasional', 'Libur Nasional'],
	['libur_sekolah', 'Libur Sekolah'],
	['ujian', 'Ujian'],
	['asesmen', 'Asesmen'],
	['pembagian_rapor', 'Pembagian Rapor'],
	['kegiatan_sekolah', 'Kegiatan Sekolah'],
	['kegiatan_asrama', 'Kegiatan Asrama'],
	['lainnya', 'Lainnya']
] as const;

const JENJANG_OPTIONS = [
	['semua', 'Semua Jenjang'],
	['srd', 'SRD'],
	['srmp', 'SRMP'],
	['srma', 'SRMA']
] as const;

function parsePositiveInteger(value: string | null) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeFilename(value: string) {
	return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'kalender-pendidikan';
}

export async function GET({ locals, url }) {
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(401, 'Sesi sekolah tidak valid.');

	const academic = await resolveSekolahAcademicContext(sekolahId);
	const tahunAjaranId =
		parsePositiveInteger(url.searchParams.get('tahun_ajaran_id')) ?? academic.activeTahunAjaranId;
	const semesterId = parsePositiveInteger(url.searchParams.get('semester_id'));

	const [tahunAjaran, semester, kelasList] = await Promise.all([
		tahunAjaranId
			? db.query.tableTahunAjaran.findFirst({
					columns: { id: true, nama: true },
					where: and(
						eq(tableTahunAjaran.id, tahunAjaranId),
						eq(tableTahunAjaran.sekolahId, sekolahId)
					)
				})
			: Promise.resolve(null),
		semesterId
			? db.query.tableSemester.findFirst({
					columns: { id: true, nama: true, tahunAjaranId: true },
					where: eq(tableSemester.id, semesterId)
				})
			: Promise.resolve(null),
		db.query.tableKelas.findMany({
			columns: { id: true, nama: true, fase: true },
			where: eq(tableKelas.sekolahId, sekolahId),
			orderBy: [asc(tableKelas.nama)]
		})
	]);

	if (semester && tahunAjaranId && semester.tahunAjaranId !== tahunAjaranId) {
		throw error(400, 'Semester tidak sesuai dengan tahun ajaran yang dipilih.');
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ExcelJSImport = ExcelJS as unknown as { Workbook: { new (): any } };
	const workbook = new ExcelJSImport.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();

	const worksheet = workbook.addWorksheet('Kalender Pendidikan');
	worksheet.columns = [
		{ header: 'Tanggal Mulai', key: 'tanggalMulai', width: 16 },
		{ header: 'Tanggal Selesai', key: 'tanggalSelesai', width: 16 },
		{ header: 'Judul', key: 'judul', width: 34 },
		{ header: 'Jenis', key: 'jenis', width: 22 },
		{ header: 'Jenjang', key: 'jenjang', width: 18 },
		{ header: 'Kelas Opsional', key: 'kelas', width: 24 },
		{ header: 'Warna', key: 'warna', width: 14 },
		{ header: 'Keterangan', key: 'keterangan', width: 42 }
	];
	worksheet.getRow(1).font = { bold: true };
	worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
	worksheet.views = [{ state: 'frozen', ySplit: 1 }];

	worksheet.addRow({
		tanggalMulai: '2026-07-15',
		tanggalSelesai: '2026-07-15',
		judul: 'Contoh: Hari Pertama Masuk Sekolah',
		jenis: 'hari_efektif',
		jenjang: 'semua',
		kelas: '',
		warna: '#2563eb',
		keterangan: 'Hapus baris contoh ini sebelum import jika tidak diperlukan.'
	});

	for (let rowNumber = 2; rowNumber <= 300; rowNumber++) {
		worksheet.getCell(rowNumber, 1).numFmt = 'yyyy-mm-dd';
		worksheet.getCell(rowNumber, 2).numFmt = 'yyyy-mm-dd';
		worksheet.getCell(rowNumber, 4).dataValidation = {
			type: 'list',
			allowBlank: false,
			formulae: [`"${JENIS_OPTIONS.map(([value]) => value).join(',')}"`]
		};
		worksheet.getCell(rowNumber, 5).dataValidation = {
			type: 'list',
			allowBlank: true,
			formulae: [`"${JENJANG_OPTIONS.map(([value]) => value).join(',')}"`]
		};
	}

	const reference = workbook.addWorksheet('Referensi');
	reference.addRow(['Kode Jenis', 'Label Jenis']);
	for (const [value, label] of JENIS_OPTIONS) reference.addRow([value, label]);
	reference.addRow([]);
	reference.addRow(['Kode Jenjang', 'Label Jenjang']);
	for (const [value, label] of JENJANG_OPTIONS) reference.addRow([value, label]);
	reference.addRow([]);
	reference.addRow(['ID Kelas', 'Nama Kelas', 'Fase']);
	for (const kelas of kelasList) reference.addRow([kelas.id, kelas.nama, kelas.fase ?? '']);
	reference.columns = [{ width: 18 }, { width: 28 }, { width: 12 }];
	reference.getRow(1).font = { bold: true };
	reference.getRow(12).font = { bold: true };

	const info = workbook.addWorksheet('Panduan');
	info.addRows([
		['Template Import Kalender Pendidikan'],
		['Sekolah', locals.sekolah?.nama ?? '-'],
		['Tahun Ajaran', tahunAjaran?.nama ?? 'Aktif / tidak dipilih'],
		['Semester', semester?.nama ?? 'Kosong / kalender 12 bulan'],
		[],
		[
			'Mode Import',
			'Berbasis tahun ajaran. Semester boleh kosong agar agenda berlaku pada kalender 12 bulan.'
		],
		['Kolom wajib', 'Tanggal Mulai, Judul, Jenis'],
		['Tanggal Selesai', 'Boleh kosong, otomatis sama dengan Tanggal Mulai'],
		['Jenis', 'Gunakan kode pada sheet Referensi, contoh: hari_efektif, libur_nasional, ujian'],
		['Jenjang', 'semua, srd, srmp, atau srma. Jika kosong otomatis semua.'],
		[
			'Kelas Opsional',
			'Boleh kosong. Jika diisi, gunakan nama kelas atau ID kelas dari sheet Referensi.'
		],
		['Warna', 'Opsional, format hex seperti #2563eb.']
	]);
	info.columns = [{ width: 22 }, { width: 80 }];
	info.getRow(1).font = { bold: true, size: 14 };

	const buffer = await workbook.xlsx.writeBuffer();
	const filename = sanitizeFilename(
		`template-kalender-${tahunAjaran?.nama ?? 'aktif'}-${semester?.nama ?? '12-bulan'}.xlsx`
	);

	return new Response(new Uint8Array(buffer as ArrayBuffer), {
		headers: {
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		}
	});
}
