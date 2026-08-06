import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { KartuAbsensiPrintData } from '../../../../routes/cetak/kartu-absensi/preview-data';

let fallbackLogoDataUri: string | null = null;

function getFallbackLogoDataUri(): string {
	if (fallbackLogoDataUri) return fallbackLogoDataUri;
	try {
		const buffer = readFileSync(resolve('static/tutwuri.png'));
		fallbackLogoDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
	} catch {
		fallbackLogoDataUri = '';
	}
	return fallbackLogoDataUri;
}

function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function headerMarkup(data: KartuAbsensiPrintData) {
	const logoSrc = data.sekolah.logoSrc || getFallbackLogoDataUri();
	return `<header class="card-header">
		<div class="logo-frame">${logoSrc ? `<img src="${logoSrc}" alt="Logo sekolah" />` : ''}</div>
		<div class="school-heading">
			<div class="authority">${escapeHtml(data.sekolah.naungan)}</div>
			<div class="school-name">${escapeHtml(data.sekolah.nama)}</div>
			<div class="school-address">${escapeHtml(data.sekolah.alamat)}</div>
		</div>
	</header>`;
}

function identityRow(label: string, value: string) {
	return `<div class="identity-row">
		<div class="identity-label">${escapeHtml(label)}</div>
		<div class="identity-separator">:</div>
		<div class="identity-value">${escapeHtml(value)}</div>
	</div>`;
}

function frontCardMarkup(data: KartuAbsensiPrintData): string {
	const studentNumber = data.murid.nisn || data.murid.nis;
	return `<article class="student-card front">
		${headerMarkup(data)}
		<div class="front-title">KARTU PELAJAR SISWA</div>
		<div class="front-body">
			<div class="photo-frame">
				${data.murid.fotoSrc ? `<img src="${data.murid.fotoSrc}" alt="Foto ${escapeHtml(data.murid.nama)}" />` : ''}
			</div>
			<div class="identity-list">
				${identityRow('Nama Lengkap', data.murid.nama)}
				${identityRow('NISN', studentNumber)}
				${identityRow('T.T.L', data.murid.tempatTanggalLahir)}
				${identityRow('Kelas', data.kelas.nama)}
				${identityRow('Alamat', data.murid.alamat)}
			</div>
		</div>
		<div class="card-footer">${escapeHtml(data.sekolah.nama)}</div>
	</article>`;
}

function backCardMarkup(data: KartuAbsensiPrintData): string {
	return `<article class="student-card back">
		${headerMarkup(data)}
		<div class="back-body">
			<section class="terms">
				<h2>SYARAT DAN KETENTUAN</h2>
				<p>Kartu ini merupakan identitas resmi pemegang kartu selama menjadi siswa aktif dan tidak dapat dipindahtangankan kepada pihak lain.</p>
				<p>Pemegang kartu wajib membawa dan menunjukkan kartu saat menggunakan fasilitas sekolah atau mengikuti kegiatan resmi kependidikan.</p>
				<p>Apabila kartu hilang atau rusak, pemegang kartu segera melapor kepada tata usaha sekolah.</p>
			</section>
			<section class="qr-panel">
				<h2>QR ABSENSI</h2>
				<img class="qr" src="${data.qrDataUrl}" alt="QR Absensi ${escapeHtml(data.murid.nama)}" />
				<div class="qr-name">${escapeHtml(data.murid.nama)}</div>
				<div class="qr-number">NIS ${escapeHtml(data.murid.nis)}</div>
			</section>
		</div>
		<div class="card-footer">${escapeHtml(data.sekolah.nama)}</div>
	</article>`;
}

function slotMarkup(data: KartuAbsensiPrintData | undefined, side: 'front' | 'back') {
	if (!data) return '<div class="card-slot empty" aria-hidden="true"></div>';
	return `<div class="card-slot">${side === 'front' ? frontCardMarkup(data) : backCardMarkup(data)}</div>`;
}

function sheetMarkup(
	cards: Array<KartuAbsensiPrintData | undefined>,
	side: 'front' | 'back',
	isLast: boolean
) {
	return `<section class="sheet ${isLast ? 'last-sheet' : ''}" data-side="${side}">
		${cards.map((card) => slotMarkup(card, side)).join('\n')}
	</section>`;
}

function renderCardSheets(cards: KartuAbsensiPrintData[]) {
	const sheets: string[] = [];
	for (let index = 0; index < cards.length; index += 2) {
		const pair = [cards[index], cards[index + 1]];
		sheets.push(sheetMarkup(pair, 'front', false));
		sheets.push(sheetMarkup(pair, 'back', index + 2 >= cards.length));
	}
	return sheets.join('\n');
}

function kartuAbsensiStyles(): string {
	return `
		@page {
			size: A4 portrait;
			margin: 0;
		}

		* {
			box-sizing: border-box;
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}

		html,
		body {
			margin: 0;
			padding: 0;
			font-family: Arial, Helvetica, sans-serif;
			color: #102a38;
			background: #ffffff;
		}

		.sheet {
			width: 210mm;
			height: 297mm;
			display: grid;
			grid-template-rows: repeat(2, 100mm);
			justify-items: center;
			align-content: center;
			row-gap: 12mm;
			overflow: hidden;
			break-after: page;
			page-break-after: always;
		}

		.sheet.last-sheet {
			break-after: auto;
			page-break-after: auto;
		}

		.card-slot {
			width: 150mm;
			height: 100mm;
		}

		.card-slot.empty {
			visibility: hidden;
		}

		.student-card {
			position: relative;
			width: 150mm;
			height: 100mm;
			overflow: hidden;
			border: 0.3mm solid #1d3542;
			border-radius: 2.4mm;
			background: #ffffff;
		}

		.student-card::before {
			content: '';
			position: absolute;
			top: 0;
			right: 0;
			width: 22mm;
			height: 22mm;
			background: #6ec4d8;
			clip-path: polygon(100% 0, 100% 100%, 0 0);
		}

		.student-card::after {
			content: '';
			position: absolute;
			right: 0;
			bottom: 0;
			width: 44mm;
			height: 8mm;
			background: #0b4964;
			clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%);
		}

		.card-header {
			position: relative;
			z-index: 1;
			height: 23mm;
			display: grid;
			grid-template-columns: 19mm minmax(0, 1fr);
			align-items: center;
			gap: 4mm;
			padding: 2.5mm 8mm;
			color: #ffffff;
			background: #0b4964;
		}

		.logo-frame {
			width: 17mm;
			height: 17mm;
			display: flex;
			align-items: center;
			justify-content: center;
			overflow: hidden;
			border-radius: 3mm;
			background: #ffffff;
		}

		.logo-frame img {
			width: 15mm;
			height: 15mm;
			object-fit: contain;
		}

		.school-heading {
			min-width: 0;
			padding-right: 13mm;
		}

		.authority {
			font-size: 9.5px;
			font-weight: 800;
			line-height: 1.15;
		}

		.school-name {
			margin-top: 1mm;
			overflow: hidden;
			font-size: 12.5px;
			font-weight: 800;
			line-height: 1.15;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.school-address {
			margin-top: 1mm;
			overflow: hidden;
			font-size: 6.8px;
			line-height: 1.2;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.front-title {
			margin: 3.2mm 8mm 2.5mm;
			color: #0b4964;
			font-size: 13px;
			font-weight: 900;
			text-align: center;
		}

		.front-body {
			display: grid;
			grid-template-columns: 31mm minmax(0, 1fr);
			gap: 5mm;
			padding: 0 10mm;
		}

		.photo-frame {
			width: 29mm;
			height: 39mm;
			overflow: hidden;
			border: 0.3mm solid #436272;
			background: #ffffff;
		}

		.photo-frame img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			object-position: center top;
		}

		.identity-list {
			min-width: 0;
			padding-top: 0.5mm;
		}

		.identity-row {
			display: grid;
			grid-template-columns: 28mm 3mm minmax(0, 1fr);
			min-height: 7.1mm;
			align-items: start;
			padding: 1.1mm 0;
			border-bottom: 0.2mm solid #bdd7e1;
			font-size: 9px;
			line-height: 1.25;
		}

		.identity-label {
			font-weight: 700;
		}

		.identity-value {
			min-width: 0;
			max-height: 9mm;
			overflow: hidden;
			overflow-wrap: anywhere;
			font-weight: 700;
		}

		.back-body {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 45mm;
			gap: 7mm;
			padding: 6mm 10mm 0;
		}

		.terms {
			min-width: 0;
			padding-right: 6mm;
			border-right: 0.25mm solid #8ab8c8;
		}

		.terms h2,
		.qr-panel h2 {
			margin: 0 0 3mm;
			color: #0b4964;
			font-size: 11px;
			font-weight: 900;
		}

		.terms p {
			margin: 0 0 2.3mm;
			font-size: 8.2px;
			line-height: 1.35;
			text-align: justify;
		}

		.qr-panel {
			text-align: center;
		}

		.qr {
			display: block;
			width: 34mm;
			height: 34mm;
			margin: 0 auto;
		}

		.qr-name {
			margin-top: 2mm;
			overflow: hidden;
			font-size: 8.5px;
			font-weight: 800;
			line-height: 1.2;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.qr-number {
			margin-top: 1mm;
			font-size: 7.5px;
			font-weight: 700;
		}

		.card-footer {
			position: absolute;
			left: 8mm;
			right: 8mm;
			bottom: 2.2mm;
			z-index: 1;
			overflow: hidden;
			color: #476572;
			font-size: 6.8px;
			font-weight: 700;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	`;
}

function documentHtml(cards: KartuAbsensiPrintData[], title: string) {
	return `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<title>${escapeHtml(title)}</title>
	<style>${kartuAbsensiStyles()}</style>
</head>
<body>
	${renderCardSheets(cards)}
</body>
</html>`;
}

export function renderKartuAbsensiHTML(data: KartuAbsensiPrintData): string {
	return documentHtml([data], `Kartu Pelajar dan Absensi - ${data.murid.nama}`);
}

export function renderKartuAbsensiSheetHTML(cards: KartuAbsensiPrintData[]): string {
	const schoolName = cards[0]?.sekolah.nama ?? 'Sekolah';
	return documentHtml(cards, `Kartu Pelajar dan Absensi - ${schoolName}`);
}
