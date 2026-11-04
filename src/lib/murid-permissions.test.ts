import assert from 'node:assert/strict';
import test from 'node:test';
import {
	canAccessStudentList,
	canManageStudentArchive,
	canEditMurid
} from './murid-permissions.ts';
import { canAccessMenu } from './role-menu-access.ts';

test('menu kelas dan asrama mengikuti peran wali meski izin umum ditambahkan', () => {
	for (const type of ['user', 'wali_asuh', 'wali_murid', 'tim_dapur']) {
		const user = { type, permissions: ['menu_murid', 'kelas_manage', 'asrama_penempatan'] };
		assert.equal(canAccessMenu(user, '/murid'), false);
		assert.equal(canAccessMenu(user, '/murid/asrama'), false);
	}
	assert.equal(canAccessMenu({ type: 'wali_kelas', waliKelasIds: [123] }, '/murid'), true);
	assert.equal(canAccessMenu({ type: 'wali_kelas' }, '/murid/asrama'), false);
	assert.equal(canAccessMenu({ type: 'wali_asrama' }, '/murid'), false);
	assert.equal(canAccessMenu({ type: 'wali_asrama' }, '/murid/asrama'), true);
	for (const view of ['semua', 'kelas', 'asrama', 'pasif'] as const)
		assert.equal(canAccessStudentList({ type: 'admin' }, view), true);
});

test('integrasi arsip mempertahankan akses operator dan batas akses wali', () => {
	const operator = { type: 'user', jabatanAkses: 'operator', permissions: ['murid_arsip'] };
	assert.equal(canManageStudentArchive(operator), true);
	assert.equal(canAccessMenu(operator, '/murid/semua'), true);
	assert.equal(canAccessMenu(operator, '/murid'), true);
	assert.equal(
		canManageStudentArchive({ type: 'wali_kelas', permissions: ['murid_arsip'] }),
		false
	);
	assert.equal(
		canManageStudentArchive({ type: 'user', jabatanAkses: 'operator', permissions: [] }),
		true
	);
});

test('guru wali kelas memperoleh menu kelas dan pasif selama masih ditugaskan', () => {
	const teacher = { type: 'user', waliKelasIds: [123] };
	assert.equal(canAccessStudentList(teacher, 'kelas'), true);
	assert.equal(canAccessStudentList(teacher, 'pasif'), true);
	assert.equal(canAccessStudentList(teacher, 'asrama'), false);
	assert.equal(canAccessStudentList({ ...teacher, waliKelasIds: [] }, 'kelas'), false);
});

test('role operasional mengedit data murid tanpa penugasan guru semu', () => {
	for (const role of ['operator', 'kepala_sekolah', 'waka_kurikulum', 'waka_kesiswaan'])
		assert.equal(canEditMurid({ roles: [role] }), true);
	assert.equal(canEditMurid({ roles: ['waka_sarpras'] }), false);
});
