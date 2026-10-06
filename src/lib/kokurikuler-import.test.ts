import assert from 'node:assert/strict';
import test from 'node:test';
import { parseKokurikulerRows } from './kokurikuler-import.ts';

const dimensions = [
	{ key: 'ketakwaan', label: 'Keimanan dan Ketakwaan' },
	{ key: 'kesehatan', label: 'Kesehatan' }
];

test('pratinjau memisahkan data valid, duplikat, dan dimensi yang salah', () => {
	const rows = parseKokurikulerRows([
		['Kode', 'Dimensi', 'Kegiatan'],
		[' KOK1 ', 'Kesehatan, ketakwaan', 'Olahraga'],
		['kok2', 'Kesehatan', 'Kegiatan lain'],
		['KOK1', 'Kesehatan', 'Duplikat file'],
		['KOK3', 'Tidak dikenal', 'Salah dimensi'],
		['', 'Kesehatan', 'Tanpa kode']
	], dimensions, ['KOK2']);
	assert.equal(rows.length, 5);
	assert.deepEqual(rows[0], {
		baris: 2, kode: 'KOK1', dimensi: ['kesehatan', 'ketakwaan'], kegiatan: 'Olahraga', masalah: null
	});
	assert.equal(rows[1].masalah, 'Kode sudah digunakan');
	assert.equal(rows[2].masalah, 'Kode sudah digunakan');
	assert.match(rows[3].masalah ?? '', /tidak valid/);
	assert.match(rows[4].masalah ?? '', /tidak valid/);
});

test('template dengan header berbeda ditolak', () => {
	assert.throws(() => parseKokurikulerRows([['Nama', 'Dimensi', 'Kegiatan']], dimensions, []), /Kolom pertama/);
});
