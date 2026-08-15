import { formatValue as formatValueRaw, sharedStyles } from './shared';

function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function formatValue(value: string | number | null | undefined): string {
	return escapeHtml(formatValueRaw(value));
}

export interface JurnalMengajarPrintData {
	sekolah: {
		nama: string;
		npsn: string;
		alamat: string;
		logoUrl: string | null;
		logoDinasUrl: string | null;
	};
	filter: {
		label: string;
		value: string;
		jenisJadwal: string;
	};
	periode: {
		tahunPelajaran: string;
		semester: string;
		tanggalMulai: string;
		tanggalSelesai: string;
	};
	rows: Array<{
		tanggal: string;
		kelas: string;
		mataPelajaran: string;
		jamPelajaran: string;
		pukul: string;
		lingkupMateri: string;
		tujuanPembelajaran: string;
		hadir: number;
		sakit: number;
		izin: number;
		alfa: number;
		catatan: string;
	}>;
	kepalaSekolah: {
		nama: string;
		nip?: string | null;
		statusKepalaSekolah?: string | null;
	};
	guru: {
		nama: string;
		nip?: string | null;
	};
	isWaliKelas: boolean;
	guruLabel: string;
	ttd: {
		tempat: string;
		tanggal: string;
	};
}

export function renderJurnalMengajarHTML(data: JurnalMengajarPrintData): string {
	const rows = data.rows ?? [];
	const title =
		data.filter.label === 'Kelas'
			? 'Jurnal Mengajar Per Kelas'
			: 'Jurnal Mengajar Per Mata Pelajaran';
	const logo = (src: string | null, alt: string) =>
		src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />` : '';

	const tableRows = rows
		.map(
			(row, i) => `
		<tr${i % 2 === 1 ? ' class="striped"' : ''}>
			<td class="text-center">${formatValue(row.tanggal)}</td>
			<td class="text-center">${formatValue(row.kelas)}</td>
			<td>${formatValue(row.mataPelajaran)}</td>
			<td class="text-center">JP ${formatValue(row.jamPelajaran)}${row.pukul ? `<br><span class="time">${formatValue(row.pukul)}</span>` : ''}</td>
			<td>${formatValue(row.lingkupMateri)}</td>
			<td>${formatValue(row.tujuanPembelajaran)}</td>
			<td class="text-center">${row.hadir}/${row.sakit}/${row.izin}/${row.alfa}</td>
			<td>${formatValue(row.catatan)}</td>
		</tr>`
		)
		.join('');

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${sharedStyles()}

@page {
	size: A4 landscape;
	margin: 10mm;
	@bottom-right {
		content: "Halaman " counter(page) " dari " counter(pages);
		font-size: 7pt;
		color: #64748b;
	}
}

body {
	margin: 0;
	font-family: Arial, Helvetica, sans-serif;
	font-size: 9pt;
	color: #111827;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

.document-header {
	display: grid;
	grid-template-columns: 25mm minmax(0, 1fr) 25mm;
	align-items: center;
	gap: 4mm;
	margin-bottom: 5mm;
	padding-bottom: 3mm;
	border-bottom: 1.4px solid #111;
}

.header-logo {
	display: flex;
	width: 25mm;
	height: 24mm;
	align-items: center;
	justify-content: center;
}

.header-logo img {
	display: block;
	max-width: 22mm;
	max-height: 22mm;
	object-fit: contain;
}

.header-text {
	text-align: center;
	text-transform: uppercase;
}

.header-text h1 {
	margin: 0;
	font-size: 18pt;
	line-height: 1.1;
}

.header-text .school {
	margin-top: 2px;
	font-size: 13pt;
	font-weight: 800;
}

.header-text .identity,
.header-text .address {
	margin-top: 2px;
	font-size: 8pt;
	text-transform: none;
	color: #334155;
}

.filter-info {
	display: flex;
	flex-wrap: wrap;
	gap: 2mm 7mm;
	margin-bottom: 3mm;
	padding: 2.5mm 3mm;
	border: 1px solid #64748b;
	background: #f8fafc;
	font-size: 8.5pt;
}

.journal-table {
	width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
	font-size: 8pt;
}

.journal-table thead {
	display: table-header-group;
}

.journal-table th,
.journal-table td {
	border: 1.2px solid #000;
}

.journal-table th {
	background-color: #155bb7;
	color: #fff;
	font-weight: bold;
	text-align: center;
	padding: 2mm 1.2mm;
	font-size: 7.5pt;
}

.journal-table td {
	padding: 1.5mm;
	vertical-align: top;
	overflow-wrap: anywhere;
}

.journal-table tr {
	break-inside: avoid;
	page-break-inside: avoid;
}

.journal-table tr.striped td {
	background-color: #f1f5f9;
}

.text-center {
	text-align: center;
}

.time {
	font-size: 8pt;
	color: #444;
}

.signature-section {
	margin-top: 9mm;
	break-inside: avoid;
	page-break-inside: avoid;
}

.signature-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
	border: none;
}

.signature-table td {
	padding: 2pt 6pt;
	vertical-align: top;
	text-align: center;
	border: none;
}

.signature-table .text-right {
	text-align: right;
}

.signature-table .font-bold {
	font-weight: bold;
}

.signature-table .underline {
	text-decoration: underline;
}

.signature-table .h-24 {
	height: 22mm;
}

.signature-table .h-4 {
	height: 1rem;
}
</style>
</head>
<body>
	<div class="document-header">
		<div class="header-logo">${logo(data.sekolah.logoDinasUrl, 'Logo pemda atau kementerian')}</div>
		<div class="header-text">
			<h1>${formatValue(title)}</h1>
			<div class="school">${formatValue(data.sekolah.nama)}</div>
			<div class="identity">NPSN ${formatValue(data.sekolah.npsn)} &bull; Tahun Ajaran ${formatValue(data.periode.tahunPelajaran)} &bull; ${formatValue(data.filter.jenisJadwal)}</div>
			${data.sekolah.alamat ? `<div class="address">${formatValue(data.sekolah.alamat)}</div>` : ''}
		</div>
		<div class="header-logo">${logo(data.sekolah.logoUrl, 'Logo sekolah')}</div>
	</div>

	<div class="filter-info">
		<span><strong>${formatValue(data.filter.label)}:</strong> ${formatValue(data.filter.value)}</span>
		<span><strong>Semester:</strong> ${formatValue(data.periode.semester)}</span>
		<span><strong>Periode:</strong> ${formatValue(data.periode.tanggalMulai)} s.d. ${formatValue(data.periode.tanggalSelesai)}</span>
		<span><strong>Penandatangan:</strong> ${formatValue(data.guruLabel)} &bull; ${formatValue(data.guru.nama)}</span>
	</div>

	<table class="journal-table">
		<thead>
			<tr>
				<th style="width: 8%;">Tanggal</th>
				<th style="width: 8%;">Kelas</th>
				<th style="width: 12%;">Mata Pelajaran</th>
				<th style="width: 6%;">Jam</th>
				<th style="width: 13%;">Materi</th>
				<th style="width: 22%;">Tujuan Pembelajaran</th>
				<th style="width: 10%;">Kehadiran (H/S/I/TK)</th>
				<th style="width: 21%;">Catatan</th>
			</tr>
		</thead>
		<tbody>
			${tableRows || '<tr><td colspan="8" class="text-center" style="padding:20px;">Tidak ada data jurnal mengajar</td></tr>'}
		</tbody>
	</table>

	<div class="signature-section">
		<table class="signature-table">
			<colgroup>
				<col style="width:50%">
				<col style="width:50%">
			</colgroup>
			<tbody style="page-break-inside: avoid;">
				<tr>
					<td class="font-bold">Mengetahui</td>
					<td class="text-center">${formatValue(data.ttd.tempat)}, ${formatValue(data.ttd.tanggal)}</td>
				</tr>
				<tr>
					<td>${data.kepalaSekolah.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah'}</td>
					<td>${formatValue(data.guruLabel)}</td>
				</tr>
				<tr>
					<td class="h-24"></td>
					<td class="h-24"></td>
				</tr>
				<tr>
					<td class="font-bold underline">${formatValue(data.kepalaSekolah.nama)}</td>
					<td class="font-bold underline">${formatValue(data.guru.nama)}</td>
				</tr>
				<tr>
					<td class="text-center">${escapeHtml(data.kepalaSekolah.nip)}</td>
					<td class="text-center">${escapeHtml(data.guru.nip)}</td>
				</tr>
			</tbody>
		</table>
	</div>
</body>
</html>`;
}
