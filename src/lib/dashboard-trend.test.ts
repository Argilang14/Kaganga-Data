import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardTrendDates, dashboardTrendPoint } from './dashboard-trend.ts';

test('trend uses seven calendar days across month and year boundaries', () => {
	assert.deepEqual(dashboardTrendDates('2026-01-03'), [
		'2025-12-28',
		'2025-12-29',
		'2025-12-30',
		'2025-12-31',
		'2026-01-01',
		'2026-01-02',
		'2026-01-03'
	]);
});
test('unrecorded is a gap, not a zero attendance rate', () => {
	assert.equal(
		dashboardTrendPoint('2026-10-28', [{ id: 1, cells: [{ status: 'belum' }] }]).rate,
		null
	);
	assert.equal(
		dashboardTrendPoint('2026-10-28', [{ id: 1, cells: [{ status: 'tanpa_sumber' }] }]).rate,
		null
	);
	assert.equal(dashboardTrendPoint('2026-10-28', []).rate, null);
	assert.equal(
		dashboardTrendPoint('2026-10-28', [{ id: 1, cells: [{ status: 'sakit' }] }]).rate,
		0
	);
});
test('present and late count as attendance, permits and illness as recorded absence; deduplicated', () => {
	const result = dashboardTrendPoint('2026-10-28', [
		{ id: 1, cells: [{ status: 'hadir' }] },
		{ id: 1, cells: [{ status: 'hadir' }] },
		{ id: 2, cells: [{ status: 'terlambat' }] },
		{ id: 3, cells: [{ status: 'sakit' }] },
		{ id: 4, cells: [{ status: 'izin_pulang' }] },
		{ id: 5, cells: [{ status: 'belum' }] }
	]);
	assert.deepEqual(result, {
		date: '2026-10-28',
		total: 5,
		present: 2,
		recorded: 4,
		unrecorded: 1,
		rate: 40
	});
});
