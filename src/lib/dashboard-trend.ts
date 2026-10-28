import type { MonitoringStatus } from './attendance-monitoring.ts';

export function dashboardTrendDates(today: string) {
	const end = new Date(`${today}T12:00:00Z`);
	return Array.from({ length: 7 }, (_, index) => {
		const day = new Date(end);
		day.setUTCDate(day.getUTCDate() - 6 + index);
		return day.toISOString().slice(0, 10);
	});
}

export function dashboardTrendPoint(
	date: string,
	rows: Array<{ id: number; cells: Array<{ status: MonitoringStatus }> }>
) {
	const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
	const present = unique.filter((row) =>
		['hadir', 'terlambat', 'pulang'].includes(row.cells[0]?.status)
	).length;
	const recorded = unique.filter(
		(row) => row.cells[0] && !['belum', 'tanpa_sumber'].includes(row.cells[0].status)
	).length;
	return {
		date,
		total: unique.length,
		present,
		recorded,
		unrecorded: unique.length - recorded,
		rate: recorded && unique.length ? Math.round((present / unique.length) * 100) : null
	};
}

export type DashboardTrend = {
	source: string;
	generatedAt: string;
	series: Array<{ level: string; points: ReturnType<typeof dashboardTrendPoint>[] }>;
};
