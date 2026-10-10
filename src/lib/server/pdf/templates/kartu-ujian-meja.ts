import type { ExamCardData } from './kartu-ujian.ts';
import { renderSchoolLetterhead, schoolLetterheadStyles } from './school-letterhead.ts';

type ExamDeskCardData = ExamCardData & { showPrincipalSignature?: boolean };

const esc = (value: string | null | undefined) =>
	String(value ?? '').replace(/[\x26\x3c\x3e\x22\x27]/g, (char) => `&#${char.charCodeAt(0)};`);

function row(label: string, value: string | null | undefined, emphasize = false) {
	return `<div class="desk-identity-row"><span>${esc(label)}</span><b>:</b><strong${emphasize ? ' class="emphasize"' : ''}>${esc(value || '-')}</strong></div>`;
}

function card(data: ExamDeskCardData, participant: ExamCardData['peserta'][number]) {
	const title = `${data.ujian.nama}${data.ujian.singkatan ? ` (${data.ujian.singkatan})` : ''}`;
	const period = [data.ujian.semester, `TP. ${data.ujian.tahunAjaran}`].filter(Boolean).join(' ');
	return `<article class="desk-card">
		${renderSchoolLetterhead(participant.sekolah ?? data.sekolah, true)}
		<div class="desk-title"><div>KARTU PESERTA</div><div>${esc(title).toUpperCase()}</div><div>${esc(period).toUpperCase()}</div></div>
		<div class="desk-body${data.showPrincipalSignature === false ? ' desk-body--no-signature' : ''}">
			<section class="desk-identity">
				${row('No. Peserta', participant.nomorPeserta, true)}
				${row('Nama Peserta', participant.nama, true)}
				${row('NISN', participant.nisn)}
				${row('Kelas', participant.kelas)}
				${data.showLmsAccount ? row('Username LMS', participant.usernameLms) + row('Password LMS', participant.passwordLms) : ''}
				${row('Ruang', participant.ruang)}
			</section>
			${data.showPrincipalSignature !== false ? `<footer class="desk-signature"><div>${esc(data.tandaTangan.tempatTanggal)}</div><div>${esc(data.tandaTangan.jabatan)},</div><div class="desk-signature-space"></div><div class="desk-signature-name">${esc(data.tandaTangan.nama || '(........................)')}</div><div>${data.tandaTangan.nip ? `NIP. ${esc(data.tandaTangan.nip)}` : 'NIP. -'}</div></footer>` : ''}
		</div>
	</article>`;
}

export function renderKartuUjianMejaHTML(data: ExamDeskCardData) {
	const sheets: string[] = [];
	for (let index = 0; index < data.peserta.length; index += 8) {
		sheets.push(
			`<section class="desk-sheet">${data.peserta
				.slice(index, index + 8)
				.map((participant) => card(data, participant))
				.join('')}</section>`
		);
	}
	return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kartu Ujian Meja</title><style>
		${schoolLetterheadStyles()}
		@page{size:A4 portrait;margin:0}
		*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
		.desk-sheet{width:210mm;height:297mm;padding:10mm 8mm;display:grid;grid-template-columns:repeat(2,94mm);grid-template-rows:repeat(4,62mm);column-gap:6mm;row-gap:5mm;align-content:start;break-after:page;page-break-after:always}
		.desk-sheet:last-child{break-after:auto;page-break-after:auto}
		.desk-card{width:94mm;height:62mm;padding:2mm;border:.3mm solid #111;display:flex;flex-direction:column;background:#fff;break-inside:avoid}
		.desk-card .school-letterhead{grid-template-columns:9mm minmax(0,1fr) 9mm;gap:1mm;margin:0;padding:0 0 1mm;border-bottom:.3mm solid #111}
		.desk-card .school-letterhead__logo{width:9mm;height:9mm}.desk-card .school-letterhead__logo img{max-width:9mm;max-height:9mm}
		.desk-card .school-letterhead__authority{font-size:6.2pt;line-height:1.05}.desk-card .school-letterhead__unit,.desk-card .school-letterhead__school{margin-top:.2mm;font-size:5pt;line-height:1.05}
		.desk-card .school-letterhead__contact{margin-top:.25mm;font-size:3.8pt;line-height:1.1}
		.desk-title{text-align:center;font-weight:800;font-size:7.4pt;line-height:1.12;margin:1.6mm 0 2mm}.desk-title>div:first-child{font-size:8.5pt;margin-bottom:.3mm}
		.desk-body{display:grid;grid-template-columns:minmax(0,1fr) 32mm;gap:1.5mm;flex:1;min-height:0}
		.desk-body--no-signature{grid-template-columns:minmax(0,1fr)}
		.desk-identity{min-width:0;font-size:7.5pt;line-height:1.13}.desk-identity-row{display:grid;grid-template-columns:19mm 1.5mm minmax(0,1fr);gap:.3mm;margin:.3mm 0}.desk-identity-row strong{min-width:0;overflow-wrap:anywhere}.desk-identity-row .emphasize{font-size:8pt}
		.desk-signature{align-self:end;font-size:6.8pt;line-height:1.15;overflow-wrap:anywhere}.desk-signature-space{height:6mm}.desk-signature-name{font-size:7.2pt;font-weight:800;text-decoration:underline}
	</style></head><body>${sheets.join('')}</body></html>`;
}
