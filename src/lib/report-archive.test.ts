import assert from 'node:assert/strict';
import test from 'node:test';
import {
	reportSelection,
	verifiedReportMetadata,
	reportHistoryIds,
	reportRevisionReason
} from './report-archive.ts';

const metadata = {
	schoolName: 'Sekolah Contoh',
	npsn: '00001234',
	address: 'Jalan Sekolah',
	principalName: 'Kepala Sekolah',
	principalNip: '',
	principalStatus: 'definitif',
	caregiverName: 'Wali Asuh Contoh',
	caregiverNip: '',
	teacherName: 'Wali Contoh',
	teacherNip: '-',
	place: 'Bengkulu',
	date: '2026-06-20'
};

test('batch selection is bounded, unique and uses positive integer history IDs', () => {
	assert.deepEqual(reportHistoryIds([1, 2]), [1, 2]);
	for (const input of [
		null,
		[],
		[1, 1],
		[0],
		['1'],
		[1.2],
		Array.from({ length: 21 }, (_, i) => i + 1)
	])
		assert.throws(() => reportHistoryIds(input));
});
test('revisions need an explicit safe reason', () => {
	assert.equal(
		reportRevisionReason('  Koreksi sesuai berita acara  '),
		'Koreksi sesuai berita acara'
	);
	for (const input of [
		null,
		'',
		'singkat',
		'<b>alasan revisi</b>',
		'x'.repeat(1001),
		'alasan\nbaru panjang'
	])
		assert.throws(() => reportRevisionReason(input));
});

test('report selection only accepts supported kinds and periods', () => {
	assert.deepEqual(reportSelection('sekolah', 'rts'), { kind: 'sekolah', period: 'rts' });
	assert.deepEqual(reportSelection('asrama', 'ras'), { kind: 'asrama', period: 'ras' });
	assert.deepEqual(reportSelection('martikulasi', 'ras'), { kind: 'martikulasi', period: 'ras' });
	for (const [kind, period] of [
		['asrama', 'rts'],
		['martikulasi', 'rts'],
		['sekolah', 'x'],
		['x', 'ras'],
		[null, null]
	]) {
		assert.throws(() => reportSelection(kind, period));
	}
});
test('metadata retains leading zeros, trims values, and accepts optional NIP', () => {
	assert.equal(
		verifiedReportMetadata({ ...metadata, schoolName: ' Sekolah Contoh ' }).schoolName,
		metadata.schoolName
	);
	assert.equal(verifiedReportMetadata(metadata).npsn, '00001234');
	assert.equal(
		verifiedReportMetadata({ ...metadata, principalNip: '198107112023211001' }).principalNip,
		'198107112023211001'
	);
});
test('metadata rejects incomplete, unsafe, and oversized values', () => {
	for (const input of [
		null,
		[],
		{},
		{ ...metadata, schoolName: '' },
		{ ...metadata, npsn: '1234567' },
		{ ...metadata, npsn: 12345678 },
		{ ...metadata, teacherNip: '123' },
		{ ...metadata, address: '<script>' },
		{ ...metadata, place: 'x'.repeat(601) }
	]) {
		assert.throws(() => verifiedReportMetadata(input));
	}
});
test('report dates must be real calendar dates', () => {
	assert.equal(verifiedReportMetadata({ ...metadata, date: '2024-02-29' }).date, '2024-02-29');
	for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '20/06/2026', '']) {
		assert.throws(() => verifiedReportMetadata({ ...metadata, date }));
	}
});
