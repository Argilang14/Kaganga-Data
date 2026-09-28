import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./buku-tamu.ts', import.meta.url), 'utf8');

test('template Buku Tamu escapes every guest-controlled text field', () => {
	for (const field of ['waktu', 'nama', 'asal', 'nip', 'keperluan', 'pesan']) {
		assert.match(source, new RegExp(`escapeHtml\\(row\\.${field}`));
	}
	assert.match(source, /renderSchoolLetterhead\(data\.sekolah\)/);
	assert.match(source, /schoolLetterheadStyles\(\)/);
	assert.match(source, /escapeHtml\(data\.sekolah\.npsn\)/);
	assert.match(source, /escapeHtml\(data\.periode\)/);
	assert.match(source, /replaceAll\('<', '&lt;'\)/);
	assert.match(source, /replaceAll\('>', '&gt;'\)/);
});
