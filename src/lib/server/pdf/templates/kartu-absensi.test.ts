import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	KartuAbsensiLayout,
	KartuAbsensiPrintData
} from '../../../../routes/cetak/kartu-absensi/preview-data.ts';
import { renderKartuAbsensiSheetHTML } from './kartu-absensi.ts';

function card(id: number, layout: KartuAbsensiLayout = 'duplex'): KartuAbsensiPrintData {
	return {
		layout,
		sekolah: { nama: 'Sekolah QA', logoSrc: null, naungan: 'Kementerian', alamat: 'Alamat' },
		kelas: { nama: 'X.A', jenjang: 'sma' },
		murid: {
			id,
			nama: `Murid ${id}`,
			nis: String(id),
			nisn: String(id),
			tempatTanggalLahir: 'Bengkulu, 1 Januari 2010',
			alamat: 'Alamat murid',
			fotoSrc: null
		},
		qrDataUrl: 'data:image/png;base64,AA==',
		issuedAt: '2026-09-22'
	};
}

function section(html: string, side: 'front' | 'back', occurrence = 0) {
	const starts = [
		...html.matchAll(new RegExp(`<section class="sheet[^>]*" data-side="${side}">`, 'g'))
	];
	const start = starts[occurrence];
	if (start?.index === undefined) return '';
	const contentStart = start.index + start[0].length;
	const nextSheet = html.indexOf('<section class="sheet', contentStart);
	const contentEnd = nextSheet === -1 ? html.indexOf('</body>', contentStart) : nextSheet;
	return html.slice(contentStart, contentEnd);
}

test('lembar A4 memuat delapan kartu berukuran 85,6 x 54 mm', () => {
	const html = renderKartuAbsensiSheetHTML(
		Array.from({ length: 8 }, (_, index) => card(index + 1))
	);
	assert.match(html, /grid-template-columns: repeat\(2, 85\.6mm\)/);
	assert.match(html, /grid-template-rows: repeat\(4, 54mm\)/);
	assert.match(html, /width: 85\.6mm/);
	assert.match(html, /height: 54mm/);
	assert.equal((section(html, 'front').match(/data-card-id=/g) ?? []).length, 8);
	assert.equal((section(html, 'back').match(/data-card-id=/g) ?? []).length, 8);
});

test('sisi belakang dicerminkan per baris untuk duplex sisi panjang', () => {
	const html = renderKartuAbsensiSheetHTML(
		Array.from({ length: 8 }, (_, index) => card(index + 1))
	);
	const ids = [...section(html, 'back').matchAll(/data-card-id="(\d+)"/g)].map((match) =>
		Number(match[1])
	);
	assert.deepEqual(ids, [2, 1, 4, 3, 6, 5, 8, 7]);
});

test('sembilan murid menghasilkan dua pasang halaman tanpa menggeser kartu terakhir', () => {
	const html = renderKartuAbsensiSheetHTML(
		Array.from({ length: 9 }, (_, index) => card(index + 1))
	);
	assert.equal((html.match(/data-side="front"/g) ?? []).length, 2);
	assert.equal((html.match(/data-side="back"/g) ?? []).length, 2);
	assert.match(section(html, 'front', 1), /data-card-id="9"/);
	assert.equal((section(html, 'front', 1).match(/class="card-slot empty"/g) ?? []).length, 7);
});

test('model foto dan QR hanya membuat sisi depan serta memuat keduanya', () => {
	const html = renderKartuAbsensiSheetHTML(
		Array.from({ length: 8 }, (_, index) => card(index + 1, 'photo-qr'))
	);
	assert.equal((html.match(/data-side="front"/g) ?? []).length, 1);
	assert.equal((html.match(/data-side="back"/g) ?? []).length, 0);
	assert.match(html, /layout-photo-qr/);
	assert.match(html, /class="front-media with-qr"/);
});

test('model QR saja memakai kartu portrait 94 x 123 mm tanpa sisi belakang', () => {
	const html = renderKartuAbsensiSheetHTML([card(1, 'qr-only')]);
	assert.equal((html.match(/data-side="front"/g) ?? []).length, 1);
	assert.equal((html.match(/data-side="back"/g) ?? []).length, 0);
	assert.match(html, /portrait-card/);
	assert.match(html, /grid-template-columns: repeat\(2, 94mm\)/);
	assert.match(html, /grid-template-rows: repeat\(2, 123mm\)/);
	assert.match(html, /width: 94mm/);
	assert.match(html, /height: 123mm/);
	assert.match(html, /JENJANG SMA/);
	assert.match(html, /NIS 1/);
	assert.match(html, /NISN 1/);
	assert.match(html, /class="portrait-background" aria-hidden="true"/);
	assert.match(html, /background:url\("data:image\/png;base64,/);
	assert.doesNotMatch(html, /class="photo-frame"/);
});

test('lima kartu QR membentuk dua halaman A4 dengan slot kosong di halaman terakhir', () => {
	const html = renderKartuAbsensiSheetHTML(
		Array.from({ length: 5 }, (_, index) => card(index + 1, 'qr-only'))
	);
	assert.equal((html.match(/data-side="front"/g) ?? []).length, 2);
	assert.equal((section(html, 'front').match(/data-card-id=/g) ?? []).length, 4);
	assert.equal((section(html, 'front', 1).match(/class="card-slot empty"/g) ?? []).length, 3);
	assert.match(section(html, 'front', 1), /data-card-id="5"/);
	assert.equal((html.match(/background:url\("data:image\/png;base64,/g) ?? []).length, 1);
});

test('identitas portrait di-escape dan NISN kosong tidak diganti NIS', () => {
	const item = card(1, 'qr-only');
	item.murid.nama = '<img src=x onerror=alert(1)>';
	item.murid.nisn = '';
	item.kelas.jenjang = 'srd';
	const html = renderKartuAbsensiSheetHTML([item]);
	assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
	assert.doesNotMatch(html, /<img src=x/);
	assert.match(html, /NISN -/);
	assert.match(html, /JENJANG SD/);
});

test('model kartu berbeda tidak boleh dicampur dalam satu PDF', () => {
	assert.throws(
		() => renderKartuAbsensiSheetHTML([card(1, 'qr-only'), card(2, 'photo-qr')]),
		/model yang sama/
	);
});
