import assert from 'node:assert/strict';
import test from 'node:test';
import {
	muridIdentityKey,
	normalizedNisn,
	validNisn,
	resolveMuridImportIdentity
} from './murid-identity.ts';

test('identitas murid memakai UID, bukan NISN yang dapat berubah', () => {
	assert.equal(muridIdentityKey({ identityUid: 'abc', id: 1 }), 'uid:abc');
});

test('fallback baris murid tidak menggabungkan nomor nasional kosong', () => {
	assert.equal(muridIdentityKey({ id: 1 }), 'record:1');
	assert.notEqual(muridIdentityKey({ id: 1 }), muridIdentityKey({ id: 2 }));
	assert.throws(() => muridIdentityKey({}));
});

test('placeholder NISN menjadi kosong dan nol awal tidak hilang', () => {
	for (const value of ['000', '0000000000', '', '-', 'BELUM-123'])
		assert.equal(normalizedNisn(value), '');
	assert.equal(normalizedNisn(' 0096329793 '), '0096329793');
	assert.equal(validNisn('0096329793'), true);
	for (const value of ['0000000000', '123', '123456789a']) assert.equal(validNisn(value), false);
});

test('pencocokan impor tidak memilih murid terakhir dengan NISN bersama', () => {
	const rows = [
		{ id: 1, nis: 'N1', nisn: '000', nama: 'Anisa' },
		{ id: 2, nis: 'N2', nisn: '000', nama: 'Abrillia' }
	];
	assert.equal(resolveMuridImportIdentity(rows, { nisn: '000' }), undefined);
	assert.equal(resolveMuridImportIdentity(rows, { nisn: '000', nama: 'Abrillia' })?.id, 2);
	assert.equal(resolveMuridImportIdentity(rows, { id: 999, nis: 'N1', nama: 'Anisa' }), undefined);
	assert.equal(resolveMuridImportIdentity(rows, { id: 1, nama: 'Abrillia' }), undefined);
	assert.equal(resolveMuridImportIdentity(rows, { nis: 'tidak ada', nama: 'Anisa' }), undefined);
});

test('duplikasi NISN valid atau nama tidak ditentukan tanpa bukti identitas tambahan', () => {
	const rows = [
		{ id: 1, nisn: '0011223344', nama: 'Anisa' },
		{ id: 2, nisn: '0011223344', nama: 'Abrillia' }
	];
	assert.equal(resolveMuridImportIdentity(rows, { nisn: '0011223344' }), undefined);
	assert.equal(resolveMuridImportIdentity(rows, { nisn: '0011223344', nama: 'Anisa' })?.id, 1);
	assert.equal(resolveMuridImportIdentity(rows, { nisn: '0099999999', nama: 'Anisa' }), undefined);
	assert.equal(
		resolveMuridImportIdentity(
			[
				{ id: 1, nama: 'Anisa' },
				{ id: 2, nama: 'Anisa' }
			],
			{ nama: 'Anisa' }
		),
		undefined
	);
});
