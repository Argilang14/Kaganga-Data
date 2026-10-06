import assert from 'node:assert/strict';
import test from 'node:test';
import { monitoringOverview } from './attendance-monitoring-view.ts';
import type { MonitoringStatus } from './attendance-monitoring.ts';

const empty: Record<MonitoringStatus, number> = {
	hadir: 0,
	terlambat: 0,
	sakit: 0,
	izin: 0,
	alfa: 0,
	pulang: 0,
	izin_pulang: 0,
	belum: 0,
	tanpa_sumber: 0
};

test('overview partitions one monitoring column without counting pending as alfa', () => {
	assert.deepEqual(
		monitoringOverview(
			{
				hadir: 3,
				terlambat: 1,
				pulang: 2,
				sakit: 1,
				izin: 1,
				izin_pulang: 2,
				alfa: 1,
				belum: 3,
				tanpa_sumber: 1
			},
			15
		),
		{ present: 6, absent: 5, pending: 4, recorded: 11, percentage: 73 }
	);
});

test('missing activity source does not count as recorded attendance', () => {
	assert.deepEqual(monitoringOverview({ ...empty, tanpa_sumber: 24 }, 24), {
		present: 0,
		absent: 0,
		pending: 24,
		recorded: 0,
		percentage: 0
	});
});

test('an empty class has a zero percentage rather than NaN', () => {
	assert.equal(monitoringOverview(empty, 0).percentage, 0);
});

test('overview follows the selected column independently of other activity counts', () => {
	const entry = monitoringOverview({ ...empty, hadir: 1, belum: 1 }, 2);
	const exit = monitoringOverview({ ...empty, belum: 2 }, 2);
	assert.equal(entry.present, 1);
	assert.equal(exit.present, 0);
	assert.equal(exit.percentage, 0);
});
