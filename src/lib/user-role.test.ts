import assert from 'node:assert/strict';
import test from 'node:test';
import {
	creatableUserRoles,
	parseUserRoles,
	getUserRoles,
	resolveFormRoles,
	hasRole,
	isFullAccess,
	schoolWideAcademic,
	schoolWideDorm,
	userRoleLabel
} from './user-role.ts';
import { roleGrants } from './role-policy.ts';
import { effectivePermissions, systemOnlyPermissions } from '../routes/pengguna/permissions.ts';
import { canAccessMenu } from './role-menu-access.ts';

test('roles validate, deduplicate and reject privilege injection', () => {
	assert.deepEqual(parseUserRoles(['user', 'waka_kurikulum', 'user']), ['user', 'waka_kurikulum']);
	for (const value of [[], null, 'user', ['admin'], ['wali_murid'], ['invalid']])
		assert.equal(parseUserRoles(value), null);
	const form = new FormData();
	form.set('roles', JSON.stringify(['user', 'waka_kurikulum']));
	assert.deepEqual(resolveFormRoles(form), {
		type: 'user',
		roles: ['user', 'waka_kurikulum'],
		jabatanAkses: null
	});
	form.set('roles', 'invalid');
	assert.equal(resolveFormRoles(form), null);
	assert.ok(creatableUserRoles.includes('waka_humas'));
});
test('explicit roles override compatibility type and old position', () => {
	const account = { type: 'admin', jabatanAkses: 'kepala_sekolah', roles: ['user'] };
	assert.deepEqual(getUserRoles(account), ['user']);
	assert.equal(isFullAccess(account), false);
	assert.equal(userRoleLabel({ roles: ['user', 'waka_kurikulum'] }), 'Guru Mapel, Waka Kurikulum');
	assert.deepEqual(getUserRoles({ type: 'wali_kelas' }), ['user']);
});
test('Admin and Kepala Sekolah have all permissions; Operator all operations', () => {
	for (const role of ['admin', 'kepala_sekolah']) {
		const account = { roles: [role] };
		assert.ok(isFullAccess(account));
		for (const permission of systemOnlyPermissions) assert.ok(roleGrants(account, permission));
		assert.ok(canAccessMenu(account, '/pengguna'));
	}
	const operator = { roles: ['operator'] };
	for (const permission of [
		'asrama_penempatan',
		'keasramaan_input',
		'menu_kurikulum',
		'menu_nilai_intrakurikuler',
		'persetujuan_setujui'
	])
		assert.ok(roleGrants(operator, permission));
	for (const permission of systemOnlyPermissions)
		assert.equal(roleGrants(operator, permission), false);
	assert.equal(canAccessMenu(operator, '/pengguna'), false);
});
test('Waka roles only open their agreed domains', () => {
	const check = (role: string, allowed: string[], denied: string[]) => {
		const account = { type: 'user', roles: [role], permissions: [] };
		for (const path of allowed) assert.ok(canAccessMenu(account, path), role + ' ' + path);
		for (const path of denied) assert.equal(canAccessMenu(account, path), false, role + ' ' + path);
	};
	check(
		'waka_kurikulum',
		[
			'/data-mata-pelajaran',
			'/jadwal',
			'/ujian',
			'/martikulasi',
			'/rpm',
			'/asesmen-formatif',
			'/keasramaan'
		],
		['/inventaris', '/pengguna']
	);
	check(
		'waka_kesiswaan',
		['/murid/semua', '/murid/pasif', '/administrasi/absensi/kegiatan/pengaturan'],
		['/asesmen-sumatif', '/inventaris', '/pengguna']
	);
	check(
		'waka_sarpras',
		['/inventaris', '/ruangan'],
		['/asesmen-sumatif', '/pengguna', '/data-mata-pelajaran']
	);
	check(
		'waka_keasramaan',
		['/asrama', '/keasramaan', '/catatan-wali-asrama', '/rekap-nilai-asrama'],
		['/asesmen-sumatif', '/pengguna']
	);
	check(
		'waka_humas',
		[
			'/surat-menyurat/arsip',
			'/berkas',
			'/komunikasi',
			'/pengumuman',
			'/administrasi/absensi/kegiatan/pengaturan'
		],
		['/pengguna', '/asesmen-sumatif']
	);
});
test('combined roles add only explicit domains and keep school system closed', () => {
	const account = { type: 'user', roles: ['user', 'wali_asuh', 'waka_sarpras'], permissions: [] };
	for (const role of ['user', 'wali_asuh', 'waka_sarpras'] as const)
		assert.ok(hasRole(account, role));
	for (const path of ['/asesmen-formatif', '/asesmen-keasramaan', '/inventaris'])
		assert.ok(canAccessMenu(account, path));
	assert.equal(canAccessMenu(account, '/pengguna'), false);
	assert.equal(schoolWideAcademic(account), false);
	assert.equal(schoolWideDorm(account), false);
});
test('old broad stored grants cannot cross role ceilings', () => {
	const account = {
		type: 'user',
		roles: ['waka_sarpras'],
		permissions: ['menu_nilai_intrakurikuler', 'user_add', 'keasramaan_input'] as const
	};
	const permissions = effectivePermissions(account);
	for (const permission of account.permissions)
		assert.equal(permissions.includes(permission), false);
	assert.equal(roleGrants({ roles: ['wali_asrama'] }, 'keasramaan_input'), false);
	assert.ok(roleGrants({ roles: ['wali_asuh'] }, 'keasramaan_input'));
	assert.equal(roleGrants({ roles: ['waka_keasramaan'] }, 'keasramaan_input'), false);
});
