import { error } from '@sveltejs/kit';
import { isSummaryDate } from '$lib/attendance-summary';
import { attendanceMonthRange } from '$lib/attendance-report-period';
import { monthlyAttendanceIndicators, monthlyRecapPeriods } from '$lib/attendance-permit-recap';
import { and, asc, between, eq, inArray } from 'drizzle-orm';
import {
	ABSENSI_KEGIATAN_STATUSES,
	assertAbsensiKegiatanAccess,
	loadKegiatanAbsensiOptions,
	listLocalDatesInRange,
	type AbsensiKegiatanStatus
} from '$lib/server/absensi-kegiatan';
import {
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	todayLocalDate
} from '$lib/server/absensi-digital';
import { loadSchoolPermitRecap, loadPermitRecapDetails } from '$lib/server/attendance-permit-recap';
import { activeMuridFilter } from '$lib/server/murid-query';
import db from '$lib/server/db';
import { projectPermitAttendance } from '$lib/server/attendance-permits';
import { getClassEducationIdentity } from '$lib/server/education-units';
import { studentAccessCondition } from '$lib/server/attendance-student-access';
import {
	tableAbsensiKegiatan,
	tableKelas,
	tableMurid,
	tablePegawai,
	tableSekolah,
	tableTindakLanjutAbsensi
} from '$lib/server/db/schema';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import {
	composeAlamat,
	formatTanggal,
	getLogoDinasSrc,
	getLogoSrc
} from '$lib/server/pdf/preview-utils';
import { renderAbsensiKegiatanHTML } from '$lib/server/pdf/templates/absensi-kegiatan';
import type { RequestHandler } from './$types';

type Counts = Record<AbsensiKegiatanStatus, number>;

const emptyCounts = () =>
	Object.fromEntries(ABSENSI_KEGIATAN_STATUSES.map((status) => [status, 0])) as Counts;

const titleCase = (value: string) =>
	value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const GET: RequestHandler = async ({ locals, url }) => {
	assertAbsensiKegiatanAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.sekolah || !locals.user)
		throw error(400, 'Sekolah aktif tidak ditemukan.');

	const today = todayLocalDate();
	const monthMode = url.searchParams.has('bulan_awal') || url.searchParams.has('bulan_akhir');
	let monthRange: ReturnType<typeof attendanceMonthRange> | null = null;
	if (monthMode) {
		try {
			monthRange = attendanceMonthRange(
				url.searchParams.get('bulan_awal') ?? '',
				url.searchParams.get('bulan_akhir') ?? '',
				today
			);
		} catch (cause) {
			throw error(400, (cause as Error).message);
		}
	}
	const tanggalAwal =
		monthRange?.start ?? normalizeDateInput(url.searchParams.get('tanggal_awal'), today);
	const requestedEnd =
		monthRange?.end ?? normalizeDateInput(url.searchParams.get('tanggal_akhir'), tanggalAwal);
	const tanggalAkhir = requestedEnd < today ? requestedEnd : today;
	if (!isSummaryDate(tanggalAwal) || !isSummaryDate(tanggalAkhir) || tanggalAwal > tanggalAkhir)
		throw error(400, 'Tanggal awal tidak boleh setelah tanggal akhir.');
	const daySpan = Math.floor(
		(Date.parse(`${tanggalAkhir}T00:00:00Z`) - Date.parse(`${tanggalAwal}T00:00:00Z`)) / 86_400_000
	);
	if (daySpan > 366) throw error(400, 'Rentang laporan maksimal 1 tahun.');

	const kelasId = parsePositiveInteger(url.searchParams.get('kelas_id'));
	const kegiatanId = parsePositiveInteger(url.searchParams.get('kegiatan_id'));
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	if (!academic.activeSemesterId || !academic.activeTahunAjaranId) {
		throw error(400, 'Tahun ajaran dan semester aktif belum tersedia.');
	}
	if (!kelasId || !kelasList.some((kelas) => kelas.id === kelasId)) {
		throw error(403, 'Kelas tidak tersedia atau berada di luar penugasan akun.');
	}
	const kegiatanList = await loadKegiatanAbsensiOptions(sekolahId, true, locals.user);
	const selectedKegiatan = kegiatanId
		? kegiatanList.find((kegiatan) => kegiatan.id === kegiatanId)
		: null;
	if (kegiatanId && !selectedKegiatan) throw error(404, 'Kegiatan absensi tidak ditemukan.');

	const [students, recordedRows, kelas, sekolah, logoUrl, logoDinasUrl] = await Promise.all([
		db.query.tableMurid.findMany({
			columns: { id: true, nis: true, nama: true },
			where: and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, academic.activeSemesterId),
				eq(tableMurid.kelasId, kelasId),
				activeMuridFilter(),
				await studentAccessCondition(locals.user, sekolahId)
			),
			orderBy: asc(tableMurid.nama)
		}),
		db.query.tableAbsensiKegiatan.findMany({
			where: and(
				eq(tableAbsensiKegiatan.sekolahId, sekolahId),
				eq(tableAbsensiKegiatan.semesterId, academic.activeSemesterId),
				eq(tableAbsensiKegiatan.kelasId, kelasId),
				between(tableAbsensiKegiatan.tanggal, tanggalAwal, tanggalAkhir),
				kegiatanId ? eq(tableAbsensiKegiatan.kegiatanId, kegiatanId) : undefined
			),
			orderBy: [asc(tableAbsensiKegiatan.tanggal), asc(tableAbsensiKegiatan.kegiatanId)]
		}),
		db.query.tableKelas.findFirst({
			columns: { id: true, nama: true, fase: true },
			with: { waliKelas: { columns: { nama: true, nip: true } } },
			where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
		}),
		db.query.tableSekolah.findFirst({
			columns: { nama: true, npsn: true, kepalaSekolahId: true },
			where: eq(tableSekolah.id, sekolahId)
		}),
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId)
	]);
	if (!kelas || !sekolah) throw error(404, 'Data kelas atau sekolah tidak ditemukan.');
	const attendanceRows = await projectPermitAttendance({
		schoolId: sekolahId,
		semesterId: academic.activeSemesterId,
		studentIds: students.map((item) => item.id),
		dates: listLocalDatesInRange(tanggalAwal, tanggalAkhir),
		activities: kegiatanList.filter((item) => !kegiatanId || item.id === kegiatanId),
		rows: recordedRows
	});

	const kepala = sekolah.kepalaSekolahId
		? await db.query.tablePegawai.findFirst({
				columns: { nama: true, nip: true },
				where: and(
					eq(tablePegawai.id, sekolah.kepalaSekolahId),
					eq(tablePegawai.sekolahId, sekolahId)
				)
			})
		: null;
	const summary = emptyCounts();
	const countsByStudent = new Map(students.map((student) => [student.id, emptyCounts()]));
	for (const row of attendanceRows) {
		if (!countsByStudent.has(row.muridId)) continue;
		summary[row.status] += 1;
		const studentCounts = countsByStudent.get(row.muridId);
		if (studentCounts) studentCounts[row.status] += 1;
	}

	const schoolRecap =
		locals.user.type === 'tim_dapur'
			? null
			: await loadSchoolPermitRecap({
					schoolId: sekolahId,
					semesterId: academic.activeSemesterId,
					studentIds: students.map((s) => s.id),
					start: tanggalAwal,
					end: tanggalAkhir,
					excludeCurrentUnrecorded: true
				});
	const alerts: ReturnType<typeof monthlyAttendanceIndicators> = [];
	if (schoolRecap && students.length) {
		const followUps = await db.query.tableTindakLanjutAbsensi.findMany({
			where: and(
				eq(tableTindakLanjutAbsensi.sekolahId, sekolahId),
				inArray(
					tableTindakLanjutAbsensi.muridId,
					students.map((student) => student.id)
				),
				between(tableTindakLanjutAbsensi.periodeMulai, tanggalAwal, tanggalAkhir)
			)
		});
		const periods = monthlyRecapPeriods(tanggalAwal, tanggalAkhir);
		for (const period of periods) {
			const monthly =
				periods.length === 1
					? schoolRecap
					: await loadSchoolPermitRecap({
							schoolId: sekolahId,
							semesterId: academic.activeSemesterId,
							studentIds: students.map((student) => student.id),
							...period,
							excludeCurrentUnrecorded: true
						});
			for (const student of students)
				alerts.push(
					...monthlyAttendanceIndicators(student, monthly.get(student.id)!, period, followUps)
				);
		}
	}
	const periodPermits = schoolRecap
		? await loadPermitRecapDetails(
				sekolahId,
				students.map((s) => s.id),
				tanggalAwal,
				tanggalAkhir
			)
		: [];
	const monthLabel = (month: string) =>
		new Date(`${month}-01T00:00:00Z`).toLocaleDateString('id-ID', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
	const periodLabel = monthRange
		? `${monthLabel(tanggalAwal.slice(0, 7))} - ${monthLabel(url.searchParams.get('bulan_akhir')!)}. Data sampai ${formatTanggal(tanggalAkhir)}`
		: tanggalAwal === tanggalAkhir
			? formatTanggal(tanggalAwal)
			: `${formatTanggal(tanggalAwal)} - ${formatTanggal(tanggalAkhir)}`;
	const html = renderAbsensiKegiatanHTML({
		sekolah: {
			naungan: locals.sekolah.naungan,
			nama: (await getClassEducationIdentity(sekolahId, kelasId)).nama,
			npsn: (await getClassEducationIdentity(sekolahId, kelasId)).npsn,
			alamat: composeAlamat(locals.sekolah),
			email: locals.sekolah.email,
			logoUrl,
			logoDinasUrl
		},
		periode: periodLabel,
		kelas: kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama,
		kegiatan: selectedKegiatan?.nama ?? 'Semua kegiatan',
		summary,
		studentRows: students.map((student, index) => ({
			no: index + 1,
			nis: student.nis,
			nama: student.nama,
			counts: countsByStudent.get(student.id) ?? emptyCounts(),
			schoolRecap: schoolRecap?.get(student.id)
		})),
		alerts: alerts.map((item) => ({
			nama: item.nama,
			indikator: item.indikator,
			periode: `${formatTanggal(item.periodeMulai)} - ${formatTanggal(item.periodeSelesai)}`,
			akumulasi: item.akumulasi,
			status: titleCase(item.status),
			catatan: item.catatan
		})),
		permits: periodPermits.map((item) => ({
			nama: item.namaSnapshot,
			tanggalKeluar: formatTanggal(item.tanggalKeluar),
			rencanaKembali: formatTanggal(item.rencanaKembali),
			status: titleCase(item.status),
			alasan: `${item.alasan}. Pencatat: ${item.pencatat}. Security keluar: ${item.perjalanan?.keluarPada ? new Date(item.perjalanan.keluarPada).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'belum diverifikasi'}${item.petugasKeluarSecurity ? ` (${item.petugasKeluarSecurity})` : ''}. Security kembali: ${item.perjalanan?.kembaliPada ? new Date(item.perjalanan.kembaliPada).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'belum diverifikasi'}${item.petugasKembaliSecurity ? ` (${item.petugasKembaliSecurity})` : ''}. ${item.perluDiperiksa.join(' ')}`
		})),
		tandaTangan: {
			kiri: {
				jabatan: 'Mengetahui, Kepala Sekolah',
				nama: kepala?.nama ?? '',
				nip: kepala?.nip ?? ''
			},
			kanan: {
				jabatan: 'Wali Kelas',
				nama: kelas.waliKelas?.nama ?? '',
				nip: kelas.waliKelas?.nip ?? ''
			}
		}
	});
	const pdf = Buffer.from(await renderPDF(html));
	const filename = `rekap-absensi-kegiatan-${tanggalAwal}-${tanggalAkhir}.pdf`;
	return new Response(new Blob([pdf], { type: 'application/pdf' }), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `inline; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
};
