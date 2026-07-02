import db from '$lib/server/db';
import {
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKelas,
	tableMurid
} from '$lib/server/db/schema';
import { error, type RequestHandler } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

function sanitizeFilename(value: string) {
	return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'kelas';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const formData = await request.formData();
		const kelasIdRaw = formData.get('kelasId')?.toString();

		if (!kelasIdRaw || !locals.sekolah?.id) {
			throw error(400, 'Data tidak lengkap');
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			throw error(400, 'ID kelas tidak valid');
		}

		const kelas = await db.query.tableKelas.findFirst({
			where: eq(tableKelas.id, kelasId),
			columns: { nama: true }
		});

		const muridList = await db.query.tableMurid.findMany({
			columns: { nama: true, nisn: true },
			where: eq(tableMurid.kelasId, kelasId),
			orderBy: asc(tableMurid.nama)
		});

		const keasramaanList = await db.query.tableKeasramaan.findMany({
			columns: { id: true, nama: true },
			where: eq(tableKeasramaan.kelasId, kelasId),
			orderBy: asc(tableKeasramaan.createdAt),
			with: {
				indikator: {
					columns: { id: true, deskripsi: true },
					orderBy: asc(tableKeasramaanIndikator.createdAt),
					with: {
						tujuan: {
							columns: { id: true, deskripsi: true }
						}
					}
				}
			}
		});

		const refs: Array<{ code: number; matev: string; detail: string }> = [];
		for (const matev of keasramaanList) {
			for (const indikator of matev.indikator) {
				if (indikator.tujuan.length === 0) {
					refs.push({ code: refs.length + 1, matev: matev.nama, detail: indikator.deskripsi });
					continue;
				}
				for (const tujuan of indikator.tujuan) {
					refs.push({
						code: refs.length + 1,
						matev: matev.nama,
						detail: tujuan.deskripsi || indikator.deskripsi
					});
				}
			}
		}

		if (refs.length === 0) {
			throw error(400, 'Belum ada data mata evaluasi/TP keasramaan untuk kelas ini');
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const workbook = new ExcelJS.Workbook() as any;

		const penilaian = workbook.addWorksheet('Penilaian');
		penilaian.views = [{ state: 'frozen', ySplit: 2, xSplit: 3 }];
		const referensi = workbook.addWorksheet('Referensi');
		const petunjuk = workbook.addWorksheet('Petunjuk');

		const header: Array<string | number> = ['NISN', 'NIK', 'nama_siswa'];
		const refRow: Array<string | number> = ['', '', ''];
		for (const ref of refs) {
			header.push(`${ref.code}_nilai`, `${ref.code}_deskripsi`);
			refRow.push(ref.code, ref.detail);
		}
		penilaian.addRow(header);
		penilaian.addRow(refRow);

		for (const murid of muridList) {
			const row = [murid.nisn ?? '', '', murid.nama];
			for (let i = 0; i < refs.length; i++) {
				row.push('', '');
			}
			penilaian.addRow(row);
		}

		penilaian.getRow(1).font = { bold: true };
		penilaian.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
		penilaian.columns = [
			{ width: 18 },
			{ width: 18 },
			{ width: 30 },
			...refs.flatMap(() => [{ width: 12 }, { width: 38 }])
		];

		for (let rowNumber = 3; rowNumber <= muridList.length + 2; rowNumber++) {
			for (let colNumber = 4; colNumber <= refs.length * 2 + 3; colNumber += 2) {
				penilaian.getCell(rowNumber, colNumber).dataValidation = {
					type: 'decimal',
					operator: 'between',
					allowBlank: true,
					formulae: [0, 100]
				};
			}
		}

		referensi.addRow(['Kode Mapel', 'Indikator Penilaian', 'Detail Indikator']);
		referensi.getRow(1).font = { bold: true };
		let lastMatev = '';
		for (const ref of refs) {
			referensi.addRow([ref.code, ref.matev === lastMatev ? '' : ref.matev, ref.detail]);
			lastMatev = ref.matev;
		}
		referensi.columns = [{ width: 14 }, { width: 34 }, { width: 70 }];

		petunjuk.addRows([
			['Petunjuk Import Nilai Keasramaan Massal'],
			['1. Isi nilai angka pada kolom *_nilai dengan rentang 0 sampai 100.'],
			[
				'2. Kolom *_deskripsi boleh dikosongkan; sistem saat ini menyimpan kategori nilai, bukan deskripsi per kolom.'
			],
			['3. Siswa dicocokkan berdasarkan NISN terlebih dahulu, lalu nama_siswa.'],
			[
				'4. Nilai angka dikonversi otomatis: >=90 Sangat Baik, >=80 Baik, >=70 Cukup, selain itu Perlu Bimbingan.'
			],
			['5. Sheet Referensi jangan dihapus agar kode kolom dapat dicocokkan dengan sistem.']
		]);
		petunjuk.getRow(1).font = { bold: true, size: 14 };
		petunjuk.columns = [{ width: 120 }];

		const buffer = await workbook.xlsx.writeBuffer();
		const kelasNama = sanitizeFilename(kelas?.nama ?? 'kelas');

		return new Response(new Uint8Array(buffer as ArrayBuffer), {
			headers: {
				'Content-Disposition': `attachment; filename="template-keasramaan-massal-${kelasNama}.xlsx"`,
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}
		});
	} catch (err) {
		console.error('Download template keasramaan massal error:', err);
		return new Response(JSON.stringify({ message: 'Gagal membuat template massal' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
