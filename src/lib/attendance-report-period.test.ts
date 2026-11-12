import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceMonthRange } from './attendance-report-period.ts';
import { monthlyRecapPeriods } from './attendance-permit-recap.ts';

test('periode Agustus sampai bulan berjalan mencakup semua bulan dan berhenti hari ini', () => {
	const range = attendanceMonthRange('2026-08', '2026-11', '2026-11-12');
	assert.deepEqual(range, { start: '2026-08-01', end: '2026-11-12', requestedEnd: '2026-11-30' });
	assert.deepEqual(monthlyRecapPeriods(range.start, range.end), [
		{ start: '2026-08-01', end: '2026-08-31' },
		{ start: '2026-09-01', end: '2026-09-30' },
		{ start: '2026-10-01', end: '2026-10-31' },
		{ start: '2026-11-01', end: '2026-11-12' }
	]);
});

test('satu bulan, tahun kabisat, dan lintas tahun memakai batas kalender', () => {
	assert.equal(attendanceMonthRange('2024-02', '2024-02', '2026-11-12').end, '2024-02-29');
	assert.deepEqual(
		monthlyRecapPeriods(
			attendanceMonthRange('2025-12', '2026-01', '2026-11-12').start,
			attendanceMonthRange('2025-12', '2026-01', '2026-11-12').end
		),
		[
			{ start: '2025-12-01', end: '2025-12-31' },
			{ start: '2026-01-01', end: '2026-01-31' }
		]
	);
});

test('periode kosong, tidak valid, terbalik, mendatang dan terlalu panjang ditolak', () => {
	for (const [start, end] of [
		['', '2026-11'],
		['2026-13', '2026-13'],
		['2026-11', '2026-08'],
		['2026-11', '2026-12'],
		['2025-01', '2026-11']
	])
		assert.throws(() => attendanceMonthRange(start, end, '2026-11-12'));
});
