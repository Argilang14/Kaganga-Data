import assert from 'node:assert/strict';
import test from 'node:test';
import {
	canViewLeadershipDashboard,
	dashboardClassSummary,
	legacyDashboardHref
} from './dashboard-leadership.ts';
import type { MonitoringStatus } from './attendance-monitoring.ts';

const classes = [{ id: 1, nama: 'X.A', jenjang: 'sma', waliKelas: 'Guru A' }];
const row = (id: number, status: MonitoringStatus, kelasId = 1) => ({
	id,
	kelasId,
	cells: [{ status }]
});

test('leadership requires admin or explicit permission, not only a teacher or guardian role', () => {
	assert.equal(canViewLeadershipDashboard({ type: 'admin' }), true);
	assert.equal(canViewLeadershipDashboard({ type: 'user', permissions: ['pimpinan_lihat'] }), true);
	for (const type of ['user', 'wali_asuh', 'wali_asrama', 'tim_dapur'])
		assert.equal(canViewLeadershipDashboard({ type }), false);
	assert.equal(canViewLeadershipDashboard(null), false);
});

test('class summary partitions canonical entrance statuses and never labels pending as alfa', () => {
	const [summary] = dashboardClassSummary(classes, [
		row(1, 'hadir'),
		row(2, 'terlambat'),
		row(3, 'sakit'),
		row(4, 'izin'),
		row(5, 'izin_pulang'),
		row(6, 'alfa'),
		row(7, 'belum'),
		row(8, 'tanpa_sumber')
	]);
	assert.deepEqual(
		[summary.total, summary.hadir, summary.tidakHadir, summary.belum, summary.recorded],
		[8, 2, 4, 2, 6]
	);
	assert.equal(summary.percentage, 75);
});

test('class summary ignores duplicate students and classes outside the supplied scope', () => {
	const [summary] = dashboardClassSummary(classes, [
		row(1, 'hadir'),
		row(1, 'hadir'),
		row(2, 'hadir', 999)
	]);
	assert.equal(summary.total, 1);
	assert.equal(summary.hadir, 1);
	assert.equal(dashboardClassSummary(classes, [])[0].percentage, 0);
});

test('old leadership links preserve filters and translate them to monitoring parameters', () => {
	assert.equal(
		legacyDashboardHref(new URLSearchParams('jenjang=srma&kelas=12&sumber_masuk=7')),
		'/?jenjang=sma&sumber_masuk=7&kelas_id=12#pengawasan-kelas'
	);
	assert.equal(legacyDashboardHref(new URLSearchParams('kelas=0')), '/#pengawasan-kelas');
	assert.equal(
		legacyDashboardHref(new URLSearchParams('kelas=12&kelas_id=14')),
		'/?kelas_id=14#pengawasan-kelas'
	);
});
