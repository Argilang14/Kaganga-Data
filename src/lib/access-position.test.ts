import test from 'node:test';
import assert from 'node:assert/strict';
import {
	accessPositionValues,
	hasSchoolWideOperationalAccess,
	isLeadershipAccessPosition,
	parseAccessPosition
} from './access-position.ts';

test('jabatan akses hanya menerima nilai resmi', () => {
	for (const position of accessPositionValues)
		assert.equal(parseAccessPosition(position), position);
	assert.equal(parseAccessPosition('waka_lainnya'), null);
	assert.equal(parseAccessPosition(null), null);
});

test('jabatan pimpinan dan operator mendapat cakupan sekolah', () => {
	for (const position of accessPositionValues) {
		assert.equal(hasSchoolWideOperationalAccess({ type: 'user', jabatanAkses: position }), true);
	}
	assert.equal(hasSchoolWideOperationalAccess({ type: 'user', jabatanAkses: null }), false);
	assert.equal(hasSchoolWideOperationalAccess({ type: 'admin' }), true);
});

test('operator bukan jabatan persetujuan pimpinan', () => {
	assert.equal(isLeadershipAccessPosition('kepala_sekolah'), true);
	assert.equal(isLeadershipAccessPosition('waka_kesiswaan'), true);
	assert.equal(isLeadershipAccessPosition('operator'), false);
});
