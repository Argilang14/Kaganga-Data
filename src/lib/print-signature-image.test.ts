import assert from 'node:assert/strict';
import { test } from 'node:test';
import { printSignatureImage } from './print-signature-image.ts';

test('gambar tanda tangan hanya menerima data PNG lokal', () => {
	for (const url of [
		null,
		'',
		'https://example.com/a.png',
		'data:image/svg+xml;base64,AAAA',
		'data:image/png;base64,AA" onerror="alert(1)'
	])
		assert.equal(printSignatureImage(url), '');
	assert.match(printSignatureImage('data:image/png;base64,AAAA'), /<img/);
});
