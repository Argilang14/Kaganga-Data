export type AttendanceReportView = 'monitoring' | 'rekap';

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
	return `?${params}`;
}

export function attendanceMenuPath(path: string) {
	const normalized = path.replace(/\/+$/, '');
	return normalized === '/administrasi/absensi/kegiatan/rekap'
		? '/administrasi/absensi/monitoring'
		: normalized;
}
