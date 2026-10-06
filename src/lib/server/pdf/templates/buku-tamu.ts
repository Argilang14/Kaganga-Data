import { sharedStyles } from './shared';
import {
	renderSchoolLetterhead,
	schoolLetterheadStyles,
	type SchoolLetterheadData
} from './school-letterhead.ts';

function escapeHtml(value: string | number | null | undefined) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export type BukuTamuPrintData = {
	sekolah: SchoolLetterheadData & {
		npsn: string;
	};
	periode: string;
	rows: Array<{
		no: number;
		waktu: string;
		nama: string;
		asal: string;
		nip: string;
		keperluan: string;
		pesan: string;
		tandaTangan: string | null;
	}>;
};

export function renderBukuTamuHTML(data: BukuTamuPrintData) {
	const rows = data.rows
		.map(
			(row) => `<tr>
		<td class="center">${row.no}</td><td>${escapeHtml(row.waktu)}</td><td>${escapeHtml(row.nama)}</td>
		<td>${escapeHtml(row.asal)}</td><td>${escapeHtml(row.nip || '-')}</td><td>${escapeHtml(row.keperluan)}</td>
		<td>${escapeHtml(row.pesan || '-')}</td><td class="signature">${row.tandaTangan ? `<img src="${escapeHtml(row.tandaTangan)}" alt="">` : ''}</td>
	</tr>`
		)
		.join('');
	return `<!doctype html><html><head><meta charset="utf-8"><style>
	${sharedStyles()}
	${schoolLetterheadStyles()}
	@page { size: A4 landscape; margin: 13mm; }
	body { font-size: 9pt; }
	.document-title { margin:0 0 4mm; text-align:center; }
	.document-title h1 { margin:0; font-size:18pt; line-height:1.1; }
	.document-title .identity { margin-top:2px; font-size:8pt; color:#334155; }
	.period { margin:9px 0; display:flex; justify-content:space-between; }
	table { table-layout:fixed; font-size:8pt; }
	th, td { border:1px solid #111; padding:4px; vertical-align:top; overflow-wrap:anywhere; }
	th { background:#dbeafe; text-align:center; font-weight:700; }
	.center { text-align:center; }
	.signature { text-align:center; vertical-align:middle; }
	.signature img { max-width:75px; max-height:38px; object-fit:contain; }
	</style></head><body>
	${renderSchoolLetterhead(data.sekolah)}
	<div class="document-title"><h1>BUKU TAMU DIGITAL</h1><div class="identity">NPSN ${escapeHtml(data.sekolah.npsn)}</div></div>
	<div class="period"><strong>Periode: ${escapeHtml(data.periode)}</strong><span>Total kunjungan: ${data.rows.length}</span></div>
	<table><colgroup><col style="width:4%"><col style="width:11%"><col style="width:13%"><col style="width:13%"><col style="width:9%"><col style="width:20%"><col style="width:20%"><col style="width:10%"></colgroup>
	<thead><tr><th>No.</th><th>Waktu</th><th>Nama</th><th>Asal / Instansi</th><th>NIP</th><th>Keperluan</th><th>Pesan dan Kesan</th><th>Tanda Tangan</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="center">Tidak ada data kunjungan.</td></tr>'}</tbody></table>
	</body></html>`;
}
