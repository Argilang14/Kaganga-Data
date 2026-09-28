import { jakartaToday } from '$lib/dashboard-summary';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableAbsensiHarian,
	tableAsesmenKeasramaan,
	tableAsesmenSumatif,
	tableDocumentApproval,
	tableKelas,
	tableMurid,
	tablePegawai,
	tablePresensiPegawai,
	tableQrMurid
} from '$lib/server/db/schema';
import { inferKelasJadwalJenjang, JADWAL_JENJANG, type JadwalJenjang } from '$lib/server/jadwal';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

const safePercent = (value: number, total: number) =>
	total > 0 ? Math.round((value / total) * 100) : 0;

export async function load({ locals, url }) {
	authority('pimpinan_lihat');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const allClasses = academic.activeSemesterId
		? await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true, waliKelasId: true },
				with: { waliKelas: { columns: { nama: true } } },
				where: and(
					eq(tableKelas.sekolahId, sekolahId),
					eq(tableKelas.semesterId, academic.activeSemesterId)
				),
				orderBy: asc(tableKelas.nama)
			})
		: [];
	const classOptions = allClasses.map((item) => ({
		...item,
		jenjang: inferKelasJadwalJenjang(item)
	}));
	const requestedJenjang = url.searchParams.get('jenjang') ?? '';
	const jenjang = JADWAL_JENJANG.includes(requestedJenjang as JadwalJenjang)
		? (requestedJenjang as JadwalJenjang)
		: '';
	const requestedClassId = Number(url.searchParams.get('kelas') ?? 0);
	const filteredByLevel = jenjang
		? classOptions.filter((item) => item.jenjang === jenjang)
		: classOptions;
	const kelasId = filteredByLevel.some((item) => item.id === requestedClassId)
		? requestedClassId
		: 0;
	const selectedClasses = kelasId
		? filteredByLevel.filter((item) => item.id === kelasId)
		: filteredByLevel;
	const classIds = selectedClasses.map((item) => item.id);
	const students = classIds.length
		? await db.query.tableMurid.findMany({
				columns: { id: true, kelasId: true, foto: true, qrToken: true },
				where: and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.kelasId, classIds))
			})
		: [];
	const studentIds = students.map((item) => item.id);
	const today = jakartaToday();
	const [
		studentAttendance,
		employeeRows,
		employeeAttendance,
		academicRows,
		dormitoryRows,
		approvals,
		qrRows
	] = await Promise.all([
		studentIds.length
			? db
					.select({ muridId: tableAbsensiHarian.muridId, status: tableAbsensiHarian.status })
					.from(tableAbsensiHarian)
					.where(
						and(
							eq(tableAbsensiHarian.sekolahId, sekolahId),
							eq(tableAbsensiHarian.tanggal, today),
							inArray(tableAbsensiHarian.muridId, studentIds)
						)
					)
			: Promise.resolve([]),
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, jenis: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif'))
		}),
		db
			.select({ pegawaiId: tablePresensiPegawai.pegawaiId, status: tablePresensiPegawai.status })
			.from(tablePresensiPegawai)
			.where(
				and(eq(tablePresensiPegawai.sekolahId, sekolahId), eq(tablePresensiPegawai.tanggal, today))
			),
		studentIds.length
			? db
					.selectDistinct({ muridId: tableAsesmenSumatif.muridId })
					.from(tableAsesmenSumatif)
					.where(inArray(tableAsesmenSumatif.muridId, studentIds))
			: Promise.resolve([]),
		studentIds.length
			? db
					.selectDistinct({ muridId: tableAsesmenKeasramaan.muridId })
					.from(tableAsesmenKeasramaan)
					.where(inArray(tableAsesmenKeasramaan.muridId, studentIds))
			: Promise.resolve([]),
		db
			.select({ status: tableDocumentApproval.status, total: sql<number>`count(*)` })
			.from(tableDocumentApproval)
			.where(eq(tableDocumentApproval.sekolahId, sekolahId))
			.groupBy(tableDocumentApproval.status),
		studentIds.length
			? db
					.selectDistinct({ muridId: tableQrMurid.muridId })
					.from(tableQrMurid)
					.where(and(inArray(tableQrMurid.muridId, studentIds), isNull(tableQrMurid.revokedAt)))
			: Promise.resolve([])
	]);

	const attendanceCount = (status: string) =>
		studentAttendance.filter((row) => row.status === status).length;
	const employeeCount = (status: string) =>
		employeeAttendance.filter((row) => row.status === status).length;
	const pendingDocuments = approvals
		.filter((row) => ['diajukan', 'diperiksa', 'disetujui'].includes(row.status))
		.reduce((sum, row) => sum + Number(row.total), 0);
	const academicAssessed = new Set(academicRows.map((row) => row.muridId)).size;
	const dormitoryAssessed = new Set(dormitoryRows.map((row) => row.muridId)).size;
	const activeQr = new Set(qrRows.map((row) => row.muridId));
	const classSummary = selectedClasses.map((kelas) => {
		const classStudents = students.filter((student) => student.kelasId === kelas.id);
		const ids = new Set(classStudents.map((student) => student.id));
		return {
			id: kelas.id,
			nama: kelas.nama,
			jenjang: kelas.jenjang,
			waliKelas: kelas.waliKelas?.nama ?? '-',
			murid: classStudents.length,
			hadir: studentAttendance.filter(
				(row) => ids.has(row.muridId) && ['hadir', 'terlambat'].includes(row.status)
			).length,
			tidakHadir: studentAttendance.filter(
				(row) => ids.has(row.muridId) && ['sakit', 'izin', 'alfa'].includes(row.status)
			).length,
			belumDiisi: Math.max(
				0,
				classStudents.length - studentAttendance.filter((row) => ids.has(row.muridId)).length
			)
		};
	});

	return {
		meta: { title: 'Dashboard Pimpinan' } satisfies PageMeta,
		context: {
			tahunAjaran:
				academic.tahunAjaranList.find((item) => item.id === academic.activeTahunAjaranId)?.nama ??
				'-',
			semester: academic.activeSemesterTipe ?? '-',
			tanggal: today
		},
		filters: { jenjang, kelasId },
		classes: classOptions,
		summary: {
			classes: selectedClasses.length,
			students: students.length,
			employees: employeeRows.length,
			studentAttendance: {
				hadir: attendanceCount('hadir') + attendanceCount('terlambat'),
				sakit: attendanceCount('sakit'),
				izin: attendanceCount('izin'),
				alfa: attendanceCount('alfa'),
				belum: Math.max(0, students.length - studentAttendance.length)
			},
			employeeAttendance: {
				hadir: employeeCount('hadir'),
				tidakHadir: employeeAttendance.filter((row) => row.status !== 'hadir').length,
				belum: Math.max(0, employeeRows.length - employeeAttendance.length)
			},
			academic: {
				completed: academicAssessed,
				total: students.length,
				percentage: safePercent(academicAssessed, students.length)
			},
			dormitory: {
				completed: dormitoryAssessed,
				total: students.length,
				percentage: safePercent(dormitoryAssessed, students.length)
			},
			completeness: {
				photo: students.filter((item) => Boolean(item.foto?.trim())).length,
				qr: students.filter((item) => Boolean(item.qrToken?.trim()) || activeQr.has(item.id)).length
			},
			pendingDocuments
		},
		classSummary
	};
}
