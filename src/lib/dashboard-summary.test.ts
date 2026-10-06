import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jakartaToday, attendanceSummary } from './dashboard-summary.ts';
test('daily date uses Jakarta across UTC midnight', () => {
	assert.equal(jakartaToday(new Date('2026-09-12T18:00:00Z')), '2026-09-13');
});
test('unrecorded is separate from absent and zero safe', () => {
	assert.deepEqual(attendanceSummary(10, [{ status: 'alfa', count: 2 }]).unrecorded, 8);
	assert.equal(attendanceSummary(0, []).unrecorded, 0);
});
