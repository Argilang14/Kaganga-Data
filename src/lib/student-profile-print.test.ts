import test from 'node:test';
import assert from 'node:assert/strict';
import {
	maskInformationIdentity,
	parseInformationPrintOptions,
	safeInformationImage
} from './student-profile-print.ts';

test('penyamaran identitas tidak mengubah nol awal dan tidak membuka nomor pendek', () => {
	assert.equal(maskInformationIdentity('0012345678901234', true), '************1234');
	assert.equal(maskInformationIdentity('0012345678901234', false), '0012345678901234');
	assert.equal(maskInformationIdentity('123', true), '***');
	assert.equal(maskInformationIdentity(null, false), '-');
});
test('pilihan cetak ketat, tidak menerima sekolah atau penugasan dari client', () => {
	const valid = { kelasId: 1, muridId: null, maskIdentity: true, background: 'default' };
	assert.deepEqual(parseInformationPrintOptions(valid), valid);
	for (const invalid of [
		null,
		[],
		{ ...valid, kelasId: '1' },
		{ ...valid, muridId: -1 },
		{ ...valid, maskIdentity: 'false' },
		{ ...valid, background: 'https://example.com/image.png' },
		{ ...valid, sekolahId: 2 }
	])
		assert.throws(() => parseInformationPrintOptions(invalid));
});
test('dokumen hanya memakai data URI gambar raster, tidak URL, SVG atau HTML', () => {
	assert.equal(safeInformationImage('data:image/png;base64,YQ=='), 'data:image/png;base64,YQ==');
	for (const value of [
		'https://example.com/a.png',
		'file:///private.png',
		'data:image/svg+xml;base64,YQ==',
		'data:text/html;base64,YQ==',
		'data:image/png;base64,a" onerror="alert(1)'
	])
		assert.equal(safeInformationImage(value), null);
});
