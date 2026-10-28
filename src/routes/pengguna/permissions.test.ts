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

test('profil pribadi murid memerlukan izin khusus, tidak otomatis mengikuti role atau jabatan', () => {
	for (const position of [
		'kepala_sekolah',
		'waka_kesiswaan',
		'waka_kurikulum',
		'waka_sarpras',
		'waka_keasramaan',
		'waka_humas',
		'operator'
	] as const) {
		assert.equal(
			permissionsForAccessPosition(position).some((permission) =>
				permission.startsWith('murid_profil_')
			),
			false
		);
	}
	for (const type of [
		'user',
		'wali_kelas',
		'wali_asuh',
		'wali_asrama',
		'tim_dapur',
		'tim_keamanan'
	])
		assert.equal(
			effectivePermissions({ type }).some((permission) => permission.startsWith('murid_profil_')),
			false
		);
	assert.equal(
		effectivePermissions({
			type: 'user',
			jabatanAkses: 'operator',
			permissions: ['murid_profil_lihat']
		}).includes('murid_profil_lihat'),
		true
	);
	assert.equal(effectivePermissions({ type: 'admin' }).includes('murid_profil_cetak'), true);
});
