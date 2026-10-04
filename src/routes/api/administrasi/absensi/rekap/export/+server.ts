import {
	ABSENSI_STATUSES,
	assertAbsensiDigitalAccess,
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	resolveKelasId,
	todayLocalDate
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { studentAccessCondition } from '$lib/server/student-access';
import { tableAbsensiHarian, tableMurid } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function GET({ locals, url }) {
	assertAbsensiDigitalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) return json({ message: 'Sesi tidak valid.' }, { status: 401 });

	const today = todayLocalDate();
	const tanggalAwal = normalizeDateInput(url.searchParams.get('tanggal_awal'), today);
	const tanggalAkhir = normalizeDateInput(url.searchParams.get('tanggal_akhir'), tanggalAwal);
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasId = resolveKelasId(kelasList, parsePositiveInteger(url.searchParams.get('kelas_id')));
	const muridId = parsePositiveInteger(url.searchParams.get('murid_id'));

	if (!academic.activeSemesterId || !kelasId) {
		return json({ message: 'Kelas atau semester aktif belum tersedia.' }, { status: 400 });
	}

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, academic.activeSemesterId),
			eq(tableMurid.kelasId, kelasId),
			muridId ? eq(tableMurid.id, muridId) : undefined,
			await studentAccessCondition(locals.user, sekolahId)
		),
		orderBy: asc(tableMurid.nama)
	});
	const muridIds = muridList.map((murid) => murid.id);
	const absensiRows = muridIds.length
		? await db.query.tableAbsensiHarian.findMany({
				where: and(
					eq(tableAbsensiHarian.sekolahId, sekolahId),
					eq(tableAbsensiHarian.semesterId, academic.activeSemesterId),
					eq(tableAbsensiHarian.kelasId, kelasId),
					inArray(tableAbsensiHarian.muridId, muridIds),
					gte(tableAbsensiHarian.tanggal, tanggalAwal),
					lte(tableAbsensiHarian.tanggal, tanggalAkhir)
				)
			})
		: [];

	const counts = new Map<number, Record<(typeof ABSENSI_STATUSES)[number], number>>();
	for (const murid of muridList) {
		counts.set(murid.id, { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alfa: 0 });
	}
	for (const row of absensiRows) {
		const target = counts.get(row.muridId);
		if (target) target[row.status] += 1;
	}

	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Rekap Absensi');
	sheet.addRows([
		['Rekap Absensi Digital'],
		['Sekolah', locals.sekolah?.nama ?? '-'],
		['Tanggal', `${tanggalAwal} s.d. ${tanggalAkhir}`],
		[],
		['Nama', 'NIS', 'NISN', 'Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alfa']
	]);
	for (const murid of muridList) {
		const row = counts.get(murid.id) ?? { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alfa: 0 };
		sheet.addRows([
			[murid.nama, murid.nis, murid.nisn, row.hadir, row.terlambat, row.sakit, row.izin, row.alfa]
		]);
	}
	for (let index = 1; index <= 8; index += 1) {
		sheet.getColumn(index).width = index === 1 ? 28 : 14;
	}

	const buffer = await workbook.xlsx.writeBuffer();
	const body =
		buffer instanceof ArrayBuffer
			? buffer
			: new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
	return new Response(body, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="rekap-absensi-${tanggalAwal}-${tanggalAkhir}.xlsx"`
		}
	});
}
