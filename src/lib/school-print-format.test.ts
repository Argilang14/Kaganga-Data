import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchoolPrintFormat } from './school-print-format.ts';

test('SR variants and integrated level use the SR format', () => {
	for (const variant of ['srd', 'srmp', 'srma', 'srt']) assert.equal(getSchoolPrintFormat({ jenjangPendidikan: 'sd', jenjangVariant: variant }), 'sr');
	assert.equal(getSchoolPrintFormat({ jenjangPendidikan: 'SRT' }), 'sr');
});
test('non-SR schools preserve the default format', () => {
	for (const level of ['sd', 'smp', 'sma', 'slb', 'pkbm']) assert.equal(getSchoolPrintFormat({ jenjangPendidikan: level }), 'default');
});
test('unknown types do not guess a format', () => {
	assert.equal(getSchoolPrintFormat(null), null);
	assert.equal(getSchoolPrintFormat({ jenjangPendidikan: 'unknown' }), null);
});
