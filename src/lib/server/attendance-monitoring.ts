import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, lte, gte, or, isNull, ne } from 'drizzle-orm';
import db from './db';
import { canAttendance, canAttendActivity, attendanceDateAllowed } from '$lib/attendance-access';
import { canAccessMenu } from '$lib/role-menu-access';
import {
	availableMonitoringTabs,
	resolveMonitoringColumns,
	buildMonitoringRows,
	monitoringCounts,
	monitoringStatusLabels,
	monitoringSlots,
	monitoringToday,
	normalizeMonitoringTab,
	type MonitoringRecord,
	type MonitoringTab
} from '$lib/attendance-monitoring';
import {
	connectSchoolDormRows,
	summarizeSchoolDorm,
	matchesSchoolDormFilter,
	schoolDormFilters,
	type SchoolDormFilter
} from '$lib/attendance-school-dorm';
import { ensureDefaultAbsensiKegiatan } from './absensi-kegiatan';
import { inferSummaryLevel, isSummaryDate } from '$lib/attendance-summary';
import { loadAbsensiKelasOptions } from './absensi-digital';
import { studentAccessCondition } from './attendance-student-access';
import { activeMuridFilter } from './murid-query';
import {
	tableMurid as m,
	tableKegiatanAbsensi as activity,
	tableAbsensiKegiatan as a,
	tableAbsensiHarian as daily,
	tableIzinPulangMurid as permit
} from './db/schema';

export async function loadMonitoringSnapshot(locals: App.Locals, params: URLSearchParams) {
	const { user, sekolah } = locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	if (user.type !== 'admin' && user.sekolahId !== sekolah.id)
		throw error(403, 'Sekolah di luar penugasan akun.');
	if (!canAttendance(user, 'lihat')) throw error(403, 'Izin melihat absensi belum diberikan.');
	const date = params.get('tanggal') ?? monitoringToday();
	if (!isSummaryDate(date) || date > monitoringToday())
		throw error(400, 'Pilih tanggal valid, bukan tanggal mendatang.');
	// A kitchen account never receives non-meal activity metadata, even with a forged tab.
	const mealsOnly = user.type === 'tim_dapur';
	const tabs = availableMonitoringTabs(mealsOnly);
	const requestedTab = normalizeMonitoringTab(params.get('tab'));
	if (requestedTab && !tabs.some((item) => item.key === requestedTab))
		throw error(403, 'Tab monitoring di luar akses akun.');
	const tab = (requestedTab ?? tabs[0].key) as MonitoringTab;
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolah.id, user);
	const classes = kelasList.map((kelas) => ({
		...kelas,
		jenjang: inferSummaryLevel(kelas, sekolah.jenjangPendidikan)
	}));
	const level = params.get('jenjang') ?? 'semua';
	if (!['semua', 'sd', 'smp', 'sma', 'unknown'].includes(level))
		throw error(400, 'Jenjang tidak valid.');
	const classValue = params.get('kelas_id') ?? '';
	const classId = classValue ? Number(classValue) : null;
	if (
		classValue &&
		(!Number.isSafeInteger(classId) || !classes.some((item) => item.id === classId))
	)
		throw error(403, 'Kelas di luar penugasan atau semester aktif.');
	if (
		classId &&
		level !== 'semua' &&
		!classes.some((item) => item.id === classId && item.jenjang === level)
	)
		throw error(400, 'Kelas tidak sesuai jenjang yang dipilih.');
	const selectedClasses = classes.filter(
		(item) => (level === 'semua' || item.jenjang === level) && (!classId || item.id === classId)
	);
	if (!mealsOnly)
		await ensureDefaultAbsensiKegiatan(sekolah.id, ['asrama_berangkat', 'asrama_tiba']);
	const activities = await db.query.tableKegiatanAbsensi.findMany({
		columns: { id: true, nama: true, kode: true, kategori: true, jamMulai: true, aksesEdit: true },
		where: and(
			eq(activity.sekolahId, sekolah.id),
			eq(activity.aktif, true),
			mealsOnly ? eq(activity.kategori, 'makan') : undefined
		),
		orderBy: [asc(activity.urutan), asc(activity.nama)]
	});
	let columns, queryColumns;
	const connected = tab === 'sekolah' || tab === 'asrama';
	try {
		columns = resolveMonitoringColumns(tab, activities, params);
		queryColumns = connected
			? [
					...resolveMonitoringColumns('sekolah', activities, params),
					...resolveMonitoringColumns('asrama', activities, params)
				]
			: columns;
	} catch {
		throw error(400, 'Sumber kegiatan tidak tersedia atau tidak sesuai kategori.');
	}
	const students =
		academic.activeSemesterId && selectedClasses.length
			? await db.query.tableMurid.findMany({
					columns: { id: true, nama: true, kelasId: true },
					where: and(
						await studentAccessCondition(user, sekolah.id, academic.activeSemesterId),
						activeMuridFilter(),
						inArray(
							m.kelasId,
							selectedClasses.map((item) => item.id)
						)
					),
					orderBy: [asc(m.nama), asc(m.id)]
				})
			: [];
	const ids = students.map((item) => item.id);
	const activityIds = [
		...new Set(queryColumns.flatMap((column) => (column.activityId ? [column.activityId] : [])))
	];
	const records: MonitoringRecord[] =
		ids.length && activityIds.length
			? await db.query.tableAbsensiKegiatan.findMany({
					columns: {
						id: true,
						muridId: true,
						kegiatanId: true,
						status: true,
						waktuScan: true,
						metode: true,
						updatedAt: true,
						createdAt: true
					},
					where: and(
						eq(a.sekolahId, sekolah.id),
						eq(a.semesterId, academic.activeSemesterId!),
						eq(a.tanggal, date),
						inArray(
							a.kelasId,
							selectedClasses.map((item) => item.id)
						),
						inArray(a.muridId, ids),
						inArray(a.kegiatanId, activityIds)
					)
				})
			: [];
	if (!mealsOnly && ids.length && queryColumns.some((column) => column.source === 'harian')) {
		const rows = await db.query.tableAbsensiHarian.findMany({
			columns: {
				id: true,
				muridId: true,
				status: true,
				waktuScan: true,
				metode: true,
				updatedAt: true,
				createdAt: true
			},
			where: and(
				eq(daily.sekolahId, sekolah.id),
				eq(daily.semesterId, academic.activeSemesterId!),
				eq(daily.tanggal, date),
				inArray(
					daily.kelasId,
					selectedClasses.map((item) => item.id)
				),
				inArray(daily.muridId, ids)
			)
		});
		records.push(...rows.map((row) => ({ ...row, kegiatanId: null })));
	}
	const permits =
		ids.length && academic.activeTahunAjaranId
			? await db.query.tableIzinPulangMurid.findMany({
					columns: {
						muridId: true,
						tanggalKeluar: true,
						waktuKeluar: true,
						tanggalKembali: true,
						waktuKembali: true
					},
					where: and(
						eq(permit.sekolahId, sekolah.id),
						eq(permit.tahunAjaranId, academic.activeTahunAjaranId),
						eq(permit.semesterId, academic.activeSemesterId!),
						inArray(permit.muridId, ids),
						ne(permit.status, 'dibatalkan'),
						lte(permit.tanggalKeluar, date),
						or(isNull(permit.tanggalKembali), gte(permit.tanggalKembali, date))
					)
				})
			: [];
	const names = new Map(classes.map((item) => [item.id, item.nama]));
	const rawRows = buildMonitoringRows({
		date,
		columns: queryColumns,
		records,
		permits,
		students: students.map((item) => ({ ...item, kelas: names.get(item.kelasId) ?? '-' }))
	});
	const connectedRows = connected
		? connectSchoolDormRows(rawRows, queryColumns)
		: rawRows.map((row) => ({ ...row, journeys: [] }));
	const rows = connectedRows.map((row) => ({
		...row,
		cells: columns.map(
			(column) => row.cells[queryColumns.findIndex((item) => item.key === column.key)]
		)
	}));
	const linkedColumns = columns.map((column) => {
		const source = activities.find((item) => item.id === column.activityId);
		const entryPath =
			column.source === 'harian'
				? '/administrasi/absensi'
				: column.activityId
					? '/administrasi/absensi/kegiatan'
					: null;
		const canRecord =
			!!entryPath &&
			canAccessMenu(user, entryPath) &&
			attendanceDateAllowed(user, date, monitoringToday()) &&
			(column.source === 'harian'
				? canAttendActivity(user, 'sekolah')
				: !!source &&
					canAttendActivity(user, source.aksesEdit, source.kategori, {
						kode: source.kode,
						tanggal: date
					}));
		return {
			...column,
			entryPath: canRecord ? entryPath : null,
			recapPath:
				column.activityId && canAccessMenu(user, '/administrasi/absensi/kegiatan/rekap')
					? '/administrasi/absensi/kegiatan/rekap'
					: null
		};
	});
	return {
		date,
		today: monitoringToday(),
		tab,
		tabs,
		classes,
		level,
		classId,
		columns: linkedColumns,
		rows,
		connection: connected ? summarizeSchoolDorm(rows) : null,
		sourceOptions: columns.map((column) => ({
			key: column.key,
			options: activities
				.filter(
					(item) =>
						item.kategori === monitoringSlots.find((slot) => slot.key === column.key)!.category
				)
				.map(({ id, nama }) => ({ id, nama }))
		})),
		summaries: linkedColumns.map((column, columnIndex) => ({
			...column,
			counts: monitoringCounts(rows, columnIndex)
		})),
		activeSemesterId: academic.activeSemesterId,
		generatedAt: new Date().toISOString()
	};
}

export async function loadAttendanceMonitoring(locals: App.Locals, params: URLSearchParams) {
	const snapshot = await loadMonitoringSnapshot(locals, params);
	const { rows, columns } = snapshot;
	const focus = params.get('kolom') ?? columns[0].key;
	const index = columns.findIndex((column) => column.key === focus);
	if (index < 0) throw error(400, 'Kolom monitoring tidak valid.');
	const status = params.get('status') ?? '';
	if (status && !Object.hasOwn(monitoringStatusLabels, status))
		throw error(400, 'Status monitoring tidak valid.');
	const query = (params.get('q') ?? '').trim().slice(0, 100);
	const travel = params.get('perjalanan') ?? '';
	if (!schoolDormFilters.includes(travel as SchoolDormFilter) || (travel && !snapshot.connection))
		throw error(400, 'Filter perjalanan tidak valid untuk tab ini.');
	const filtered = rows.filter(
		(row) =>
			(!query || row.nama.toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id'))) &&
			(!status || row.cells[index].status === status) &&
			matchesSchoolDormFilter(row.journeys, travel as SchoolDormFilter)
	);
	const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
	const requestedPage = Number(params.get('page') ?? 1);
	const page = Math.min(
		pageCount,
		Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1
	);
	return {
		...snapshot,
		total: rows.length,
		matched: filtered.length,
		rows: filtered.slice((page - 1) * 30, page * 30),
		page,
		pageCount,
		query,
		travel,
		status,
		focus,
		statusLabels: monitoringStatusLabels
	};
}
