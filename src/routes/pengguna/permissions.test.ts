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
	assert.equal(permissions.includes('kelas_manage'), false);
	assert.equal(permissions.includes('persetujuan_setujui'), false);
	for (const permission of systemOnlyPermissions)
		assert.equal(permissions.includes(permission), false);
});

test('operator mendapat semua operasional, tanpa sistem', () => {
	const permissions = permissionsForAccessPosition('operator');
	for (const permission of ['kelas_manage', 'persetujuan_setujui', 'komunikasi_approve'] as const)
		assert.ok(permissions.includes(permission));
	for (const permission of systemOnlyPermissions)
		assert.equal(permissions.includes(permission), false);
});

test('rapor penuh bagi Kepala Sekolah, Wakakur dan Operator', () => {
	for (const role of ['kepala_sekolah', 'waka_kurikulum', 'operator'] as const)
		for (const permission of [
			'rapor_arsip_finalisasi',
			'rapor_arsip_revisi',
			'rapor_arsip_massal'
		] as const)
			assert.ok(permissionsForAccessPosition(role).includes(permission));
	assert.equal(
		permissionsForAccessPosition('waka_keasramaan').includes('rapor_arsip_finalisasi'),
		false
	);
});

test('operator tetap tidak mendapat izin sistem dari centang manual', () => {
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
			['kepala_sekolah', 'operator'].includes(position)
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

test('wali kelas mengikuti penugasan aktif tanpa mengubah role guru', () => {
	const user = { type: 'user', waliKelasIds: [123] };
	assert.ok(effectivePermissions(user).includes('rapor_manage'));
	assert.ok(effectivePermissions(user).includes('cetak_akademik'));
	assert.equal(effectivePermissions({ ...user, waliKelasIds: [] }).includes('rapor_manage'), false);
	assert.equal(effectivePermissions(user).includes('user_list'), false);
});

test('seluruh nonadmin tidak memperoleh izin sistem dari centang manual', () => {
	for (const type of [
		'user',
		'wali_kelas',
		'wali_asuh',
		'wali_asrama',
		'tim_dapur',
		'tim_keamanan'
	]) {
		const permissions = effectivePermissions({ type, permissions: [...systemOnlyPermissions] });
		for (const permission of systemOnlyPermissions)
			assert.equal(permissions.includes(permission), false);
	}
});

test('izin keasramaan menggambarkan tindakan peran, termasuk izin tersimpan lama', () => {
	const stored = ['keasramaan_manage', 'keasramaan_input', 'menu_catatan_asrama'] as const;
	const warden = effectivePermissions({ type: 'wali_asrama', permissions: stored });
	assert.ok(warden.includes('keasramaan_manage'));
	assert.equal(warden.includes('keasramaan_input'), false);
	const caregiver = effectivePermissions({ type: 'wali_asuh', permissions: stored });
	assert.ok(caregiver.includes('keasramaan_input'));
	assert.equal(caregiver.includes('keasramaan_manage'), false);
	assert.equal(caregiver.includes('menu_catatan_asrama'), false);
	assert.equal(
		effectivePermissions({ type: 'user', permissions: stored }).includes('keasramaan_input'),
		false
	);
});
