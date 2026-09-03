import assert from 'node:assert/strict';
import test from 'node:test';
const { waktuToLocalDate } = (await import('./utils' + '.ts')) as typeof import('./utils');

test('waktuToLocalDate uses the local calendar date in WIB', () => {
	const previousTimezone = process.env.TZ;
	process.env.TZ = 'Asia/Jakarta';
	try {
		assert.equal(waktuToLocalDate('2026-08-10T17:30:00.000Z'), '2026-08-11');
		assert.equal(waktuToLocalDate('2026-08-11T05:00:00.000Z'), '2026-08-11');
	} finally {
		process.env.TZ = previousTimezone;
	}
});

test('waktuToLocalDate keeps a safe fallback for invalid legacy values', () => {
	assert.equal(waktuToLocalDate('2026-08-11-invalid'), '2026-08-11');
});
