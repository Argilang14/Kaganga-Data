import db from './db';
import { error } from '@sveltejs/kit';
import { canAttendance } from '$lib/attendance-access';
import { accessibleClassIds, studentAccessCondition } from './student-access';
import { loadMonitoringSnapshot } from './attendance-monitoring';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';
import { activeMuridFilter } from './murid-query';
import {
	tableKelas as k,
	tableMurid as m,
	tablePegawai as p,
	tablePresensiPegawai as attendance,
	tableKalenderPendidikan as calendar,
	tableJadwalPelajaran as schedule,
	tableJadwalJam as slots
} from './db/schema';
import { and, eq, inArray, sql, or, isNull, lte, gte, asc } from 'drizzle-orm';
import type { AcademicContext } from './db/academic';
import { loadJurnalScheduleContext } from './jurnal-mengajar';
import { isPresensiPegawaiWorkday } from './presensi-pegawai';
import { attendanceSummary, jakartaToday } from '$lib/dashboard-summary';
import { canAccessArea } from '$lib/menu-access';

export async function loadDashboardDaily(
	locals: App.Locals,
	academic: AcademicContext,
	searchParams = new URLSearchParams(),
	includeAgenda = false
) {
	const { user, sekolah } = locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	const schoolId = sekolah.id;
	if (user.type !== 'admin' && user.sekolahId !== schoolId)
		throw error(403, 'Sekolah di luar penugasan akun.');
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
	const allowed = new Set(await accessibleClassIds(user, schoolId, academic.activeSemesterId));
	const ids = classes.map((row) => row.id).filter((id) => allowed.has(id));
	const studentWhere = and(
		await studentAccessCondition(user, schoolId, academic.activeSemesterId),
		activeMuridFilter(),
		academic.activeSemesterId ? eq(m.semesterId, academic.activeSemesterId) : sql`0`,
		ids.length ? inArray(m.kelasId, ids) : sql`0`
	);
	const [student] = await db
		.select({
			total: sql<number>`count(*)`,
			photo: sql<number>`sum(case when trim(coalesce(${m.foto}, '')) = '' then 1 else 0 end)`,
			qr: sql<number>`sum(case when not exists (select 1 from qr_murid q where q.murid_id = ${m.id} and q.revoked_at is null) then 1 else 0 end)`
		})
		.from(m)
		.where(studentWhere);
	const sourceParams = new URLSearchParams({ tanggal: date, tab: 'sekolah' });
	if (searchParams.has('sumber_masuk'))
		sourceParams.set('sumber_masuk', searchParams.get('sumber_masuk')!);
	const snapshot =
		canAttendance(user, 'lihat') && user.type !== 'tim_dapur'
			? await loadMonitoringSnapshot(locals, sourceParams)
			: null;
	const entrance = snapshot?.summaries[0];
	const statuses = entrance
		? Object.entries(entrance.counts)
				.filter(([status, count]) => count > 0 && !['belum', 'tanpa_sumber'].includes(status))
				.map(([status, count]) => ({ status, count }))
		: [];
	const absences = [];
	for (const status of ['sakit', 'izin', 'alfa', 'izin_pulang'] as const) {
		const total = Number(statuses.find((row) => row.status === status)?.count ?? 0);
		const pageCount = Math.max(1, Math.ceil(total / 20));
		const requested = Number(searchParams.get(`${status}_page`) ?? 1);
		const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
		const students = (snapshot?.rows ?? [])
			.filter((row) => row.cells[0].status === status)
			.slice((page - 1) * 20, page * 20)
			.map(({ id, nama, kelas }) => ({ id, nama, kelas }));
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
		scope: hasSchoolWideOperationalAccess(user) ? 'Sekolah' : 'Penugasan Anda',
		jenis: context?.jenisLabel ?? '-',
		students: snapshot ? attendanceSummary(snapshot.rows.length, statuses) : null,
		studentSource: entrance ? { source: entrance.source, label: entrance.sourceLabel } : null,
		sourceOptions: snapshot?.sourceOptions[0].options ?? [],
		monitoringHref: snapshot ? `/administrasi/absensi/monitoring?${sourceParams}` : null,
		generatedAt: new Date().toISOString(),
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
