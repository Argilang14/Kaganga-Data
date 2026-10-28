import test from 'node:test';
import assert from 'node:assert/strict';
import {
	canUseStudentProfile,
	emptyStudentProfile,
	validateStudentProfilePatch,
	validateStudentProfileConsistency
} from './murid-profile.ts';

test('profil kosong tidak mengarang bantuan, kondisi keluarga, atau persetujuan', () => {
	assert.equal(emptyStudentProfile.nomorKk, null);
	assert.equal(emptyStudentProfile.statusBansos, null);
	assert.equal(emptyStudentProfile.bersediaAsrama, null);
	assert.equal(emptyStudentProfile.suratPernyataanDitandatangani, null);
	assert.deepEqual(validateStudentProfilePatch({}), {});
	assert.doesNotThrow(() => validateStudentProfileConsistency({ ...emptyStudentProfile }));
});

test('KK dan RT/RW mempertahankan nol awal, nilai Tidak dan nol tidak berubah menjadi kosong', () => {
	assert.deepEqual(
		validateStudentProfilePatch({
			nomorKk: '0012345678901234',
			rt: '001',
			rw: '08',
			bersediaAsrama: false,
			suratPernyataanDitandatangani: false,
			jumlahTanggungan: 0,
			desilDtsen: 10
		}),
		{
			nomorKk: '0012345678901234',
			rt: '001',
			rw: '08',
			bersediaAsrama: false,
			suratPernyataanDitandatangani: false,
			jumlahTanggungan: 0,
			desilDtsen: 10
		}
	);
});

test('kepemilikan, foto utama, identitas, dan versi tidak boleh diisi melalui biodata tambahan', () => {
	for (const key of [
		'id',
		'muridId',
		'identityUid',
		'sekolahId',
		'semesterId',
		'nisn',
		'foto',
		'storageKey',
		'createdBy',
		'revisi',
		'petugasPendataanNama',
		'__proto__'
	]) {
		const input = Object.fromEntries([[key, 'diubah']]);
		assert.throws(() => validateStudentProfilePatch(input), key);
	}
});

test('validasi menolak KK angka, pilihan palsu, tanggal tidak sah, dan rentang di luar batas', () => {
	for (const input of [
		{ nomorKk: 1234567890123456 },
		{ nomorKk: '1234' },
		{ nomorKk: 'abcdefghijklmnop' },
		{ rt: '-1' },
		{ rw: '1234' },
		{ desilDtsen: 0 },
		{ desilDtsen: 11 },
		{ desilDtsen: 1.5 },
		{ jumlahTanggungan: -1 },
		{ jumlahTanggungan: '3' },
		{ luasTempatTinggal: Infinity },
		{ luasTempatTinggal: -2 },
		{ statusHunian: 'bebas' },
		{ statusSertifikat: 'milik yayasan' },
		{ bersediaAsrama: 'false' },
		{ suratPernyataanDitandatangani: 0 },
		{ tanggalPendataan: '2026-02-30' },
		{ tanggalSuratPernyataan: '2026-13-01' },
		{ catatanPetugas: 'x'.repeat(2001) },
		{ jenisBansos: ['tidak_terdaftar'] },
		{ jenisBansos: {} },
		{ petugasPendataanId: 0 }
	])
		assert.throws(() => validateStudentProfilePatch(input), JSON.stringify(input));
	assert.doesNotThrow(() => validateStudentProfilePatch({ tanggalPendataan: '2024-02-29' }));
});

test('bantuan sosial dan tanggal surat harus sesuai status, tanpa menghapus rincian diam-diam', () => {
	assert.throws(() =>
		validateStudentProfileConsistency({ ...emptyStudentProfile, jenisBansos: ['pkh'] })
	);
	assert.throws(() =>
		validateStudentProfileConsistency({
			...emptyStudentProfile,
			statusBansos: 'tidak_menerima',
			jenisBansos: ['pkh']
		})
	);
	assert.throws(() =>
		validateStudentProfileConsistency({ ...emptyStudentProfile, bansosLainnya: 'Bantuan daerah' })
	);
	assert.throws(() =>
		validateStudentProfileConsistency({
			...emptyStudentProfile,
			tanggalSuratPernyataan: '2026-10-01'
		})
	);
	assert.doesNotThrow(() =>
		validateStudentProfileConsistency({
			...emptyStudentProfile,
			statusBansos: 'menerima',
			jenisBansos: ['pkh', 'lainnya'],
			bansosLainnya: 'Bantuan daerah',
			suratPernyataanDitandatangani: true,
			tanggalSuratPernyataan: '2026-10-01'
		})
	);
});

test('akses Data Murid, absensi luas, role wali, dan cetak umum tidak membuka profil pribadi', () => {
	for (const type of ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama']) {
		const user = {
			type,
			sekolahId: 1,
			permissions: ['menu_murid', 'kelas_manage', 'absensi_lihat', 'cetak_dokumen']
		};
		for (const action of ['read', 'edit', 'print'] as const)
			assert.equal(canUseStudentProfile(user, 1, action), false);
	}
	assert.equal(canUseStudentProfile(null, 1, 'read'), false);
	assert.equal(canUseStudentProfile({ type: 'admin', mustChangePassword: true }, 1, 'read'), false);
	assert.equal(canUseStudentProfile({ type: 'admin' }, 0, 'read'), false);
});

test('izin baca, kelola, dan cetak terpisah serta tidak lintas sekolah', () => {
	const user = { type: 'wali_asuh', sekolahId: 1, permissions: ['murid_profil_lihat'] };
	assert.equal(canUseStudentProfile(user, 1, 'read'), true);
	assert.equal(canUseStudentProfile(user, 1, 'edit'), false);
	assert.equal(canUseStudentProfile(user, 1, 'print'), false);
	assert.equal(canUseStudentProfile(user, 2, 'read'), false);
	assert.equal(
		canUseStudentProfile({ ...user, permissions: ['murid_profil_manage'] }, 1, 'read'),
		true
	);
	assert.equal(
		canUseStudentProfile({ ...user, permissions: ['murid_profil_manage'] }, 1, 'edit'),
		true
	);
	assert.equal(
		canUseStudentProfile({ ...user, permissions: ['murid_profil_cetak'] }, 1, 'print'),
		true
	);
	for (const type of ['wali_murid', 'tim_dapur', 'tim_keamanan'])
		assert.equal(
			canUseStudentProfile({ ...user, type, permissions: ['murid_profil_manage'] }, 1, 'edit'),
			false
		);
	for (const action of ['read', 'edit', 'print'] as const)
		assert.equal(canUseStudentProfile({ type: 'admin' }, 2, action), true);
});
