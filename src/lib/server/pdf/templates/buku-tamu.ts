import { sharedStyles } from './shared';

function escapeHtml(value: string | number | null | undefined) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export type BukuTamuPrintData = {
	sekolah: {
		nama: string;
		npsn: string;
		alamat: string;
		logoUrl: string | null;
		logoDinasUrl: string | null;
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
	const logo = (src: string | null, alt: string) =>
		src
			? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`
			: '<span></span>';
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
	@page { size: A4 landscape; margin: 13mm; }
	body { font-size: 9pt; }
	.header { display:grid; grid-template-columns:72px 1fr 72px; align-items:center; gap:12px; padding-bottom:8px; border-bottom:3px solid #111; text-align:center; }
	.header img { width:64px; height:64px; object-fit:contain; margin:auto; }
	.header h1 { font-size:16pt; letter-spacing:0; margin:0 0 2px; }
	.header p { margin:1px 0; }
	.period { margin:9px 0; display:flex; justify-content:space-between; }
	table { table-layout:fixed; font-size:8pt; }
	th, td { border:1px solid #111; padding:4px; vertical-align:top; overflow-wrap:anywhere; }
	th { background:#dbeafe; text-align:center; font-weight:700; }
	.center { text-align:center; }
	.signature { text-align:center; vertical-align:middle; }
	.signature img { max-width:75px; max-height:38px; object-fit:contain; }
	</style></head><body>
	<header class="header">${logo(data.sekolah.logoDinasUrl, 'Logo pemda atau kementerian')}<div><h1>BUKU TAMU</h1><p><strong>${escapeHtml(data.sekolah.nama)}</strong></p><p>NPSN ${escapeHtml(data.sekolah.npsn)} | ${escapeHtml(data.sekolah.alamat)}</p></div>${logo(data.sekolah.logoUrl, 'Logo sekolah')}</header>
	<div class="period"><strong>Periode: ${escapeHtml(data.periode)}</strong><span>Total kunjungan: ${data.rows.length}</span></div>
	<table><colgroup><col style="width:4%"><col style="width:11%"><col style="width:13%"><col style="width:13%"><col style="width:9%"><col style="width:20%"><col style="width:20%"><col style="width:10%"></colgroup>
	<thead><tr><th>No.</th><th>Waktu</th><th>Nama</th><th>Asal / Instansi</th><th>NIP</th><th>Keperluan</th><th>Pesan dan Kesan</th><th>Tanda Tangan</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="center">Tidak ada data kunjungan.</td></tr>'}</tbody></table>
	</body></html>`;
}
