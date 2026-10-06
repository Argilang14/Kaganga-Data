import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./jurnal-mengajar.ts', import.meta.url), 'utf8');

test('template jurnal memiliki kop dua logo, judul dinamis, dan tabel multipage', () => {
	assert.match(source, /Jurnal Mengajar Per Kelas/);
	assert.match(source, /Jurnal Mengajar Per Mata Pelajaran/);
	assert.match(source, /renderSchoolLetterhead\(data\.sekolah\)/);
	assert.match(source, /schoolLetterheadStyles\(\)/);
	assert.match(source, /display: table-header-group/);
	assert.match(source, /page-break-inside: avoid/);
});

test('template jurnal mengamankan nilai HTML dan menaruh tanda tangan di akhir', () => {
	assert.match(source, /function escapeHtml/);
	assert.match(source, /return escapeHtml\(formatValueRaw\(value\)\)/);
	assert.match(source, /class="signature-section"/);
	assert.match(source, /Kepala Sekolah/);
	assert.match(source, /guruLabel/);
});

test('template jurnal menyediakan watermark logo sekolah yang dapat dimatikan', () => {
	assert.match(source, /backgroundLogoUrl\?/);
	assert.match(source, /data\.backgroundLogoUrl \? `<img/);
	assert.match(source, /class="watermark"/);
});
