import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildAttendanceScanGroups,
	canScanModeActivity,
	canScanStudentTravel,
	parseAttendanceScanMode,
	type ScanActivity
} from './attendance-scan.ts';
import {
	canonicalAttendanceActivityCode,
	selectAttendanceActivitySources
} from './attendance-activity.ts';
import { canAttendance, canAttendActivity } from './attendance-access.ts';
import { resolveMonitoringColumns } from './attendance-monitoring.ts';
import { effectivePermissions } from '../routes/pengguna/permissions.ts';
import { canAccessMenu, canPrintDocument } from './role-menu-access.ts';

const activities: ScanActivity[] = [
	['apel_berangkat', 'sekolah', 'sekolah'],
	['apel_pulang', 'sekolah', 'sekolah'],
	['asrama_berangkat', 'asrama', 'asrama'],
	['asrama_tiba', 'asrama', 'asrama'],
	['apel_malam', 'asrama', 'asrama'],
	['makan_pagi', 'makan', 'asrama'],
	['makan_siang', 'makan', 'asrama'],
	['makan_malam', 'makan', 'asrama'],
	['sholat_subuh', 'sholat', 'asrama'],
	['sholat_zuhur', 'sholat', 'asrama'],
	['sholat_asar', 'sholat', 'asrama'],
	['sholat_magrib', 'sholat', 'asrama'],
	['sholat_isya', 'sholat', 'asrama']
].map(([kode, kategori, aksesEdit], i) => ({ id: i + 1, kode, kategori, aksesEdit, nama: kode }));
const weekday = '2026-10-16';
const groups = (type: string, date = weekday) =>
	buildAttendanceScanGroups({ type }, activities, date);

test('five scan modes are explicit and reject legacy/unknown mode labels', () => {
	for (const mode of ['pegawai', 'sekolah', 'makan', 'asrama', 'pulang'])
		assert.equal(parseAttendanceScanMode(mode), mode);
	for (const mode of ['kegiatan', 'constructor', '', undefined])
		assert.equal(parseAttendanceScanMode(mode), null);
	assert.deepEqual(buildAttendanceScanGroups(null, activities, weekday), []);
});

test('teachers get classroom attendance and school activities, kitchen gets meals only', () => {
	for (const type of ['user', 'wali_kelas']) {
		const result = groups(type);
		assert.deepEqual(
			result.map((group) => group.mode),
			['pegawai', 'sekolah']
		);
		assert.deepEqual(
			result[1].activities.map((item) => item.key),
			['apel_berangkat', 'apel_pulang', 'sholat_zuhur', 'sholat_asar']
		);
		assert.deepEqual(
			groups(type, '2026-10-17')[1].activities.map((item) => item.key),
			['apel_berangkat', 'apel_pulang']
		);
		assert.equal(result[0].status, 'available');
		assert.equal(result[0].onlineRequired, true);
		assert.equal(result[0].qrKind, 'kelas');
	}
	assert.deepEqual(
		groups('tim_dapur').map((group) => group.mode),
		['makan']
	);
	assert.equal(groups('tim_dapur')[0].activities.length, 3);
});

test('guardians get dormitory and five prayers, without meal mutation or future employee dorm scan', () => {
	for (const type of ['wali_asuh', 'wali_asrama']) {
		const result = groups(type, '2026-10-18');
		assert.deepEqual(
			result.map((group) => group.mode),
			['asrama']
		);
		assert.equal(result[0].activities.length, 8);
		assert.equal(canAttendActivity({ type }, 'asrama', 'makan'), false);
	}
});

test('leadership retains operational modes and shared prayers use identical existing IDs', () => {
	for (const user of [
		{ type: 'admin' },
		{ type: 'user', jabatanAkses: 'waka_humas' },
		{ type: 'user', jabatanAkses: 'operator' }
	]) {
		const result = buildAttendanceScanGroups(user, activities, weekday);
		assert.deepEqual(
			result.map((group) => group.mode),
			['pegawai', 'sekolah', 'makan', 'asrama', 'pulang']
		);
		for (const key of ['sholat_zuhur', 'sholat_asar']) {
			const school = result
				.find((group) => group.mode === 'sekolah')!
				.activities.find((item) => item.key === key)!;
			const dorm = result
				.find((group) => group.mode === 'asrama')!
				.activities.find((item) => item.key === key)!;
			assert.equal(school.activityId, dorm.activityId);
			assert.equal(school.activityId, activities.find((item) => item.kode === key)!.id);
		}
	}
});

test('security permissions separate recording a journey from authorizing permits or ordinary attendance', () => {
	const user = {
		type: 'tim_keamanan',
		permissions: effectivePermissions({ type: 'tim_keamanan' })
	};
	assert.deepEqual(user.permissions.sort(), ['absensi_perjalanan', 'absensi_scan']);
	assert.equal(canScanStudentTravel(user), true);
	assert.equal(canScanStudentTravel({ type: 'user' }), false);
	assert.equal(canScanStudentTravel({ type: 'user', permissions: ['absensi_perjalanan'] }), true);
	for (const action of [
		'input',
		'lihat',
		'koreksi',
		'export',
		'izin_pulang',
		'pengaturan',
		'qr_manage'
	] as const)
		assert.equal(canAttendance(user, action), false);
	assert.equal(
		canAttendance({ ...user, permissions: ['absensi_izin_pulang'] }, 'izin_pulang'),
		false
	);
	const result = groups('tim_keamanan');
	assert.deepEqual(
		result.map((group) => group.mode),
		['pulang']
	);
	assert.equal(result[0].status, 'available');
	assert.equal(result[0].onlineRequired, true);
	assert.deepEqual(
		result[0].activities.map((item) => item.key),
		['pulang_ke_rumah', 'kembali_ke_sekolah']
	);
	for (const path of [
		'/administrasi/absensi/scan',
		'/administrasi/absensi/konfirmasi-pulang',
		'/api/administrasi/absensi/scan',
		'/pengaturan/profil'
	])
		assert.equal(canAccessMenu(user, path), true, path);
	for (const path of [
		'/murid',
		'/pengguna',
		'/cetak',
		'/administrasi/absensi/kegiatan',
		'/administrasi/absensi/monitoring',
		'/administrasi/absensi/monitoring-kelas',
		'/api/administrasi/absensi/kegiatan/rekap/export',
		'/api/murid-photo/1'
	])
		assert.equal(canAccessMenu(user, path), false, path);
	assert.equal(canPrintDocument(user, 'qr-kelas'), false);
});

test('forged mode/category combinations and anonymous scans are rejected', () => {
	const meal = activities.find((item) => item.kode === 'makan_pagi')!;
	assert.equal(canScanModeActivity({ type: 'user' }, 'sekolah', meal, weekday), false);
	assert.equal(canScanModeActivity({ type: 'wali_asrama' }, 'asrama', meal, weekday), false);
	assert.equal(canScanModeActivity({ type: 'tim_keamanan' }, 'makan', meal, weekday), false);
	assert.equal(canScanModeActivity(null, 'makan', meal, weekday), false);
	assert.equal(canAttendActivity({ type: 'wali_asrama' }, 'semua', 'sekolah'), false);
	assert.equal(canAttendActivity({ type: 'user' }, 'semua', 'asrama'), false);
});

test('legacy prayer aliases resolve one source deterministically, preserving source objects', () => {
	const canonical = activities.find((item) => item.kode === 'sholat_zuhur')!;
	const alias = { ...canonical, id: 90, kode: 'sholat_dzuhur' };
	const original = JSON.stringify([alias, canonical]);
	assert.deepEqual(selectAttendanceActivitySources([alias, canonical]), [canonical]);
	assert.deepEqual(selectAttendanceActivitySources([canonical, alias]), [canonical]);
	assert.equal(JSON.stringify([alias, canonical]), original);
	assert.deepEqual(selectAttendanceActivitySources([alias]), [alias]);
	assert.equal(canonicalAttendanceActivityCode('sholat_ashar'), 'sholat_asar');
	assert.equal(canonicalAttendanceActivityCode('constructor'), 'constructor');
	const cols = resolveMonitoringColumns(
		'sholat',
		[{ ...alias, jamMulai: '12:00' }],
		new URLSearchParams()
	);
	assert.equal(cols.find((item) => item.key === 'zuhur')!.activityId, alias.id);
	const explicit = resolveMonitoringColumns(
		'sholat',
		[alias, canonical].map((item) => ({ ...item, jamMulai: '12:00' })),
		new URLSearchParams({ sumber_zuhur: '90' })
	);
	assert.equal(explicit.find((item) => item.key === 'zuhur')!.activityId, 90);
});
