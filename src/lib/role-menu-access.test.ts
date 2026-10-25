import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessMenu, canPrintDocument } from './role-menu-access.ts';
import { canAttendActivity, canViewAttendanceActivity } from './attendance-access.ts';
import {
	effectivePermissions,
	permissionsForAccessPosition
} from '../routes/pengguna/permissions.ts';

const user = (type: string, extra = {}) => ({ type, ...extra });
test('QR kelas printing remains restricted to class monitoring managers', () => {
	assert.ok(canPrintDocument(user('admin'), 'qr-kelas'));
	assert.ok(canPrintDocument(user('user', { jabatanAkses: 'kepala_sekolah' }), 'qr-kelas'));
	assert.ok(canPrintDocument(user('user', { permissions: ['class_monitoring_manage'] }), 'qr-kelas'));
	assert.ok(canAccessMenu(user('user', { permissions: ['class_monitoring_manage'] }), '/api/pdf/qr-kelas'));
	assert.equal(canAccessMenu(user('user'), '/api/pdf/qr-kelas'), false);
	for (const type of ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'tim_dapur', 'wali_murid'])
		assert.equal(canPrintDocument(user(type), 'qr-kelas'), false, type);
});
test('monitoring kelas has independent menu and API permissions', () => {
	for (const path of ['/administrasi/absensi/monitoring-kelas', '/api/administrasi/absensi/monitoring-kelas']) {
		assert.ok(canAccessMenu(user('user'), path));
		assert.ok(canAccessMenu(user('admin'), path));
		for (const type of ['wali_asuh', 'wali_asrama', 'tim_dapur', 'wali_murid']) {
			if (type !== 'wali_murid') assert.equal(canAccessMenu(user(type), path), false, type);
			assert.ok(canAccessMenu(user(type, { permissions: ['class_monitoring_lihat'] }), path));
		}
	}
	assert.ok(effectivePermissions(user('user')).includes('class_monitoring_scan'));
	assert.equal(effectivePermissions(user('user')).includes('class_monitoring_manage'), false);
	assert.ok(permissionsForAccessPosition('waka_humas').includes('class_monitoring_manage'));
});
test('guru only requested menus, APIs and documents', () => {
	for (const path of [
		'/murid',
		'/jurnal-mengajar',
		'/intrakurikuler',
		'/asesmen-formatif',
		'/asesmen-sumatif',
		'/administrasi/absensi/scan',
		'/administrasi/absensi/kegiatan',
		'/administrasi/absensi/kegiatan/rekap',
		'/administrasi/absensi/monitoring',
		'/surat-menyurat/sppd',
		'/surat-menyurat/dinas-luar',
		'/cetak',
		'/pengaturan/profil'
	])
		assert.ok(
			canAccessMenu(user('user', { permissions: effectivePermissions(user('user')) }), path),
			path
		);
	for (const path of [
		'/sekolah',
		'/pegawai',
		'/kelas',
		'/murid/arsip',
		'/keasramaan',
		'/cetak-raport',
		'/cetak/rapor.pdf',
		'/inventaris',
		'/api/database/export',
		'/api/keasramaan/export'
	])
		assert.equal(canAccessMenu(user('user'), path), false, path);
	assert.equal(canPrintDocument(user('user'), 'rapor'), false);
	assert.ok(canPrintDocument(user('user'), 'kartu-absensi'));
});
test('guardian roles differ only for dormitory administration by default', () => {
	for (const type of ['wali_asuh', 'wali_asrama']) {
		assert.ok(canAccessMenu(user(type), '/keasramaan'));
		assert.ok(canAccessMenu(user(type), '/asesmen-keasramaan'));
		assert.ok(canPrintDocument(user(type), 'keasramaan'));
		for (const doc of ['rapor', 'cover', 'biodata', 'piagam', 'martikulasi-sttm'])
			assert.equal(canPrintDocument(user(type), doc), false);
		assert.equal(canAccessMenu(user(type), '/intrakurikuler'), false);
		assert.equal(canAccessMenu(user(type), '/catatan-wali-asrama'), type === 'wali_asrama');
		assert.equal(canAccessMenu(user(type), '/rekap-nilai-asrama'), type === 'wali_asrama');
	}
});
test('meal staff cannot access or mutate other activity categories', () => {
	const kitchen = user('tim_dapur', { permissions: effectivePermissions(user('tim_dapur')) });
	assert.ok(canAccessMenu(kitchen, '/administrasi/absensi/kegiatan/rekap'));
	assert.ok(canAccessMenu(kitchen, '/administrasi/absensi/monitoring'));
	assert.ok(canAccessMenu(kitchen, '/surat-menyurat/sppd'));
	for (const path of [
		'/murid',
		'/cetak',
		'/administrasi/absensi',
		'/administrasi/absensi/kegiatan/pengaturan',
		'/administrasi/absensi/kartu-qr'
	])
		assert.equal(canAccessMenu(kitchen, path), false, path);
	assert.ok(canAttendActivity(kitchen, 'asrama', 'makan'));
	for (const category of ['sekolah', 'asrama', 'sholat', undefined]) {
		assert.equal(canAttendActivity(kitchen, 'semua', category), false);
		assert.equal(canViewAttendanceActivity(kitchen, category), false);
	}
});
test('existing leadership stays broad, Humas only adds attendance and letters', () => {
	for (const jabatanAkses of ['kepala_sekolah', 'waka_kurikulum', 'waka_sarpras'])
		assert.ok(canAccessMenu(user('user', { jabatanAkses }), '/inventaris'));
	const humas = user('user', {
		jabatanAkses: 'waka_humas',
		permissions: permissionsForAccessPosition('waka_humas')
	});
	assert.ok(canAccessMenu(humas, '/presensi-pegawai'));
	assert.ok(canAccessMenu(humas, '/surat-menyurat/arsip'));
	assert.equal(canAccessMenu(humas, '/inventaris'), false);
	assert.equal(canAccessMenu(humas, '/pengguna'), false);
});
test('manual admin exceptions open menu but keep other features closed', () => {
	assert.ok(canAccessMenu(user('user'), '/api/murid-photo/1'));
	assert.equal(canAccessMenu(user('user'), '/api/murid-bulk-photo'), false);
	assert.ok(canAccessMenu(user('user', { permissions: ['keasramaan_lihat'] }), '/keasramaan'));
	assert.equal(
		canAccessMenu(user('user', { permissions: ['keasramaan_lihat'] }), '/asesmen-keasramaan'),
		false
	);
	assert.ok(canPrintDocument(user('wali_asuh', { permissions: ['cetak_akademik'] }), 'rapor'));
	assert.ok(canAccessMenu(user('admin'), '/pengguna'));
	assert.equal(canAccessMenu(null, '/murid'), false);
	assert.equal(canAccessMenu(user('tidak_valid'), '/murid'), false);
	assert.equal(canPrintDocument(user('tidak_valid'), 'rapor'), false);
});
