import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSchoolLetterhead, resolveNaunganLetterhead } from './school-letterhead.ts';

test('kop mengikuti naungan pada Data Sekolah', () => {
	assert.equal(resolveNaunganLetterhead('kemsos'), 'KEMENTERIAN SOSIAL REPUBLIK INDONESIA');
	assert.equal(
		resolveNaunganLetterhead('kemendikbud'),
		'KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH'
	);
});

test('kop memuat unit tetap, sekolah, kontak, dan dua logo', () => {
	const html = renderSchoolLetterhead({
		naungan: 'kemsos',
		nama: 'Sekolah Rakyat Terintegrasi 3 Provinsi Bengkulu',
		alamat: 'Jl. Terminal Regional, Kota Bengkulu',
		email: 'sekolah@example.id',
		logoDinasUrl: 'data:image/png;base64,dinas',
		logoUrl: 'data:image/png;base64,sekolah'
	});
	assert.match(html, /Pusat Pendidikan, Pelatihan dan Pengembangan Profesi/);
	assert.match(html, /Jl\. Terminal Regional, Kota Bengkulu \| Email: sekolah@example\.id/);
	assert.equal((html.match(/<img /g) ?? []).length, 2);
});

test('kop mengabaikan baris kontak jika data belum tersedia', () => {
	const html = renderSchoolLetterhead({ naungan: 'kemsos', nama: 'Sekolah Uji' });
	assert.doesNotMatch(html, /school-letterhead__contact/);
});
