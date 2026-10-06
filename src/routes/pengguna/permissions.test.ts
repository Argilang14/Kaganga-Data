import test from 'node:test';
import assert from 'node:assert/strict';
import {
	defaultPermissionsForType,
	effectivePermissions,
	permissionsForAccessPosition,
	systemOnlyPermissions,
	userPermissions
} from './permissions.ts';

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

test('pimpinan menerima izin operasional tanpa pengaturan sistem', () => {
	const permissions = permissionsForAccessPosition('waka_kurikulum');
	assert.equal(permissions.includes('kelas_manage'), true);
	assert.equal(permissions.includes('persetujuan_setujui'), true);
	for (const permission of systemOnlyPermissions)
		assert.equal(permissions.includes(permission), false);
});

test('operator tidak otomatis menerima kewenangan persetujuan', () => {
	const permissions = permissionsForAccessPosition('operator');
	assert.equal(permissions.includes('kelas_manage'), true);
	assert.equal(permissions.includes('persetujuan_setujui'), false);
	assert.equal(permissions.includes('komunikasi_approve'), false);
});

test('izin manual dapat menambah pengecualian operator tetapi bukan izin sistem', () => {
	const permissions = effectivePermissions({
		type: 'user',
		jabatanAkses: 'operator',
		permissions: ['persetujuan_setujui', 'user_add']
	});
	assert.equal(permissions.includes('persetujuan_setujui'), true);
	assert.equal(permissions.includes('user_add'), false);
});

test('nilai jabatan tidak dikenal tidak memperoleh bundel izin', () => {
	assert.deepEqual(permissionsForAccessPosition('tidak_valid' as never), []);
});
