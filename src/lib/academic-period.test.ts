import test from 'node:test';
import assert from 'node:assert/strict';
import { academicPeriodForDate } from './academic-period.ts';

const years = [
	{
		id: 1,
		nama: '2026/2027',
		semester: [{ id: 1, tanggalMasuk: '2026-07-13', tanggalBagiRaport: '2026-12-20' }]
	},
	{
		id: 2,
		nama: '2027/2028',
		semester: [{ id: 2, tanggalMulai: '2027-07-12', tanggalSelesai: '2027-12-20' }]
	}
];
test('historical dates choose their own year and explicit semester, independent of active selection', () => {
	assert.equal(academicPeriodForDate(years, '2026-11-09')?.year.id, 1);
	assert.equal(academicPeriodForDate(years.toReversed(), '2026-11-09')?.semester?.id, 1);
	assert.equal(academicPeriodForDate(years, '2027-06-30')?.year.id, 1);
	assert.equal(academicPeriodForDate(years, '2027-07-01')?.year.id, 2);
	assert.equal(academicPeriodForDate(years, '2025-11-09'), null);
	assert.equal(academicPeriodForDate([...years, { ...years[0], id: 3 }], '2026-11-09'), null);
});
