import type { JadwalPelajaranPrintData } from '../../../../routes/cetak/jadwal-pelajaran/preview-data';

function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function safeColor(value?: string | null) {
	return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function buildSubjectLegend(data: JadwalPelajaranPrintData) {
	const legend = new Map<string, { kode: string; nama: string; guru: string }>();
	for (const cell of data.cells) {
		if (!cell.mapelKode && !cell.mapelNama) continue;
		const kode = cell.mapelKode || cell.label;
		const key = kode + '::' + cell.mapelNama + '::' + cell.guru;
		if (!legend.has(key)) legend.set(key, { kode, nama: cell.mapelNama, guru: cell.guru });
	}
	return Array.from(legend.values()).sort((a, b) => a.kode.localeCompare(b.kode, 'id-ID'));
}

function renderLegend(data: JadwalPelajaranPrintData) {
	const legend = buildSubjectLegend(data);
	if (!legend.length) {
		return '<section class="legend"><h2>Keterangan Mapel dan Guru</h2><p>Belum ada mata pelajaran terjadwal.</p></section>';
	}
	return (
		'<section class="legend"><h2>Keterangan Mapel dan Guru</h2><table><thead><tr>' +
		'<th class="legend-code">Kode</th><th>Mata Pelajaran</th><th>Guru Pengampu</th>' +
		'</tr></thead><tbody>' +
		legend
			.map(
				(item) =>
					'<tr><td class="legend-code">' +
					escapeHtml(item.kode) +
					'</td><td>' +
					escapeHtml(item.nama || item.kode) +
					'</td><td>' +
					escapeHtml(item.guru || '-') +
					'</td></tr>'
			)
			.join('') +
		'</tbody></table></section>'
	);
}

function renderSignature(data: JadwalPelajaranPrintData) {
	const kepala = data.sekolah.kepalaSekolah;
	const waka = data.sekolah.wakaKurikulum;
	const jabatan = kepala.status === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';
	return (
		'<section class="signatures"><div class="signature-date">' +
		escapeHtml(data.sekolah.lokasiTandaTangan || '') +
		(data.sekolah.lokasiTandaTangan ? ', ' : '') +
		escapeHtml(data.tanggalCetak) +
		'</div><div class="signature-grid"><div class="signature-block"><div>' +
		escapeHtml(jabatan) +
		'</div><div class="signature-space"></div><div class="signature-name">' +
		escapeHtml(kepala.nama || '................................') +
		'</div><div>NIP. ' +
		escapeHtml(kepala.nip || '-') +
		'</div></div><div class="signature-block"><div>Waka Kurikulum</div>' +
		'<div class="signature-space"></div><div class="signature-name">' +
		escapeHtml(waka?.nama || '................................') +
		'</div><div>NIP. ' +
		escapeHtml(waka?.nip || '-') +
		'</div></div></div></section>'
	);
}

function renderSchedule(data: JadwalPelajaranPrintData) {
	const jenjangOrder = ['srd', 'srmp', 'srma'] as const;
	const visibleJenjang =
		data.selectedJenjang === 'semua'
			? jenjangOrder.filter((jenjang) => data.kelasList.some((kelas) => kelas.jenjang === jenjang))
			: [data.selectedJenjang];
	const kelasByJenjang = new Map(
		visibleJenjang.map((jenjang) => [
			jenjang,
			data.kelasList.filter((kelas) => kelas.jenjang === jenjang)
		])
	);
	const jamBySlot = new Map(
		data.jamList.map((jam) => [jam.jenjang + '|' + jam.hari + '|' + jam.jamKe, jam])
	);
	const cellBySlot = new Map(
		data.cells.map((cell) => [cell.kelasId + '|' + cell.hari + '|' + cell.jamKe, cell])
	);
	const jamColumnCount = visibleJenjang.length;
	const totalColumns = 1 + jamColumnCount + data.kelasList.length;

	const header =
		'<thead><tr><th class="day-head">Hari</th>' +
		visibleJenjang
			.map((jenjang) => {
				const kelas = kelasByJenjang.get(jenjang) ?? [];
				return (
					'<th class="time-head">Jam ' +
					escapeHtml(jenjang === 'srma' ? 'SRMA' : jenjang.toUpperCase()) +
					'</th>' +
					kelas
						.map(
							(item) =>
								'<th class="class-head"><span>' +
								escapeHtml(item.nama) +
								'</span><small>' +
								escapeHtml(jenjang === 'srma' ? 'SRMA/SRT' : jenjang.toUpperCase()) +
								'</small></th>'
						)
						.join('')
				);
			})
			.join('') +
		'</tr></thead>';

	const bodyRows: string[] = [];
	for (const [hari, hariLabel] of Object.entries(data.hariLabels)) {
		const maxJamKe = Math.max(
			0,
			...data.jamList
				.filter((jam) => jam.hari === hari && visibleJenjang.includes(jam.jenjang))
				.map((jam) => jam.jamKe)
		);
		if (!maxJamKe) continue;

		for (let jamKe = 1; jamKe <= maxJamKe; jamKe += 1) {
			let row = '<tr>';
			if (jamKe === 1) {
				row +=
					'<th class="day-cell" rowspan="' +
					maxJamKe +
					'">' +
					escapeHtml(hariLabel) +
					'</th>';
			}
			for (const jenjang of visibleJenjang) {
				const jam = jamBySlot.get(jenjang + '|' + hari + '|' + jamKe);
				const pukul = jam ? jam.pukulMulai + ' - ' + jam.pukulSelesai : '';
				row +=
					'<td class="time-cell ' +
					(jam ? '' : 'inactive') +
					'"><strong>' +
					(jam ? escapeHtml(jam.jamKe) : '') +
					'</strong><span>' +
					escapeHtml(pukul) +
					'</span></td>';
				for (const kelas of kelasByJenjang.get(jenjang) ?? []) {
					if (!jam) {
						row += '<td class="schedule-cell inactive"><span>Tidak aktif</span></td>';
						continue;
					}
					const cell = cellBySlot.get(kelas.id + '|' + hari + '|' + jamKe);
					const label = cell?.label || jam.namaDefault || '-';
					const color = safeColor(cell?.warna);
					const typeClass =
						cell?.tipe === 'istirahat'
							? 'break'
							: cell?.tipe === 'kegiatan'
								? 'activity'
								: cell?.tipe === 'kosong'
									? 'empty'
									: 'subject';
					row +=
						'<td class="schedule-cell ' +
						typeClass +
						'"' +
						(color ? ' style="background:' + color + '22;border-color:' + color + ';"' : '') +
						'><strong>' +
						escapeHtml(label) +
						'</strong>' +
						(cell?.guru ? '<small>' + escapeHtml(cell.guru) + '</small>' : '') +
						'</td>';
				}
			}
			bodyRows.push(row + '</tr>');
		}
	}

	if (!bodyRows.length) {
		bodyRows.push(
			'<tr><td class="empty-table" colspan="' +
				totalColumns +
				'">Belum ada jam pelajaran untuk konteks yang dipilih.</td></tr>'
		);
	}
	return '<table class="schedule">' + header + '<tbody>' + bodyRows.join('') + '</tbody></table>';
}

export function renderJadwalPelajaranHTML(data: JadwalPelajaranPrintData): string {
	const orientation = data.orientation === 'portrait' ? 'portrait' : 'landscape';
	const columnCount = Math.max(data.kelasList.length, 1);
	const subjectFont = columnCount > 10 ? '5.6px' : columnCount > 7 ? '6.2px' : '7px';
	return (
		'<!doctype html><html lang="id"><head><meta charset="utf-8" />' +
		'<title>Jadwal Pelajaran - ' +
		escapeHtml(data.jenjangLabel) +
		'</title><style>' +
		'@page{size:A4 ' +
		orientation +
		';margin:7mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
		'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;font-size:8px}' +
		'.document-header{display:grid;grid-template-columns:24mm minmax(0,1fr) 24mm;align-items:center;gap:3mm;margin-bottom:4mm}.header-logo{display:flex;width:24mm;height:22mm;align-items:center;justify-content:center}.header-logo img{display:block;max-width:20mm;max-height:20mm;object-fit:contain}.header{text-align:center;text-transform:uppercase}.header h1{margin:0;font-size:15px}.header .school{margin-top:2px;font-size:12px;font-weight:700}.header .meta{margin-top:2px;font-size:9px;color:#475569}' +
		'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.55px solid #cbd5e1;padding:2px;vertical-align:middle}' +
		'.schedule thead th{height:10mm;background:#155bb7;color:#fff;text-align:center}.day-head{width:12mm}.time-head{width:18mm}.class-head span,.class-head small{display:block}.class-head small{margin-top:1px;font-size:5.5px;color:#dbeafe}' +
		'.day-cell{background:#dbeafe;color:#0f172a;text-align:center;text-transform:uppercase}.time-cell{background:#eff6ff;text-align:center}.time-cell strong,.time-cell span{display:block}.time-cell span{margin-top:1px;font-size:5.5px;white-space:nowrap}' +
		'.schedule-cell{height:10mm;text-align:center;overflow:hidden}.schedule-cell strong{display:block;font-size:' +
		subjectFont +
		';line-height:1.15;overflow-wrap:anywhere}.schedule-cell small{display:block;margin-top:1px;font-size:5px;line-height:1.05;color:#475569;overflow-wrap:anywhere}' +
		'.subject{background:#e0f2fe}.activity{background:#dcfce7}.break{background:#fef3c7}.empty{background:#fff;color:#94a3b8}.inactive{background:#f3f4f6!important;color:#9ca3af;border-color:#e5e7eb!important}.empty-table{padding:8mm;text-align:center;color:#64748b}' +
		'.after-table{margin-top:4mm;break-inside:avoid}.legend h2{margin:0 0 2mm;font-size:9px}.legend table{table-layout:auto;font-size:7px}.legend th{background:#e5e7eb;color:#111827;text-align:left}.legend th,.legend td{padding:2px 3px;border-color:#94a3b8}.legend-code{width:18mm;text-align:center!important;font-weight:700}' +
		'.signatures{margin-top:5mm;min-height:32mm;line-height:1.35;font-size:8px;break-inside:avoid}.signature-date{margin-left:auto;width:58mm;text-align:left}.signature-grid{display:grid;grid-template-columns:58mm 58mm;justify-content:space-between;margin-top:1mm}.signature-block{text-align:left}.signature-space{height:18mm}.signature-name{font-weight:700;text-decoration:underline}.footer{margin-top:3mm;display:flex;justify-content:space-between;color:#64748b;font-size:7px}' +
		'</style></head><body><section class="sheet"><div class="document-header"><div class="header-logo">' +
		(data.sekolah.logoDinasUrl
			? '<img src="' + escapeHtml(data.sekolah.logoDinasUrl) + '" alt="Logo pemda atau kementerian" />'
			: '') +
		'</div><div class="header"><h1>Jadwal Pelajaran</h1><div class="school">' +
		escapeHtml(data.sekolah.nama) +
		'</div><div class="meta">' +
		escapeHtml(data.jenjangLabel) +
		' - ' +
		escapeHtml(data.jenisLabel) +
		' - Tahun Ajaran ' +
		escapeHtml(data.periode.tahunPelajaran) +
		'</div></div><div class="header-logo">' +
		(data.sekolah.logoUrl
			? '<img src="' + escapeHtml(data.sekolah.logoUrl) + '" alt="Logo sekolah" />'
			: '') +
		'</div></div>' +
		renderSchedule(data) +
		'<div class="after-table">' +
		renderLegend(data) +
		renderSignature(data) +
		'</div><div class="footer"><span>Dicetak dari Kaganga</span><span>Orientasi: ' +
		(orientation === 'landscape' ? 'Landscape' : 'Portrait') +
		'</span></div></section></body></html>'
	);
}