import assert from 'node:assert/strict';
import test from 'node:test';
import { identityIntegrityProblem, type IdentityMember } from './murid-identity-integrity.ts';

const member: IdentityMember = {
	id: 1,
	sekolahId: 1,
	semesterId: 1,
	linkSchoolId: 1,
	linkSemesterId: 1,
	nis: '001',
	nama: 'Murid A',
	tanggalLahir: '2010-01-01'
};
test('identitas tunggal serta murid sama lintas semester tetap sah', () => {
	assert.equal(identityIntegrityProblem([member], 1, 1), null);
	assert.equal(
		identityIntegrityProblem(
			[member, { ...member, id: 2, semesterId: 2, linkSemesterId: 2 }],
			1,
			2
		),
		null
	);
});
test('hubungan pribadi berbeda tidak boleh mengalami perubahan status bersama', () => {
	for (const change of [{ nis: '002' }, { nama: 'Murid B' }, { tanggalLahir: '2010-02-01' }]) {
		assert.ok(
			identityIntegrityProblem(
				[member, { ...member, ...change, id: 2, semesterId: 2, linkSemesterId: 2 }],
				1,
				1
			)
		);
	}
});
test('sumber hilang, lintas sekolah, semester keliru dan duplikat periode ditolak', () => {
	assert.ok(identityIntegrityProblem([], 1));
	assert.ok(identityIntegrityProblem([member], 1, 99));
	assert.ok(identityIntegrityProblem([{ ...member, sekolahId: 2 }], 1));
	assert.ok(identityIntegrityProblem([{ ...member, linkSchoolId: 2 }], 1));
	assert.ok(identityIntegrityProblem([{ ...member, linkSemesterId: 2 }], 1));
	assert.ok(identityIntegrityProblem([member, { ...member, id: 2 }], 1));
});
