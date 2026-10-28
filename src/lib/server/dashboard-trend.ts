import { error } from '@sveltejs/kit';
import { canAttendance } from '$lib/attendance-access';
import { canViewLeadershipDashboard } from '$lib/dashboard-leadership';
import { jakartaToday } from '$lib/dashboard-summary';
import {
	dashboardTrendDates,
	dashboardTrendPoint,
	type DashboardTrend
} from '$lib/dashboard-trend';
import { resolveSekolahAcademicContext } from './db/academic';
import { accessibleClassIds } from './student-access';
import { loadMonitoringSnapshot } from './attendance-monitoring';

export async function loadDashboardTrend(
	locals: App.Locals,
	search: URLSearchParams
): Promise<DashboardTrend> {
	const { user, sekolah } = locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	if (user.type !== 'admin' && user.sekolahId !== sekolah.id)
		throw error(403, 'Sekolah di luar penugasan akun.');
	if (!canAttendance(user, 'lihat') || user.type === 'tim_dapur')
		throw error(403, 'Grafik kehadiran sekolah di luar akses akun.');
	const params = new URLSearchParams({ tab: 'sekolah' });
	if (canViewLeadershipDashboard(user)) {
		for (const key of ['jenjang', 'kelas_id'])
			if (search.has(key)) params.set(key, search.get(key)!);
		if (params.get('kelas_id')) {
			const academic = await resolveSekolahAcademicContext(sekolah.id);
			const allowed = await accessibleClassIds(user, sekolah.id, academic.activeSemesterId);
			if (!allowed.includes(Number(params.get('kelas_id'))))
				throw error(403, 'Kelas di luar penugasan akun.');
		}
	}
	if (search.has('sumber_masuk')) params.set('sumber_masuk', search.get('sumber_masuk')!);
	const series: DashboardTrend['series'] = [];
	let source = '';
	// Reuse monitoring's illness, home-leave, tenant and assignment rules for each day.
	for (const date of dashboardTrendDates(jakartaToday())) {
		params.set('tanggal', date);
		const snapshot = await loadMonitoringSnapshot(locals, params);
		source = snapshot.columns[0]?.sourceLabel ?? '';
		const levels = new Map(snapshot.classes.map((kelas) => [kelas.id, kelas.jenjang]));
		for (const level of ['sd', 'smp', 'sma', 'unknown']) {
			const rows = snapshot.rows.filter((row) => levels.get(row.kelasId) === level);
			if (!rows.length) continue;
			let item = series.find((item) => item.level === level);
			if (!item) {
				item = { level, points: [] };
				series.push(item);
			}
			item.points.push(dashboardTrendPoint(date, rows));
		}
	}
	return { series, source, generatedAt: new Date().toISOString() };
}
