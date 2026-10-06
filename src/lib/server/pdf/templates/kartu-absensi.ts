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
	return `<div class="card-header">
		<div class="logo-frame">${logoSrc ? `<img src="${logoSrc}" alt="Logo sekolah" />` : ''}</div>
		<div class="school-heading">
			<div class="authority">${escapeHtml(data.sekolah.naungan)}</div>
			<div class="school-name">${escapeHtml(data.sekolah.nama)}</div>
			<div class="school-address">${escapeHtml(data.sekolah.alamat)}</div>
		</div>
	</div>`;
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
	const isPhotoQr = data.layout === 'photo-qr';
	const isQrOnly = data.layout === 'qr-only';
	const mediaMarkup = isQrOnly
		? `<div class="front-qr-only">
			<img class="front-qr" src="${data.qrDataUrl}" alt="QR Absensi ${escapeHtml(data.murid.nama)}" />
			<div>QR ABSENSI</div>
		</div>`
		: `<div class="front-media ${isPhotoQr ? 'with-qr' : ''}">
			<div class="photo-frame">
				${data.murid.fotoSrc ? `<img src="${data.murid.fotoSrc}" alt="Foto ${escapeHtml(data.murid.nama)}" />` : '<span>FOTO</span>'}
			</div>
			${isPhotoQr ? `<img class="front-qr" src="${data.qrDataUrl}" alt="QR Absensi ${escapeHtml(data.murid.nama)}" />` : ''}
		</div>`;
	return `<article class="student-card front layout-${data.layout}">
		${headerMarkup(data)}
		<div class="front-title">${data.layout === 'duplex' ? 'KARTU PELAJAR SISWA' : 'KARTU PELAJAR &amp; ABSENSI'}</div>
		<div class="front-body">
			${mediaMarkup}
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
	return `<div class="card-slot" data-card-id="${data.murid.id}">${side === 'front' ? frontCardMarkup(data) : backCardMarkup(data)}</div>`;
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
	const duplex = cards[0]?.layout === 'duplex';
	for (let index = 0; index < cards.length; index += 8) {
		const group: Array<KartuAbsensiPrintData | undefined> = cards.slice(index, index + 8);
		while (group.length < 8) group.push(undefined);
		const isLastGroup = index + 8 >= cards.length;
		sheets.push(sheetMarkup(group, 'front', !duplex && isLastGroup));
		if (duplex) {
			const mirroredBack = [
				group[1],
				group[0],
				group[3],
				group[2],
				group[5],
				group[4],
				group[7],
				group[6]
			];
			sheets.push(sheetMarkup(mirroredBack, 'back', isLastGroup));
		}
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
			grid-template-columns: repeat(2, 85.6mm);
			grid-template-rows: repeat(4, 54mm);
			column-gap: 5mm;
			row-gap: 5mm;
			align-content: start;
			justify-content: start;
			padding: 33mm 16.9mm;
			overflow: hidden;
			break-after: page;
			page-break-after: always;
		}

		.sheet.last-sheet {
			break-after: auto;
			page-break-after: auto;
		}

		.card-slot {
			width: 85.6mm;
			height: 54mm;
			break-inside: avoid;
			page-break-inside: avoid;
		}

		.card-slot.empty {
			visibility: hidden;
		}

		.student-card {
			position: relative;
			width: 85.6mm;
			height: 54mm;
			overflow: hidden;
			border: 0.25mm solid #1d3542;
			border-radius: 1.5mm;
			background: #ffffff;
		}

		.student-card::before {
			content: '';
			position: absolute;
			top: 0;
			right: 0;
			width: 12mm;
			height: 12mm;
			background: #6ec4d8;
			clip-path: polygon(100% 0, 100% 100%, 0 0);
		}

		.student-card::after {
			content: '';
			position: absolute;
			right: 0;
			bottom: 0;
			width: 25mm;
			height: 4.5mm;
			background: #0b4964;
			clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%);
		}

		.card-header {
			position: relative;
			z-index: 1;
			height: 11.5mm;
			display: grid;
			grid-template-columns: 9mm minmax(0, 1fr);
			align-items: center;
			gap: 2mm;
			padding: 1.2mm 4mm;
			color: #ffffff;
			background: #0b4964;
		}

		.logo-frame {
			width: 9mm;
			height: 9mm;
			display: flex;
			align-items: center;
			justify-content: center;
			overflow: hidden;
			border-radius: 1.2mm;
			background: #ffffff;
		}

		.logo-frame img {
			width: 8mm;
			height: 8mm;
			object-fit: contain;
		}

		.school-heading {
			min-width: 0;
			padding-right: 7mm;
		}

		.authority {
			font-size: 4.2pt;
			font-weight: 800;
			line-height: 1.15;
		}

		.school-name {
			margin-top: 0.35mm;
			overflow: hidden;
			display: -webkit-box;
			font-size: 5.2pt;
			font-weight: 800;
			line-height: 1.05;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
		}

		.school-address {
			margin-top: 0.35mm;
			overflow: hidden;
			font-size: 3.5pt;
			line-height: 1.2;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.front-title {
			margin: 1.2mm 4mm 1mm;
			color: #0b4964;
			font-size: 6.5pt;
			font-weight: 900;
			text-align: center;
		}

		.front-body {
			display: grid;
			grid-template-columns: 18mm minmax(0, 1fr);
			gap: 2.5mm;
			padding: 0 4.5mm;
		}

		.front-media {
			width: 17mm;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 1mm;
		}

		.photo-frame {
			width: 17mm;
			height: 23mm;
			display: flex;
			align-items: center;
			justify-content: center;
			overflow: hidden;
			border: 0.2mm solid #436272;
			background: #f7fafb;
			color: #7b909a;
			font-size: 4pt;
			font-weight: 700;
		}

		.photo-frame img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			object-position: center top;
		}

		.front-media.with-qr .photo-frame {
			width: 13mm;
			height: 15.5mm;
		}

		.front-qr {
			display: block;
			width: 15.5mm;
			height: 15.5mm;
			object-fit: contain;
		}

		.front-qr-only {
			width: 18mm;
			color: #0b4964;
			font-size: 4pt;
			font-weight: 900;
			text-align: center;
		}

		.front-qr-only .front-qr {
			width: 22mm;
			height: 22mm;
			margin: 0 -2mm 0.8mm;
		}

		.identity-list {
			min-width: 0;
			padding-top: 0;
		}

		.identity-row {
			display: grid;
			grid-template-columns: 13.5mm 1.5mm minmax(0, 1fr);
			min-height: 3.75mm;
			align-items: start;
			padding: 0.35mm 0;
			border-bottom: 0.15mm solid #bdd7e1;
			font-size: 4.5pt;
			line-height: 1.15;
		}

		.identity-label {
			font-weight: 700;
		}

		.identity-value {
			min-width: 0;
			max-height: 5.4mm;
			overflow: hidden;
			overflow-wrap: anywhere;
			font-weight: 700;
		}

		.back-body {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 25mm;
			gap: 3mm;
			padding: 3mm 4.5mm 0;
		}

		.terms {
			min-width: 0;
			padding-right: 3mm;
			border-right: 0.2mm solid #8ab8c8;
		}

		.terms h2,
		.qr-panel h2 {
			margin: 0 0 1.4mm;
			color: #0b4964;
			font-size: 5.5pt;
			font-weight: 900;
		}

		.terms p {
			margin: 0 0 1.1mm;
			font-size: 4.1pt;
			line-height: 1.25;
			text-align: justify;
		}

		.qr-panel {
			text-align: center;
		}

		.qr {
			display: block;
			width: 20mm;
			height: 20mm;
			margin: 0 auto;
		}

		.qr-name {
			margin-top: 0.8mm;
			overflow: hidden;
			font-size: 4.5pt;
			font-weight: 800;
			line-height: 1.2;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.qr-number {
			margin-top: 0.4mm;
			font-size: 4pt;
			font-weight: 700;
		}

		.card-footer {
			position: absolute;
			left: 4mm;
			right: 4mm;
			bottom: 0.9mm;
			z-index: 1;
			overflow: hidden;
			color: #476572;
			font-size: 3.5pt;
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
