import assert from 'node:assert/strict';
import { test } from 'node:test';

const { sanitizeUploadName } = (await import('./dinas-luar' + '.ts')) as typeof import('./dinas-luar');

test('sanitizeUploadName menghapus traversal dan karakter berbahaya', () => {
	assert.equal(sanitizeUploadName('../../Undangan rapat?.pdf'), 'Undangan_rapat_.pdf');
	assert.equal(sanitizeUploadName(''), 'file');
});
