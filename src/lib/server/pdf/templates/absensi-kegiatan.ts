import { sharedStyles } from './shared';
import {
	renderSchoolLetterhead,
	schoolLetterheadStyles,
	type SchoolLetterheadData
} from './school-letterhead';

const escapeHtml = (value: unknown) =>
	String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

type StatusCounts = Record<'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'pulang', number>;

export type AbsensiKegiatanPrintData = {
	sekolah: SchoolLetterheadData & { npsn: string };
	periode: string;
	kelas: string;
	kegiatan: string;
	summary: StatusCounts;
	studentRows: Array<{ no: number; nis: string; nama: string; counts: StatusCounts }>;
	detailRows: Array<{ tanggal: string; kegiatan: string; counts: StatusCounts }>;
	alerts: Array<{
		nama: string;
		indikator: string;
		periode: string;
		durasi: number;
		status: string;
		catatan: string;
	}>;
	permits: Array<{
		nama: string;
		tanggalKeluar: string;
		rencanaKembali: string;
		status: string;
		alasan: string;
	}>;
	tandaTangan: {
		kiri: { jabatan: string; nama: string; nip: string };
		kanan: { jabatan: string; nama: string; nip: string };
	};
};

const countCells = (counts: StatusCounts) =>
	['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang']
		.map((status) => `<td class="center">${counts[status as keyof StatusCounts]}</td>`)
		.join('');

const emptyRow = (colspan: number, message: string) =>
	`<tr><td colspan="${colspan}" class="center muted">${escapeHtml(message)}</td></tr>`;

export function renderAbsensiKegiatanHTML(data: AbsensiKegiatanPrintData) {
	const studentRows = data.studentRows
		.map(
			(row) => `<tr><td class="center">${row.no}</td><td>${escapeHtml(row.nis || '-')}</td><td>${escapeHtml(row.nama)}</td>${countCells(row.counts)}</tr>`
		)
		.join('');
	const detailRows = data.detailRows
		.map(
			(row) => `<tr><td>${escapeHtml(row.tanggal)}</td><td>${escapeHtml(row.kegiatan)}</td>${countCells(row.counts)}</tr>`
		)
		.join('');
	const alertRows = data.alerts
		.map(
			(row) => `<tr><td>${escapeHtml(row.nama)}</td><td>${escapeHtml(row.indikator)}</td><td>${escapeHtml(row.periode)}</td><td class="center">${row.durasi}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.catatan || '-')}</td></tr>`
		)
		.join('');
	const permitRows = data.permits
		.map(
			(row) => `<tr><td>${escapeHtml(row.nama)}</td><td>${escapeHtml(row.tanggalKeluar)}</td><td>${escapeHtml(row.rencanaKembali)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.alasan)}</td></tr>`
		)
		.join('');
	const signature = (item: { jabatan: string; nama: string; nip: string }) => `<div><p>${escapeHtml(item.jabatan)}</p><div class="signature-space"></div><p><strong><u>${escapeHtml(item.nama || '................................')}</u></strong></p><p>NIP. ${escapeHtml(item.nip || '-')}</p></div>`;

	return `<!doctype html><html><head><meta charset="utf-8"><style>
	${sharedStyles()}
	${schoolLetterheadStyles()}
	@page { size: A4 landscape; margin: 11mm; }
	body { font-size:8pt; color:#111; }
	.document-title { text-align:center; margin:0 0 4mm; }
	.document-title h1 { margin:0; font-size:15pt; }
	.meta { display:grid; grid-template-columns:1fr 1fr; gap:2mm 8mm; margin-bottom:3mm; }
	.summary { display:grid; grid-template-columns:repeat(6,1fr); gap:2mm; margin:3mm 0 4mm; }
	.summary div { border:1px solid #111; padding:2mm; text-align:center; }
	.summary strong { display:block; font-size:13pt; }
	h2 { font-size:10pt; margin:4mm 0 1.5mm; }
	table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7.5pt; }
	thead { display:table-header-group; }
	tr { break-inside:avoid; }
	th, td { border:1px solid #111; padding:1.4mm; vertical-align:top; overflow-wrap:anywhere; }
	th { background:#dbeafe; text-align:center; font-weight:700; }
	.center { text-align:center; }
	.muted { color:#555; font-style:italic; }
	.section { break-inside:auto; }
	.signatures { display:grid; grid-template-columns:1fr 1fr; gap:25mm; margin:7mm 8% 0; text-align:center; break-inside:avoid; }
	.signatures p { margin:0; }
	.signature-space { height:16mm; }
	.footer { margin-top:4mm; text-align:right; font-size:6.5pt; color:#555; }
	</style></head><body>
	${renderSchoolLetterhead(data.sekolah, true)}
	<section class="document-title"><h1>REKAP ABSENSI KEGIATAN</h1></section>
	<div class="meta"><div><strong>Periode:</strong> ${escapeHtml(data.periode)}</div><div><strong>Kelas:</strong> ${escapeHtml(data.kelas)}</div><div><strong>Kegiatan:</strong> ${escapeHtml(data.kegiatan)}</div><div><strong>Total catatan:</strong> ${Object.values(data.summary).reduce((sum, value) => sum + value, 0)}</div></div>
	<section class="summary">${(['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang'] as const).map((status) => `<div><span>${escapeHtml(status === 'alfa' ? 'Alfa' : status.charAt(0).toUpperCase() + status.slice(1))}</span><strong>${data.summary[status]}</strong></div>`).join('')}</section>
	<section class="section"><h2>REKAP PER MURID</h2><table><colgroup><col style="width:4%"><col style="width:10%"><col style="width:38%"><col span="6" style="width:8%"></colgroup><thead><tr><th>No.</th><th>NIS</th><th>Nama Murid</th><th>Hadir</th><th>Terlambat</th><th>Sakit</th><th>Izin</th><th>Alfa</th><th>Pulang</th></tr></thead><tbody>${studentRows || emptyRow(9, 'Tidak ada data murid pada kelas ini.')}</tbody></table></section>
	<section class="section"><h2>RINCIAN HARIAN DAN KEGIATAN</h2><table><colgroup><col style="width:13%"><col style="width:39%"><col span="6" style="width:8%"></colgroup><thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Hadir</th><th>Terlambat</th><th>Sakit</th><th>Izin</th><th>Alfa</th><th>Pulang</th></tr></thead><tbody>${detailRows || emptyRow(8, 'Belum ada catatan absensi pada periode ini.')}</tbody></table></section>
	<section class="section"><h2>INDIKATOR YANG MEMERLUKAN TINDAK LANJUT</h2><table><colgroup><col style="width:18%"><col style="width:19%"><col style="width:19%"><col style="width:7%"><col style="width:12%"><col style="width:25%"></colgroup><thead><tr><th>Nama Murid</th><th>Indikator</th><th>Periode</th><th>Hari</th><th>Status</th><th>Catatan Tindak Lanjut</th></tr></thead><tbody>${alertRows || emptyRow(6, 'Tidak ada indikator yang memerlukan tindak lanjut.')}</tbody></table></section>
	<section class="section"><h2>IZIN PULANG AKTIF ATAU TERLAMBAT</h2><table><colgroup><col style="width:20%"><col style="width:15%"><col style="width:15%"><col style="width:15%"><col style="width:35%"></colgroup><thead><tr><th>Nama Murid</th><th>Tanggal Keluar</th><th>Rencana Kembali</th><th>Status</th><th>Alasan</th></tr></thead><tbody>${permitRows || emptyRow(5, 'Tidak ada izin pulang aktif atau terlambat.')}</tbody></table></section>
	<section class="signatures">${signature(data.tandaTangan.kiri)}${signature(data.tandaTangan.kanan)}</section>
	<div class="footer">Dicetak dari Kaganga</div>
	</body></html>`;
}
