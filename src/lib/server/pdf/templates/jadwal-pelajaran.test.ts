import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderJadwalPelajaranHTML } from './jadwal-pelajaran.ts';

function fixture(orientation = 'portrait', layoutMode = 'padat') {
	const kelasList = ['srd', 'srmp', 'srma'].map((jenjang, index) => ({
		id: index + 1,
		nama: `Kelas ${index + 1}`,
		jenjang
	}));
	return {
		orientation,
		layoutMode,
		selectedJenjang: 'semua',
		jenjangLabel: 'Semua Jenjang',
		jenisLabel: 'Semester Ganjil',
		periode: { tahunPelajaran: '2026/2027' },
		tanggalCetak: '24 Oktober 2026',
		hariLabels: { senin: 'Senin' },
		kelasList,
		jamList: kelasList.map((kelas) => ({
			jenjang: kelas.jenjang,
			hari: 'senin',
			jamKe: 1,
			tipe: 'pelajaran',
			aktif: true,
			pukulMulai: '07:00',
			pukulSelesai: '07:40'
		})),
		cells: kelasList.map((kelas) => ({
			kelasId: kelas.id,
			hari: 'senin',
			jamKe: 1,
			tipe: 'pelajaran',
			mapelKode: 'MAT',
			mapelNama: 'Matematika',
			guru: 'Guru QA',
			label: 'MAT'
		})),
		sekolah: {
			nama: 'Sekolah Rakyat Terintegrasi 3 Provinsi Bengkulu',
			naungan: 'kemsos',
			lokasiTandaTangan: 'Bengkulu',
			kepalaSekolah: { nama: 'Kepala QA', nip: '', status: 'definitif' }
		}
	};
}

test('jadwal semua jenjang tetap memiliki tabel dan kop pada empat tata letak', () => {
	for (const orientation of ['portrait', 'landscape'])
		for (const mode of ['padat', 'multi']) {
			const html = renderJadwalPelajaranHTML(fixture(orientation, mode) as never);
			assert.match(html, new RegExp(`size:A4 ${orientation}`));
			assert.match(html, /Sekolah Rakyat Terintegrasi 3 Provinsi Bengkulu/);
			assert.match(html, /Jam SRD/);
			assert.match(html, /Jam SRMP/);
			assert.match(html, /Jam SRMA/);
			assert.match(html, /Matematika/);
			assert.doesNotMatch(html, /<img class="principal-mark"/);
		}
});

test('gambar kop dan pengesahan tidak menghilangkan identitas, jadwal, atau nama penanda tangan', () => {
	const data = fixture();
	const school = {
		...data.sekolah,
		customLetterheadUrl: 'data:image/png;base64,AAAA',
		signatureUrl: 'data:image/png;base64,BBBB',
		stampUrl: 'data:image/png;base64,CCCC'
	};
	const html = renderJadwalPelajaranHTML({ ...data, sekolah: school } as never);
	assert.match(html, /school-letterhead--custom/);
	assert.equal((html.match(/<img class="principal-mark"/g) ?? []).length, 2);
	assert.match(html, /Kepala QA/);
	assert.match(html, /Matematika/);
});
