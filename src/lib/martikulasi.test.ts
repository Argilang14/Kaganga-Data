import assert from 'node:assert/strict';
import test from 'node:test';

const {
	formatNomorSttm,
	hitungStatusKelengkapanMartikulasi,
	isFormatNomorSttmValid,
	martikulasiLevelLabel,
	martikulasiAspekAkademik,
	martikulasiAspekKarakter,
	normalizeMartikulasiLevel
} = (await import('./martikulasi' + '.ts')) as typeof import('./martikulasi');

const akademikLengkap = martikulasiAspekAkademik.map(() => ({
	capaianAwal: '70',
	capaianAkhir: '85',
	ketuntasan: 'tuntas' as const
}));
const karakterLengkap = martikulasiAspekKarakter.map(() => ({
	deskripsiCapaian: 'Menunjukkan perkembangan baik.'
}));

test('aspek akademik tidak menduplikasi Bahasa Indonesia di luar Literasi', () => {
	assert.deepEqual(
		martikulasiAspekAkademik.map((aspek) => aspek.kode),
		['literasi', 'numerasi', 'sains', 'bahasa_inggris']
	);
});

test('status lengkap hanya jika seluruh aspek dan level penempatan terisi', () => {
	assert.equal(
		hitungStatusKelengkapanMartikulasi({
			akademik: akademikLengkap,
			karakter: karakterLengkap,
			levelPenempatan: 'mahir'
		}),
		'lengkap'
	);
	assert.equal(
		hitungStatusKelengkapanMartikulasi({
			akademik: akademikLengkap,
			karakter: karakterLengkap,
			levelPenempatan: null
		}),
		'belum_lengkap'
	);
});

test('ketuntasan tetap keputusan manual dan tidak diturunkan dari capaian angka', () => {
	assert.equal(
		hitungStatusKelengkapanMartikulasi({
			akademik: akademikLengkap.map((item, index) =>
				index === 0 ? { ...item, ketuntasan: null } : item
			),
			karakter: karakterLengkap,
			levelPenempatan: 'madya'
		}),
		'belum_lengkap'
	);
});

test('level lama dipetakan ke Dasar, Madya, dan Mahir', () => {
	assert.equal(normalizeMartikulasiLevel('perlu_penguatan'), 'dasar');
	assert.equal(normalizeMartikulasiLevel('siap_dengan_pendampingan'), 'madya');
	assert.equal(normalizeMartikulasiLevel('siap'), 'mahir');
	assert.equal(martikulasiLevelLabel('dasar'), 'Level Dasar');
	assert.equal(martikulasiLevelLabel('siap_dengan_pendampingan'), 'Level Madya');
});

test('format nomor STTM mengganti token secara konsisten', () => {
	assert.equal(
		formatNomorSttm('{urut}/STTM/SR/{bulan_romawi}/{tahun}/{tahun_ajaran}/{nis}', {
			urut: 7,
			tanggal: '2026-09-12',
			tahunAjaran: '2026/2027',
			nis: '26001'
		}),
		'007/STTM/SR/IX/2026/2026-2027/26001'
	);
	assert.equal(isFormatNomorSttmValid('{urut}/STTM/{tahun}'), true);
	assert.equal(isFormatNomorSttmValid('STTM/{tahun}'), false);
});
