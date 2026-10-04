/* eslint-disable @typescript-eslint/no-explicit-any -- Tipe ExcelJS di workspace ini tidak memuat semua API runtime. */
import {
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	resolveKelasId,
	todayLocalDate
} from '$lib/server/absensi-digital';
import {
	ABSENSI_KEGIATAN_STATUS_LABELS,
	ABSENSI_KEGIATAN_STATUSES,
	listLocalDatesInRange,
	loadKegiatanAbsensiOptions,
	requireAbsensiKegiatanAccess
} from '$lib/server/absensi-kegiatan';
import db from '$lib/server/db';
import { tableAbsensiKegiatan, tableMurid } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, asc, between, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';

function normalizeDateRange(valueAwal: string | null, valueAkhir: string | null) {
	const today = todayLocalDate();
	const tanggalAwal = normalizeDateInput(valueAwal, today);
	const tanggalAkhir = normalizeDateInput(valueAkhir, tanggalAwal);
	return tanggalAwal <= tanggalAkhir
		? { tanggalAwal, tanggalAkhir }
		: { tanggalAwal: tanggalAkhir, tanggalAkhir: tanggalAwal };
}

function sanitizeFilename(value: string) {
	return value
		.replace(/[^a-z0-9\-_]+/gi, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export async function GET({ locals, url }) {
	requireAbsensiKegiatanAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) return json({ message: 'Sesi tidak valid.' }, { status: 401 });

	const { tanggalAwal, tanggalAkhir } = normalizeDateRange(
		url.searchParams.get('tanggal_awal'),
		url.searchParams.get('tanggal_akhir')
	);
	const requestedKegiatanId = parsePositiveInteger(url.searchParams.get('kegiatan_id'));
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasId = resolveKelasId(kelasList, parsePositiveInteger(url.searchParams.get('kelas_id')));
	const kelas = kelasList.find((item) => item.id === kelasId);
	const kegiatanList = await loadKegiatanAbsensiOptions(sekolahId);
	const selectedKegiatanIds =
		requestedKegiatanId && kegiatanList.some((kegiatan) => kegiatan.id === requestedKegiatanId)
			? [requestedKegiatanId]
			: kegiatanList.map((kegiatan) => kegiatan.id);
	const selectedKegiatan = kegiatanList.filter((kegiatan) =>
		selectedKegiatanIds.includes(kegiatan.id)
	);

	if (!academic.activeSemesterId || !kelasId) {
		return json({ message: 'Kelas atau semester aktif belum tersedia.' }, { status: 400 });
	}

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, academic.activeSemesterId),
			eq(tableMurid.kelasId, kelasId),
			activeMuridFilter()
			, await studentAccessCondition(locals.user, sekolahId)
		),
		orderBy: asc(tableMurid.nama)
	});
	const muridIds = muridList.map((murid) => murid.id);
	const absensiRows = muridIds.length
		? await db.query.tableAbsensiKegiatan.findMany({
				where: and(
					eq(tableAbsensiKegiatan.sekolahId, sekolahId),
					eq(tableAbsensiKegiatan.semesterId, academic.activeSemesterId),
					eq(tableAbsensiKegiatan.kelasId, kelasId),
					inArray(tableAbsensiKegiatan.kegiatanId, selectedKegiatanIds),
					between(tableAbsensiKegiatan.tanggal, tanggalAwal, tanggalAkhir),
					inArray(tableAbsensiKegiatan.muridId, muridIds)
				)
			})
		: [];
	const absensiByKey = new Map(
		absensiRows.map((row) => [`${row.tanggal}:${row.kegiatanId}:${row.muridId}`, row])
	);

	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();
	const sheet: any = workbook.addWorksheet('Import Absensi');
	sheet.addRows([
		['Template Import Absensi Kegiatan'],
		['Sekolah', locals.sekolah?.nama ?? '-'],
		['Kelas', kelas ? `${kelas.nama}${kelas.fase ? ` - ${kelas.fase}` : ''}` : '-'],
		['Tanggal', `${tanggalAwal} s.d. ${tanggalAkhir}`],
		[],
		[
			'Tanggal',
			'Kelas ID',
			'Kelas',
			'Kegiatan ID',
			'Kode Kegiatan',
			'Kegiatan',
			'Murid ID',
			'Nama',
			'NIS',
			'NISN',
			'Status',
			'Catatan'
		]
	]);

	const dates = listLocalDatesInRange(tanggalAwal, tanggalAkhir);
	for (const tanggal of dates) {
		for (const kegiatan of selectedKegiatan) {
			for (const murid of muridList) {
				const existing = absensiByKey.get(`${tanggal}:${kegiatan.id}:${murid.id}`);
				sheet.addRow([
					tanggal,
					kelasId,
					kelas?.nama ?? '',
					kegiatan.id,
					kegiatan.kode,
					kegiatan.nama,
					murid.id,
					murid.nama,
					murid.nis,
					murid.nisn,
					existing ? ABSENSI_KEGIATAN_STATUS_LABELS[existing.status] : '',
					existing?.catatan ?? ''
				]);
			}
		}
	}

	sheet.views = [{ state: 'frozen', ySplit: 6 }];
	sheet.getRow(1).font = { bold: true, size: 14 };
	sheet.getRow(6).font = { bold: true };
	sheet.columns = [
		{ width: 12 },
		{ width: 10 },
		{ width: 18 },
		{ width: 12 },
		{ width: 18 },
		{ width: 20 },
		{ width: 10 },
		{ width: 28 },
		{ width: 16 },
		{ width: 16 },
		{ width: 14 },
		{ width: 32 }
	];
	const statusFormula = `"${ABSENSI_KEGIATAN_STATUSES.map((status) => ABSENSI_KEGIATAN_STATUS_LABELS[status]).join(',')}"`;
	for (let rowNumber = 7; rowNumber <= sheet.rowCount; rowNumber += 1) {
		sheet.getCell(rowNumber, 11).dataValidation = {
			type: 'list',
			allowBlank: true,
			formulae: [statusFormula],
			showDropDown: true
		};
	}

	const buffer = await workbook.xlsx.writeBuffer();
	const body =
		buffer instanceof ArrayBuffer
			? buffer
			: new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
	const kelasLabel = sanitizeFilename(kelas?.nama ?? 'kelas');
	return new Response(body, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="template-import-absensi-${kelasLabel}-${tanggalAwal}-${tanggalAkhir}.xlsx"`
		}
	});
}
import { activeMuridFilter } from '$lib/server/murid-query';
import { studentAccessCondition } from '$lib/server/student-access';
