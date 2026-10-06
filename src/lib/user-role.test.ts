import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	creatableUserRoles,
	resolveUserRole,
	displayedUserRole,
	userRoleLabel
} from './user-role.ts';

test('Tim Dapur dan Operator tersedia sebagai role akun', () => {
	assert.ok(creatableUserRoles.includes('tim_dapur'));
	assert.ok(creatableUserRoles.includes('operator'));
	assert.deepEqual(resolveUserRole('tim_dapur'), { type: 'tim_dapur', jabatanAkses: null });
});

test('Operator memakai kebijakan jabatan yang sudah ada tanpa migrasi akun lama', () => {
	assert.deepEqual(resolveUserRole('operator'), { type: 'user', jabatanAkses: 'operator' });
	assert.deepEqual(resolveUserRole('user', 'operator'), resolveUserRole('operator'));
	assert.equal(displayedUserRole({ type: 'user', jabatanAkses: 'operator' }), 'operator');
	assert.equal(userRoleLabel({ type: 'user', jabatanAkses: 'operator' }), 'Operator');
	assert.equal(userRoleLabel({ type: 'tim_dapur' }), 'Tim Dapur');
});

test('Operator tidak dapat menyisipkan jabatan lain dan role tidak dikenal ditolak', () => {
	assert.equal(resolveUserRole('operator', 'kepala_sekolah'), null);
	assert.equal(resolveUserRole('admin'), null);
	assert.equal(resolveUserRole('unknown'), null);
	assert.equal(resolveUserRole('user', 'unknown'), null);
});

test('Guru dan jabatan lain tetap memakai format sebelumnya', () => {
	assert.deepEqual(resolveUserRole('user', 'waka_kurikulum'), {
		type: 'user',
		jabatanAkses: 'waka_kurikulum'
	});
	assert.equal(userRoleLabel({ type: 'user', jabatanAkses: 'waka_kurikulum' }), 'Guru Mapel');
	assert.equal(displayedUserRole({ type: 'wali_asrama', jabatanAkses: 'operator' }), 'wali_asrama');
});
