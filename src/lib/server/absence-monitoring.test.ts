import assert from 'node:assert/strict';
import test from 'node:test';
import {
	canTransitionIzinPulangStatus,
	collapseActivityAttendanceByDay,
	effectiveIzinPulangStatus,
	findLongestStatusRun,
	listSchoolDays
} from './absence-monitoring.ts';

test('beberapa kegiatan pada hari yang sama hanya dihitung sebagai satu hari', () => {
	const result = collapseActivityAttendanceByDay([
		{ muridId: 7, tanggal: '2026-09-21', status: 'hadir' },
		{ muridId: 7, tanggal: '2026-09-21', status: 'sakit' },
		{ muridId: 7, tanggal: '2026-09-21', status: 'alfa' }
	]);
	assert.deepEqual(result, [
		{ muridId: 7, tanggal: '2026-09-21', status: 'sakit', sourceCount: 3 }
	]);
});

test('hari libur dan hari di luar pola sekolah tidak dihitung', () => {
	const result = listSchoolDays({
		start: '2026-09-21',
		end: '2026-09-27',
		hariSekolah: 6,
		holidayDates: ['2026-09-23']
	});
	assert.deepEqual(result, [
		'2026-09-21',
		'2026-09-22',
		'2026-09-24',
		'2026-09-25',
		'2026-09-26'
	]);
});

test('sakit berturut-turut mengikuti urutan hari sekolah', () => {
	const schoolDays = ['2026-09-21', '2026-09-22', '2026-09-24', '2026-09-25'];
	const statuses = new Map([
		['2026-09-21', 'sakit'],
		['2026-09-22', 'sakit'],
		['2026-09-24', 'sakit'],
		['2026-09-25', 'hadir']
	]);
	assert.deepEqual(findLongestStatusRun(schoolDays, statuses, 'sakit'), {
		start: '2026-09-21',
		end: '2026-09-24',
		length: 3
	});
});

test('izin yang melewati rencana kembali menjadi terlambat secara efektif', () => {
	assert.equal(
		effectiveIzinPulangStatus(
			{ status: 'sedang_izin', rencanaKembali: '2026-09-24', tanggalKembali: null },
			'2026-09-25'
		),
		'terlambat_kembali'
	);
	assert.equal(
		effectiveIzinPulangStatus(
			{
				status: 'sedang_izin',
				rencanaKembali: '2026-09-24',
				tanggalKembali: '2026-09-23'
			},
			'2026-09-25'
		),
		'sudah_kembali'
	);
});

test('izin yang telah selesai tidak dapat dibuka ulang tanpa membuat catatan baru', () => {
	assert.equal(canTransitionIzinPulangStatus('sedang_izin', 'sudah_kembali'), true);
	assert.equal(canTransitionIzinPulangStatus('sudah_kembali', 'sedang_izin'), false);
	assert.equal(canTransitionIzinPulangStatus('dibatalkan', 'sedang_izin'), false);
});
