import type { MonitoringStatus } from './attendance-monitoring.ts';

export function canViewLeadershipDashboard(
	user?: { type?: string | null; permissions?: readonly string[] | null } | null
) {
	return user?.type === 'admin' || user?.permissions?.includes('pimpinan_lihat') === true;
}

export type DashboardClass = {
	id: number;
	nama: string;
	jenjang: string;
	waliKelas: string;
};

export function dashboardClassSummary(
	classes: DashboardClass[],
	rows: Array<{ id: number; kelasId: number; cells: Array<{ status: MonitoringStatus }> }>
) {
	const grouped = new Map(
		classes.map((kelas) => [
			kelas.id,
			{ ...kelas, total: 0, hadir: 0, tidakHadir: 0, belum: 0, recorded: 0, percentage: 0 }
		])
	);
	const seen = new Set<number>();
	for (const row of rows) {
		const kelas = grouped.get(row.kelasId);
		if (!kelas || seen.has(row.id)) continue;
		seen.add(row.id);
		kelas.total++;
		const status = row.cells[0]?.status;
		if (status && ['hadir', 'terlambat', 'pulang'].includes(status)) kelas.hadir++;
		else if (status && ['sakit', 'izin', 'izin_pulang', 'alfa'].includes(status))
			kelas.tidakHadir++;
		else kelas.belum++;
	}
	return [...grouped.values()].map((kelas) => ({
		...kelas,
		recorded: kelas.hadir + kelas.tidakHadir,
		percentage: kelas.total ? Math.round(((kelas.hadir + kelas.tidakHadir) / kelas.total) * 100) : 0
	}));
}

export function legacyDashboardHref(params: URLSearchParams) {
	const result = new URLSearchParams(params);
	const level = result.get('jenjang');
	const levels: Record<string, string> = { srd: 'sd', srmp: 'smp', srma: 'sma' };
	if (level && levels[level]) result.set('jenjang', levels[level]);
	if (result.has('kelas') && !result.has('kelas_id')) {
		const value = result.get('kelas');
		if (value && value !== '0') result.set('kelas_id', value);
	}
	result.delete('kelas');
	return `/${result.size ? `?${result}` : ''}#pengawasan-kelas`;
}
