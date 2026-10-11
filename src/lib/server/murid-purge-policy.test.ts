import assert from 'node:assert/strict';
import test from 'node:test';
import { muridPurgeProblem } from './murid-purge-policy.ts';

const row = {
	status: 'keluar',
	needsIdentityReview: 0,
	identityKey: 'uid:student',
	lastMuridId: 1
};
test('hanya keluar sekolah dengan identitas terverifikasi dapat diproses', () => {
	assert.equal(muridPurgeProblem(row), null);
	for (const status of ['aktif', 'pindah', 'alumni'])
		assert.ok(muridPurgeProblem({ ...row, status }));
	assert.ok(muridPurgeProblem({ ...row, needsIdentityReview: 1 }));
});
test('snapshot lama boleh dibersihkan hanya bila tidak menunjuk murid hidup', () => {
	assert.equal(muridPurgeProblem({ ...row, identityKey: 'nisn:000', lastMuridId: null }), null);
	assert.ok(muridPurgeProblem({ ...row, identityKey: 'nisn:000' }));
});
