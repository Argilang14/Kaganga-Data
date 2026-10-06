import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExamCardData } from './kartu-ujian.ts';
import { renderKartuUjianMejaHTML } from './kartu-ujian-meja.ts';

const data: ExamCardData = {
	sekolah: { nama: 'Sekolah Rakyat Terintegrasi 3 Provinsi Bengkulu', naungan: 'kemsos' },
	ujian: {
		nama: 'Asesmen Sumatif Tengah Semester',
		singkatan: 'ASTS',
		tahunAjaran: '2026/2027',
		semester: 'Semester Ganjil'
	},
	peserta: [],
	tandaTangan: {
		tempatTanggal: 'Bengkulu, 5 Oktober 2026',
		nama: 'Yuliarma Yenni, M.Pd.',
		nip: '198107112023122005',
		jabatan: 'Kepala Sekolah'
	}
};

test('kartu meja A4 terdiri dari 2 kolom dan 4 baris berukuran 94 x 62 mm', () => {
	for (const count of [0, 1, 8, 9, 16, 17]) {
		const html = renderKartuUjianMejaHTML({
			...data,
			peserta: Array.from({ length: count }, (_, i) => ({
				nama: `Murid ${i + 1}`,
				nomorPeserta: String(i + 1)
			}))
		});
		assert.equal((html.match(/class="desk-sheet"/g) ?? []).length, Math.ceil(count / 8));
		assert.equal((html.match(/class="desk-card"/g) ?? []).length, count);
		assert.match(html, /grid-template-columns:repeat\(2,94mm\)/);
		assert.match(html, /grid-template-rows:repeat\(4,62mm\)/);
		assert.match(html, /@page\{size:A4 portrait;margin:0\}/);
		assert.doesNotMatch(html, /transform:scale/);
	}
});

test('LMS bawaan OFF dan nomor, NISN, kelas, ruang serta kop mengikuti data', () => {
	const participant = {
		nama: 'Murid Uji',
		nomorPeserta: '7005542001',
		nis: 'NIS-NOT-PRINTED',
		nisn: '0108831548',
		kelas: 'X.A',
		ruang: '02',
		usernameLms: 'desk-user-secret',
		passwordLms: 'desk-password-secret'
	};
	const off = renderKartuUjianMejaHTML({ ...data, peserta: [participant] });
	assert.doesNotMatch(
		off,
		/Username LMS|Password LMS|desk-user-secret|desk-password-secret|NIS-NOT-PRINTED/
	);
	for (const value of [
		'7005542001',
		'0108831548',
		'X.A',
		'02',
		data.sekolah.nama,
		data.tandaTangan.nama
	])
		assert.ok(off.includes(value));
	assert.match(off, /KEMENTERIAN SOSIAL REPUBLIK INDONESIA/);
	const on = renderKartuUjianMejaHTML({ ...data, peserta: [participant], showLmsAccount: true });
	assert.match(on, /Username LMS/);
	assert.match(on, /desk-user-secret/);
	assert.match(on, /desk-password-secret/);
});

test('data peserta, kop dan tanda tangan di-escape tanpa merender HTML pengguna', () => {
	const html = renderKartuUjianMejaHTML({
		...data,
		sekolah: { nama: '<script>kop</script>' },
		peserta: [{ nama: '<img src=x onerror=alert(1)>', passwordLms: '<script>sandi</script>' }],
		showLmsAccount: true,
		tandaTangan: { ...data.tandaTangan, nama: '<script>kepala</script>' }
	});
	assert.doesNotMatch(html, /<script>|<img src=x/);
	assert.match(html, /&#60;img src=x/);
});

test('TTD Kepsek bawaan ON dan OFF menghapus seluruh blok tanpa mengubah ukuran kartu', () => {
	for (const showLmsAccount of [false, true]) {
		const options = { ...data, peserta: [{ nama: 'Murid Uji' }], showLmsAccount };
		for (const showPrincipalSignature of [undefined, true]) {
			const on = renderKartuUjianMejaHTML({ ...options, showPrincipalSignature });
			assert.match(on, /<footer class="desk-signature">/);
			assert.ok(on.includes(data.tandaTangan.nama));
		}
		const off = renderKartuUjianMejaHTML({ ...options, showPrincipalSignature: false });
		assert.doesNotMatch(
			off,
			/<footer|Yuliarma|198107112023122005|Bengkulu, 5 Oktober|Kepala Sekolah/
		);
		assert.match(off, /class="desk-body desk-body--no-signature"/);
		assert.match(off, /width:94mm;height:62mm/);
		assert.match(off, /Murid Uji/);
	}
});
