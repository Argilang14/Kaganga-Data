import { monitoringSlots } from './attendance-monitoring.ts';

export type AttendanceReportView = 'monitoring' | 'rekap';

export function attendanceReportClasses(
	kelasList: Array<{ id: number }>,
	requested: string | null
) {
	const allKelas = requested === 'all';
	const requestedId = Number(requested);
	const kelasId = allKelas
		? null
		: (kelasList.find((kelas) => kelas.id === requestedId)?.id ?? kelasList[0]?.id ?? null);
	return {
		allKelas,
		kelasId,
		kelasIds: allKelas ? kelasList.map((kelas) => kelas.id) : kelasId ? [kelasId] : []
	};
}

export function attendanceReportSearch(
	view: AttendanceReportView,
	filters: { date: string; classId?: number | null; activityId?: number | null }
) {
	const params = new URLSearchParams();
	if (view === 'monitoring') params.set('tanggal', filters.date);
	else {
		params.set('tanggal_awal', filters.date);
		params.set('tanggal_akhir', filters.date);
		if (filters.activityId && filters.activityId > 0 && Number.isSafeInteger(filters.activityId))
			params.set('kegiatan_id', String(filters.activityId));
	}
	if (filters.classId && filters.classId > 0 && Number.isSafeInteger(filters.classId))
		params.set('kelas_id', String(filters.classId));
	else if (view === 'rekap' && filters.classId === null) params.set('kelas_id', 'all');
	return `?${params}`;
}

export function attendanceMenuPath(path: string) {
	return path.replace(/\/+$/, '');
}

export type AttendanceReportContext = {
	monitoring?: {
		date: string;
		classId: number | null;
		focus: string;
		columns: Array<{ key: string; activityId: number | null }>;
	};
	tanggalAkhir?: string;
	kelasId?: number | null;
	kegiatanId?: number | null;
	kegiatanList?: Array<{ id: number; kode: string; kategori: string }>;
};

export function attendanceReportMenuLink(
	path: string | undefined,
	currentPath: string,
	search: string,
	data: AttendanceReportContext
) {
	const monitoringPath = '/administrasi/absensi/monitoring';
	const recapPath = '/administrasi/absensi/kegiatan/rekap';
	const current = attendanceMenuPath(currentPath);
	if (
		![monitoringPath, recapPath].includes(path ?? '') ||
		![monitoringPath, recapPath].includes(current)
	)
		return path;
	if (path === current) return path + search;
	if (current === monitoringPath && data.monitoring) {
		const snapshot = data.monitoring;
		return (
			path +
			attendanceReportSearch('rekap', {
				date: snapshot.date,
				classId: snapshot.classId,
				activityId: snapshot.columns.find((column) => column.key === snapshot.focus)?.activityId
			})
		);
	}
	if (current === recapPath && data.tanggalAkhir) {
		const params = new URLSearchParams(
			attendanceReportSearch('monitoring', {
				date: data.tanggalAkhir,
				classId: data.kelasId
			})
		);
		const activity = data.kegiatanList?.find((item) => item.id === data.kegiatanId);
		const slot =
			activity &&
			(monitoringSlots.find(
				(item) => item.code === activity.kode && item.category === activity.kategori
			) ??
				monitoringSlots.find((item) => item.category === activity.kategori));
		if (activity && slot) {
			params.set('tab', slot.tab);
			params.set('kolom', slot.key);
			params.set(`sumber_${slot.key}`, String(activity.id));
		}
		return `${path}?${params}`;
	}
	return path;
}
