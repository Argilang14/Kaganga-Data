import type { JadwalPelajaranPrintData } from '../../../../routes/cetak/jadwal-pelajaran/preview-data';

function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function cellClass(tipe: string) {
	if (tipe === 'istirahat') return 'cell break';
	if (tipe === 'kegiatan') return 'cell activity';
	if (tipe === 'kosong') return 'cell empty';
	return 'cell subject';
}

function renderRows(data: JadwalPelajaranPrintData) {
	const rows: string[] = [];
	const kelasList = data.kelasList;
	const cells = new Map(data.cells.map((cell) => [`${cell.kelasId}:${cell.jamId}`, cell]));
	for (const [hari, hariLabel] of Object.entries(data.hariLabels)) {
		const daySlots = data.jamList.filter((jam) => jam.hari === hari);
		if (!daySlots.length) continue;
		rows.push(
			`<tr class="day-row"><th colspan="${3 + kelasList.length}">${escapeHtml(hariLabel)}</th></tr>`
		);
		for (const jam of daySlots) {
			const pukul = `${jam.pukulMulai} - ${jam.pukulSelesai}`;
			const classCells = kelasList
				.map((kelas) => {
					const cell = cells.get(`${kelas.id}:${jam.id}`);
					const label = cell?.label || (jam.tipe === 'istirahat' ? jam.namaDefault : '');
					const guru = cell?.guru || '';
					return `<td class="${cellClass(cell?.tipe ?? jam.tipe)}">
						<div class="slot-label">${escapeHtml(label || '+')}</div>
						${guru ? `<div class="slot-guru">${escapeHtml(guru)}</div>` : ''}
					</td>`;
				})
				.join('');
			rows.push(`<tr>
				<td class="jam-ke">${escapeHtml(jam.jamKe)}</td>
				<td class="jam-label">${escapeHtml(jam.label ?? '')}</td>
				<td class="pukul">${escapeHtml(pukul)}</td>
				${classCells}
			</tr>`);
		}
	}
	return rows.join('\n');
}

function buildSubjectLegend(data: JadwalPelajaranPrintData) {
	const legendMap = new Map<string, { kode: string; nama: string; guru: string }>();
	for (const cell of data.cells) {
		if (!cell.mapelKode && !cell.mapelNama) continue;
		const kode = cell.mapelKode || cell.label;
		const key = `${kode}::${cell.mapelNama}::${cell.guru}`;
		if (!legendMap.has(key)) {
			legendMap.set(key, { kode, nama: cell.mapelNama, guru: cell.guru });
		}
	}
	return Array.from(legendMap.values()).sort((a, b) => a.kode.localeCompare(b.kode, 'id-ID'));
}

function renderSubjectLegend(data: JadwalPelajaranPrintData) {
	const legend = buildSubjectLegend(data);
	if (!legend.length) {
		return `<section class="legend-block"><h2>Keterangan Mapel dan Guru</h2><p class="empty-note">Belum ada mata pelajaran terjadwal.</p></section>`;
	}
	return `<section class="legend-block">
		<h2>Keterangan Mapel dan Guru</h2>
		<table class="legend-table">
			<thead>
				<tr>
					<th class="legend-code">Kode</th>
					<th>Mata Pelajaran</th>
					<th>Guru Pengampu</th>
				</tr>
			</thead>
			<tbody>
				${legend
					.map(
						(item) => `<tr>
							<td class="legend-code">${escapeHtml(item.kode)}</td>
							<td>${escapeHtml(item.nama || item.kode)}</td>
							<td>${escapeHtml(item.guru || '-')}</td>
						</tr>`
					)
					.join('')}
			</tbody>
		</table>
	</section>`;
}

function renderSignature(data: JadwalPelajaranPrintData) {
	const kepala = data.sekolah.kepalaSekolah;
	const jabatan = kepala.status === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';
	return `<section class="signature-block">
		<div class="signature-box">
			<div>${escapeHtml(data.sekolah.lokasiTandaTangan || '')}${data.sekolah.lokasiTandaTangan ? ', ' : ''}${escapeHtml(data.tanggalCetak)}</div>
			<div>${escapeHtml(jabatan)}</div>
			<div class="signature-space"></div>
			<div class="signature-name">${escapeHtml(kepala.nama || '................................')}</div>
			<div>NIP. ${escapeHtml(kepala.nip || '-')}</div>
		</div>
	</section>`;
}

export function renderJadwalPelajaranHTML(data: JadwalPelajaranPrintData): string {
	const orientation = data.orientation === 'portrait' ? 'portrait' : 'landscape';
	const kelasCount = Math.max(data.kelasList.length, 1);
	const subjectFontSize = kelasCount > 9 ? '6.5px' : kelasCount > 6 ? '7.2px' : '8px';
	return `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<title>Jadwal Pelajaran - ${escapeHtml(data.jenjangLabel)}</title>
	<style>
		@page { size: A4 ${orientation}; margin: 8mm; }
		* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; font-size: 8px; }
		.header { text-align: center; margin-bottom: 5mm; text-transform: uppercase; }
		.header h1 { margin: 0; font-size: 15px; letter-spacing: 0.04em; }
		.header .school { margin-top: 2px; font-size: 12px; font-weight: 700; }
		.header .meta { margin-top: 2px; font-size: 9px; }
		table { width: 100%; border-collapse: collapse; table-layout: fixed; }
		th, td { border: 0.6px solid #1f2937; padding: 2px; vertical-align: middle; }
		thead th { background: #155bb7; color: #fff; font-weight: 700; text-align: center; }
		.day-row th { background: #dbeafe; color: #0f172a; text-align: left; font-size: 8px; padding: 3px 5px; }
		.jam-ke { width: 20px; text-align: center; background: #eef6ff; }
		.jam-label { width: 38px; text-align: center; background: #eef6ff; }
		.pukul { width: 58px; text-align: center; background: #eef6ff; white-space: nowrap; }
		.kelas-head { width: calc((100% - 116px) / ${kelasCount}); }
		.cell { min-height: 20px; text-align: center; overflow: hidden; }
		.subject { background: #e0f2fe; }
		.activity { background: #dcfce7; }
		.break { background: #fed7aa; font-weight: 700; }
		.empty { background: #fff; color: #94a3b8; }
		.slot-label { font-size: ${subjectFontSize}; font-weight: 800; line-height: 1.15; word-break: break-word; }
		.slot-guru { margin-top: 1px; font-size: 5.8px; line-height: 1.1; color: #475569; word-break: break-word; }
		.after-table { margin-top: 4mm; page-break-inside: avoid; }
		.legend-block h2 { margin: 0 0 2mm; font-size: 9px; }
		.legend-table { table-layout: auto; font-size: 7px; }
		.legend-table th { background: #e5e7eb; color: #111827; }
		.legend-table th, .legend-table td { padding: 2px 3px; border-color: #94a3b8; text-align: left; }
		.legend-code { width: 18mm; text-align: center !important; font-weight: 700; }
		.empty-note { margin: 0; color: #64748b; }
		.signature-block { margin-top: 5mm; min-height: 34mm; font-size: 8px; }
		.signature-box { margin-left: auto; width: 58mm; text-align: left; line-height: 1.35; }
		.signature-space { height: 20mm; }
		.signature-name { font-weight: 700; text-decoration: underline; }
		.footer { margin-top: 3mm; display: flex; justify-content: space-between; color: #64748b; font-size: 7px; }
		@media print {
			.after-table { break-inside: avoid; }
		}
	</style>
</head>
<body>
	<section class="sheet">
		<div class="header">
			<h1>Jadwal Pelajaran</h1>
			<div class="school">${escapeHtml(data.sekolah.nama)}</div>
			<div class="meta">${escapeHtml(data.jenjangLabel)} ${data.periode.semester ? '- ' + escapeHtml(data.periode.semester) : ''} ${data.periode.tahunPelajaran ? '- ' + escapeHtml(data.periode.tahunPelajaran) : ''}</div>
		</div>
		<table>
			<thead>
				<tr>
					<th class="jam-ke">Ke</th>
					<th class="jam-label">Jam</th>
					<th class="pukul">Pukul</th>
					${data.kelasList.map((kelas) => `<th class="kelas-head">${escapeHtml(kelas.nama)}</th>`).join('')}
				</tr>
			</thead>
			<tbody>
				${renderRows(data)}
			</tbody>
		</table>
		<div class="after-table">
			${renderSubjectLegend(data)}
			${renderSignature(data)}
		</div>
		<div class="footer">
			<span>Dicetak dari Kaganga</span>
			<span>Orientasi: ${orientation === 'landscape' ? 'Landscape' : 'Portrait'}</span>
		</div>
	</section>
</body>
</html>`;
}
