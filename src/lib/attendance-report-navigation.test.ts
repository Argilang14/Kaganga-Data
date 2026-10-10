import test from 'node:test';
import assert from 'node:assert/strict';
import {
	attendanceMenuPath,
	attendanceReportMenuLink,
	attendanceReportClasses,
	attendanceReportSearch
} from './attendance-report-navigation.ts';

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
		'?tanggal_awal=2026-08-03&tanggal_akhir=2026-08-03&kelas_id=all'
	);
});

test('semua kelas hanya mencakup daftar kelas yang diizinkan', () => {
	assert.deepEqual(attendanceReportClasses([{ id: 7 }, { id: 9 }], 'all'), {
		allKelas: true,
		kelasId: null,
		kelasIds: [7, 9]
	});
	assert.deepEqual(attendanceReportClasses([], 'all').kelasIds, []);
});

test('kelas tunggal, default dan id di luar cakupan tetap menggunakan kelas yang diizinkan', () => {
	for (const requested of [null, '', '999', 'invalid'])
		assert.deepEqual(attendanceReportClasses([{ id: 7 }, { id: 9 }], requested), {
			allKelas: false,
			kelasId: 7,
			kelasIds: [7]
		});
	assert.deepEqual(attendanceReportClasses([{ id: 7 }, { id: 9 }], '9').kelasIds, [9]);
	assert.deepEqual(attendanceReportClasses([], '9').kelasIds, []);
});

test('monitoring dan rekap memiliki menu aktif yang terpisah', () => {
	assert.equal(
		attendanceMenuPath('/administrasi/absensi/kegiatan/rekap/'),
		'/administrasi/absensi/kegiatan/rekap'
	);
	for (const path of [
		'/administrasi/absensi/monitoring',
		'/administrasi/absensi/kegiatan',
		'/administrasi/absensi/kegiatan/pengaturan',
		'/administrasi/absensi/scan'
	])
		assert.equal(attendanceMenuPath(path), path);
});

test('dropdown mempertahankan query halaman sendiri dan konteks saat berpindah', () => {
	const monitoring = '/administrasi/absensi/monitoring';
	const recap = '/administrasi/absensi/kegiatan/rekap';
	const data = {
		monitoring: {
			date: '2026-08-03',
			classId: 7,
			focus: 'masuk',
			columns: [{ key: 'masuk', activityId: 12 }]
		}
	};
	assert.equal(
		attendanceReportMenuLink(monitoring, monitoring, '?q=Adi&page=2', data),
		monitoring + '?q=Adi&page=2'
	);
	const params = new URLSearchParams(
		attendanceReportMenuLink(recap, monitoring, '', data)!.split('?')[1]
	);
	assert.equal(params.get('kelas_id'), '7');
	assert.equal(params.get('kegiatan_id'), '12');
	assert.equal(params.get('tanggal_awal'), '2026-08-03');
	assert.equal(attendanceReportMenuLink(recap, '/murid', '?kelas_id=9', data), recap);
});

test('rekap sholat dan makan kembali ke kolom serta sumber monitoring yang sesuai', () => {
	for (const [kode, kategori, tab, kolom] of [
		['sholat_zuhur', 'sholat', 'sholat', 'zuhur'],
		['makan_siang', 'makan', 'makan', 'siang'],
		['apel_pulang', 'sekolah', 'sekolah', 'pulang'],
		['apel_malam', 'asrama', 'asrama', 'apel_malam'],
		['asrama_berangkat', 'asrama', 'asrama', 'asrama_berangkat'],
		['asrama_tiba', 'asrama', 'asrama', 'asrama_tiba']
	]) {
		const href = attendanceReportMenuLink(
			'/administrasi/absensi/monitoring',
			'/administrasi/absensi/kegiatan/rekap',
			'',
			{
				tanggalAkhir: '2026-08-03',
				kelasId: null,
				kegiatanId: 12,
				kegiatanList: [{ id: 12, kode, kategori }]
			}
		);
		const params = new URLSearchParams(href!.split('?')[1]);
		assert.equal(params.get('tab'), tab);
		assert.equal(params.get('kolom'), kolom);
		assert.equal(params.get('sumber_' + kolom), '12');
		assert.equal(params.has('kelas_id'), false);
	}
});

test('kegiatan tidak tersedia tidak disisipkan ke query monitoring', () => {
	const href = attendanceReportMenuLink(
		'/administrasi/absensi/monitoring',
		'/administrasi/absensi/kegiatan/rekap',
		'',
		{
			tanggalAkhir: '2026-08-03',
			kelasId: 7,
			kegiatanId: 99,
			kegiatanList: []
		}
	);
	assert.equal(href, '/administrasi/absensi/monitoring?tanggal=2026-08-03&kelas_id=7');
});
