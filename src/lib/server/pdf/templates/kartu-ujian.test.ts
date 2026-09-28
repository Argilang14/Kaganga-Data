import assert from 'node:assert/strict';
import test from 'node:test';
import { renderKartuUjianHTML } from './kartu-ujian.ts';

	test('membagi peserta menjadi empat kartu per lembar A4', () => {
		const html = renderKartuUjianHTML({
			sekolah: { nama: 'Sekolah Rakyat Uji', alamat: 'Bengkulu', email: 'uji@example.sch.id' },
			ujian: { nama: 'Asesmen Sumatif Tengah Semester', singkatan: 'ASTS', tahunAjaran: '2026/2027', semester: 'Semester Genap' },
			peserta: Array.from({ length: 5 }, (_, index) => ({ nama: `Murid ${index + 1}`, nomorPeserta: String(index + 1).padStart(3, '0'), kelas: 'X.A' })),
			tandaTangan: { tempatTanggal: 'Bengkulu, 6 April 2027', nama: 'Kepala Sekolah', nip: '123', jabatan: 'Kepala Sekolah' }
		});

		assert.equal((html.match(/class="exam-sheet"/g) ?? []).length, 2);
		assert.equal((html.match(/class="exam-card"/g) ?? []).length, 5);
		assert.match(html, /grid-template-columns:repeat\(2/);
		assert.match(html, /grid-template-rows:repeat\(2/);
		assert.match(html, /KARTU PESERTA/);
	});
