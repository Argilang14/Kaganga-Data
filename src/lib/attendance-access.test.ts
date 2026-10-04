import test from 'node:test';
import assert from 'node:assert/strict';
import {
	attendanceActions,
	canAttendance,
	canAttendActivity,
	attendanceDateAllowed
} from './attendance-access.ts';
import { accessPositionValues, isRestrictedTeacher } from './access-position.ts';
import {
	effectivePermissions,
	permissionsForAccessPosition,
	systemOnlyPermissions
} from '../routes/pengguna/permissions.ts';

test('pimpinan dan operator memiliki izin operasional, bukan izin sistem', () => {
	for (const jabatanAkses of accessPositionValues) {
		const user = { type: 'user', jabatanAkses, permissions: [] };
		assert.equal(isRestrictedTeacher(user), false);
		for (const action of attendanceActions) assert.equal(canAttendance(user, action), true);
		const permissions = permissionsForAccessPosition(jabatanAkses);
		for (const permission of ['kelas_manage', 'rapor_manage', 'administrasi_jadwal'] as const)
			assert.ok(permissions.includes(permission));
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
