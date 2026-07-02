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
	applyAutoAlfaKegiatan,
	listLocalDatesInRange,
	loadKegiatanAbsensiOptions,
	requireAbsensiKegiatanAccess
} from '$lib/server/absensi-kegiatan';
import db from '$lib/server/db';
import { tableAbsensiKegiatan, tableMurid } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, asc, between, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';

type StatusKey = (typeof ABSENSI_KEGIATAN_STATUSES)[number];

function emptySummary() {
	return Object.fromEntries(ABSENSI_KEGIATAN_STATUSES.map((status) => [status, 0])) as Record<
		StatusKey,
		number
	>;
}

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
	const kegiatanId =
		requestedKegiatanId && kegiatanList.some((kegiatan) => kegiatan.id === requestedKegiatanId)
			? requestedKegiatanId
			: null;
	const selectedKegiatan = kegiatanList.find((kegiatan) => kegiatan.id === kegiatanId);

	if (!academic.activeSemesterId || !kelasId) {
		return json({ message: 'Kelas atau semester aktif belum tersedia.' }, { status: 400 });
	}

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, academic.activeSemesterId),
			eq(tableMurid.kelasId, kelasId)
		),
		orderBy: asc(tableMurid.nama)
	});
	const muridIds = muridList.map((murid) => murid.id);
	if (muridIds.length) {
		const kegiatanIds = kegiatanId ? [kegiatanId] : kegiatanList.map((kegiatan) => kegiatan.id);
		for (const tanggal of listLocalDatesInRange(tanggalAwal, tanggalAkhir)) {
			await applyAutoAlfaKegiatan({
				sekolahId,
				semesterId: academic.activeSemesterId,
				kelasId,
				tanggal,
				kegiatanIds
			});
		}
	}

	const absensiRows = muridIds.length
		? await db.query.tableAbsensiKegiatan.findMany({
				where: and(
					eq(tableAbsensiKegiatan.sekolahId, sekolahId),
					eq(tableAbsensiKegiatan.semesterId, academic.activeSemesterId),
					eq(tableAbsensiKegiatan.kelasId, kelasId),
					kegiatanId ? eq(tableAbsensiKegiatan.kegiatanId, kegiatanId) : undefined,
					between(tableAbsensiKegiatan.tanggal, tanggalAwal, tanggalAkhir),
					inArray(tableAbsensiKegiatan.muridId, muridIds)
				)
			})
		: [];

	const summary = emptySummary();
	const byMurid = new Map<number, Record<StatusKey, number>>();
	const kegiatanNameById = new Map(kegiatanList.map((kegiatan) => [kegiatan.id, kegiatan.nama]));
	const muridNameById = new Map(muridList.map((murid) => [murid.id, murid.nama]));
	const detailByDateKegiatan = new Map<
		string,
		{ tanggal: string; kegiatanNama: string; counts: Record<StatusKey, number> }
	>();

	for (const murid of muridList) byMurid.set(murid.id, emptySummary());
	for (const row of absensiRows) {
		summary[row.status] += 1;
		byMurid.get(row.muridId)![row.status] += 1;
		const detailKey = `${row.tanggal}:${row.kegiatanId}`;
		const detail = detailByDateKegiatan.get(detailKey) ?? {
			tanggal: row.tanggal,
			kegiatanNama: kegiatanNameById.get(row.kegiatanId) ?? 'Kegiatan',
			counts: emptySummary()
		};
		detail.counts[row.status] += 1;
		detailByDateKegiatan.set(detailKey, detail);
	}

	const workbook: any = new ExcelJS.Workbook();
	workbook.creator = 'Kaganga';
	workbook.created = new Date();

	const rekapSheet: any = workbook.addWorksheet('Rekap Per Siswa');
	rekapSheet.addRows([
		['Rekap Absensi Kegiatan'],
		['Sekolah', locals.sekolah?.nama ?? '-'],
		['Kelas', kelas ? `${kelas.nama}${kelas.fase ? ` - ${kelas.fase}` : ''}` : '-'],
		['Kegiatan', selectedKegiatan?.nama ?? 'Semua kegiatan'],
		['Tanggal', `${tanggalAwal} s.d. ${tanggalAkhir}`],
		[],
		[
			'No',
			'Nama',
			'NIS',
			'NISN',
			...ABSENSI_KEGIATAN_STATUSES.map((status) => ABSENSI_KEGIATAN_STATUS_LABELS[status])
		]
	]);
	for (const [index, murid] of muridList.entries()) {
		const counts = byMurid.get(murid.id) ?? emptySummary();
		rekapSheet.addRow([
			index + 1,
			murid.nama,
			murid.nis,
			murid.nisn,
			...ABSENSI_KEGIATAN_STATUSES.map((status) => counts[status])
		]);
	}

	const detailSheet: any = workbook.addWorksheet('Detail Per Tanggal');
	detailSheet.addRows([
		[
			'Tanggal',
			'Kegiatan',
			...ABSENSI_KEGIATAN_STATUSES.map((status) => ABSENSI_KEGIATAN_STATUS_LABELS[status])
		]
	]);
	for (const row of Array.from(detailByDateKegiatan.values()).sort((a, b) => {
		const byDate = a.tanggal.localeCompare(b.tanggal);
		if (byDate !== 0) return byDate;
		return a.kegiatanNama.localeCompare(b.kegiatanNama);
	})) {
		detailSheet.addRow([
			row.tanggal,
			row.kegiatanNama,
			...ABSENSI_KEGIATAN_STATUSES.map((status) => row.counts[status])
		]);
	}

	const dataSheet: any = workbook.addWorksheet('Data Scan');
	dataSheet.addRows([
		['Tanggal', 'Kegiatan', 'Nama', 'Status', 'Metode', 'Waktu Scan', 'Catatan'],
		...absensiRows
			.slice()
			.sort((a, b) => {
				const byDate = a.tanggal.localeCompare(b.tanggal);
				if (byDate !== 0) return byDate;
				return (muridNameById.get(a.muridId) ?? '').localeCompare(
					muridNameById.get(b.muridId) ?? ''
				);
			})
			.map((row) => [
				row.tanggal,
				kegiatanNameById.get(row.kegiatanId) ?? 'Kegiatan',
				muridNameById.get(row.muridId) ?? '-',
				ABSENSI_KEGIATAN_STATUS_LABELS[row.status],
				row.metode,
				row.waktuScan ?? '',
				row.catatan ?? ''
			])
	]);

	for (const sheet of [rekapSheet, detailSheet, dataSheet]) {
		sheet.views = [{ state: 'frozen', ySplit: sheet === rekapSheet ? 7 : 1 }];
		sheet.eachRow((row: any, rowNumber: number) => {
			if (rowNumber === 1 || rowNumber === 7) row.font = { bold: true };
		});
		sheet.columns?.forEach((column: any, index: number) => {
			column.width = index === 1 ? 28 : 14;
		});
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
			'content-disposition': `attachment; filename="rekap-kegiatan-${kelasLabel}-${tanggalAwal}-${tanggalAkhir}.xlsx"`
		}
	});
}
