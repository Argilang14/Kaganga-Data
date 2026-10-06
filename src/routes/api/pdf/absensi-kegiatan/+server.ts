import { error } from '@sveltejs/kit';
import { and, asc, between, eq } from 'drizzle-orm';
import {
	ABSENSI_KEGIATAN_STATUSES,
	assertAbsensiKegiatanAccess,
	loadKegiatanAbsensiOptions,
	type AbsensiKegiatanStatus
} from '$lib/server/absensi-kegiatan';
import {
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	todayLocalDate
} from '$lib/server/absensi-digital';
import { loadAttendanceMonitoring } from '$lib/server/attendance-monitoring.server';
import db from '$lib/server/db';
import { studentAccessCondition } from '$lib/server/student-access';
import {
	tableAbsensiKegiatan,
	tableKelas,
	tableMurid,
	tablePegawai,
	tableSekolah
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

const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const GET: RequestHandler = async ({ locals, url }) => {
	assertAbsensiKegiatanAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.sekolah || !locals.user) throw error(400, 'Sekolah aktif tidak ditemukan.');

	const today = todayLocalDate();
	const tanggalAwal = normalizeDateInput(url.searchParams.get('tanggal_awal'), today);
	const tanggalAkhir = normalizeDateInput(url.searchParams.get('tanggal_akhir'), tanggalAwal);
	if (tanggalAwal > tanggalAkhir) throw error(400, 'Tanggal awal tidak boleh setelah tanggal akhir.');
	const daySpan = Math.floor((Date.parse(`${tanggalAkhir}T00:00:00Z`) - Date.parse(`${tanggalAwal}T00:00:00Z`)) / 86_400_000);
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

	const [students, attendanceRows, kelas, sekolah, logoUrl, logoDinasUrl, monitoring] =
		await Promise.all([
			db.query.tableMurid.findMany({
				columns: { id: true, nis: true, nama: true },
				where: and(
					eq(tableMurid.sekolahId, sekolahId),
					eq(tableMurid.semesterId, academic.activeSemesterId),
					eq(tableMurid.kelasId, kelasId),
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
			getLogoDinasSrc(sekolahId),
			loadAttendanceMonitoring({
				sekolahId,
				tahunAjaranId: academic.activeTahunAjaranId,
				semesterId: academic.activeSemesterId,
				kelasIds: [kelasId],
				user: locals.user,
				today: tanggalAkhir > today ? today : tanggalAkhir
			})
		]);
	if (!kelas || !sekolah) throw error(404, 'Data kelas atau sekolah tidak ditemukan.');

	const kepala = sekolah.kepalaSekolahId
		? await db.query.tablePegawai.findFirst({
				columns: { nama: true, nip: true },
				where: and(
					eq(tablePegawai.id, sekolah.kepalaSekolahId),
					eq(tablePegawai.sekolahId, sekolahId)
				)
			})
		: null;
	const kegiatanById = new Map(kegiatanList.map((item) => [item.id, item.nama]));
	const summary = emptyCounts();
	const countsByStudent = new Map(students.map((student) => [student.id, emptyCounts()]));
	const detailByKey = new Map<string, { tanggal: string; kegiatan: string; counts: Counts }>();
	for (const row of attendanceRows) {
		if (!countsByStudent.has(row.muridId)) continue;
		summary[row.status] += 1;
		const studentCounts = countsByStudent.get(row.muridId);
		if (studentCounts) studentCounts[row.status] += 1;
		const key = `${row.tanggal}:${row.kegiatanId}`;
		const detail = detailByKey.get(key) ?? {
			tanggal: row.tanggal,
			kegiatan: kegiatanById.get(row.kegiatanId) ?? 'Kegiatan',
			counts: emptyCounts()
		};
		detail.counts[row.status] += 1;
		detailByKey.set(key, detail);
	}

	const activePermits = monitoring.izinPulang.filter(
		(item) => !item.tanggalKembali && ['sedang_izin', 'terlambat_kembali'].includes(item.status)
	);
	const periodLabel =
		tanggalAwal === tanggalAkhir
			? formatTanggal(tanggalAwal)
			: `${formatTanggal(tanggalAwal)} - ${formatTanggal(tanggalAkhir)}`;
	const html = renderAbsensiKegiatanHTML({
		sekolah: {
			naungan: locals.sekolah.naungan,
			nama: sekolah.nama,
			npsn: sekolah.npsn,
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
			counts: countsByStudent.get(student.id) ?? emptyCounts()
		})),
		detailRows: Array.from(detailByKey.values()).map((row) => ({
			...row,
			tanggal: formatTanggal(row.tanggal)
		})),
		alerts: monitoring.alerts.map((item) => ({
			nama: item.nama,
			indikator: titleCase(item.title),
			periode: `${formatTanggal(item.periodeMulai)} - ${formatTanggal(item.periodeSelesai)}`,
			durasi: item.duration,
			status: item.followUp ? titleCase(item.followUp.status) : 'Baru',
			catatan: item.followUp?.catatan ?? ''
		})),
		permits: activePermits.map((item) => ({
			nama: item.nama,
			tanggalKeluar: formatTanggal(item.tanggalKeluar),
			rencanaKembali: formatTanggal(item.rencanaKembali),
			status: titleCase(item.status),
			alasan: item.alasan
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
