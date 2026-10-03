import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	canDownloadDatabaseBackup,
	canExportClassData,
	hasClassExportAccess
} from './export-access.ts';

test('whole database backup is restricted to administrators', () => {
	assert.equal(canDownloadDatabaseBackup({ type: 'admin' }), true);
	for (const type of [
		'kepala_sekolah',
		'user',
		'wali_kelas',
		'wali_asuh',
		'wali_asrama',
		'unknown'
	]) {
		assert.equal(canDownloadDatabaseBackup({ type, permissions: ['dashboard_manage'] }), false);
	}
	assert.equal(canDownloadDatabaseBackup({ type: 'user', jabatanAkses: 'kepala_sekolah' }), false);
	assert.equal(canDownloadDatabaseBackup(null), false);
});

test('feature permission and class assignment are independent checks', () => {
	assert.equal(canExportClassData({ type: 'user' }, 'absensi'), false);
	assert.equal(
		canExportClassData({ type: 'user', permissions: ['administrasi_absensi'] }, 'absensi'),
		true
	);
	for (const type of ['wali_asuh', 'wali_asrama'])
		assert.equal(canExportClassData({ type }, 'keasramaan'), true);
	assert.equal(canExportClassData(null, 'keasramaan'), false);
});

test('all roles are constrained to the selected class school', () => {
	for (const type of [
		'admin',
		'kepala_sekolah',
		'user',
		'wali_kelas',
		'wali_asuh',
		'wali_asrama'
	]) {
		assert.equal(
			hasClassExportAccess({
				user: { type, sekolahId: 1 },
				sekolahId: 1,
				classSchoolId: 2,
				assigned: true
			}),
			false
		);
	}
});

test('non-admin roles require their own school and assignments', () => {
	for (const type of ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama']) {
		for (const assigned of [false, true]) {
			assert.equal(
				hasClassExportAccess({
					user: { type, sekolahId: 1 },
					sekolahId: 1,
					classSchoolId: 1,
					assigned
				}),
				assigned
			);
		}
		assert.equal(
			hasClassExportAccess({
				user: { type, sekolahId: 2 },
				sekolahId: 1,
				classSchoolId: 1,
				assigned: true
			}),
			false
		);
	}
	assert.equal(
		hasClassExportAccess({
			user: { type: 'kepala_sekolah', sekolahId: 1 },
			sekolahId: 1,
			classSchoolId: 1,
			assigned: false
		}),
		false
	);
	assert.equal(
		hasClassExportAccess({
			user: { type: 'user', jabatanAkses: 'waka_kurikulum', sekolahId: 1 },
			sekolahId: 1,
			classSchoolId: 1,
			assigned: false
		}),
		true
	);
	assert.equal(
		hasClassExportAccess({
			user: { type: 'unknown', sekolahId: 1 },
			sekolahId: 1,
			classSchoolId: 1,
			assigned: true
		}),
		false
	);
});
