import type { KalenderPendidikanPrintData } from '../../../../routes/cetak/kalender-pendidikan/preview-data';

function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function agendaTanggalDalamBulan(
	item: { tanggalMulai: string; tanggalSelesai: string },
	year: number,
	month: number
) {
	const monthStart = new Date(year, month, 1).getTime();
	const monthEnd = new Date(year, month + 1, 0).getTime();
	const start = new Date(Math.max(new Date(`${item.tanggalMulai}T00:00:00`).getTime(), monthStart));
	const end = new Date(Math.min(new Date(`${item.tanggalSelesai}T00:00:00`).getTime(), monthEnd));
	const startDay = start.getDate();
	const endDay = end.getDate();
	return startDay === endDay ? `${startDay}` : `${startDay}-${endDay}`;
}

function agendaForDay(data: KalenderPendidikanPrintData, year: number, month: number, day: number) {
	const value = new Date(year, month, day).toISOString().slice(0, 10);
	return data.kalenderList.find(
		(item) => item.tanggalMulai <= value && item.tanggalSelesai >= value
	);
}

function dayClass(agenda: { jenis?: string } | undefined, weekDay: number) {
	if (agenda) return 'day has-agenda';
	if (weekDay === 0) return 'day sunday';
	return 'day';
}

function agendaStyle(agenda: { warna?: string | null } | undefined) {
	return agenda?.warna ? ` style="background:${escapeHtml(agenda.warna)};"` : '';
}

function renderMonth(
	data: KalenderPendidikanPrintData,
	month: KalenderPendidikanPrintData['months'][number]
) {
	return `<section class="month-card">
		<h2>${escapeHtml(month.label)}</h2>
		<table class="calendar">
			<thead><tr><th>M</th><th>S</th><th>S</th><th>R</th><th>K</th><th>J</th><th>S</th></tr></thead>
			<tbody>
				${month.weeks
					.map(
						(week) =>
							`<tr>${week
								.map((day, index) => {
									if (!day) return '<td class="day empty"></td>';
									const agenda = agendaForDay(data, month.year, month.month, day);
									return `<td class="${dayClass(agenda, index)}"${agendaStyle(agenda)}>${day}</td>`;
								})
								.join('')}</tr>`
					)
					.join('')}
			</tbody>
		</table>
		<div class="agenda-list">
			${
				month.agendas.length
					? month.agendas
							.map((item) => {
								const agenda = item as { judul?: string; warna?: string | null };
								return `<div class="agenda-item">
								<span class="agenda-date">${escapeHtml(agendaTanggalDalamBulan(item, month.year, month.month))}</span>
								<i style="background:${escapeHtml(agenda.warna || '#2563eb')}"></i>
								<span class="agenda-title">${escapeHtml(agenda.judul)}</span>
							</div>`;
							})
							.join('')
					: '<div class="empty-agenda">Belum ada agenda.</div>'
			}
		</div>
	</section>`;
}

export function renderKalenderPendidikanHTML(data: KalenderPendidikanPrintData): string {
	const isPortrait = data.orientation === 'portrait';
	const kepalaSekolah = data.sekolah.kepalaSekolah;
	return `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<title>Kalender Pendidikan</title>
	<style>
		@page { size: A4 ${isPortrait ? 'portrait' : 'landscape'}; margin: 7mm; }
		* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #020617; background: #fff; font-size: ${isPortrait ? '8px' : '8.5px'}; }
		.sheet { width: 100%; }
		.header { text-align: center; margin-bottom: 4mm; }
		.header .school { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
		.header h1 { margin: 0 0 2px; font-size: 18px; line-height: 1.1; }
		.header .period { color: #475569; font-size: 11px; }
		.month-grid { display: grid; grid-template-columns: repeat(${isPortrait ? 2 : 3}, 1fr); gap: 3mm; }
		.month-card { min-height: ${isPortrait ? '73mm' : '75mm'}; border: 0.7px solid #e2e8f0; border-radius: 5px; padding: 3mm; break-inside: avoid; page-break-inside: avoid; }
		.month-card h2 { margin: 0 0 2.5mm; text-align: center; font-size: 10px; line-height: 1.1; text-transform: uppercase; }
		.calendar { width: 100%; border-collapse: collapse; table-layout: fixed; }
		.calendar th, .calendar td { border: 0.5px solid #e5e7eb; text-align: center; vertical-align: middle; }
		.calendar th { height: 5.6mm; background: #f8fafc; color: #0f172a; font-size: 7px; font-weight: 700; }
		.calendar td { height: ${isPortrait ? '6.7mm' : '6.9mm'}; font-size: 7.2px; }
		.day { background: #fff; }
		.day.sunday { background: #fee2e2; color: #b91c1c; }
		.day.has-agenda { color: #fff; font-weight: 700; }
		.day.empty { background: #fff; }
		.agenda-list { margin-top: 2.8mm; min-height: 14mm; }
		.agenda-item { display: grid; grid-template-columns: 24px 7px 1fr; align-items: center; gap: 3px; margin-bottom: 1.2mm; line-height: 1.18; }
		.agenda-item i { width: 6px; height: 6px; border-radius: 999px; display: inline-block; }
		.agenda-date { color: #0f172a; font-weight: 700; }
		.agenda-title { color: #0f172a; }
		.empty-agenda { padding-top: 3mm; color: #94a3b8; text-align: center; font-size: 7.2px; }
		.signature { margin: 9mm 2mm 0 auto; width: 58mm; text-align: center; break-inside: avoid; page-break-inside: avoid; font-size: 9px; }
		.signature .space { height: 18mm; }
		.signature .name { font-weight: 700; text-decoration: underline; }
	</style>
</head>
<body>
	<section class="sheet">
		<div class="header">
			<h1>Kalender Pendidikan</h1>
			<div class="school">${escapeHtml(data.sekolah.nama)}</div>
			<div class="period">${escapeHtml(data.periode.label || data.periode.tahunPelajaran || '')}</div>
		</div>
		<div class="month-grid">${data.months.map((month) => renderMonth(data, month)).join('')}</div>
		<div class="signature">
			<div>${escapeHtml(data.ttd.tempat)}${data.ttd.tempat && data.ttd.tanggal ? ', ' : ''}${escapeHtml(data.ttd.tanggal)}</div>
			<div>Kepala Sekolah</div>
			<div class="space"></div>
			<div class="name">${escapeHtml(kepalaSekolah?.nama || '')}</div>
			<div>NIP. ${escapeHtml(kepalaSekolah?.nip || '-')}</div>
		</div>
	</section>
</body>
</html>`;
}
