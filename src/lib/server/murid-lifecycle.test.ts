import assert from 'node:assert/strict';
import test from 'node:test';
import { muridIdentityKey } from './murid-identity.ts';

test('identitas murid mengutamakan NISN', () => {
	assert.equal(muridIdentityKey({ nis: ' 123 ', nisn: ' 0099 ' }), 'nisn:0099');
});

test('identitas murid memakai NIS jika NISN kosong', () => {
	assert.equal(muridIdentityKey({ nis: ' AbC-10 ', nisn: '' }), 'nis:abc-10');
});
