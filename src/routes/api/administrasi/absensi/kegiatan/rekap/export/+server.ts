import { loadSchoolPermitRecap, loadPermitRecapDetails } from '$lib/server/attendance-permit-recap';
import { permitRecapColumns } from '$lib/attendance-permit-recap';
import { isSummaryDate } from '$lib/attendance-summary';
/* eslint-disable @typescript-eslint/no-explicit-any -- Tipe ExcelJS di workspace ini tidak memuat semua API runtime. */
import {
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	todayLocalDate
} from '$lib/server/absensi-digital';
import { attendanceReportClasses } from '$lib/attendance-report-navigation';
import {
	ABSENSI_KEGIATAN_STATUS_LABELS,
	ABSENSI_KEGIATAN_STATUSES,
	listLocalDatesInRange,
	loadKegiatanAbsensiOptions,
	requireAbsensiKegiatanAccess
} from '$lib/server/absensi-kegiatan';
import db from '$lib/server/db';
import { studentAccessCondition } from '$lib/server/attendance-student-access';
import { projectPermitAttendance } from '$lib/server/attendance-permits';
import { tableAbsensiKegiatan, tableMurid } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
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
	if (
		!isSummaryDate(tanggalAwal) ||
		!isSummaryDate(tanggalAkhir) ||
		Math.abs(Date.parse(tanggalAkhir) - Date.parse(tanggalAwal)) > 366 * 86400000
	)
		error(400, 'Pilih rentang tanggal valid, maksimal satu tahun.');
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
	const { kelasId, kelasIds, allKelas } = attendanceReportClasses(
		kelasList,
		url.searchParams.get('kelas_id')
	);
	const kelasNames = new Map(kelasList.map((item) => [item.id, item.nama]));
	const kelas = kelasList.find((item) => item.id === kelasId);
	const kegiatanList = await loadKegiatanAbsensiOptions(sekolahId, true, locals.user);
	const kegiatanId =
		requestedKegiatanId && kegiatanList.some((kegiatan) => kegiatan.id === requestedKegiatanId)
			? requestedKegiatanId
			: null;
	const selectedKegiatan = kegiatanList.find((kegiatan) => kegiatan.id === kegiatanId);

	if (!academic.activeSemesterId || !kelasIds.length) {
		return json({ message: 'Kelas atau semester aktif belum tersedia.' }, { status: 400 });
	}

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true, kelasId: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, academic.activeSemesterId),
			inArray(tableMurid.kelasId, kelasIds),
			await studentAccessCondition(locals.user, sekolahId, undefined, selectedKegiatan?.kategori)
		),
		orderBy: [asc(tableMurid.kelasId), asc(tableMurid.nama)]
	});
	const muridIds = muridList.map((murid) => murid.id);

	const recordedRows = muridIds.length
		? await db.query.tableAbsensiKegiatan.findMany({
				where: and(
					eq(tableAbsensiKegiatan.sekolahId, sekolahId),
					eq(tableAbsensiKegiatan.semesterId, academic.activeSemesterId),
					inArray(tableAbsensiKegiatan.kelasId, kelasIds),
					kegiatanId ? eq(tableAbsensiKegiatan.kegiatanId, kegiatanId) : undefined,
					locals.user?.type === 'tim_dapur'
						? inArray(
								tableAbsensiKegiatan.kegiatanId,
								kegiatanList.map((item) => item.id)
							)
						: undefined,
					between(tableAbsensiKegiatan.tanggal, tanggalAwal, tanggalAkhir),
					inArray(tableAbsensiKegiatan.muridId, muridIds)
				)
			})
		: [];

	const schoolRecap =
		locals.user.type !== 'tim_dapur'
			? await loadSchoolPermitRecap({
					schoolId: sekolahId,
					semesterId: academic.activeSemesterId,
					studentIds: muridIds,
					start: tanggalAwal,
					end: tanggalAkhir
				})
			: null;

	const absensiRows = await projectPermitAttendance({
		schoolId: sekolahId,
		semesterId: academic.activeSemesterId,
		studentIds: muridIds,
		dates: listLocalDatesInRange(tanggalAwal, tanggalAkhir),
		activities: kegiatanList.filter((item) => !kegiatanId || item.id === kegiatanId),
		rows: recordedRows
	});
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
		[
			'Kelas',
			allKelas
				? 'Semua Kelas yang Diizinkan'
				: kelas
					? `${kelas.nama}${kelas.fase ? ` - ${kelas.fase}` : ''}`
					: '-'
		],
		['Kegiatan', selectedKegiatan?.nama ?? 'Semua kegiatan'],
		['Tanggal', `${tanggalAwal} s.d. ${tanggalAkhir}`],
		[],
		[
			'No',
			'Nama',
			'NIS',
			'NISN',
			...(allKelas ? ['Kelas'] : []),
			...ABSENSI_KEGIATAN_STATUSES.map(
				(status) => `${ABSENSI_KEGIATAN_STATUS_LABELS[status]} (kegiatan)`
			),
			...(schoolRecap
				? ['Izin sekolah (hari)', 'Alfa sekolah (hari)', ...permitRecapColumns.map((c) => c.label)]
				: [])
		]
	]);
	for (const [index, murid] of muridList.entries()) {
		const counts = byMurid.get(murid.id) ?? emptySummary();
		rekapSheet.addRow([
			index + 1,
			murid.nama,
			murid.nis,
			murid.nisn,
			...(allKelas ? [kelasNames.get(murid.kelasId ?? -1) ?? '-'] : []),
			...ABSENSI_KEGIATAN_STATUSES.map((status) => counts[status]),
			...(schoolRecap
				? [
						schoolRecap.get(murid.id)?.counts.izin ?? 0,
						schoolRecap.get(murid.id)?.counts.alfa ?? 0,
						...permitRecapColumns.map((c) => schoolRecap.get(murid.id)?.[c.key] ?? 0)
					]
				: [])
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
		[
			'Tanggal',
			'Kegiatan',
			'Nama',
			...(allKelas ? ['Kelas'] : []),
			'Status',
			'Metode',
			'Waktu Scan',
			'Catatan'
		],
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
				...(allKelas ? [kelasNames.get(row.kelasId) ?? '-'] : []),
				ABSENSI_KEGIATAN_STATUS_LABELS[row.status],
				row.metode,
				row.waktuScan ?? '',
				row.catatan ?? ''
			])
	]);

	const permitSheet = schoolRecap ? workbook.addWorksheet('Catatan Izin Pulang') : null;
	if (permitSheet) {
		permitSheet.addRow([
			'ID Izin',
			'Nama',
			'Kelas saat izin',
			'Keluar izin',
			'Waktu keluar izin',
			'Rencana kembali',
			'Waktu rencana kembali',
			'Kembali tercatat',
			'Waktu kembali tercatat',
			'Status',
			'Pencatat izin',
			'Pencatat kembali',
			'Scan keluar security (UTC)',
			'Petugas keluar security',
			'Scan kembali security (UTC)',
			'Petugas kembali security',
			'Alasan',
			'Perlu diperiksa'
		]);
		for (const p of await loadPermitRecapDetails(sekolahId, muridIds, tanggalAwal, tanggalAkhir)) {
			permitSheet.addRow([
				p.id,
				p.namaSnapshot,
				p.kelasSnapshot,
				p.tanggalKeluar,
				p.waktuKeluar ?? '',
				p.rencanaKembali,
				p.waktuRencanaKembali ?? '',
				p.tanggalKembali ?? '',
				p.waktuKembali ?? '',
				p.status,
				p.pencatat,
				p.pencatatKembali,
				p.perjalanan?.keluarPada ?? '',
				p.petugasKeluarSecurity,
				p.perjalanan?.kembaliPada ?? '',
				p.petugasKembaliSecurity,
				p.alasan,
				p.perluDiperiksa.join(' ')
			]);
		}
	}
	for (const sheet of [rekapSheet, detailSheet, dataSheet, ...(permitSheet ? [permitSheet] : [])]) {
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
	const kelasLabel = sanitizeFilename(allKelas ? 'semua-kelas' : (kelas?.nama ?? 'kelas'));
	return new Response(body, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="rekap-kegiatan-${kelasLabel}-${tanggalAwal}-${tanggalAkhir}.xlsx"`
		}
	});
}
