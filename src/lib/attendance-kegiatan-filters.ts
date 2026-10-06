export type AttendanceKegiatanFilters = {
	tanggal: string;
	kelasId: number | null;
	kegiatanId: number | null;
};

export function attendanceKegiatanSearch(filters: AttendanceKegiatanFilters) {
	const params = new URLSearchParams({ tanggal: filters.tanggal });
	if (filters.kelasId !== null) params.set('kelas_id', String(filters.kelasId));
	if (filters.kegiatanId !== null) params.set('kegiatan_id', String(filters.kegiatanId));
	return params;
}

export function attendanceKegiatanAction(
	action: 'updateManual' | 'bulkUpdateManual' | 'clearStatus',
	filters: AttendanceKegiatanFilters
) {
	return `?/${action}&${attendanceKegiatanSearch(filters).toString()}`;
}
