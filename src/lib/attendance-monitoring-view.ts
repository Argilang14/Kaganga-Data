import type { MonitoringStatus } from './attendance-monitoring.ts';

export function monitoringOverview(counts: Record<MonitoringStatus, number>, total: number) {
	const present = counts.hadir + counts.terlambat + counts.pulang;
	const absent = counts.sakit + counts.izin + counts.izin_pulang + counts.alfa;
	const pending = counts.belum + counts.tanpa_sumber;
	const recorded = present + absent;
	return {
		present,
		absent,
		pending,
		recorded,
		percentage: total > 0 ? Math.min(100, Math.round((recorded / total) * 100)) : 0
	};
}
