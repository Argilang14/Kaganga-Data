import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	careDate,
	careText,
	careRequestKey,
	careShiftWindow,
	validCareTransition,
	canUsePengasuhan
} from './pengasuhan.ts';
import { canAccessMenu } from './role-menu-access.ts';

test('pengasuhan hanya role pendamping dan admin, bukan jabatan atau izin menu', () => {
	for (const type of ['admin', 'wali_asuh', 'wali_asrama']) {
		assert.equal(canUsePengasuhan({ type }), true);
		assert.equal(canAccessMenu({ type }, '/pengasuhan/sakit'), true);
	}
	for (const type of ['user', 'wali_kelas', 'tim_keamanan', 'tim_dapur', 'wali_murid']) {
		assert.equal(canUsePengasuhan({ type }), false);
		assert.equal(
			canAccessMenu({ type, jabatanAkses: 'kepala_sekolah' }, '/pengasuhan/kejadian'),
			false
		);
		assert.equal(
			canAccessMenu({ type, jabatanAkses: 'operator' }, '/api/pengasuhan/catatan/1'),
			false
		);
	}
	assert.equal(canUsePengasuhan(null), false);
});
test('tanggal tidak menerima tanggal palsu dan tanggal masa depan', () => {
	assert.equal(careDate('2026-10-25', '2026-10-25'), '2026-10-25');
	for (const date of ['2026-02-30', '2026-10-26', '', '2026-1-01', 'invalid'])
		assert.throws(() => careDate(date, '2026-10-25'));
});
test('status hanya bergerak maju, termasuk catatan koreksi setelah selesai', () => {
	assert.equal(validCareTransition('baru', 'diproses'), true);
	assert.equal(validCareTransition('selesai', 'selesai'), true);
	assert.equal(validCareTransition('selesai', 'baru'), false);
	assert.equal(validCareTransition('diproses', 'baru'), false);
});
test('piket malam melewati tanggal, bulan, dan tahun', () => {
	assert.deepEqual(careShiftWindow('2026-12-31', 'malam'), {
		start: '2026-12-31 23:01',
		end: '2027-01-01 07:00'
	});
	assert.deepEqual(careShiftWindow('2026-10-25', 'pagi'), {
		start: '2026-10-25 07:01',
		end: '2026-10-25 15:00'
	});
});
test('validasi catatan dan kunci formulir', () => {
	assert.equal(careText(' catatan ', 'Catatan'), 'catatan');
	assert.throws(() => careText(' ', 'Catatan'));
	assert.throws(() => careText('x'.repeat(3001), 'Catatan'));
	assert.throws(() => careRequestKey('bad'));
	assert.equal(careRequestKey('valid-request-key-123456'), 'valid-request-key-123456');
});
