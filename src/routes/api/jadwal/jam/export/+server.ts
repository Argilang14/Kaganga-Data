/* eslint-disable @typescript-eslint/no-explicit-any -- Tipe ExcelJS di workspace ini tidak memuat semua API runtime. */
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableJadwalJam } from '$lib/server/db/schema';
import {
	findJadwalJamTemplate,
	JADWAL_JENIS_LABELS,
	JADWAL_JENJANG_LABELS,
	normalizeJadwalJenjang,
	requireJadwalManageAccess,
	selectJadwalContext
} from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET({ locals, url }) {
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(401, 'Sesi sekolah tidak valid.');
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const context = selectJadwalContext(academic, {
		tahunAjaranId: url.searchParams.get('tahunAjaranId'),
		jenis: url.searchParams.get('jenis')
	});
	if (!context.tahunAjaranId) throw error(400, 'Tahun ajaran belum tersedia.');
	const jenjang = normalizeJadwalJenjang(url.searchParams.get('jenjang'));
	const template = await findJadwalJamTemplate(sekolahId, jenjang, context);
	const rows = template
		? await db.query.tableJadwalJam.findMany({
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.templateId, template.id),
					eq(tableJadwalJam.jenjang, jenjang)
				),
				orderBy: [asc(tableJadwalJam.urutan), asc(tableJadwalJam.jamKe)]
			})
		: [];
	const workbook = new ExcelJS.Workbook() as any;
	workbook.creator = 'Kaganga';
	const tahunAjaran = academic.tahunAjaranList.find(
		(item) => item.id === context.tahunAjaranId
	)?.nama;
	const info = workbook.addWorksheet('Informasi') as any;
	info.addRows([
		['Atribut', 'Nilai'],
		['Sekolah', locals.sekolah?.nama ?? ''],
		['Tahun Ajaran ID', context.tahunAjaranId],
		['Tahun Ajaran', tahunAjaran ?? context.tahunAjaranId],
		['Jenis Jadwal', context.jenis],
		['Jenis Jadwal Label', JADWAL_JENIS_LABELS[context.jenis]],
		['Jenjang', jenjang],
		['Jenjang Label', JADWAL_JENJANG_LABELS[jenjang]],
		['Jumlah Baris', rows.length],
		['Diekspor', new Date().toISOString()]
	]);
	info.columns = [{ width: 24 }, { width: 42 }];
	info.getRow(1).font = { bold: true };
	const sheet = workbook.addWorksheet('Jam Jadwal') as any;
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
	const safeYear = String(tahunAjaran ?? context.tahunAjaranId).replace(/[^0-9A-Za-z_-]+/g, '-');
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="jam-jadwal-${safeYear}-${context.jenis}-${jenjang}.xlsx"`
		}
	});
}
