import assert from 'node:assert/strict';
import test from 'node:test';
import {
	renderRaportMartikulasiHTML,
	renderSkMartikulasiHTML,
	renderSttmMartikulasiHTML,
	type MartikulasiSchoolPrint,
	type MartikulasiSettingsPrint,
	type MartikulasiStudentPrint
} from './martikulasi.ts';

const school: MartikulasiSchoolPrint = {
	nama: 'Sekolah Aktif',
	npsn: '10000001',
	naungan: 'kemsos',
	alamat: 'Alamat sekolah',
	email: 'sekolah@example.id',
	logoUrl: null,
	logoDinasUrl: null,
	kepalaSekolah: { nama: 'Kepala Aktif', nip: '19800101', status: 'definitif' }
};
const settings: MartikulasiSettingsPrint = {
	tahunAjaran: '2026/2027',
	periodeMulai: '1 Juli 2026',
	periodeSelesai: '30 September 2026',
	nomorSk: '001/SK-M/SR/2026',
	tanggalSk: '1 Juli 2026',
	lokasiPenetapan: 'Bengkulu'
};
const student: MartikulasiStudentPrint = {
	nama: 'Murid Uji',
	nis: '26001',
	nisn: '00112233',
	jenjang: 'SRMA',
	kelas: 'X.A',
	nomorSttm: null,
	tanggalSttm: '',
	levelPenempatan: 'siap',
	rekomendasi: 'Lanjut kelas reguler',
	catatanUmum: null,
	waliKelas: { nama: 'Wali Uji', nip: '19900101' },
	nilai: [
		{
			aspekKode: 'literasi',
			capaianAwal: 'Baik',
			capaianAkhir: 'Sangat Baik',
			ketuntasan: 'tuntas',
			catatan: 'Tuntas',
			deskripsiCapaian: null
		}
	]
};

test('STTM belum bernomor selalu ditandai sebagai draf', () => {
	const html = renderSttmMartikulasiHTML({ school, settings, students: [student] });
	assert.match(html, /DRAF - NOMOR BELUM DITERBITKAN/);
});

test('STTM terbit memakai identitas snapshot dan tidak ditandai draf', () => {
	const html = renderSttmMartikulasiHTML({
		school,
		settings,
		students: [
			{
				...student,
				nomorSttm: '001/STTM/SR/IX/2026',
				tanggalSttm: '30 September 2026',
				schoolSnapshot: {
					...school,
					nama: 'Sekolah Saat Terbit',
					kepalaSekolah: { nama: 'Kepala Saat Terbit', nip: '19700101', status: 'plt' }
				}
			}
		]
	});
	assert.doesNotMatch(html, /DRAF - NOMOR BELUM DITERBITKAN/);
	assert.match(html, /Sekolah Saat Terbit/);
	assert.match(html, /Kepala Saat Terbit/);
});

test('raport massal membuat satu halaman dokumen per murid', () => {
	const html = renderRaportMartikulasiHTML({
		school,
		settings,
		students: [student, { ...student, nama: 'Murid Uji Kedua', nis: '26002' }]
	});
	assert.equal((html.match(/<section class="[^"]*\bpage\b[^"]*">/g) ?? []).length, 2);
});

test('SK memuat nomor dan snapshot anggota tim', () => {
	const html = renderSkMartikulasiHTML({
		school,
		settings,
		tim: [{ nama: 'Pegawai Lama', nip: '19881111', jabatan: 'Koordinator', tugas: 'Koordinasi' }]
	});
	assert.match(html, /001\/SK-M\/SR\/2026/);
	assert.match(html, /Pegawai Lama/);
	assert.match(html, /KEMENTERIAN SOSIAL REPUBLIK INDONESIA/);
	assert.match(html, /Pusat Pendidikan, Pelatihan dan Pengembangan Profesi/);
	assert.match(html, /Alamat sekolah \| Email: sekolah@example\.id/);
});
