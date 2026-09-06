import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPermissionsForType, userPermissions } from './permissions.ts';

test('admin menerima seluruh izin bawaan', () => {
	assert.deepEqual(defaultPermissionsForType('admin'), userPermissions);
});

test('pengguna multi-kelas menerima izin pindah kelas', () => {
	assert.deepEqual(defaultPermissionsForType('user', { kelasCount: 2 }), ['kelas_pindah']);
});

test('pengguna satu kelas dan peran pendamping mulai tanpa izin khusus', () => {
	assert.deepEqual(defaultPermissionsForType('user', { kelasCount: 1 }), []);
	assert.deepEqual(defaultPermissionsForType('wali_asuh'), []);
	assert.deepEqual(defaultPermissionsForType('wali_asrama'), []);
});

test('hasil izin admin berupa salinan yang aman diubah pemanggil', () => {
	assert.notEqual(defaultPermissionsForType('admin'), userPermissions);
});
