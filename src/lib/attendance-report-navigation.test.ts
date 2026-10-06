import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceMenuPath, attendanceReportSearch } from './attendance-report-navigation.ts';

test('monitoring menuju rekap membawa tanggal, kelas dan kegiatan pilihan', () => {
	const params = new URLSearchParams(
		attendanceReportSearch('rekap', { date: '2026-08-03', classId: 7, activityId: 12 })
	);
	assert.equal(params.get('tanggal_awal'), '2026-08-03');
	assert.equal(params.get('tanggal_akhir'), '2026-08-03');
	assert.equal(params.get('kelas_id'), '7');
	assert.equal(params.get('kegiatan_id'), '12');
	assert.equal(params.has('tanggal'), false);
});

test('rekap menuju monitoring menggunakan tanggal akhir dan kelas, bukan query rekap', () => {
	const params = new URLSearchParams(
		attendanceReportSearch('monitoring', { date: '2026-08-07', classId: 7, activityId: 12 })
	);
	assert.equal(params.get('tanggal'), '2026-08-07');
	assert.equal(params.get('kelas_id'), '7');
	assert.equal(params.has('tanggal_awal'), false);
	assert.equal(params.has('kegiatan_id'), false);
});

test('cakupan tanpa kelas/kegiatan tidak mengirim id palsu', () => {
	assert.equal(
		attendanceReportSearch('rekap', { date: '2026-08-03', classId: null, activityId: null }),
		'?tanggal_awal=2026-08-03&tanggal_akhir=2026-08-03'
	);
});

test('halaman rekap mengaktifkan menu gabungan tanpa mengubah menu catat atau pengaturan', () => {
	assert.equal(
		attendanceMenuPath('/administrasi/absensi/kegiatan/rekap/'),
		'/administrasi/absensi/monitoring'
	);
	for (const path of [
		'/administrasi/absensi/monitoring',
		'/administrasi/absensi/kegiatan',
		'/administrasi/absensi/kegiatan/pengaturan',
		'/administrasi/absensi/scan'
	])
		assert.equal(attendanceMenuPath(path), path);
});
