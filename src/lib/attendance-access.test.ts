import test from 'node:test';
import assert from 'node:assert/strict';
import {
	attendanceActions,
	canAttendance,
	canAttendActivity,
	attendanceDateAllowed,
	hasSchoolWideAttendanceStudentAccess
} from './attendance-access.ts';
import { accessPositionValues, isRestrictedTeacher } from './access-position.ts';
import {
	effectivePermissions,
	permissionsForAccessPosition,
	systemOnlyPermissions
} from '../routes/pengguna/permissions.ts';

test('cakupan semua murid absensi hanya untuk Wali Asrama di sekolah sendiri', () => {
	assert.equal(
		hasSchoolWideAttendanceStudentAccess({ type: 'wali_asrama', sekolahId: 7 }, 7),
		true
	);
	assert.equal(
		hasSchoolWideAttendanceStudentAccess({ type: 'wali_asrama', sekolahId: 7 }, 8),
		false
	);
	for (const type of ['user', 'wali_kelas', 'wali_asuh', 'tim_dapur', 'admin']) {
		assert.equal(hasSchoolWideAttendanceStudentAccess({ type, sekolahId: 7 }, 7), false);
	}
	assert.equal(hasSchoolWideAttendanceStudentAccess(null, 7), false);
	assert.equal(hasSchoolWideAttendanceStudentAccess(undefined, 7), false);
});

test('cakupan Wali Asrama tidak menambah izin berisiko atau input kegiatan sekolah', () => {
	const user = { type: 'wali_asrama', sekolahId: 7, permissions: [] };
	assert.equal(hasSchoolWideAttendanceStudentAccess(user, 7), true);
	assert.equal(canAttendActivity(user, 'asrama'), true);
	assert.equal(canAttendActivity(user, 'sekolah'), false);
	for (const action of ['impor', 'pengaturan', 'qr_manage', 'koreksi_lama'] as const) {
		assert.equal(canAttendance(user, action), false);
	}
});

test('pimpinan dan operator memiliki izin operasional, bukan izin sistem', () => {
	for (const jabatanAkses of accessPositionValues) {
		const user = { type: 'user', jabatanAkses, permissions: [] };
		assert.equal(isRestrictedTeacher(user), false);
		for (const action of attendanceActions) assert.equal(canAttendance(user, action), true);
		const permissions = permissionsForAccessPosition(jabatanAkses);
		for (const permission of ['kelas_manage', 'rapor_manage', 'administrasi_jadwal'] as const)
			assert.equal(permissions.includes(permission), jabatanAkses !== 'waka_humas');
		for (const permission of systemOnlyPermissions) assert.ok(!permissions.includes(permission));
	}
});
test('guru dan wali memperoleh izin dasar, tindakan berisiko tetap memerlukan izin', () => {
	for (const type of ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama']) {
		const user = { type, permissions: [] };
		for (const action of ['lihat', 'scan', 'input', 'koreksi', 'export'] as const)
			assert.ok(canAttendance(user, action));
		for (const action of [
			'koreksi_lama',
			'impor',
			'pengaturan',
			'qr_manage',
			'sinkron_rapor',
			'izin_pulang'
		] as const)
			assert.equal(canAttendance(user, action), false);
		assert.ok(effectivePermissions(user).includes('absensi_scan'));
	}
});
test('izin lama absensi tidak membuka impor, reset QR, atau pengaturan', () => {
	const user = { type: 'wali_murid', permissions: ['administrasi_absensi'] };
	assert.equal(canAttendance(user, 'lihat'), true);
	assert.equal(canAttendance(user, 'pengaturan'), false);
	assert.equal(canAttendance(user, 'sinkron_rapor'), false);
});
test('hak tambahan admin tidak memperluas tanggung jawab kegiatan guru dan wali', () => {
	assert.ok(canAttendActivity({ type: 'user' }, 'sekolah'));
	assert.equal(
		canAttendActivity({ type: 'user', permissions: ['absensi_pengaturan'] }, 'asrama'),
		false
	);
	assert.ok(canAttendActivity({ type: 'wali_asuh' }, 'asrama'));
	assert.equal(canAttendActivity({ type: 'wali_asuh' }, 'sekolah'), false);
	assert.ok(canAttendActivity({ type: 'wali_asrama' }, 'semua'));
	assert.equal(canAttendActivity(undefined, 'semua'), false);
});
test('tanggal hari ini boleh, tanggal lama perlu izin dan tanggal mustahil ditolak', () => {
	const today = '2026-10-04';
	assert.ok(attendanceDateAllowed({ type: 'user' }, today, today));
	assert.equal(attendanceDateAllowed({ type: 'user' }, '2026-10-03', today), false);
	assert.ok(
		attendanceDateAllowed(
			{ type: 'user', permissions: ['absensi_koreksi_lama'] },
			'2026-10-03',
			today
		)
	);
	assert.equal(attendanceDateAllowed({ type: 'admin' }, '2026-10-05', today), false);
	assert.equal(attendanceDateAllowed({ type: 'admin' }, '2026-02-31', today), false);
});
test('operator tidak mendapat persetujuan pimpinan atau pengelolaan pengguna', () => {
	const user = {
		type: 'user',
		jabatanAkses: 'operator' as const,
		permissions: ['user_add' as const]
	};
	assert.equal(effectivePermissions(user).includes('user_add'), false);
	assert.equal(effectivePermissions(user).includes('persetujuan_setujui'), false);
});

test('guru dan wali kelas dapat mencatat Zuhur/Asar pada Senin-Jumat saja', () => {
	for (const type of ['user', 'wali_kelas']) {
		for (const kode of ['sholat_zuhur', 'sholat_dzuhur', 'sholat_asar', 'sholat_ashar']) {
			for (const tanggal of [
				'2026-08-03',
				'2026-08-04',
				'2026-08-05',
				'2026-08-06',
				'2026-08-07'
			]) {
				assert.equal(canAttendActivity({ type }, 'asrama', 'sholat', { kode, tanggal }), true);
			}
			for (const tanggal of ['2026-08-08', '2026-08-09', '2026-02-31', 'invalid', undefined]) {
				assert.equal(canAttendActivity({ type }, 'asrama', 'sholat', { kode, tanggal }), false);
			}
		}
	}
});

test('guru tidak memperoleh akses sholat lain walaupun akses kegiatan diatur semua', () => {
	for (const kode of [
		'sholat_subuh',
		'sholat_magrib',
		'sholat_isya',
		'sholat_tambahan',
		undefined
	]) {
		for (const scope of ['sekolah', 'asrama', 'semua']) {
			assert.equal(
				canAttendActivity(
					{ type: 'user', permissions: ['absensi_pengaturan', 'absensi_koreksi_lama'] },
					scope,
					'sholat',
					{ kode, tanggal: '2026-08-03' }
				),
				false
			);
		}
	}
	assert.equal(
		canAttendActivity({ type: 'tim_dapur' }, 'semua', 'sholat', {
			kode: 'sholat_zuhur',
			tanggal: '2026-08-03'
		}),
		false
	);
});

test('wali asuh/asrama tetap dapat mencatat lima waktu termasuk Sabtu-Minggu', () => {
	for (const type of ['wali_asuh', 'wali_asrama']) {
		for (const kode of [
			'sholat_subuh',
			'sholat_zuhur',
			'sholat_asar',
			'sholat_magrib',
			'sholat_isya'
		]) {
			for (const tanggal of ['2026-08-03', '2026-08-08', '2026-08-09']) {
				assert.equal(canAttendActivity({ type }, 'asrama', 'sholat', { kode, tanggal }), true);
			}
		}
	}
});

test('pimpinan/operator tetap mendapat akses operasional sholat tanpa pembatasan role guru', () => {
	for (const user of [
		{ type: 'admin' },
		{ type: 'user', jabatanAkses: 'kepala_sekolah' },
		{ type: 'user', jabatanAkses: 'operator' }
	]) {
		assert.equal(
			canAttendActivity(user, 'asrama', 'sholat', { kode: 'sholat_subuh', tanggal: '2026-08-09' }),
			true
		);
	}
});
