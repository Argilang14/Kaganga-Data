import type { JadwalPelajaranPrintData } from '../../../../routes/cetak/jadwal-pelajaran/preview-data';
import { buildJadwalSegments, type JadwalSegment } from '../../../jadwal-segments';
import { onePageFitScript, onePageFitStyles } from './one-page-fit';

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

function tintColor(value?: string | null, strength = 0.42) {
	const color = safeColor(value);
	if (!color) return null;
	const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
	return `rgb(${channels.map((channel) => Math.round(255 - (255 - channel) * strength)).join(',')})`;
}

function buildSubjectLegend(data: JadwalPelajaranPrintData) {
	const legend = new Map<
		string,
		{ kode: string; nama: string; guru: Set<string>; warna: string | null }
	>();
	for (const cell of data.cells) {
		if (!cell.mapelKode && !cell.mapelNama) continue;
		const kode = cell.mapelKode || cell.label;
		const key = kode + '::' + cell.mapelNama;
		const item = legend.get(key) ?? {
			kode,
			nama: cell.mapelNama,
			guru: new Set<string>(),
			warna: safeColor(cell.warna)
		};
		if (cell.guru) item.guru.add(cell.guru);
		legend.set(key, item);
	}
	return Array.from(legend.values())
		.map((item) => ({
			kode: item.kode,
			nama: item.nama,
			warna: item.warna,
			guru: Array.from(item.guru)
				.sort((a, b) => a.localeCompare(b, 'id-ID'))
				.join(', ')
		}))
		.sort((a, b) => a.kode.localeCompare(b.kode, 'id-ID'));
}

function renderLegend(data: JadwalPelajaranPrintData) {
	const legend = buildSubjectLegend(data);
	if (!legend.length) {
		return '<aside class="legend"><h2>Keterangan Mapel dan Guru</h2><p>Belum ada mata pelajaran terjadwal.</p></aside>';
	}
	return (
		'<aside class="legend"><h2>Keterangan Mapel dan Guru</h2><div class="legend-list">' +
		legend
			.map((item) => {
				const codeBackground = tintColor(item.warna, 0.62);
				return (
					'<div class="legend-item"><strong class="legend-code"' +
					(codeBackground
						? ' style="background:' + codeBackground + ';border-color:' + item.warna + '"'
						: '') +
					'>' +
					escapeHtml(item.kode) +
					'</strong><div class="legend-detail"><b>' +
					escapeHtml(item.nama || item.kode) +
					'</b><span>' +
					escapeHtml(item.guru || '-') +
					'</span></div></div>'
				);
			})
			.join('') +
		'</div></aside>'
	);
}

function renderSignature(data: JadwalPelajaranPrintData) {
	const kepala = data.sekolah.kepalaSekolah;
	const waka = data.sekolah.wakaKurikulum;
	const jabatan = kepala.status === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';
	return (
		'<section class="signatures"><table class="signature-table"><colgroup><col><col></colgroup><tbody>' +
		'<tr><td class="signature-heading">Mengetahui</td><td>' +
		escapeHtml(data.sekolah.lokasiTandaTangan || '') +
		(data.sekolah.lokasiTandaTangan ? ', ' : '') +
		escapeHtml(data.tanggalCetak) +
		'</td></tr><tr><td>' +
		escapeHtml(jabatan) +
		'</td><td>Waka Kurikulum</td></tr><tr><td class="signature-space"></td>' +
		'<td class="signature-space"></td></tr><tr><td class="signature-name">' +
		escapeHtml(kepala.nama || '................................') +
		'</td><td class="signature-name">' +
		escapeHtml(waka?.nama || '................................') +
		'</td></tr><tr><td>NIP. ' +
		escapeHtml(kepala.nip || '-') +
		'</td><td>NIP. ' +
		escapeHtml(waka?.nip || '-') +
		'</td></tr></tbody></table></section>'
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
	const cellKey = (kelasId: number, hari: string, jamKe: number) =>
		kelasId + '|' + hari + '|' + jamKe;
	const cellBySlot = new Map(
		data.cells.map((cell) => [cellKey(cell.kelasId, cell.hari, cell.jamKe), cell])
	);
	const mergeCells = visibleJenjang.flatMap((jenjang) => {
		const kelas = kelasByJenjang.get(jenjang) ?? [];
		const columnByClass = new Map(kelas.map((item, index) => [item.id, index]));
		return data.cells.flatMap((cell) => {
			const column = columnByClass.get(cell.kelasId);
			const label = cell.mapelKode || cell.label;
			if (column === undefined || !label || label === '-' || cell.tipe === 'kosong') return [];
			const isSubject = cell.tipe === 'pelajaran' && Boolean(cell.mapelKode);
			return [
				{
					key: cellKey(cell.kelasId, cell.hari, cell.jamKe),
					hari: cell.hari,
					row: cell.jamKe,
					column,
					group: jenjang,
					kode: label,
					kind: isSubject ? ('mapel' as const) : ('kegiatan' as const),
					mergeIdentity: isSubject ? cell.guru || 'tanpa-guru' : label
				}
			];
		});
	});
	const segments = buildJadwalSegments(mergeCells);
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

	const spanAttributes = (segment?: JadwalSegment) =>
		(segment && segment.rowSpan > 1 ? ' rowspan="' + segment.rowSpan + '"' : '') +
		(segment && segment.colSpan > 1 ? ' colspan="' + segment.colSpan + '"' : '');

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
				row += '<th class="day-cell" rowspan="' + maxJamKe + '">' + escapeHtml(hariLabel) + '</th>';
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
					const key = cellKey(kelas.id, hari, jamKe);
					const segment = segments.get(key);
					if (segment && segment.anchorKey !== key) continue;
					const cell = cellBySlot.get(key);
					const label = cell?.mapelKode || cell?.label || jam.namaDefault || '-';
					const color = safeColor(cell?.warna);
					const background = tintColor(cell?.warna);
					const typeClass =
						cell?.tipe === 'istirahat'
							? 'break'
							: cell?.tipe === 'kegiatan'
								? 'activity'
								: cell?.tipe === 'kosong'
									? 'empty'
									: 'subject';
					const mergedLabel =
						segment && segment.cellKeys.length > 1
							? '<small class="merge-badge">' +
								(segment.kind === 'mapel' ? segment.rowSpan + ' JP' : segment.colSpan + ' kelas') +
								'</small>'
							: '';
					row +=
						'<td class="schedule-cell ' +
						typeClass +
						'"' +
						spanAttributes(segment) +
						(background
							? ' style="background:' + background + ';border-color:' + (color ?? '#333') + ';"'
							: '') +
						'><strong>' +
						escapeHtml(label) +
						'</strong>' +
						mergedLabel +
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
	const rowCount = Object.keys(data.hariLabels).reduce((total, hari) => {
		const slots = data.jamList
			.filter((jam) => jam.hari === hari)
			.reduce((maximum, jam) => Math.max(maximum, jam.jamKe), 0);
		return total + slots;
	}, 0);
	const rowHeight = rowCount > 40 ? '3.2mm' : rowCount > 30 ? '4mm' : rowCount > 20 ? '5mm' : '7mm';
	const subjectFont = columnCount > 10 ? '6.4px' : columnCount > 7 ? '7px' : '8px';
	const legendWidth = orientation === 'landscape' ? '52mm' : '40mm';
	return (
		'<!doctype html><html lang="id"><head><meta charset="utf-8" />' +
		'<title>Jadwal Pelajaran - ' +
		escapeHtml(data.jenjangLabel) +
		'</title><style>' +
		'@page{size:A4 ' +
		orientation +
		';margin:7mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
		onePageFitStyles(orientation) +
		'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;font-size:8px}' +
		'.document-header{display:grid;grid-template-columns:24mm minmax(0,1fr) 24mm;align-items:center;gap:3mm;margin-bottom:4mm}.header-logo{display:flex;width:24mm;height:22mm;align-items:center;justify-content:center}.header-logo img{display:block;max-width:20mm;max-height:20mm;object-fit:contain}.header{text-align:center;text-transform:uppercase}.header h1{margin:0;font-size:19px;line-height:1.15}.header .school{margin-top:2px;font-size:13px;font-weight:700}.header .meta{margin-top:2px;font-size:9.5px;color:#334155}' +
		'.print-main{display:grid;grid-template-columns:minmax(0,1fr) ' +
		legendWidth +
		';align-items:start;gap:3mm}.schedule-wrap{min-width:0}' +
		'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #292929;padding:2px;vertical-align:middle}' +
		'.schedule thead th{height:10mm;background:#155bb7;color:#fff;text-align:center}.day-head{width:12mm}.time-head{width:18mm}.class-head span,.class-head small{display:block}.class-head small{margin-top:1px;font-size:5.8px;color:#dbeafe}' +
		'.day-cell{background:#bfdbfe;color:#0f172a;text-align:center;text-transform:uppercase}.time-cell{background:#dbeafe;text-align:center}.time-cell strong,.time-cell span{display:block}.time-cell span{margin-top:1px;font-size:5.8px;white-space:nowrap}' +
		'.schedule-cell{height:' +
		rowHeight +
		';text-align:center;overflow:hidden}.schedule-cell strong{display:block;font-size:' +
		subjectFont +
		';line-height:1.18;overflow-wrap:anywhere}.merge-badge{display:block;margin-top:1px;font-size:5.4px;line-height:1;color:#334155}' +
		'.subject{background:#bae6fd}.activity{background:#bbf7d0}.break{background:#fde68a}.empty{background:#fff;color:#64748b}.inactive{background:#d1d5db!important;color:#475569!important;border:1px solid #64748b!important}.time-cell.inactive{background:#cbd5e1!important}.empty-table{padding:8mm;text-align:center;color:#64748b}' +
		'.legend{border:1px solid #292929;background:#fff}.legend h2{margin:0;padding:2mm;background:#155bb7;color:#fff;font-size:8px;text-align:center;text-transform:uppercase}.legend p{margin:2mm;font-size:6.5px}.legend-list{display:grid;grid-template-columns:1fr}.legend-item{display:grid;grid-template-columns:12mm minmax(0,1fr);align-items:stretch;min-width:0;border-bottom:1px solid #292929}.legend-item:last-child{border-bottom:0}.legend-code{display:flex;align-items:center;justify-content:center;min-width:0;padding:1.2mm .8mm;border-right:1px solid #292929;font-size:7px;line-height:1.15;text-align:center}.legend-detail{min-width:0;padding:1.2mm 1.4mm}.legend-item b,.legend-item span{display:block;overflow-wrap:anywhere}.legend-item b{font-size:6.4px;line-height:1.15}.legend-item span{margin-top:.5px;color:#334155;font-size:5.8px;line-height:1.15}' +
		'.after-table{margin-top:3mm;break-inside:avoid}.signatures{min-height:34mm;line-height:1.4;font-size:10.5px;break-inside:avoid}.signature-table{width:100%;border-collapse:collapse;table-layout:fixed}.signature-table col{width:50%}.signature-table td{border:0;padding:1px 8mm;text-align:center;vertical-align:top}.signature-heading{font-weight:700}.signature-table .signature-space{height:18mm}.signature-name{font-size:11.5px;font-weight:700;text-decoration:underline}.footer{margin-top:2mm;display:flex;justify-content:space-between;color:#64748b;font-size:7px}' +
		'</style>' +
		onePageFitScript() +
		'</head><body><main class="print-page"><section class="sheet fit-content"><div class="document-header"><div class="header-logo">' +
		(data.sekolah.logoDinasUrl
			? '<img src="' +
				escapeHtml(data.sekolah.logoDinasUrl) +
				'" alt="Logo pemda atau kementerian" />'
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
		'</div></div><div class="print-main"><div class="schedule-wrap">' +
		renderSchedule(data) +
		'</div>' +
		renderLegend(data) +
		'</div><div class="after-table">' +
		renderSignature(data) +
		'</div><div class="footer"><span>Dicetak dari Kaganga</span><span>Orientasi: ' +
		(orientation === 'landscape' ? 'Landscape' : 'Portrait') +
		'</span></div></section></main></body></html>'
	);
}
