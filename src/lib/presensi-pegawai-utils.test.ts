import assert from 'node:assert/strict';
import test from 'node:test';

const utils = (await import('./presensi-pegawai-utils' + '.ts')) as typeof import('./presensi-pegawai-utils');

test('enumerateMonthDates handles leap years', () => {
	const dates = utils.enumerateMonthDates(2028, 2);
	assert.equal(dates.length, 29);
	assert.equal(dates.at(-1), '2028-02-29');
});

test('presensi status accepts only supported values', () => {
	assert.equal(utils.isPresensiPegawaiStatus('dinas_luar'), true);
	assert.equal(utils.isPresensiPegawaiStatus('alfa'), false);
	assert.equal(utils.statusLabel('cuti'), 'Cuti');
});
