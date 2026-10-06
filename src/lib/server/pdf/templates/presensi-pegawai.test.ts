import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./presensi-pegawai.ts', import.meta.url), 'utf8');

test('template presensi pegawai has two-logo header, repeated table header, and escaped cells', () => {
	assert.match(source, /logoDinasUrl/);
	assert.match(source, /logoUrl/);
	assert.match(source, /display:table-header-group/);
	assert.match(source, /row\.map\(\(cell/);
	assert.match(source, /escapeHtml\(cell\)/);
});
