import assert from 'node:assert/strict';
import test from 'node:test';
import { renderKartuUjianHTML } from './kartu-ujian.ts';

	test('menyusun empat kartu portrait siap potong 94 x 123 mm pada setiap A4', () => {
		const html = renderKartuUjianHTML({
			sekolah: { nama: 'Sekolah Rakyat Uji', alamat: 'Bengkulu', email: 'uji@example.sch.id' },
			ujian: { nama: 'Asesmen Sumatif Tengah Semester', singkatan: 'ASTS', tahunAjaran: '2026/2027', semester: 'Semester Genap' },
			peserta: Array.from({ length: 5 }, (_, index) => ({ nama: `Murid ${index + 1}`, nomorPeserta: String(index + 1).padStart(3, '0'), kelas: 'X.A' })),
			tandaTangan: { tempatTanggal: 'Bengkulu, 6 April 2027', nama: 'Kepala Sekolah', nip: '123', jabatan: 'Kepala Sekolah' }
		});

		assert.equal((html.match(/class="exam-sheet"/g) ?? []).length, 2);
		assert.equal((html.match(/class="exam-card"/g) ?? []).length, 5);
		assert.equal((html.match(/class="exam-card-slot"/g) ?? []).length, 5);
		assert.match(html, /@page\{size:A4 portrait;margin:0\}/);
		assert.match(html, /padding:9mm 8mm/);
		assert.match(html, /grid-template-columns:repeat\(2,94mm\)/);
		assert.match(html, /grid-template-rows:repeat\(2,123mm\)/);
		assert.match(html, /column-gap:6mm;row-gap:7mm/);
		assert.match(html, /width:94mm;height:123mm/);
		assert.doesNotMatch(html, /transform:scale/);
		assert.match(html, /Nama Peserta/);
		assert.match(html, /KARTU PESERTA/);
	});

test('QR hanya tampil ketika diaktifkan dan tetap mengikuti peserta masing-masing', () => {
	const data = {
		sekolah: { nama: 'Sekolah Uji' },
		ujian: { nama: 'ASTS', tahunAjaran: '2026/2027' },
		peserta: [
			{ nama: 'Murid A', qrDataUrl: 'data:image/png;base64,AAAA' },
			{ nama: 'Murid B', qrDataUrl: 'data:image/png;base64,BBBB' }
		],
		tandaTangan: { tempatTanggal: 'Bengkulu', nama: 'Kepala Sekolah', jabatan: 'Kepala Sekolah' }
	};
	const off = renderKartuUjianHTML(data);
	assert.doesNotMatch(off, /<section class="attendance-qr">/);
	assert.doesNotMatch(off, /base64,AAAA|base64,BBBB/);
	const on = renderKartuUjianHTML({ ...data, showAttendanceQr: true });
	assert.equal((on.match(/<section class="attendance-qr">/g) ?? []).length, 2);
	assert.match(on, /src="data:image\/png;base64,AAAA" alt="QR Absensi Murid A"/);
	assert.match(on, /src="data:image\/png;base64,BBBB" alt="QR Absensi Murid B"/);
});

test('akun LMS OFF tidak membocorkan username atau password dan baris NIS dihapus', () => {
	const data = {
		sekolah: { nama: 'Sekolah Uji' },
		ujian: { nama: 'ASTS', tahunAjaran: '2026/2027' },
		peserta: [{ nama: 'Murid', nis: 'NIS-YANG-DIHAPUS', nisn: '0123456789', usernameLms: 'akun-rahasia', passwordLms: 'sandi-rahasia' }],
		tandaTangan: { tempatTanggal: 'Bengkulu', nama: 'Kepala Sekolah', jabatan: 'Kepala Sekolah' }
	};
	const off = renderKartuUjianHTML(data);
	assert.doesNotMatch(off, /Username LMS|Password LMS|akun-rahasia|sandi-rahasia|NIS-YANG-DIHAPUS|<span>NIS<\/span>/);
	assert.match(off, /<span>NISN<\/span>/);
	const on = renderKartuUjianHTML({ ...data, showLmsAccount: true });
	assert.match(on, /Username LMS/);
	assert.match(on, /Password LMS/);
	assert.match(on, /akun-rahasia/);
	assert.match(on, /sandi-rahasia/);
});
