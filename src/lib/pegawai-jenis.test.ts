import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePegawaiJenis, pegawaiJenisLabel, pegawaiJenisLabels } from './presensi-pegawai-utils.ts';

test('employee type filters accept only existing categories', () => {
	for (const jenis of Object.keys(pegawaiJenisLabels)) assert.equal(normalizePegawaiJenis(jenis), jenis);
	for (const jenis of [null, '', 'admin', 'tendik', '__proto__']) assert.equal(normalizePegawaiJenis(jenis), '');
});
test('employee type labels stay separate from account roles', () => {
	assert.equal(pegawaiJenisLabel('tu'), 'Tata Usaha');
	assert.equal(pegawaiJenisLabel('wali_asrama'), 'Wali Asrama');
});
