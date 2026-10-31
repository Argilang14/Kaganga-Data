import assert from 'node:assert/strict';
import test from 'node:test';
import {
	reportArchiveFilters,
	reportFilterId,
	type ReportClassOption
} from './report-archive-filters.ts';
const options: ReportClassOption[] = [
	{
		id: 1,
		label: 'X.A',
		yearId: 10,
		yearLabel: '2025/2026',
		semesterId: 11,
		semesterLabel: 'Ganjil',
		semesterType: 'ganjil'
	},
	{
		id: 2,
		label: 'X.A',
		yearId: 10,
		yearLabel: '2025/2026',
		semesterId: 12,
		semesterLabel: 'Genap',
		semesterType: 'genap'
	},
	{
		id: 3,
		label: 'XI.A',
		yearId: 20,
		yearLabel: '2026/2027',
		semesterId: 21,
		semesterLabel: 'Ganjil',
		semesterType: 'ganjil'
	},
	{
		id: 4,
		label: 'X.A',
		yearId: 20,
		yearLabel: '2026/2027',
		semesterId: 21,
		semesterLabel: 'Ganjil',
		semesterType: 'ganjil'
	}
];
test('filter arsip memisahkan tahun, semester, dan nama kelas tanpa pilihan ganda', () => {
	const f = reportArchiveFilters(options, { classId: 0 }, { yearId: 20, semesterId: 21 });
	assert.deepEqual(
		f.years.map((y) => y.id),
		[20, 10]
	);
	assert.equal(f.yearId, 20);
	assert.equal(f.semesterId, 21);
	assert.deepEqual(
		f.classes.map((c) => c.label),
		['XI.A', 'X.A']
	);
	assert.equal(f.classId, 0);
});
test('tautan lama kelas historis tidak beralih ke tahun aktif', () => {
	const f = reportArchiveFilters(options, { classId: 2 }, { yearId: 20, semesterId: 21 });
	assert.equal(f.yearId, 10);
	assert.equal(f.semesterId, 12);
	assert.equal(f.classId, 2);
	assert.deepEqual(f.classes, [{ id: 2, label: 'X.A' }]);
});
test('tahun atau semester eksplisit tidak mengikutsertakan kelas periode lain', () => {
	assert.equal(reportArchiveFilters(options, { classId: 2, yearId: 20 }).classId, 0);
	assert.equal(
		reportArchiveFilters(options, { classId: 1, yearId: 10, semesterId: 12 }).classId,
		0
	);
	assert.deepEqual(reportArchiveFilters(options, { classId: 1, yearId: 999 }).classes, []);
	assert.deepEqual(
		reportArchiveFilters(options, { classId: 1, yearId: 10, semesterId: 21 }).classes,
		[]
	);
});
test('pilihan hanya berasal dari kelas yang diizinkan dan menangani data kosong', () => {
	const f = reportArchiveFilters(
		options.slice(0, 1),
		{ classId: 4 },
		{ yearId: 20, semesterId: 21 }
	);
	assert.deepEqual(f.years, [{ id: 10, label: '2025/2026' }]);
	assert.equal(f.classId, 0);
	assert.deepEqual(reportArchiveFilters([], { classId: 0 }).classes, []);
});
test('parameter filter menolak ID tidak valid', () => {
	assert.equal(reportFilterId(null), undefined);
	assert.equal(reportFilterId('0'), 0);
	assert.equal(reportFilterId('21'), 21);
	for (const v of ['', '-1', '1e2', '1.2', 'Infinity', '9007199254740999'])
		assert.throws(() => reportFilterId(v));
});
