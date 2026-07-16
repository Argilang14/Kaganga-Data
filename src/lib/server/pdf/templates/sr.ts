import { formatUpper, formatValue, getTutwuriBwDataUri } from './shared';
import type { CoverPrintData } from './cover';
import type { RaporPrintData } from './rapor';

type BiodataSRData = {
	sekolah: {
		nama: string;
		logoSrc?: string | null;
		bgLogoSrc?: string | null;
		statusKepalaSekolah?: string | null;
	};
	showBgLogo?: boolean;
	periode?: {
		semester?: string | null;
		tahunPelajaran?: string | null;
		tahunAjaran?: string | null;
	};
	murid: {
		foto?: string | null;
		nama: string;
		nis?: string | null;
		nisn?: string | null;
		tempatLahir?: string | null;
		tanggalLahir?: string | null;
		jenisKelamin?: string | null;
		agama?: string | null;
		alamat?: {
			jalan?: string | null;
			kelurahan?: string | null;
			kecamatan?: string | null;
			kabupaten?: string | null;
			provinsi?: string | null;
		};
	};
	orangTua: {
		ayah: { nama?: string | null; pekerjaan?: string | null };
		ibu: { nama?: string | null; pekerjaan?: string | null };
		alamat?: {
			jalan?: string | null;
			kelurahan?: string | null;
			kecamatan?: string | null;
			kabupaten?: string | null;
			provinsi?: string | null;
		};
	};
	wali: { nama?: string | null; pekerjaan?: string | null; alamat?: string | null };
	ttd: {
		tempat?: string | null;
		tanggal?: string | null;
		kepalaSekolah?: string | null;
		nip?: string | null;
	};
};

type KeasramaanSRData = {
	sekolah: { nama: string; alamat?: string | null; logoUrl?: string | null };
	murid: { nama: string; nis?: string | null; nisn?: string | null };
	rombel?: { nama?: string | null; fase?: string | null };
	periode: { tahunAjaran: string; semester: string };
	waliAsrama?: { nama?: string | null; nip?: string | null } | null;
	waliAsuh?: { nama?: string | null; nip?: string | null } | null;
	kepalaSekolah?: {
		nama?: string | null;
		nip?: string | null;
		statusKepalaSekolah?: string | null;
	} | null;
	ttd: { tempat?: string | null; tanggal?: string | null };
	kehadiran?: { sakit: number; izin: number; alfa: number } | null;
	catatanWaliAsrama?: string | null;
	keasramaanRows: Array<{
		no?: number;
		indikator: string;
		predikat: string;
		deskripsi: string;
		kategoriHeader?: string;
	}>;
};

function todayId(): string {
	return new Intl.DateTimeFormat('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date());
}

function semesterLabel(data: {
	periode?: {
		semester?: string | null;
		tahunPelajaran?: string | null;
		tahunAjaran?: string | null;
	};
}): string {
	const semester = data.periode?.semester ?? '';
	const tahun = data.periode?.tahunPelajaran ?? data.periode?.tahunAjaran ?? '';
	return [semester, tahun].filter(Boolean).join(' ');
}

function srCoverStyles(data: CoverPrintData): string {
	const schoolName = data.sekolah.nama;
	return `
@page {
	size: A4 portrait;
	margin: 46mm 16mm 14mm 16mm;
	@top-left {
		content: element(sr-akademik-header);
	}
	@bottom-left {
		content: "${schoolName}";
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
	@bottom-right {
		content: "Dicetak: ${todayId()} | Halaman " counter(page) " dari " counter(pages);
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
}
@page sr-cover-sampul {
	size: A4 portrait;
	margin: 0;
}

* { box-sizing: border-box; }
html, body {
	margin: 0;
	padding: 0;
}
body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 9.5pt;
	line-height: 1.32;
	color: #111;
}
table {
	border-collapse: collapse;
	width: 100%;
}
.sr-cover-sampul {
	background: #647484;
	color: #ffcf24;
	display: flex;
	flex-direction: column;
	height: 297mm;
	overflow: hidden;
	page: sr-cover-sampul;
	position: relative;
	width: 210mm;
}
.sr-cover-sampul::before,
.sr-cover-sampul::after {
	color: rgba(42, 61, 85, .48);
	content: "SR";
	font-size: 110mm;
	font-weight: 900;
	line-height: .8;
	position: absolute;
	right: -13mm;
	top: -10mm;
	transform: rotate(28deg);
}
.sr-cover-sampul::after {
	bottom: 24mm;
	left: -18mm;
	right: auto;
	top: auto;
	transform: rotate(-28deg);
}
.sr-cover-brand {
	align-items: center;
	color: #fff;
	display: flex;
	font-size: 11pt;
	font-weight: 700;
	gap: 7pt;
	left: 13mm;
	line-height: 1.15;
	position: absolute;
	text-transform: uppercase;
	top: 14mm;
	z-index: 1;
}
.sr-cover-brand-mark {
	background: linear-gradient(135deg, #00a651 0 42%, #ffd21f 42% 68%, #0072bc 68%);
	border-radius: 50%;
	height: 12mm;
	width: 12mm;
}
.sr-cover-main-logo {
	height: 34mm;
	margin: 53mm auto 20mm;
	object-fit: contain;
	width: 48mm;
	z-index: 1;
}
.sr-cover-main-logo.placeholder {
	align-items: center;
	border: 2pt solid currentColor;
	display: flex;
	font-weight: 700;
	justify-content: center;
	text-align: center;
}
.sr-cover-ministry {
	font-size: 21pt;
	font-weight: 800;
	line-height: 1.1;
	margin: 0 auto 15mm;
	max-width: 172mm;
	text-align: center;
	text-transform: uppercase;
	z-index: 1;
}
.sr-cover-report-title {
	font-size: 20pt;
	font-weight: 800;
	line-height: 1.16;
	margin: 0 auto;
	max-width: 174mm;
	text-align: center;
	text-transform: uppercase;
	z-index: 1;
}
.sr-cover-student-label {
	font-size: 18pt;
	font-weight: 800;
	margin: auto auto 10mm;
	text-align: center;
	text-transform: uppercase;
	z-index: 1;
}
.sr-cover-student-card {
	background: rgba(238, 242, 246, .82);
	border-radius: 12mm;
	color: #1f2b38;
	margin: 0 auto 13mm;
	min-height: 44mm;
	padding: 9mm 14mm;
	width: 178mm;
	z-index: 1;
}
.sr-cover-student-row {
	display: grid;
	font-size: 13pt;
	grid-template-columns: 34mm 6mm 1fr;
	line-height: 1.45;
	margin: 1.5mm 0;
}
.sr-cover-student-row .label {
	font-weight: 700;
}
.sr-cover-student-row .value {
	font-weight: 800;
	text-transform: uppercase;
}
.sr-cover-footer {
	font-size: 15pt;
	font-weight: 800;
	line-height: 1.45;
	margin: 0 auto 13mm;
	max-width: 178mm;
	text-align: center;
	z-index: 1;
}
.sr-cover-identity-page {
	page-break-before: always;
}
.sr-akademik-header {
	position: running(sr-akademik-header);
	width: 100%;
	padding-top: 8mm;
	border-bottom: 2pt solid #0f3d5e;
	height: 37mm;
	overflow: hidden;
}
.sr-akademik-header-inner {
	display: grid;
	grid-template-columns: 58pt 1fr;
	column-gap: 13pt;
	align-items: start;
}
.sr-logo {
	width: 58pt;
	height: 58pt;
	object-fit: contain;
	display: block;
}
.sr-logo-placeholder {
	width: 58pt;
	height: 58pt;
}
.sr-akademik-title {
	color: #0f3d5e;
	font-size: 15pt;
	font-weight: 700;
	letter-spacing: .1pt;
	line-height: 1;
	margin: 4pt 0 8pt;
	text-transform: uppercase;
}
.sr-akademik-meta {
	color: #444;
	display: grid;
	grid-template-columns: 74pt 7pt 1fr;
	font-size: 9pt;
	line-height: 1.28;
	row-gap: 2pt;
}
.sr-akademik-meta .label {
	font-weight: 700;
}
.sr-cover-title {
	border-left: 4pt solid #0f3d5e;
	color: #0f3d5e;
	font-size: 11pt;
	font-weight: 700;
	margin: 0 0 9pt;
	padding-left: 6pt;
	text-align: left;
	text-transform: uppercase;
}
.sr-cover-school-table {
	border-collapse: collapse;
	table-layout: fixed;
	width: 100%;
}
.sr-cover-school-table td {
	border: 1pt solid #222;
	font-size: 9.5pt;
	padding: 6pt 8pt;
	vertical-align: top;
}
.sr-cover-school-table .label {
	background: #f0f0f0;
	font-weight: 700;
	width: 36%;
}
.sr-cover-school-table .value {
	white-space: pre-line;
	width: 64%;
}
`;
}

function srAcademicStyles(data: RaporPrintData): string {
	const schoolName = data.sekolah.nama;
	return `
@page {
	size: A4 portrait;
	margin: 46mm 16mm 14mm 16mm;
	@top-left {
		content: element(sr-akademik-header);
	}
	@bottom-left {
		content: "${schoolName}";
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
	@bottom-right {
		content: "Dicetak: ${todayId()} | Halaman " counter(page) " dari " counter(pages);
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
}

* { box-sizing: border-box; }
html, body {
	margin: 0;
	padding: 0;
}
body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 9pt;
	line-height: 1.32;
	color: #111;
}
table {
	border-collapse: collapse;
	width: 100%;
}
.sr-akademik-header {
	position: running(sr-akademik-header);
	width: 100%;
	padding-top: 8mm;
	border-bottom: 2pt solid #0f3d5e;
	height: 37mm;
	overflow: hidden;
}
.sr-akademik-header-inner {
	display: grid;
	grid-template-columns: 58pt 1fr;
	column-gap: 13pt;
	align-items: start;
}
.sr-logo {
	width: 58pt;
	height: 58pt;
	object-fit: contain;
	display: block;
}
.sr-logo-placeholder {
	width: 58pt;
	height: 58pt;
}
.sr-akademik-title {
	color: #0f3d5e;
	font-size: 15pt;
	font-weight: 700;
	letter-spacing: .1pt;
	line-height: 1;
	margin: 4pt 0 8pt;
	text-transform: uppercase;
}
.sr-akademik-meta {
	color: #444;
	display: grid;
	grid-template-columns: 74pt 7pt 1fr;
	font-size: 9pt;
	line-height: 1.28;
	row-gap: 2pt;
}
.sr-akademik-meta .label {
	font-weight: 700;
}
.sr-table {
	border-collapse: collapse;
	table-layout: fixed;
	width: 100%;
}
.sr-table th,
.sr-table td {
	border: 1pt solid #222;
	padding: 4pt 6pt;
	vertical-align: top;
}
.sr-table th {
	background: #ececec;
	font-size: 9pt;
	font-weight: 700;
	text-align: center;
	vertical-align: middle;
}
.sr-table thead {
	display: table-header-group;
}
.sr-table tr {
	break-inside: auto;
	page-break-inside: auto;
}
.sr-table tr.sr-group-row {
	break-after: avoid;
	break-inside: avoid;
	page-break-after: avoid;
	page-break-inside: avoid;
}
.sr-group-row td {
	background: #f4f4f4;
	color: #111;
	font-weight: 700;
	padding: 4pt 7pt;
	text-align: left;
}
.sr-col-no { width: 8%; text-align: center; }
.sr-col-subject { width: 29%; }
.sr-col-score { width: 10%; text-align: center; }
.sr-col-desc { width: 53%; }
.sr-col-att-type { width: 28%; }
.sr-col-att-days { width: 18%; text-align: center; }
.sr-col-att-note { width: 46%; }
.sr-desc {
	white-space: pre-line;
	text-align: left;
}
.sr-section-block {
	break-inside: auto;
	margin-top: 10pt;
	page-break-inside: auto;
}
.sr-section-block.keep-together {
	break-inside: avoid;
	page-break-inside: avoid;
}
.sr-nonacademic-block {
	break-inside: auto;
	page-break-inside: auto;
}
.sr-nonacademic-block .sr-subsection-title {
	break-after: avoid;
	page-break-after: avoid;
}
.sr-nonacademic-block .sr-table {
	break-inside: auto;
	page-break-inside: auto;
}
.sr-section-heading {
	border-left: 4pt solid #0f3d5e;
	color: #0f3d5e;
	font-size: 11pt;
	font-weight: 700;
	margin: 0 0 9pt;
	padding-left: 6pt;
	text-align: left;
	text-transform: uppercase;
}
.sr-subsection-title {
	color: #111;
	font-size: 10pt;
	font-weight: 700;
	margin: 10pt 0 6pt;
	text-align: left;
}
.sr-section-block .sr-subsection-title:first-of-type {
	margin-top: 0;
}
.sr-note-title {
	border-left: 4pt solid #0f3d5e;
	color: #0f3d5e;
	font-size: 11pt;
	font-weight: 700;
	text-align: left;
	margin: 0 0 9pt;
	padding-left: 6pt;
	text-transform: uppercase;
}
.sr-decision-title {
	border-left: 4pt solid #0f3d5e;
	color: #0f3d5e;
	font-size: 11pt;
	font-weight: 700;
	text-align: left;
	margin: 0 0 9pt;
	padding-left: 6pt;
	text-transform: uppercase;
}
.sr-plain-box {
	border: 1pt solid #222;
	min-height: 36pt;
	padding: 6pt 7pt;
	white-space: pre-line;
}
.sr-decision-table {
	margin: 0;
	width: 100%;
	table-layout: fixed;
}
.sr-decision-table td {
	border: 1pt solid #222;
	font-size: 9pt;
	padding: 6pt 7pt;
	vertical-align: top;
}
.sr-decision-label {
	width: 30%;
	font-weight: 700;
}
.watermark {
	position: fixed;
	top: 50%;
	left: 50%;
	width: 92mm;
	height: 92mm;
	object-fit: contain;
	transform: translate(-50%, -50%);
	opacity: 0.08;
	z-index: -1;
}
.sr-signatures {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	column-gap: 18pt;
	row-gap: 10pt;
	margin-top: 14pt;
	text-align: center;
	page-break-inside: avoid;
}
.sr-sign-date {
	grid-column: 3;
	grid-row: 1;
	font-size: 9pt;
	margin-bottom: 4pt;
	text-align: center;
}
.sr-sign-box {
	min-height: 74pt;
	display: flex;
	flex-direction: column;
	justify-content: flex-start;
}
.sr-sign-role {
	font-size: 9pt;
	font-weight: 700;
	margin-bottom: 40pt;
}
.sr-sign-identity {
	min-height: 24pt;
}
.sr-sign-name {
	font-size: 9pt;
	font-weight: 700;
	line-height: 1.2;
	margin: 0;
}
.sr-sign-line {
	letter-spacing: 1pt;
}
.sr-nip {
	font-size: 9pt;
	line-height: 1.2;
	margin-top: 2pt;
}
.sr-sign-parent {
	grid-column: 1;
	grid-row: 2;
}
.sr-sign-teacher {
	grid-column: 3;
	grid-row: 2;
}
.sr-sign-principal {
	grid-column: 2;
	grid-row: 3;
}
.sr-sign-principal .sr-sign-role {
	margin-bottom: 40pt;
}
`;
}

function srBiodataStyles(data: BiodataSRData): string {
	const schoolName = data.sekolah.nama;
	return `
@page {
	size: A4 portrait;
	margin: 46mm 16mm 14mm 16mm;
	@top-left {
		content: element(sr-akademik-header);
	}
	@bottom-left {
		content: "${schoolName}";
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
	@bottom-right {
		content: "Dicetak: ${todayId()} | Halaman " counter(page) " dari " counter(pages);
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
}

* { box-sizing: border-box; }
html, body {
	margin: 0;
	padding: 0;
}
body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 9pt;
	line-height: 1.28;
	color: #111;
}
table {
	border-collapse: collapse;
	width: 100%;
}
.sr-akademik-header {
	position: running(sr-akademik-header);
	width: 100%;
	padding-top: 8mm;
	border-bottom: 2pt solid #0f3d5e;
	height: 37mm;
	overflow: hidden;
}
.sr-akademik-header-inner {
	display: grid;
	grid-template-columns: 58pt 1fr;
	column-gap: 13pt;
	align-items: start;
}
.sr-logo {
	width: 58pt;
	height: 58pt;
	object-fit: contain;
	display: block;
}
.sr-logo-placeholder {
	width: 58pt;
	height: 58pt;
}
.sr-akademik-title {
	color: #0f3d5e;
	font-size: 15pt;
	font-weight: 700;
	letter-spacing: .1pt;
	line-height: 1;
	margin: 4pt 0 8pt;
	text-transform: uppercase;
}
.sr-akademik-meta {
	color: #444;
	display: grid;
	grid-template-columns: 74pt 7pt 1fr;
	font-size: 9pt;
	line-height: 1.28;
	row-gap: 2pt;
}
.sr-akademik-meta .label {
	font-weight: 700;
}
.watermark {
	position: fixed;
	top: 50%;
	left: 50%;
	width: 92mm;
	height: 92mm;
	object-fit: contain;
	transform: translate(-50%, -50%);
	opacity: 0.08;
	z-index: -1;
}
.sr-bio-title {
	border-left: 4pt solid #0f3d5e;
	color: #0f3d5e;
	font-size: 11pt;
	font-weight: 700;
	margin: 0 0 9pt;
	padding-left: 6pt;
	text-align: left;
	text-transform: uppercase;
}
.sr-bio-layout {
	display: grid;
	grid-template-columns: minmax(0, 122mm) 44mm;
	column-gap: 10mm;
	align-items: stretch;
	min-height: 198mm;
}
.sr-bio-left,
.sr-bio-right {
	min-height: 198mm;
}
.sr-bio-right {
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	align-items: center;
}
.sr-bio-table {
	table-layout: fixed;
	width: 100%;
}
.sr-bio-table td {
	border: 0.8pt solid #d7d7d7;
	padding: 4pt 5pt;
	vertical-align: top;
}
.sr-bio-label {
	background: #f3f3f3;
	font-weight: 700;
	width: 38%;
}
.sr-bio-value {
	width: 62%;
}
.sr-bio-value div + div {
	margin-top: 2pt;
}
.sr-bio-photo {
	border: 1pt solid #d7d7d7;
	border-radius: 3pt;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
	color: #777;
	font-size: 8pt;
	height: 43mm;
	width: 31mm;
}
.sr-bio-photo img {
	display: block;
	height: 100%;
	object-fit: cover;
	width: 100%;
}
.sr-bio-sign {
	padding-bottom: 7mm;
	text-align: center;
	width: 100%;
	overflow-wrap: anywhere;
}
.sr-bio-sign-role {
	font-size: 9pt;
	font-weight: 700;
	margin-bottom: 22mm;
}
.sr-bio-sign-name {
	font-size: 9.5pt;
	font-weight: 700;
	line-height: 1.2;
	margin: 0;
}
.sr-bio-nip {
	font-size: 8pt;
	line-height: 1.2;
	margin-top: 2pt;
}
`;
}

function srKeasramaanStyles(data: KeasramaanSRData): string {
	const schoolName = data.sekolah.nama;
	return `
@page {
	size: A4 portrait;
	margin: 46mm 16mm 14mm 16mm;
	@top-left {
		content: element(sr-akademik-header);
	}
	@bottom-left {
		content: "${schoolName}";
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
	@bottom-right {
		content: "Dicetak: ${todayId()} | Halaman " counter(page) " dari " counter(pages);
		font-size: 8pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #444;
	}
}

* { box-sizing: border-box; }
html, body {
	margin: 0;
	padding: 0;
}
body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 9pt;
	line-height: 1.28;
	color: #111;
}
table {
	border-collapse: collapse;
	width: 100%;
}
.sr-akademik-header {
	position: running(sr-akademik-header);
	width: 100%;
	padding-top: 8mm;
	border-bottom: 2pt solid #0f3d5e;
	height: 37mm;
	overflow: hidden;
}
.sr-akademik-header-inner {
	display: grid;
	grid-template-columns: 58pt 1fr;
	column-gap: 13pt;
	align-items: start;
}
.sr-logo {
	width: 58pt;
	height: 58pt;
	object-fit: contain;
	display: block;
}
.sr-logo-placeholder {
	width: 58pt;
	height: 58pt;
}
.sr-akademik-title {
	color: #0f3d5e;
	font-size: 15pt;
	font-weight: 700;
	letter-spacing: .1pt;
	line-height: 1;
	margin: 4pt 0 8pt;
	text-transform: uppercase;
}
.sr-akademik-meta {
	color: #444;
	display: grid;
	grid-template-columns: 74pt 7pt 1fr;
	font-size: 9pt;
	line-height: 1.28;
	row-gap: 2pt;
}
.sr-akademik-meta .label {
	font-weight: 700;
}
.watermark {
	position: fixed;
	top: 50%;
	left: 50%;
	width: 92mm;
	height: 92mm;
	object-fit: contain;
	transform: translate(-50%, -50%);
	opacity: 0.08;
	z-index: -1;
}
.sr-keasrama-title {
	border-left: 4pt solid #0f3d5e;
	break-after: avoid;
	color: #0f3d5e;
	font-size: 11pt;
	font-weight: 700;
	margin: 0 0 7pt;
	padding-left: 6pt;
	page-break-after: avoid;
	text-align: left;
	text-transform: uppercase;
}
.sr-keasrama-table {
	border-collapse: collapse;
	break-inside: auto;
	font-size: 8.4pt;
	margin-bottom: 8pt;
	page-break-inside: auto;
	table-layout: fixed;
	width: 100%;
}
.sr-keasrama-table th {
	background: #f0f0f0;
	border: 1pt solid #222;
	font-weight: 700;
	overflow-wrap: anywhere;
	padding: 4pt 6pt;
	text-align: center;
}
.sr-keasrama-table td {
	border: 1pt solid #222;
	break-inside: auto;
	overflow-wrap: anywhere;
	padding: 3.4pt 5pt;
	page-break-inside: auto;
	vertical-align: top;
}
.sr-keasrama-table col.col-no {
	width: 10mm;
}
.sr-keasrama-table col.col-indikator {
	width: 48mm;
}
.sr-keasrama-table col.col-predikat {
	width: 18mm;
}
.sr-keasrama-table col.col-deskripsi {
	width: auto;
}
.sr-keasrama-table thead {
	display: table-header-group;
}
.sr-keasrama-table tr {
	break-inside: auto;
	page-break-inside: auto;
}
.sr-keasrama-table .col-no {
	min-width: 10mm;
	max-width: 10mm;
	text-align: center;
	width: 10mm;
}
.sr-keasrama-table .col-indikator {
	min-width: 48mm;
	max-width: 48mm;
	width: 48mm;
}
.sr-keasrama-table .col-predikat {
	min-width: 18mm;
	max-width: 18mm;
	text-align: center;
	width: 18mm;
}
.sr-keasrama-table .col-deskripsi {
	overflow-wrap: anywhere;
	text-align: left;
	white-space: pre-line;
	width: auto;
}
.sr-keasrama-table tr.category-header td {
	background: #fff;
	break-after: avoid;
	break-inside: avoid;
	color: #0f3d5e;
	font-weight: 700;
	page-break-after: avoid;
	page-break-inside: avoid;
	padding: 5pt 6pt 4pt;
	text-align: left;
}
.sr-keasrama-note-title {
	border-left: 4pt solid #0f3d5e;
	break-after: avoid;
	color: #0f3d5e;
	font-size: 11pt;
	font-weight: 700;
	margin: 8pt 0 6pt;
	padding-left: 6pt;
	page-break-after: avoid;
	text-align: left;
	text-transform: uppercase;
}
.sr-keasrama-note-box {
	border: 1pt solid #222;
	font-size: 9pt;
	min-height: 28pt;
	margin-bottom: 9pt;
	padding: 6pt;
	white-space: pre-line;
}
.sr-keasrama-after-table {
	break-inside: avoid;
	page-break-inside: avoid;
}
.sr-keasrama-signature {
	break-inside: avoid;
	margin-top: 9pt;
	page-break-inside: avoid;
	width: 100%;
}
.sr-keasrama-signature td {
	padding: 0 4pt;
	text-align: center;
	vertical-align: top;
	width: 33.333%;
}
.sr-keasrama-signature .signature-date {
	min-height: 12pt;
	padding-bottom: 6pt;
	text-align: center;
}
.sr-keasrama-signature .signature-date-placeholder {
	visibility: hidden;
}
.sr-keasrama-signature .principal-cell {
	padding-top: 8pt;
}
.sr-keasrama-signature .sig-title {
	font-size: 9pt;
	font-weight: 700;
}
.sr-keasrama-signature .sig-name {
	font-size: 9.5pt;
	font-weight: 700;
	line-height: 1.2;
	padding-top: 18mm;
	text-decoration: underline;
}
.sr-keasrama-signature .sig-nip {
	font-size: 8.5pt;
	line-height: 1.2;
	padding-top: 1pt;
}
`;
}

function renderSRAcademicHeader(data: {
	sekolah: { nama: string; logoSrc?: string | null };
	murid: { nama: string };
	periode?: {
		semester?: string | null;
		tahunPelajaran?: string | null;
		tahunAjaran?: string | null;
	};
}): string {
	const logo = data.sekolah.logoSrc
		? `<img src="${data.sekolah.logoSrc}" alt="Logo sekolah" class="sr-logo">`
		: '<div class="sr-logo-placeholder"></div>';
	const semester = semesterLabel(data);
	return `<div class="sr-akademik-header">
	<div class="sr-akademik-header-inner">
		${logo}
		<div>
			<div class="sr-akademik-title">RAPOR PESERTA DIDIK</div>
			<div class="sr-akademik-meta">
				<div class="label">Nama Siswa</div><div>:</div><div>${formatUpper(data.murid.nama)}</div>
				<div class="label">Semester</div><div>:</div><div>${formatValue(semester)}</div>
				<div class="label">Nama Sekolah</div><div>:</div><div>${formatValue(data.sekolah.nama)}</div>
			</div>
		</div>
	</div>
</div>`;
}

function renderAttendanceRows(data: RaporPrintData): string {
	const { hadir, sakit, izin, tanpaKeterangan } = data.ketidakhadiran;
	const rows = [
		['Hadir', hadir, ''],
		['Alpa', tanpaKeterangan, ''],
		['Ijin', izin, ''],
		['Sakit', sakit, '']
	] as const;

	return rows
		.map(
			([label, count, note], index) => `<tr>
	<td class="sr-col-no">${index + 1}</td>
	<td class="sr-col-att-type">${label}</td>
	<td class="sr-col-att-days">${formatValue(count)}${typeof count === 'number' ? '' : ''}</td>
	<td class="sr-col-att-note">${blankIfEmpty(note)}</td>
</tr>`
		)
		.join('\n');
}

function renderSRAcademicRows(data: RaporPrintData): string {
	const kelompokMap: Record<string, { label: string; items: typeof data.nilaiIntrakurikuler }> = {
		wajib: {
			label:
				data.sekolah.jenjangVariant === 'SMK'
					? 'A. Mata Pelajaran Umum'
					: 'A. Mata Pelajaran Wajib',
			items: []
		},
		pilihan: { label: 'B. Mata Pelajaran Pilihan', items: [] },
		kejuruan: { label: 'C. Mata Pelajaran Kejuruan', items: [] },
		mulok: { label: 'D. Muatan Lokal', items: [] }
	};

	for (const row of data.nilaiIntrakurikuler) {
		const jenis = normalizeAcademicSubjectType(row.jenis);
		if (!kelompokMap[jenis]) {
			kelompokMap[jenis] = { label: row.kelompok || jenis, items: [] };
		}
		kelompokMap[jenis].items.push(row);
	}

	return ['wajib', 'pilihan', 'kejuruan', 'mulok']
		.filter((jenis) => kelompokMap[jenis]?.items.length)
		.map((jenis) => {
			const group = kelompokMap[jenis];
			const rows = group.items
				.map(
					(row, index) => `<tr>
	<td class="sr-col-no">${index + 1}</td>
	<td class="sr-col-subject">${formatValue(row.mataPelajaran)}</td>
	<td class="sr-col-score">${formatValue(row.nilaiAkhir)}</td>
	<td class="sr-col-desc sr-desc">${formatValue(row.deskripsi)}</td>
</tr>`
				)
				.join('\n');

			return `<tr class="sr-group-row"><td colspan="4">${group.label}</td></tr>
${rows}`;
		})
		.join('\n');
}

function normalizeAcademicSubjectType(value: string | null | undefined): string {
	const normalized = value?.trim().toLowerCase() ?? '';
	if (
		normalized === 'wajib' ||
		normalized === 'pilihan' ||
		normalized === 'kejuruan' ||
		normalized === 'mulok'
	) {
		return normalized;
	}
	return 'wajib';
}

function renderSRNonAcademicBlock(data: RaporPrintData): string {
	const kokurikuler =
		data.hasKokurikuler && data.kokurikuler
			? `<div class="sr-subsection-title">A. Kokurikuler</div>
	<table class="sr-table">
		<tbody>
			<tr><td class="sr-desc">${formatValue(data.kokurikuler)}</td></tr>
		</tbody>
	</table>`
			: '';

	const ekstrakurikuler = data.ekstrakurikuler?.length
		? `<div class="sr-subsection-title">${kokurikuler ? 'B' : 'A'}. Ekstrakurikuler</div>
	<table class="sr-table">
		<thead>
			<tr>
				<th class="sr-col-no">No</th>
				<th style="width: 32%;">Ekstrakurikuler</th>
				<th>Keterangan</th>
			</tr>
		</thead>
		<tbody>
			${data.ekstrakurikuler
				.map(
					(item, index) => `<tr>
				<td class="sr-col-no">${index + 1}</td>
				<td>${formatValue(item.nama)}</td>
				<td class="sr-desc">${formatValue(item.deskripsi)}</td>
			</tr>`
				)
				.join('\n')}
		</tbody>
	</table>`
		: '';

	const kehadiranLetter =
		kokurikuler && ekstrakurikuler ? 'C' : kokurikuler || ekstrakurikuler ? 'B' : 'A';

	return `<div class="sr-section-block sr-nonacademic-block">
	<div class="sr-section-heading">KEHADIRAN &amp; AKTIVITAS NON-AKADEMIK</div>
	${kokurikuler}
	${ekstrakurikuler}
	<div class="sr-subsection-title">${kehadiranLetter}. Kehadiran</div>
	<table class="sr-table">
		<thead>
			<tr>
				<th class="sr-col-no">No</th>
				<th class="sr-col-att-type">Jenis Kehadiran</th>
				<th class="sr-col-att-days">Jumlah<br>(Hari)</th>
				<th class="sr-col-att-note">Keterangan</th>
			</tr>
		</thead>
		<tbody>${renderAttendanceRows(data)}</tbody>
	</table>
</div>`;
}

function renderSignatureName(name: string | null | undefined, fallbackLine = false): string {
	const value = name?.trim();
	if (value) return formatValue(value);
	return fallbackLine ? '<span class="sr-sign-line">..................................</span>' : '';
}

function blankIfEmpty(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return '';
	return String(value);
}

function renderSRBioRow(no: string, label: string, value: string): string {
	return `<tr>
	<td class="sr-bio-label">${no} ${label}</td>
	<td class="sr-bio-value">${value}</td>
</tr>`;
}

export function renderSRCoverHTML(data: CoverPrintData): string {
	const school = data.sekolah;
	const address = school.alamat;
	const schoolAddress = [address.jalan, address.desa, address.kecamatan, address.kabupaten]
		.filter(Boolean)
		.join(', ');
	const nisnNis = [data.murid.nisn, data.murid.nis].filter(Boolean).join(' / ') || '-';
	const logo = school.logoSrc
		? `<img src="${school.logoSrc}" alt="Logo sekolah" class="sr-cover-main-logo">`
		: '<div class="sr-cover-main-logo placeholder">Logo<br>Sekolah</div>';
	const headerData = {
		sekolah: { nama: school.nama, logoSrc: school.logoSrc ?? null },
		murid: { nama: data.murid.nama },
		periode: { semester: '-', tahunPelajaran: '' }
	};

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>${srCoverStyles(data)}</style>
</head>
<body>
<section class="sr-cover-sampul">
	<div class="sr-cover-brand">
		<div class="sr-cover-brand-mark"></div>
		<div>Kementerian Sosial<br>Republik Indonesia</div>
	</div>
	${logo}
	<div class="sr-cover-ministry">Kementerian Sosial Republik Indonesia</div>
	<div class="sr-cover-report-title">Laporan Hasil Belajar<br>${formatUpper(school.nama)}</div>
	<div class="sr-cover-student-label">Nama Peserta Didik</div>
	<div class="sr-cover-student-card">
		<div class="sr-cover-student-row">
			<div class="label">Nama Murid</div><div>:</div><div class="value">${formatValue(data.murid.nama)}</div>
		</div>
		<div class="sr-cover-student-row">
			<div class="label">NISN / NIS</div><div>:</div><div class="value">${formatValue(nisnNis)}</div>
		</div>
	</div>
	<div class="sr-cover-footer">
		<div>${formatValue(schoolAddress)}</div>
		<div>${formatValue(school.website)}</div>
	</div>
</section>

<section class="sr-cover-identity-page">
${renderSRAcademicHeader(headerData)}

<div class="sr-cover-title">IDENTITAS SATUAN PENDIDIKAN</div>
<table class="sr-cover-school-table">
	<tbody>
		<tr><td class="label">Nama Sekolah</td><td class="value">${formatValue(school.nama)}</td></tr>
		<tr><td class="label">NPSN</td><td class="value">${formatValue(school.npsn)}</td></tr>
		<tr><td class="label">Alamat Sekolah</td><td class="value">${formatValue(address.jalan)}</td></tr>
		<tr><td class="label">Kode Pos</td><td class="value">${formatValue(address.kodePos)}</td></tr>
		<tr><td class="label">Desa/Kelurahan</td><td class="value">${formatValue(address.desa)}</td></tr>
		<tr><td class="label">Kecamatan</td><td class="value">${formatValue(address.kecamatan)}</td></tr>
		<tr><td class="label">Kabupaten/Kota</td><td class="value">${formatValue(address.kabupaten)}</td></tr>
		<tr><td class="label">Provinsi</td><td class="value">${formatValue(address.provinsi)}</td></tr>
		<tr><td class="label">Website</td><td class="value">${formatValue(school.website)}</td></tr>
		<tr><td class="label">E-mail</td><td class="value">${formatValue(school.email)}</td></tr>
	</tbody>
</table>
</section>
</body>
</html>`;
}

export function renderSRBiodataHTML(data: BiodataSRData): string {
	const bgLogoSrc = data.showBgLogo ? data.sekolah.bgLogoSrc || getTutwuriBwDataUri() : null;
	const muridAlamat = data.murid.alamat ?? {};
	const orangTuaAlamat = data.orangTua.alamat ?? {};
	const address = [
		muridAlamat.jalan,
		muridAlamat.kelurahan,
		muridAlamat.kecamatan,
		muridAlamat.kabupaten,
		muridAlamat.provinsi
	]
		.filter(Boolean)
		.join(', ');
	const parentAddress = [
		orangTuaAlamat.jalan,
		orangTuaAlamat.kelurahan,
		orangTuaAlamat.kecamatan,
		orangTuaAlamat.kabupaten,
		orangTuaAlamat.provinsi
	]
		.filter(Boolean)
		.join(', ');
	const photo = data.murid.foto ? `<img src="${data.murid.foto}" alt="Foto">` : 'FOTO 3x4';
	const kepalaTitle =
		data.sekolah.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';
	const rows = [
		renderSRBioRow('1.', 'Nama Lengkap Peserta Didik', formatUpper(data.murid.nama)),
		renderSRBioRow('2.', 'Nomor Induk Siswa Nasional', formatValue(data.murid.nisn)),
		renderSRBioRow(
			'3.',
			'Tempat, Tanggal Lahir',
			`${formatValue(data.murid.tempatLahir)}, ${formatValue(data.murid.tanggalLahir)}`
		),
		renderSRBioRow('4.', 'Jenis Kelamin', formatValue(data.murid.jenisKelamin)),
		renderSRBioRow('5.', 'Agama', formatValue(data.murid.agama)),
		renderSRBioRow('6.', 'Status dalam Keluarga', '-'),
		renderSRBioRow('7.', 'Anak ke', '-'),
		renderSRBioRow('8.', 'Alamat Peserta Didik', formatValue(address)),
		renderSRBioRow('9.', 'Nomor Telepon', '-'),
		renderSRBioRow(
			'10.',
			'Diterima di Sekolah ini',
			'<div>a. Di kelas: -</div><div>b. Pada tanggal: -</div>'
		),
		renderSRBioRow(
			'11.',
			'Nama Orang Tua',
			`<div>a. Ayah: ${formatValue(data.orangTua.ayah.nama)}</div><div>b. Ibu: ${formatValue(data.orangTua.ibu.nama)}</div>`
		),
		renderSRBioRow('12.', 'Alamat Orang Tua', formatValue(parentAddress)),
		renderSRBioRow('13.', 'Nomor Telepon Rumah (Orang Tua)', '-'),
		renderSRBioRow(
			'14.',
			'Pekerjaan Orang Tua',
			`<div>a. Ayah: ${formatValue(data.orangTua.ayah.pekerjaan)}</div><div>b. Ibu: ${formatValue(data.orangTua.ibu.pekerjaan)}</div>`
		),
		renderSRBioRow('15.', 'Nama Wali Peserta Didik', formatValue(data.wali.nama)),
		renderSRBioRow('16.', 'Alamat Wali Peserta Didik', formatValue(data.wali.alamat)),
		renderSRBioRow('17.', 'Nomor Telepon Rumah (Wali)', '-'),
		renderSRBioRow('18.', 'Pekerjaan Wali Peserta Didik', formatValue(data.wali.pekerjaan))
	].join('\n');

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>${srBiodataStyles(data)}</style>
</head>
<body>
${bgLogoSrc ? `<img src="${bgLogoSrc}" alt="" class="watermark">` : ''}
${renderSRAcademicHeader(data)}

<div class="sr-bio-title">IDENTITAS PESERTA DIDIK</div>
<div class="sr-bio-layout">
	<div class="sr-bio-left">
		<table class="sr-bio-table">
			<tbody>
				${rows}
			</tbody>
		</table>
	</div>
	<div class="sr-bio-right">
		<div class="sr-bio-photo">${photo}</div>
		<div class="sr-bio-sign">
			<div class="sr-bio-sign-role">${kepalaTitle}</div>
			<div class="sr-bio-sign-name">${formatValue(data.ttd.kepalaSekolah)}</div>
			<div class="sr-bio-nip">NIP . ${formatValue(data.ttd.nip)}</div>
		</div>
	</div>
</div>
</body>
</html>`;
}

export function renderSRRaporHTML(data: RaporPrintData): string {
	const bgLogoSrc = data.showBgLogo ? data.sekolah.bgLogoSrc || getTutwuriBwDataUri() : null;
	const rows = renderSRAcademicRows(data);

	const kepalaStatus =
		data.kepalaSekolah.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';
	const isSemesterGenap = data.periode.semester.toLowerCase().includes('genap');
	const showStatusAkhir = data.raporPeriode === 'ras' && isSemesterGenap;
	const statusAkhir = data.statusAkhirRapor ?? {};
	const keputusanHtml = showStatusAkhir
		? `
<div class="sr-decision-title">KEPUTUSAN KENAIKAN KELAS/KELULUSAN</div>
<table class="sr-decision-table">
	<tr>
		<td class="sr-decision-label">Status Akhir</td>
		<td>${blankIfEmpty(statusAkhir.status ?? '')}</td>
	</tr>
	<tr>
		<td class="sr-decision-label">Tanggal Penetapan</td>
		<td>${blankIfEmpty(statusAkhir.tanggalPenetapan ?? '')}</td>
	</tr>
	<tr>
		<td class="sr-decision-label">Catatan Tambahan</td>
		<td>${blankIfEmpty(statusAkhir.catatan ?? '')}</td>
	</tr>
</table>`
		: '';

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>${srAcademicStyles(data)}</style>
</head>
<body>
${bgLogoSrc ? `<img src="${bgLogoSrc}" alt="" class="watermark">` : ''}
${renderSRAcademicHeader(data)}

<div class="sr-section-heading">LAPORAN HASIL BELAJAR</div>
<table class="sr-table">
	<thead>
		<tr>
				<th class="sr-col-no">No</th>
				<th class="sr-col-subject">Mata Pelajaran</th>
				<th class="sr-col-score">Nilai</th>
				<th class="sr-col-desc">Deskripsi Capaian Kompetensi</th>
			</tr>
	</thead>
	<tbody>${rows}</tbody>
</table>

${renderSRNonAcademicBlock(data)}

<div class="sr-section-block keep-together">
	<div class="sr-note-title">CATATAN WALI KELAS</div>
	<div class="sr-plain-box">${blankIfEmpty(data.catatanWali)}</div>
</div>

<div class="sr-section-block keep-together">
	${keputusanHtml}
<div class="sr-signatures">
		<div class="sr-sign-date">${formatValue(data.ttd.tempat)}, ${formatValue(data.ttd.tanggal)}</div>
		<div class="sr-sign-box sr-sign-parent">
			<div class="sr-sign-role">Orang Tua/Wali</div>
			<div class="sr-sign-identity">
				<div class="sr-sign-name">${renderSignatureName(data.orangTuaWali?.nama, true)}</div>
			</div>
		</div>
		<div class="sr-sign-box sr-sign-teacher">
			<div class="sr-sign-role">Wali Kelas</div>
			<div class="sr-sign-identity">
				<div class="sr-sign-name">${renderSignatureName(data.waliKelas.nama, true)}</div>
				${data.waliKelas.nip ? `<div class="sr-nip">NIP . ${formatValue(data.waliKelas.nip)}</div>` : ''}
			</div>
		</div>
		<div class="sr-sign-box sr-sign-principal">
			<div class="sr-sign-role">${kepalaStatus}</div>
			<div class="sr-sign-identity">
				<div class="sr-sign-name">${renderSignatureName(data.kepalaSekolah.nama, true)}</div>
				${data.kepalaSekolah.nip ? `<div class="sr-nip">NIP . ${formatValue(data.kepalaSekolah.nip)}</div>` : ''}
			</div>
		</div>
	</div>
</div>
</body>
</html>`;
}

function predikatToLetter(predikat: string): string {
	const map: Record<string, string> = {
		'sangat-baik': 'A',
		baik: 'B',
		cukup: 'C',
		'perlu-bimbingan': 'D'
	};
	return map[predikat] ?? predikat;
}

export function renderSRKeasramaanHTML(data: KeasramaanSRData): string {
	const bgLogoSrc = data.sekolah.logoUrl || getTutwuriBwDataUri() || null;
	const headerData = {
		sekolah: {
			nama: data.sekolah.nama,
			logoSrc: data.sekolah.logoUrl
		},
		murid: data.murid,
		periode: {
			semester: data.periode.semester.replace(/^Semester\s+/i, ''),
			tahunAjaran: data.periode.tahunAjaran
		}
	};
	const tableBody = data.keasramaanRows
		.map((row, i, arr) => {
			if (row.kategoriHeader) {
				return `<tr class="category-header">
			<td colspan="4">${formatValue(row.kategoriHeader)}</td>
		</tr>`;
			}
			const prev = arr[i - 1];
			const cls = prev?.kategoriHeader ? ' class="first-data-row"' : '';
			return `<tr${cls}>
			<td class="col-no">${formatValue(row.no)}</td>
			<td class="col-indikator">${formatValue(row.indikator)}</td>
			<td class="col-predikat">${predikatToLetter(row.predikat)}</td>
			<td class="col-deskripsi">${formatValue(row.deskripsi)}</td>
		</tr>`;
		})
		.join('\n');

	const noteSection = `<div class="sr-keasrama-after-table">
<div class="sr-keasrama-note-title">CATATAN WALI ASRAMA</div>
<div class="sr-keasrama-note-box">${formatValue(data.catatanWaliAsrama)}</div>
</div>`;

	const kepalaSekolahTitle =
		data.kepalaSekolah?.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';
	const ttdText = `${formatValue(data.ttd.tempat)}, ${formatValue(data.ttd.tanggal)}`;
	const waliAsramaSection = data.waliAsrama
		? `<td style="padding-bottom:12pt;">
			<div class="signature-date signature-date-placeholder">${ttdText}</div>
			<div class="sig-title">Wali Asrama</div>
			<div class="sig-name">${formatValue(data.waliAsrama.nama)}</div>
			<div class="sig-nip">${formatValue(data.waliAsrama.nip)}</div>
		</td>`
		: '<td></td>';
	const waliAsuhSection = data.waliAsuh
		? `<td style="padding-bottom:12pt;">
			<div class="signature-date">${ttdText}</div>
			<div class="sig-title">Wali Asuh</div>
			<div class="sig-name">${formatValue(data.waliAsuh.nama)}</div>
			<div class="sig-nip">${formatValue(data.waliAsuh.nip)}</div>
		</td>`
		: '<td></td>';
	const kepalaSekolahSection = data.kepalaSekolah
		? `<td class="principal-cell">
			<div class="sig-title">${kepalaSekolahTitle}</div>
			<div class="sig-name">${formatValue(data.kepalaSekolah.nama)}</div>
			<div class="sig-nip">${formatValue(data.kepalaSekolah.nip)}</div>
		</td>`
		: '<td></td>';

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>${srKeasramaanStyles(data)}</style>
</head>
<body>
${bgLogoSrc ? `<img src="${bgLogoSrc}" alt="" class="watermark">` : ''}
${renderSRAcademicHeader(headerData)}

<div class="sr-keasrama-title">LAPORAN KEGIATAN KEASRAMAAN</div>

<table class="sr-keasrama-table">
	<colgroup>
		<col class="col-no" style="width:10mm;">
		<col class="col-indikator" style="width:52mm;">
		<col class="col-predikat" style="width:18mm;">
		<col class="col-deskripsi">
	</colgroup>
	<thead>
		<tr>
			<th class="col-no">No</th>
			<th class="col-indikator">Indikator</th>
			<th class="col-predikat">Predikat</th>
			<th class="col-deskripsi">Deskripsi</th>
		</tr>
	</thead>
	<tbody>
		${tableBody}
	</tbody>
</table>

${noteSection}

<table class="sr-keasrama-signature">
	<tr>
		${waliAsramaSection}
		<td></td>
		${waliAsuhSection}
	</tr>
	<tr>
		<td></td>
		${kepalaSekolahSection}
		<td></td>
	</tr>
</table>
</body>
</html>`;
}
