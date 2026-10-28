import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStudentInformationHTML } from './informasi-siswa.ts';
import type { StudentInformationPage } from '../../../student-profile-print.ts';

export const sampleInformationPage: StudentInformationPage = {
	nama: 'Murid Contoh',
	sekolah: 'Sekolah Rakyat Bengkulu',
	kelas: 'X.A',
	jenjang: 'SMA',
	logo: null,
	photos: ['Foto murid', 'Foto murid tambahan', 'Foto rumah', 'Foto orang tua/wali'].map(
		(label) => ({ label, src: null })
	),
	murid: [
		['NIK murid', '************1234'],
		['Nomor kartu keluarga', '************5678']
	],
	orangTua: [['Nama ayah', '-']],
	alamat: [['Alamat', '-']],
	asrama: [['Bersedia tinggal di asrama', 'Tidak']],
	perlengkapan: [['Seragam baju', '-']],
	petugas: [['Nama petugas', '-']],
	hunian: [['Status hunian', '-']],
	catatan: '',
	maskIdentity: true
};
test('A4 landscape, satu halaman per murid, data kosong tetap netral', () => {
	const html = renderStudentInformationHTML([sampleInformationPage, sampleInformationPage], {
		background: 'default'
	});
	assert.match(html, /size: A4 landscape/);
	assert.equal((html.match(/data-student-page=/g) ?? []).length, 2);
	assert.match(html, /Belum tersedia/);
	assert.match(html, /NIK dan KK disamarkan/);
	assert.match(html, /Tidak/);
});
test('teks dan gambar tidak menjadi markup atau permintaan jaringan', () => {
	const html = renderStudentInformationHTML(
		[
			{
				...sampleInformationPage,
				nama: '<script>alert(1)</script>',
				catatan: '<img src="https://example.com">',
				logo: 'https://example.com/a.png'
			}
		],
		{ background: 'none' }
	);
	assert.equal(html.includes('<script>'), false);
	assert.match(html, /&lt;script&gt;/);
	assert.equal(html.includes('src="https://example.com'), false);
	assert.match(html, /poster plain/);
	assert.throws(() =>
		renderStudentInformationHTML([sampleInformationPage], {
			background: 'custom',
			backgroundImage: 'https://example.com/a.png'
		})
	);
});
test('semua tempat foto memakai proporsi pas foto dan tidak meregang mengikuti kolom', () => {
	const html = renderStudentInformationHTML([sampleInformationPage], { background: 'default' });
	assert.match(
		html,
		/figure img,\.missing \{[^}]*aspect-ratio:3\/4;[^}]*flex:none;[^}]*object-fit:contain/
	);
	assert.match(html, /\.student-photos,\.family-photos \{ flex:none; \}/);
	assert.doesNotMatch(html, /\.student-photos \{ height:67mm/);
});
test('hunian dan garis bawah catatan sejajar perlengkapan tanpa mengisi seluruh halaman', () => {
	const html = renderStudentInformationHTML([sampleInformationPage], { background: 'default' });
	assert.match(html, /\.equipment-panel \{ grid-column:2; grid-row:3; align-self:stretch; \}/);
	assert.match(html, /\.housing \{ grid-column:1; grid-row:3;/);
	assert.match(html, /\.note-panel \{ flex:1; min-height:12mm; \}/);
	assert.match(html, /grid-template-rows:auto auto auto;[^}]*align-content:start/);
	assert.doesNotMatch(html, /margin-top:auto/);
});
test('judul foto murid berada di atas kedua pas foto', () => {
	const html = renderStudentInformationHTML([sampleInformationPage], { background: 'default' });
	assert.match(
		html,
		/<h2 class="photo-title student-photo-title">FOTO MURID<\/h2>\s*<div class="photos student-photos">/
	);
});
