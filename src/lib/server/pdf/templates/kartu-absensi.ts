import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatUpper } from './shared';
import type { KartuAbsensiPrintData } from '../../../../routes/cetak/kartu-absensi/preview-data';

let fallbackLogoDataUri: string | null = null;

function getFallbackLogoDataUri(): string {
	if (fallbackLogoDataUri) return fallbackLogoDataUri;
	try {
		const buf = readFileSync(resolve('static/tutwuri.png'));
		fallbackLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
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

function cardMarkup(data: KartuAbsensiPrintData): string {
	const logoSrc = data.sekolah.logoSrc || getFallbackLogoDataUri();
	return `<div class="card">
		<div class="corner-gray"></div>
		<div class="corner-red"></div>
		<div class="dots-top"></div>
		<div class="slash-top"></div>
		<div class="slash-left"></div>
		<div class="bottom-gray"></div>
		<div class="bottom-red"></div>
		<div class="dots-bottom"></div>
		${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Logo sekolah" />` : ''}
		<div class="title">
			<div class="title-main">KARTU ABSENSI</div>
			<div class="school">${escapeHtml(formatUpper(data.sekolah.nama))}</div>
		</div>
		<img class="qr" src="${data.qrDataUrl}" alt="QR Absensi ${escapeHtml(data.murid.nama)}" />
		<div class="identity">
			<div class="name">${escapeHtml(formatUpper(data.murid.nama))}</div>
			<div class="nis">NIS ${escapeHtml(data.murid.nis)}</div>
		</div>
	</div>`;
}

function kartuAbsensiStyles(mode: 'single' | 'sheet'): string {
	const isSheet = mode === 'sheet';
	return `
		@page {
			size: A4 portrait;
			margin: ${isSheet ? '8mm' : '12mm'};
		}

		* {
			box-sizing: border-box;
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}

		body {
			margin: 0;
			font-family: Arial, Helvetica, sans-serif;
			color: #333333;
			background: #ffffff;
		}

		.page {
			min-height: ${isSheet ? 'auto' : '100vh'};
			display: ${isSheet ? 'grid' : 'flex'};
			${isSheet ? 'grid-template-columns: repeat(3, 1fr); gap: 4mm 3mm; align-items: start;' : 'align-items: center; justify-content: center;'}
		}

		.card {
			position: relative;
			width: ${isSheet ? '61mm' : '76mm'};
			height: ${isSheet ? '95.3mm' : '119mm'};
			overflow: hidden;
			border: 1px solid #e5e7eb;
			border-radius: ${isSheet ? '2mm' : '3mm'};
			background: #ffffff;
			text-align: center;
			break-inside: avoid;
			page-break-inside: avoid;
		}

		.corner-gray {
			position: absolute;
			top: 0;
			left: 0;
			width: 29%;
			height: 17%;
			background: #5f6a6b;
			clip-path: polygon(0 0, 100% 0, 0 100%);
		}

		.corner-red {
			position: absolute;
			top: 0;
			left: 11%;
			width: 31%;
			height: 12%;
			background: #9f3438;
			clip-path: polygon(28% 0, 100% 0, 58% 100%, 0 100%);
		}

		.dots-top {
			position: absolute;
			top: 0;
			left: 38%;
			width: 38%;
			height: 9%;
			opacity: 0.9;
			background-image: radial-gradient(#9f3438 ${isSheet ? '0.44mm' : '0.55mm'}, transparent ${isSheet ? '0.5mm' : '0.62mm'});
			background-size: ${isSheet ? '1.8mm 1.8mm' : '2.2mm 2.2mm'};
			clip-path: polygon(18% 0, 100% 0, 78% 100%, 0 100%);
		}

		.slash-top,
		.slash-left {
			position: absolute;
			width: ${isSheet ? '1.6mm' : '2mm'};
			background: #9f3438;
			transform: rotate(45deg);
		}

		.slash-top {
			top: 7%;
			right: 10%;
			height: 14%;
		}

		.slash-left {
			bottom: 27%;
			left: 7%;
			height: 13%;
		}

		.bottom-gray {
			position: absolute;
			right: 0;
			bottom: 0;
			width: 38%;
			height: 25%;
			background: #5f6a6b;
			clip-path: polygon(100% 0, 100% 100%, 0 100%);
		}

		.bottom-red {
			position: absolute;
			right: 12%;
			bottom: 0;
			width: 45%;
			height: 17%;
			background: #9f3438;
			clip-path: polygon(33% 0, 100% 0, 66% 100%, 0 100%);
		}

		.dots-bottom {
			position: absolute;
			bottom: 7%;
			left: 7%;
			width: 40%;
			height: 10%;
			opacity: 0.8;
			background-image: radial-gradient(#9f3438 ${isSheet ? '0.38mm' : '0.48mm'}, transparent ${isSheet ? '0.44mm' : '0.56mm'});
			background-size: ${isSheet ? '1.55mm 1.55mm' : '1.9mm 1.9mm'};
			clip-path: polygon(25% 0, 100% 0, 72% 100%, 0 100%);
		}

		.logo {
			position: absolute;
			top: 12%;
			left: 50%;
			width: ${isSheet ? '12.8mm' : '16mm'};
			height: ${isSheet ? '12.8mm' : '16mm'};
			transform: translateX(-50%);
			object-fit: contain;
		}

		.title {
			position: absolute;
			top: 29%;
			left: 7%;
			right: 7%;
		}

		.title-main {
			font-size: ${isSheet ? '10.5px' : '14px'};
			font-weight: 900;
			letter-spacing: 0.28em;
			white-space: nowrap;
		}

		.school {
			margin-top: ${isSheet ? '2mm' : '2.5mm'};
			font-size: ${isSheet ? '7.8px' : '10px'};
			line-height: 1.35;
			font-weight: 900;
			letter-spacing: 0.14em;
			text-transform: uppercase;
		}

		.qr {
			position: absolute;
			top: 47%;
			left: 50%;
			width: ${isSheet ? '21mm' : '26mm'};
			height: ${isSheet ? '21mm' : '26mm'};
			transform: translateX(-50%);
		}

		.identity {
			position: absolute;
			top: 70.5%;
			left: 12%;
			right: 12%;
			padding: ${isSheet ? '1.1mm 1.6mm' : '1.4mm 2mm'};
			border-radius: 1mm;
			background: rgba(255, 255, 255, 0.92);
		}

		.name {
			overflow: hidden;
			font-size: ${isSheet ? '8.5px' : '11px'};
			font-weight: 800;
			letter-spacing: 0.1em;
			text-transform: uppercase;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.nis {
			margin-top: ${isSheet ? '1.5mm' : '2mm'};
			font-size: ${isSheet ? '8.5px' : '11px'};
			font-weight: 800;
			letter-spacing: 0.1em;
		}
	`;
}

export function renderKartuAbsensiHTML(data: KartuAbsensiPrintData): string {
	return `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<title>Kartu Absensi - ${escapeHtml(data.murid.nama)}</title>
	<style>
		${kartuAbsensiStyles('single')}
	</style>
</head>
<body>
	<div class="page">
		${cardMarkup(data)}
	</div>
</body>
</html>`;
}

export function renderKartuAbsensiSheetHTML(cards: KartuAbsensiPrintData[]): string {
	const schoolName = cards[0]?.sekolah.nama ?? 'Sekolah';
	return `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<title>Kartu Absensi Murid - ${escapeHtml(schoolName)}</title>
	<style>
		${kartuAbsensiStyles('sheet')}
	</style>
</head>
<body>
	<div class="page">
		${cards.map(cardMarkup).join('\n')}
	</div>
</body>
</html>`;
}
