import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessArea, getAreaAction, getProtectedArea } from './menu-access.ts';

test('guardian defaults cannot open school or class management', () => {
	for (const type of ['wali_asuh', 'wali_asrama']) {
		assert.equal(canAccessArea({ type }, 'sekolah'), false);
		assert.equal(canAccessArea({ type }, 'kelas'), false);
		assert.equal(canAccessArea({ type }, 'keasramaan', 'input'), true);
	}
});

test('teacher exceptions do not change role or grant unrelated actions', () => {
	const user = { type: 'user', permissions: ['keasramaan_lihat', 'sekolah_lihat'] };
	assert.equal(canAccessArea(user, 'keasramaan'), true);
	assert.equal(canAccessArea(user, 'keasramaan', 'input'), false);
	assert.equal(canAccessArea(user, 'sekolah'), true);
	assert.equal(canAccessArea(user, 'sekolah', 'manage'), false);
	assert.equal(canAccessArea(user, 'kelas'), false);
});

test('export permission alone does not open view, edit, or assessment', () => {
	const user = { type: 'user', permissions: ['mata_pelajaran_keasramaan'] };
	for (const action of ['lihat', 'manage', 'input'] as const) assert.equal(canAccessArea(user, 'keasramaan', action), false);
	assert.equal(canAccessArea(user, 'keasramaan', 'export'), true);
});

test('protected route boundaries and action types are explicit', () => {
	assert.equal(getProtectedArea('/sekolah/form'), 'sekolah');
	assert.equal(getProtectedArea('/kelas'), 'kelas');
	assert.equal(getProtectedArea('/api/asesmen-keasramaan/import'), 'keasramaan');
	assert.equal(getProtectedArea('/api/database/import'), null);
	assert.equal(getProtectedArea('/sekolah-lain'), null);
	assert.equal(getAreaAction('/api/asesmen-keasramaan/download-template', 'POST'), 'export');
	assert.equal(getAreaAction('/asesmen-keasramaan/form-asesmen', 'POST'), 'input');
	assert.equal(canAccessArea(null, 'kelas'), false);
	assert.equal(canAccessArea({ type: 'admin' }, 'kelas', 'manage'), true);
});
