import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessMenu, canPrintDocument } from './role-menu-access.ts';
import { canAttendActivity, canViewAttendanceActivity } from './attendance-access.ts';
import {
	effectivePermissions,
	permissionsForAccessPosition
} from '../routes/pengguna/permissions.ts';

const user = (type: string, extra = {}) => ({ type, ...extra });
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
