import assert from 'node:assert/strict';
import test from 'node:test';
import { martikulasiAspek } from './martikulasi.ts';
import { martikulasiArchiveCoverage } from './report-martikulasi.ts';
import { archivePrintPermission } from './report-archive.ts';

const grades = martikulasiAspek.map((a) => ({
	aspekKode: a.kode,
	kelompok: a.kelompok,
	capaianAwal: 'Awal',
	capaianAkhir: 'Akhir',
	ketuntasan: 'tuntas',
	deskripsiCapaian: 'Baik'
}));
test('martikulasi archives require every aspect and final placement level', () => {
	assert.deepEqual(martikulasiArchiveCoverage(grades, 'madya'), {
		expected: 9,
		filled: 9,
		observed: 8,
		relationIssue: false
	});
	assert.equal(martikulasiArchiveCoverage(grades, null).filled, 8);
	assert.equal(martikulasiArchiveCoverage(grades.slice(1), 'dasar').filled, 8);
	assert.equal(martikulasiArchiveCoverage([{ ...grades[0], capaianAkhir: ' ' }], null).filled, 0);
});
test('martikulasi archives reject unknown, duplicated and mismatched aspects', () => {
	for (const rows of [
		[...grades, grades[0]],
		[{ ...grades[0], aspekKode: 'unknown' }],
		[{ ...grades[0], kelompok: 'karakter' }]
	])
		assert.equal(martikulasiArchiveCoverage(rows, 'dasar').relationIssue, true);
});
test('academic print permission is required for martikulasi, not dormitory print', () => {
	assert.equal(archivePrintPermission('martikulasi'), 'cetak_akademik');
	assert.equal(archivePrintPermission('asrama'), 'cetak_keasramaan');
});
