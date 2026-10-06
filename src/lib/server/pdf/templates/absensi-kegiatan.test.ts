import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./absensi-kegiatan.ts', import.meta.url), 'utf8');

test('template rekap absensi memuat bagian penting dan mengamankan data dinamis', () => {
	assert.match(source, /REKAP ABSENSI KEGIATAN/);
	assert.match(source, /REKAP PER MURID/);
	assert.match(source, /INDIKATOR YANG MEMERLUKAN TINDAK LANJUT/);
	for (const value of [
		'row.nis',
		'row.nama',
		'row.kegiatan',
		'row.indikator',
		'row.periode',
		'row.status',
		'row.catatan',
		'row.alasan'
	]) {
		assert.ok(source.includes(`escapeHtml(${value}`), `${value} harus melewati escapeHtml`);
	}
	assert.match(source, /replaceAll\('<', '&lt;'\)/);
	assert.match(source, /replaceAll\('>', '&gt;'\)/);
});
