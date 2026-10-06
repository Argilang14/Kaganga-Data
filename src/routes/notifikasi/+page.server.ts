import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { loadAbsensiKelasOptions, todayLocalDate } from '$lib/server/absensi-digital';
import { loadAttendanceMonitoring } from '$lib/server/attendance-monitoring.server';
import { jakartaToday } from '$lib/dashboard-summary';
import db from '$lib/server/db';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { ensureDocumentManagementSchema } from '$lib/server/db/ensure-document-management';
import { ensureInventarisPengumumanSchema } from '$lib/server/db/ensure-inventaris-pengumuman';
import { ensureMartikulasiSchema } from '$lib/server/db/ensure-martikulasi';
import { ensureProductionOperationsSchema } from '$lib/server/db/ensure-production-operations';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import {
	tableDinasLuarPermohonan,
	tableDocumentApproval,
	tableAbsensiHarian,
	tableAsesmenSumatif,
	tableMartikulasiHasil,
	tableMurid,
	tablePengumuman,
	tableSppd,
	tableSuratArsip
} from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

type Notice = {
	id: string;
	title: string;
	description: string;
	count: number;
	severity: 'info' | 'warning' | 'error';
	href: string;
};

async function countRows(table: Parameters<typeof db.select>[0], from: any, where: any) {
	const [row] = await db.select(table).from(from).where(where);
	return Number((row as { total?: number } | undefined)?.total ?? 0);
}

export async function _getNotificationData(locals: App.Locals) {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await Promise.all([
		ensureSuratMenyuratSchema(),
		ensureDataGovernanceSchema(),
		ensureDocumentManagementSchema(),
		ensureInventarisPengumumanSchema(),
		ensureMartikulasiSchema(),
		ensureProductionOperationsSchema()
	]);
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const { kelasList } = locals.user
		? await loadAbsensiKelasOptions(sekolahId, locals.user)
		: { kelasList: [] };
	const monitoring =
		academic?.activeSemesterId && academic?.activeTahunAjaranId
			? await loadAttendanceMonitoring({
					sekolahId,
					tahunAjaranId: academic.activeTahunAjaranId,
					semesterId: academic.activeSemesterId,
					kelasIds: kelasList.map((kelas) => kelas.id),
					today: todayLocalDate()
				})
			: { alerts: [], izinPulang: [] };
	const attendanceAlerts = monitoring.alerts.filter(
		(item) => item.type !== 'izin_pulang_terlambat' && item.followUp?.status !== 'selesai'
	).length;
	const overduePermits = monitoring.alerts.filter(
		(item) => item.type === 'izin_pulang_terlambat' && item.followUp?.status !== 'selesai'
	).length;
	const total = { total: sql<number>`count(*)` };
	const canApprove =
		locals.user?.type === 'admin' ||
		locals.user?.permissions?.some((permission) =>
			['surat_persetujuan', 'persetujuan_periksa', 'persetujuan_setujui'].includes(permission)
		) === true;
	const today = jakartaToday();
	const announcementAudience = locals.user?.type === 'user' ? 'guru' : locals.user?.type;
	const activeStudentWhere = academic?.activeSemesterId
		? and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, academic.activeSemesterId))
		: sql`0`;

	const [
		suratPending,
		dinasPending,
		approvalPending,
		sppdDraft,
		fotoKosong,
		qrKosong,
		martikulasiBelum,
		activeStudents,
		attendanceFilled,
		scoreFilled,
		scheduleConflicts,
		importantAnnouncements,
		frequentAbsence,
		decliningScores,
		dormIncomplete,
		jpDeficits,
		expiringDocuments,
		communicationPending
	] = await Promise.all([
		canApprove
			? countRows(
					total,
					tableSuratArsip,
					and(eq(tableSuratArsip.sekolahId, sekolahId), eq(tableSuratArsip.status, 'diajukan'))
				)
			: 0,
		canApprove
			? countRows(
					total,
					tableDinasLuarPermohonan,
					and(
						eq(tableDinasLuarPermohonan.sekolahId, sekolahId),
						eq(tableDinasLuarPermohonan.status, 'diajukan')
					)
				)
			: 0,
		countRows(
			total,
			tableDocumentApproval,
			and(
				eq(tableDocumentApproval.sekolahId, sekolahId),
				or(
					eq(tableDocumentApproval.status, 'diajukan'),
					eq(tableDocumentApproval.status, 'diperiksa')
				)
			)
		),
		countRows(
			total,
			tableSppd,
			and(eq(tableSppd.sekolahId, sekolahId), eq(tableSppd.status, 'draft'))
		),
		academic?.activeSemesterId
			? countRows(
					total,
					tableMurid,
					and(
						eq(tableMurid.sekolahId, sekolahId),
						eq(tableMurid.semesterId, academic.activeSemesterId),
						isNull(tableMurid.foto),
						activeMuridFilter()
					)
				)
			: 0,
		academic?.activeSemesterId
			? countRows(
					total,
					tableMurid,
					and(
						eq(tableMurid.sekolahId, sekolahId),
						eq(tableMurid.semesterId, academic.activeSemesterId),
						or(isNull(tableMurid.qrToken), eq(tableMurid.qrToken, '')),
						activeMuridFilter()
					)
				)
			: 0,
		academic?.activeTahunAjaranId
			? countRows(
					total,
					tableMartikulasiHasil,
					and(
						eq(tableMartikulasiHasil.sekolahId, sekolahId),
						eq(tableMartikulasiHasil.tahunAjaranId, academic.activeTahunAjaranId),
						eq(tableMartikulasiHasil.statusKelengkapan, 'belum_lengkap')
					)
				)
			: 0,
		countRows(total, tableMurid, activeStudentWhere),
		academic?.activeSemesterId
			? countRows(
					{ total: sql<number>`count(distinct ${tableAbsensiHarian.muridId})` },
					tableAbsensiHarian,
					and(
						eq(tableAbsensiHarian.sekolahId, sekolahId),
						eq(tableAbsensiHarian.semesterId, academic.activeSemesterId),
						eq(tableAbsensiHarian.tanggal, today)
					)
				)
			: 0,
		academic?.activeSemesterId
			? countRows(
					{ total: sql<number>`count(distinct ${tableAsesmenSumatif.muridId})` },
					tableAsesmenSumatif,
					sql`${tableAsesmenSumatif.muridId} in (select id from murid where sekolah_id = ${sekolahId} and semester_id = ${academic.activeSemesterId})`
				)
			: 0,
		academic?.activeSemesterId
			? db.$client
					.execute({
						sql: `select count(*) as total from (
							select guru_pegawai_id, hari, jam_id
							from jadwal_pelajaran
							where sekolah_id = ? and semester_id = ? and guru_pegawai_id is not null
								and jam_id is not null and tipe = 'pelajaran'
							group by guru_pegawai_id, hari, jam_id
							having count(distinct kelas_id) > 1
						)`,
						args: [sekolahId, academic.activeSemesterId]
					})
					.then((result) => Number(result.rows[0]?.total ?? 0))
			: 0,
		countRows(
			total,
			tablePengumuman,
			and(
				eq(tablePengumuman.sekolahId, sekolahId),
				eq(tablePengumuman.aktif, true),
				eq(tablePengumuman.prioritas, 'penting'),
				lte(tablePengumuman.tanggalMulai, today),
				or(isNull(tablePengumuman.tanggalSelesai), gte(tablePengumuman.tanggalSelesai, today)),
				locals.user?.type === 'admin'
					? undefined
					: announcementAudience
						? or(
								eq(tablePengumuman.audiens, 'semua'),
								eq(
									tablePengumuman.audiens,
									announcementAudience as 'guru' | 'wali_kelas' | 'wali_asuh' | 'wali_asrama'
								)
							)
						: eq(tablePengumuman.audiens, 'semua')
			)
		),
		academic?.activeSemesterId
			? db.$client
					.execute({
						sql: `select count(*) as total from (select murid_id from absensi_harian where sekolah_id = ? and semester_id = ? and tanggal >= date('now','-30 day') and status in ('alfa','terlambat') group by murid_id having count(*) >= 3)`,
						args: [sekolahId, academic.activeSemesterId]
					})
					.then((result) => Number(result.rows[0]?.total ?? 0))
			: 0,
		academic?.activeSemesterId
			? db.$client
					.execute({
						sql: `select count(distinct a.murid_id) as total from asesmen_sumatif a join murid m on m.id = a.murid_id where m.sekolah_id = ? and m.semester_id = ? and a.nilai_akhir_rts is not null and a.nilai_akhir is not null and a.nilai_akhir <= a.nilai_akhir_rts - 5`,
						args: [sekolahId, academic.activeSemesterId]
					})
					.then((result) => Number(result.rows[0]?.total ?? 0))
			: 0,
		academic?.activeSemesterId
			? db.$client
					.execute({
						sql: `select count(*) as total from murid m where m.sekolah_id = ? and m.semester_id = ? and not exists (select 1 from asesmen_keasramaan a where a.murid_id = m.id)`,
						args: [sekolahId, academic.activeSemesterId]
					})
					.then((result) => Number(result.rows[0]?.total ?? 0))
			: 0,
		academic?.activeTahunAjaranId
			? db.$client
					.execute({
						sql: `select count(*) as total from jadwal_target_jp target where target.sekolah_id = ? and target.tahun_ajaran_id = ? and target.jp_per_minggu > (select count(*) from jadwal_pelajaran lesson join jadwal_template template on template.id = lesson.template_id where lesson.sekolah_id = target.sekolah_id and template.tahun_ajaran_id = target.tahun_ajaran_id and template.jenis = target.jenis and lesson.kelas_id = target.kelas_id and lesson.jadwal_mapel_id = target.jadwal_mapel_id and lesson.tipe = 'pelajaran')`,
						args: [sekolahId, academic.activeTahunAjaranId]
					})
					.then((result) => Number(result.rows[0]?.total ?? 0))
			: 0,
		db.$client
			.execute({
				sql: `select count(*) as total from document_attachment where sekolah_id = ? and expires_at is not null and date(expires_at) between date('now') and date('now','+30 day')`,
				args: [sekolahId]
			})
			.then((result) => Number(result.rows[0]?.total ?? 0)),
		db.$client
			.execute({
				sql: `select count(*) as total from communication_queue where sekolah_id = ? and status = 'pending_approval'`,
				args: [sekolahId]
			})
			.then((result) => Number(result.rows[0]?.total ?? 0))
	]);
	const attendanceMissing = Math.max(0, activeStudents - attendanceFilled);
	const scoreMissing = Math.max(0, activeStudents - scoreFilled);

	const notices = (
		[
			{
				id: 'attendance-monitoring',
				title: 'Absensi perlu tindak lanjut',
				description:
					'Murid dengan sakit berturut-turut, sakit berulang, atau alfa berulang pada kelas yang dapat Anda akses.',
				count: attendanceAlerts,
				severity: 'warning',
				href: '/administrasi/absensi/kegiatan/rekap'
			},
			{
				id: 'overdue-permits',
				title: 'Murid belum kembali dari izin',
				description: 'Izin pulang yang sudah melewati rencana kembali dan memerlukan pemeriksaan.',
				count: overduePermits,
				severity: 'error',
				href: '/administrasi/absensi/kegiatan/rekap'
			},
			{
				id: 'frequent-absence',
				title: 'Pola alfa atau terlambat berulang',
				description:
					'Murid dengan sedikitnya 3 catatan alfa/terlambat dalam 30 hari. Tinjau bukti sebelum mengambil keputusan.',
				count: frequentAbsence,
				severity: 'warning',
				href: '/analisis-peringatan#absensi'
			},
			{
				id: 'declining-scores',
				title: 'Indikasi penurunan nilai',
				description:
					'Nilai akhir terpantau turun minimal 5 poin dari nilai tengah semester. Indikator ini bukan keputusan otomatis.',
				count: decliningScores,
				severity: 'warning',
				href: '/analisis-peringatan#nilai'
			},
			{
				id: 'dorm-incomplete',
				title: 'Perkembangan keasramaan belum terisi',
				description: 'Murid aktif yang belum memiliki catatan asesmen keasramaan.',
				count: dormIncomplete,
				severity: 'info',
				href: '/analisis-peringatan#keasramaan'
			},
			{
				id: 'jp-deficit',
				title: 'Target JP mingguan belum tercapai',
				description:
					'Kombinasi kelas dan mata pelajaran yang masih di bawah target sesuai jenis jadwal.',
				count: jpDeficits,
				severity: 'warning',
				href: '/analisis-peringatan#jp'
			},
			{
				id: 'expiring-documents',
				title: 'Berkas mendekati kedaluwarsa',
				description: 'Dokumen pegawai/sekolah yang berakhir dalam 30 hari ke depan.',
				count: expiringDocuments,
				severity: 'warning',
				href: '/analisis-peringatan#berkas'
			},
			{
				id: 'communication-pending',
				title: 'Komunikasi menunggu persetujuan',
				description: 'Draf pemberitahuan belum boleh dikirim sebelum disetujui.',
				count: communicationPending,
				severity: 'info',
				href: '/komunikasi'
			},
			{
				id: 'important-announcements',
				title: 'Pengumuman penting aktif',
				description: 'Pengumuman sekolah atau asrama yang perlu segera dibaca.',
				count: importantAnnouncements,
				severity: 'warning',
				href: '/pengumuman'
			},
			{
				id: 'surat-pending',
				title: 'Surat menunggu persetujuan',
				description: 'Surat masuk atau keluar telah diajukan dan perlu diperiksa.',
				count: suratPending,
				severity: 'warning',
				href: '/surat-menyurat/arsip?status=diajukan'
			},
			{
				id: 'dinas-pending',
				title: 'Dinas luar menunggu persetujuan',
				description: 'Pengajuan perjalanan dinas belum diputuskan.',
				count: dinasPending,
				severity: 'warning',
				href: '/surat-menyurat/dinas-luar'
			},
			{
				id: 'approval-pending',
				title: 'Dokumen dalam alur persetujuan',
				description: 'Dokumen telah diajukan atau diperiksa dan menunggu keputusan berikutnya.',
				count: approvalPending,
				severity: 'warning',
				href: '/persetujuan?status=diajukan'
			},
			{
				id: 'sppd-draft',
				title: 'Draft SPPD belum diterbitkan',
				description: 'Lengkapi dan terbitkan SPPD yang masih berstatus draft.',
				count: sppdDraft,
				severity: 'info',
				href: '/surat-menyurat/sppd'
			},
			{
				id: 'foto-murid',
				title: 'Foto murid belum lengkap',
				description: 'Murid aktif pada semester berjalan yang belum memiliki foto.',
				count: fotoKosong,
				severity: 'info',
				href: '/murid'
			},
			{
				id: 'qr-murid',
				title: 'QR murid belum tersedia',
				description: 'Murid aktif pada semester berjalan yang belum mempunyai token QR.',
				count: qrKosong,
				severity: 'error',
				href: '/administrasi/absensi/kartu-qr'
			},
			{
				id: 'martikulasi',
				title: 'Nilai Martikulasi belum lengkap',
				description: 'Hasil Martikulasi belum siap untuk penerbitan STTM.',
				count: martikulasiBelum,
				severity: 'warning',
				href: '/asesmen-martikulasi'
			},
			{
				id: 'attendance-missing',
				title: 'Absensi hari ini belum lengkap',
				description: 'Murid aktif yang belum memiliki catatan absensi hari ini.',
				count: attendanceMissing,
				severity: 'warning',
				href: '/administrasi/absensi'
			},
			{
				id: 'score-missing',
				title: 'Murid belum memiliki nilai sumatif',
				description:
					'Murid aktif yang belum mempunyai satu pun isian nilai sumatif pada semester berjalan.',
				count: scoreMissing,
				severity: 'info',
				href: '/asesmen-sumatif'
			},
			{
				id: 'schedule-conflict',
				title: 'Potensi jadwal guru bentrok',
				description: 'Guru tercatat mengajar lebih dari satu kelas pada slot waktu yang sama.',
				count: scheduleConflicts,
				severity: 'error',
				href: '/rapor/jadwal-pelajaran'
			}
		] satisfies Notice[]
	).filter((notice) => notice.count > 0);

	return {
		meta: { title: 'Pusat Notifikasi' } satisfies PageMeta,
		notices,
		total: notices.reduce((sum, notice) => sum + notice.count, 0),
		generatedAt: new Date().toISOString()
	};
}

export async function load({ locals }) {
	authority('notifikasi_lihat');
	return _getNotificationData(locals);
}
import { activeMuridFilter } from '$lib/server/murid-query';
