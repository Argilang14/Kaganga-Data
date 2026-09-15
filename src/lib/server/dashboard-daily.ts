import db from './db';
import {
	tableKelas as k,
	tableMurid as m,
	tableAuthUserKelas as assignments,
	tablePegawai as p,
	tableAbsensiHarian as a,
	tablePresensiPegawai as attendance,
	tableKalenderPendidikan as calendar,
	tableJadwalPelajaran as schedule,
	tableJadwalJam as slots
} from './db/schema';
import { and, eq, inArray, sql, or, isNull, lte, gte, asc } from 'drizzle-orm';
import type { AcademicContext } from './db/academic';
import { guardianStudentCondition } from './assignment-summary';
import { getLegacyWaliKelasIds } from './legacy-wali-kelas';
import { loadJurnalScheduleContext } from './jurnal-mengajar';
import { isPresensiPegawaiWorkday } from './presensi-pegawai';
import { attendanceSummary, jakartaToday } from '$lib/dashboard-summary';
import { canAccessArea } from '$lib/menu-access';

export async function loadDashboardDaily(
	user: App.Locals['user'],
	schoolId: number,
	academic: AcademicContext,
	searchParams = new URLSearchParams(),
	includeAgenda = false
) {
	const date = jakartaToday();
	const classes =
		academic.activeSemesterId && academic.activeTahunAjaranId
			? await db.query.tableKelas.findMany({
					columns: { id: true, waliKelasId: true },
					where: and(
						eq(k.sekolahId, schoolId),
						eq(k.semesterId, academic.activeSemesterId),
						eq(k.tahunAjaranId, academic.activeTahunAjaranId)
					)
				})
			: [];
	let ids = classes.map((row) => row.id);
	if (user?.type !== 'admin') {
		if (user?.type === 'wali_kelas') {
			const allowed = new Set(
				await getLegacyWaliKelasIds(user, schoolId, academic.activeSemesterId)
			);
			ids = ids.filter((id) => allowed.has(id));
		} else if (!['wali_asuh', 'wali_asrama'].includes(user?.type ?? '')) {
			const assigned = user
				? await db.query.tableAuthUserKelas.findMany({
						columns: { kelasId: true },
						where: eq(assignments.authUserId, user.id)
					})
				: [];
			const selected = new Set(assigned.map((row) => row.kelasId));
			ids = ids.filter((id) => selected.has(id));
		}
	}
	const studentWhere = and(
		eq(m.sekolahId, schoolId),
		academic.activeSemesterId ? eq(m.semesterId, academic.activeSemesterId) : sql`0`,
		ids.length ? inArray(m.kelasId, ids) : sql`0`,
		await guardianStudentCondition(user, schoolId)
	);
	if (['wali_asuh', 'wali_asrama'].includes(user?.type ?? '')) {
		const assignedClasses = await db.selectDistinct({ id: m.kelasId }).from(m).where(studentWhere);
		ids = assignedClasses.map((row) => row.id);
	}
	const [student] = await db
		.select({
			total: sql<number>`count(*)`,
			photo: sql<number>`sum(case when trim(coalesce(${m.foto}, '')) = '' then 1 else 0 end)`,
			qr: sql<number>`sum(case when not exists (select 1 from qr_murid q where q.murid_id = ${m.id} and q.revoked_at is null) then 1 else 0 end)`
		})
		.from(m)
		.where(studentWhere);
	const statuses = await db
		.select({ status: a.status, count: sql<number>`count(*)` })
		.from(a)
		.innerJoin(m, eq(a.muridId, m.id))
		.where(
			and(
				studentWhere,
				eq(a.sekolahId, schoolId),
				eq(a.tanggal, date),
				eq(a.semesterId, academic.activeSemesterId ?? -1)
			)
		)
		.groupBy(a.status);
	const absences = [];
	for (const status of ['sakit', 'izin', 'alfa'] as const) {
		const total = Number(statuses.find((row) => row.status === status)?.count ?? 0);
		const pageCount = Math.max(1, Math.ceil(total / 20));
		const requested = Number(searchParams.get(`${status}_page`) ?? 1);
		const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
		const students = total
			? await db
					.select({ id: m.id, nama: m.nama, kelas: k.nama })
					.from(a)
					.innerJoin(m, eq(a.muridId, m.id))
					.innerJoin(k, eq(m.kelasId, k.id))
					.where(
						and(
							studentWhere,
							eq(a.sekolahId, schoolId),
							eq(k.sekolahId, schoolId),
							eq(a.semesterId, academic.activeSemesterId ?? -1),
							eq(a.tanggal, date),
							eq(a.status, status)
						)
					)
					.orderBy(asc(m.nama), asc(m.id))
					.limit(20)
					.offset((page - 1) * 20)
			: [];
		const pageLink = (number: number) => {
			const params = new URLSearchParams(searchParams);
			params.set(`${status}_page`, String(number));
			return `/?${params}#absensi-hari-ini`;
		};
		absences.push({
			status,
			total,
			students,
			page,
			pageCount,
			previous: page > 1 ? pageLink(page - 1) : null,
			next: page < pageCount ? pageLink(page + 1) : null
		});
	}
	const canEmployees =
		user?.type === 'admin' || user?.permissions?.includes('administrasi_presensi_pegawai');
	const employeeWhere = and(eq(p.sekolahId, schoolId), eq(p.status, 'aktif'));
	const [employee] = canEmployees
		? await db
				.select({
					total: sql<number>`count(*)`,
					missing: sql<number>`sum(case when trim(${p.nama}) = '' or trim(${p.jenis}) = '' then 1 else 0 end)`
				})
				.from(p)
				.where(employeeWhere)
		: [];
	const employeeStatuses = canEmployees
		? await db
				.select({ status: attendance.status, count: sql<number>`count(*)` })
				.from(attendance)
				.innerJoin(p, eq(attendance.pegawaiId, p.id))
				.where(and(employeeWhere, eq(attendance.sekolahId, schoolId), eq(attendance.tanggal, date)))
				.groupBy(attendance.status)
		: [];
	const workday = await isPresensiPegawaiWorkday(schoolId, date);
	const context = includeAgenda ? await loadJurnalScheduleContext(schoolId, academic, date) : null;
	const canAgenda =
		includeAgenda && (user?.type === 'admin' || ['user', 'wali_kelas'].includes(user?.type ?? ''));
	const events = includeAgenda
		? await db
				.select({ title: calendar.judul, kind: calendar.jenis })
				.from(calendar)
				.where(
					and(
						eq(calendar.sekolahId, schoolId),
						eq(calendar.tahunAjaranId, academic.activeTahunAjaranId ?? -1),
						or(
							isNull(calendar.semesterId),
							eq(calendar.semesterId, academic.activeSemesterId ?? -1)
						),
						lte(calendar.tanggalMulai, date),
						gte(calendar.tanggalSelesai, date),
						user?.type === 'admin'
							? undefined
							: ids.length
								? inArray(calendar.kelasId, ids)
								: sql`0`
					)
				)
				.orderBy(asc(calendar.judul))
				.limit(10)
		: [];
	const calendarHoliday = await db.query.tableKalenderPendidikan.findFirst({
		columns: { id: true },
		where: and(
			eq(calendar.sekolahId, schoolId),
			eq(calendar.tahunAjaranId, academic.activeTahunAjaranId ?? -1),
			or(isNull(calendar.semesterId), eq(calendar.semesterId, academic.activeSemesterId ?? -1)),
			isNull(calendar.kelasId),
			eq(calendar.jenjang, 'semua'),
			inArray(calendar.jenis, ['libur_nasional', 'libur_sekolah']),
			lte(calendar.tanggalMulai, date),
			gte(calendar.tanggalSelesai, date)
		)
	});
	const holiday = !workday.isWorkday || Boolean(calendarHoliday);
	const day = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][
		new Date(`${date}T12:00:00+07:00`).getUTCDay()
	];
	const lessons =
		canAgenda && !holiday && ids.length && context?.templateIds.length
			? await db
					.select({
						title: schedule.kodeKegiatan,
						kelas: k.nama,
						kelasId: k.id,
						start: slots.pukulMulai,
						end: slots.pukulSelesai
					})
					.from(schedule)
					.innerJoin(k, eq(schedule.kelasId, k.id))
					.innerJoin(slots, eq(schedule.jamId, slots.id))
					.where(
						and(
							eq(schedule.sekolahId, schoolId),
							eq(k.sekolahId, schoolId),
							eq(slots.sekolahId, schoolId),
							inArray(schedule.kelasId, ids),
							inArray(schedule.templateId, context.templateIds),
							eq(schedule.hari, day),
							sql`${schedule.tipe} <> 'kosong'`
						)
					)
					.orderBy(asc(slots.pukulMulai), asc(k.nama))
					.limit(20)
			: [];
	return {
		date,
		holiday,
		admin: user?.type === 'admin',
		canAgenda,
		jenisKey: context?.jenis ?? 'ganjil',
		scope: user?.type === 'admin' ? 'Sekolah' : 'Penugasan Anda',
		jenis: context?.jenisLabel ?? '-',
		students: attendanceSummary(Number(student?.total ?? 0), statuses),
		absences,
		employees: canEmployees
			? attendanceSummary(Number(employee?.total ?? 0), employeeStatuses)
			: null,
		events,
		lessons,
		missing: {
			photo: Number(student?.photo ?? 0),
			qr: Number(student?.qr ?? 0),
			homeroom: canAccessArea(user, 'kelas')
				? classes.filter((row) => ids.includes(row.id) && !row.waliKelasId).length
				: null,
			employee: canEmployees ? Number(employee?.missing ?? 0) : null
		}
	};
}
