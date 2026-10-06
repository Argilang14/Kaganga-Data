import { sharedStyles } from './shared';

function escapeHtml(value: unknown) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export type PresensiPegawaiPrintData = {
	sekolah: { nama: string; npsn: string; alamat: string; logoUrl: string | null; logoDinasUrl: string | null };
	judul: string;
	periode: string;
	headers: string[];
	rows: Array<Array<string | number>>;
	tandaTangan: {
		kiri: { jabatan: string; nama: string; nip: string };
		kanan: { jabatan: string; nama: string; nip: string };
	};
};

export function renderPresensiPegawaiHTML(data: PresensiPegawaiPrintData) {
	const logo = (source: string | null, alt: string) => source ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}">` : '<span></span>';
	const headers = data.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
	const rows = data.rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${index === 0 ? 'center' : ''}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
	const signature = (item: { jabatan: string; nama: string; nip: string }) => `<div><p>${escapeHtml(item.jabatan)}</p><div class="signature-space"></div><p><strong><u>${escapeHtml(item.nama || '................................')}</u></strong></p><p>NIP. ${escapeHtml(item.nip || '-')}</p></div>`;
	return `<!doctype html><html><head><meta charset="utf-8"><style>
	${sharedStyles()}
	@page { size: A4 landscape; margin: 12mm; }
	body { font-size: 8.5pt; color:#111; }
	.header { display:grid; grid-template-columns:74px 1fr 74px; align-items:center; gap:12px; border-bottom:3px solid #111; padding-bottom:8px; text-align:center; }
	.header img { width:66px; height:66px; object-fit:contain; margin:auto; }
	.header h1 { font-size:15pt; margin:0 0 3px; }
	.header p { margin:1px 0; }
	.document-title { text-align:center; margin:12px 0 9px; }
	.document-title h2 { font-size:13pt; margin:0 0 2px; }
	table { width:100%; border-collapse:collapse; table-layout:auto; }
	thead { display:table-header-group; }
	tr { break-inside:avoid; }
	th, td { border:1.2px solid #111; padding:4px; vertical-align:top; }
	th { background:#dbeafe; text-align:center; font-weight:700; }
	.center { text-align:center; }
	.signatures { display:grid; grid-template-columns:1fr 1fr; gap:80px; margin:24px 8% 0; text-align:center; break-inside:avoid; }
	.signatures p { margin:2px 0; }
	.signature-space { height:58px; }
	.footer { margin-top:14px; text-align:right; font-size:7pt; color:#555; }
	</style></head><body>
	<header class="header">${logo(data.sekolah.logoDinasUrl, 'Logo pemda atau kementerian')}<div><h1>${escapeHtml(data.sekolah.nama)}</h1><p>NPSN ${escapeHtml(data.sekolah.npsn)}</p><p>${escapeHtml(data.sekolah.alamat)}</p></div>${logo(data.sekolah.logoUrl, 'Logo sekolah')}</header>
	<section class="document-title"><h2>${escapeHtml(data.judul)}</h2><div>${escapeHtml(data.periode)}</div></section>
	<table><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${data.headers.length}" class="center">Tidak ada data.</td></tr>`}</tbody></table>
	<section class="signatures">${signature(data.tandaTangan.kiri)}${signature(data.tandaTangan.kanan)}</section>
	<div class="footer">Dicetak dari Kaganga</div>
	</body></html>`;
}
