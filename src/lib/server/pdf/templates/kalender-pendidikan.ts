import type { KalenderPendidikanPrintData } from '../../../../routes/cetak/kalender-pendidikan/preview-data';

function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function safeColor(value?: string | null) {
	return value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#2563eb';
}

function isLibur(item: { jenis?: string }) {
	return item.jenis === 'libur_nasional' || item.jenis === 'libur_sekolah';
}

function agendaColor(item: { jenis?: string; warna?: string | null }) {
	return isLibur(item) ? '#dc2626' : safeColor(item.warna);
}

function agendaTanggalDalamBulan(
	item: { tanggalMulai: string; tanggalSelesai: string },
	year: number,
	month: number
) {
	const monthStart = new Date(year, month, 1).getTime();
	const monthEnd = new Date(year, month + 1, 0).getTime();
	const start = new Date(Math.max(new Date(item.tanggalMulai + 'T00:00:00').getTime(), monthStart));
	const end = new Date(Math.min(new Date(item.tanggalSelesai + 'T00:00:00').getTime(), monthEnd));
	return start.getDate() === end.getDate()
		? String(start.getDate())
		: start.getDate() + '-' + end.getDate();
}

function agendasForDay(data: KalenderPendidikanPrintData, year: number, month: number, day: number) {
	const value = new Date(year, month, day).toISOString().slice(0, 10);
	return data.kalenderList
		.filter((item) => item.tanggalMulai <= value && item.tanggalSelesai >= value)
		.sort((a, b) => {
			if (isLibur(a) && !isLibur(b)) return -1;
			if (!isLibur(a) && isLibur(b)) return 1;
			return a.tanggalMulai.localeCompare(b.tanggalMulai) || a.judul.localeCompare(b.judul);
		});
}

function renderMonth(
	data: KalenderPendidikanPrintData,
	month: KalenderPendidikanPrintData['months'][number]
) {
	const dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
	const header = dayLabels
		.map(
			(label, index) =>
				'<th class="' + (index === 6 ? 'sunday-head' : '') + '">' + escapeHtml(label) + '</th>'
		)
		.join('');
	const weeks = month.weeks
		.map(
			(week) =>
				'<tr>' +
				week
					.map((day, dayIndex) => {
						if (!day) return '<td class="day empty"></td>';
						const agendas = agendasForDay(data, month.year, month.month, day);
						const holiday = agendas.some(isLibur);
						const primary = agendas[0];
						const className = holiday
							? 'day holiday'
							: dayIndex === 6
								? 'day sunday'
								: dayIndex === 5
									? 'day saturday'
									: agendas.length
										? 'day agenda'
										: 'day';
						const style =
							!holiday && dayIndex !== 5 && dayIndex !== 6 && primary
								? ' style="background:' + agendaColor(primary) + '22;color:#1e293b"'
								: '';
						const dots = agendas.length
							? '<div class="dots">' +
								agendas
									.slice(0, 4)
									.map(
										(item) =>
											'<i style="background:' +
											escapeHtml(agendaColor(item)) +
											'"></i>'
									)
									.join('') +
								(agendas.length > 4 ? '<small>+' + (agendas.length - 4) + '</small>' : '') +
								'</div>'
							: '';
						return (
							'<td class="' +
							className +
							'"' +
							style +
							'><strong>' +
							day +
							'</strong>' +
							dots +
							'</td>'
						);
					})
					.join('') +
				'</tr>'
		)
		.join('');
	const agendaList = month.agendas.length
		? month.agendas
				.map(
					(item) =>
						'<div class="agenda-item"><span class="agenda-date">' +
						escapeHtml(agendaTanggalDalamBulan(item, month.year, month.month)) +
						'</span><i style="background:' +
						escapeHtml(agendaColor(item)) +
						'"></i><span>' +
						escapeHtml(item.judul) +
						'</span></div>'
				)
				.join('')
		: '<div class="empty-agenda">Belum ada agenda.</div>';

	return (
		'<section class="month-card"><h2>' +
		escapeHtml(month.label) +
		'</h2><table class="calendar"><thead><tr>' +
		header +
		'</tr></thead><tbody>' +
		weeks +
		'</tbody></table><div class="agenda-list">' +
		agendaList +
		'</div></section>'
	);
}

export function renderKalenderPendidikanHTML(data: KalenderPendidikanPrintData): string {
	const portrait = data.orientation === 'portrait';
	const kepala = data.sekolah.kepalaSekolah;
	return (
		'<!doctype html><html lang="id"><head><meta charset="utf-8" /><title>Kalender Pendidikan</title><style>' +
		'@page{size:A4 ' +
		(portrait ? 'portrait' : 'landscape') +
		';margin:7mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
		'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#020617;background:#fff;font-size:' +
		(portrait ? '7.5px' : '8px') +
		'}.document-header{display:grid;grid-template-columns:24mm minmax(0,1fr) 24mm;align-items:center;gap:3mm;margin-bottom:4mm}.header-logo{display:flex;width:24mm;height:22mm;align-items:center;justify-content:center}.header-logo img{display:block;max-width:20mm;max-height:20mm;object-fit:contain}.header{text-align:center}.header h1{margin:0 0 2px;font-size:18px}.header .school{font-size:10.5px;font-weight:700;text-transform:uppercase}.header .period{margin-top:2px;color:#475569;font-size:10px}' +
		'.month-grid{display:grid;grid-template-columns:repeat(' +
		(portrait ? '2' : '3') +
		',1fr);gap:3mm}.month-card{min-height:' +
		(portrait ? '72mm' : '74mm') +
		';border:.7px solid #e2e8f0;border-radius:5px;padding:3mm;break-inside:avoid}.month-card h2{margin:0 0 2.5mm;text-align:center;font-size:10px;text-transform:uppercase}' +
		'.calendar{width:100%;border-collapse:collapse;table-layout:fixed}.calendar th,.calendar td{border:.5px solid #e5e7eb;text-align:center;vertical-align:middle}.calendar th{height:5.6mm;background:#f3f4f6;font-size:7px}.calendar th.sunday-head{background:#fee2e2;color:#b91c1c}.calendar td{height:' +
		(portrait ? '6.5mm' : '6.8mm') +
		';font-size:7px}.day{background:#fff}.day.sunday,.day.holiday{background:#fee2e2;color:#991b1b}.day.saturday{background:#fff;color:#111827}.day.empty{background:#fff}.day strong{display:block}.dots{display:flex;align-items:center;justify-content:center;gap:1px;margin-top:1px}.dots i{display:block;width:4px;height:4px;border-radius:50%}.dots small{font-size:5px;line-height:1}' +
		'.agenda-list{margin-top:2.5mm;min-height:14mm}.agenda-item{display:grid;grid-template-columns:24px 7px 1fr;align-items:center;gap:3px;margin-bottom:1.1mm;line-height:1.15}.agenda-item i{width:6px;height:6px;border-radius:50%}.agenda-date{font-weight:700}.empty-agenda{padding-top:3mm;color:#94a3b8;text-align:center}' +
		'.summary{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:4mm}.summary div{border:.7px solid #e2e8f0;border-radius:5px;padding:3mm;font-size:9px}.summary strong{font-weight:700}.signature{margin:8mm 2mm 0 auto;width:58mm;text-align:center;break-inside:avoid;font-size:9px}.signature-space{height:18mm}.signature-name{font-weight:700;text-decoration:underline}' +
		'</style></head><body><section><div class="document-header"><div class="header-logo">' +
		(data.sekolah.logoDinasUrl
			? '<img src="' + escapeHtml(data.sekolah.logoDinasUrl) + '" alt="Logo pemda atau kementerian" />'
			: '') +
		'</div><div class="header"><h1>Kalender Pendidikan</h1><div class="school">' +
		escapeHtml(data.sekolah.nama) +
		'</div><div class="period">' +
		escapeHtml(data.periode.label || data.periode.tahunPelajaran || '') +
		' - ' +
		escapeHtml(data.jenjangLabel) +
		'</div></div><div class="header-logo">' +
		(data.sekolah.logoUrl
			? '<img src="' + escapeHtml(data.sekolah.logoUrl) + '" alt="Logo sekolah" />'
			: '') +
		'</div></div><div class="month-grid">' +
		data.months.map((month) => renderMonth(data, month)).join('') +
		'</div><div class="summary"><div><strong>Hari Pembelajaran Efektif</strong> = ' +
		data.summary.totalHariEfektif +
		' Hari</div><div><strong>Minggu Efektif</strong> = ' +
		data.summary.totalMingguEfektif +
		' Minggu</div></div><div class="signature"><div>' +
		escapeHtml(data.ttd.tempat) +
		(data.ttd.tempat && data.ttd.tanggal ? ', ' : '') +
		escapeHtml(data.ttd.tanggal) +
		'</div><div>Kepala Sekolah</div><div class="signature-space"></div><div class="signature-name">' +
		escapeHtml(kepala?.nama || '') +
		'</div><div>NIP. ' +
		escapeHtml(kepala?.nip || '-') +
		'</div></div></section></body></html>'
	);
}