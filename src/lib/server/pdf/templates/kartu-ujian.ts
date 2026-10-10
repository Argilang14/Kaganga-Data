import {
	renderSchoolLetterhead,
	schoolLetterheadStyles,
	type SchoolLetterheadData
} from './school-letterhead.ts';

type Participant = {
	nomorPeserta?: string | null;
	nama: string;
	nis?: string | null;
	nisn?: string | null;
	kelas?: string | null;
	ruang?: string | null;
	usernameLms?: string | null;
	passwordLms?: string | null;
	qrDataUrl?: string | null;
	sekolah?: SchoolLetterheadData;
};

export type ExamCardData = {
	sekolah: SchoolLetterheadData;
	ujian: {
		nama: string;
		singkatan?: string | null;
		tahunAjaran: string;
		semester?: string | null;
		tanggalCetak?: string | null;
	};
	peserta: Participant[];
	showAttendanceQr?: boolean;
	showLmsAccount?: boolean;
	tandaTangan: { tempatTanggal: string; nama: string; nip?: string | null; jabatan: string };
};

const esc = (value: string | number | null | undefined) =>
	String(value ?? '').replace(/[\x26\x3c\x3e\x22\x27]/g, (char) => `&#${char.charCodeAt(0)};`);

function chunks<T>(items: T[], size: number) {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size)
		result.push(items.slice(index, index + size));
	return result;
}

function row(label: string, value: string | null | undefined, emphasize = false) {
	return `<div class="identity-row"><span>${esc(label)}</span><b>:</b><strong${emphasize ? ' class="emphasize"' : ''}>${esc(value || '-')}</strong></div>`;
}

function card(data: ExamCardData, participant: Participant) {
	const examTitle = [data.ujian.nama, data.ujian.semester, `TP. ${data.ujian.tahunAjaran}`].filter(
		Boolean
	);
	return `<article class="exam-card">
		${renderSchoolLetterhead(participant.sekolah ?? data.sekolah, true)}
		<div class="exam-title"><div>KARTU PESERTA</div>${examTitle.map((line) => `<div>${esc(line).toUpperCase()}</div>`).join('')}</div>
		<section class="identity">
			${row('No. Peserta', participant.nomorPeserta, true)}
			${row('Nama Peserta', participant.nama, true)}
			${row('NISN', participant.nisn)}
			${row('Kelas', participant.kelas)}
			${data.showLmsAccount ? row('Username LMS', participant.usernameLms) + row('Password LMS', participant.passwordLms) : ''}
			${row('Ruang', participant.ruang)}
		</section>
		${data.showAttendanceQr && participant.qrDataUrl ? `<section class="attendance-qr"><img src="${esc(participant.qrDataUrl)}" alt="QR Absensi ${esc(participant.nama)}" /><div>QR ABSENSI</div></section>` : ''}
		<footer class="signature"><div>${esc(data.tandaTangan.tempatTanggal)}</div><div>${esc(data.tandaTangan.jabatan)},</div><div class="signature-space"></div><div class="signature-name">${esc(data.tandaTangan.nama || '(................................)')}</div><div>${data.tandaTangan.nip ? `NIP. ${esc(data.tandaTangan.nip)}` : 'NIP. -'}</div></footer>
	</article>`;
}

export function renderKartuUjianHTML(data: ExamCardData) {
	const sheets = chunks(data.peserta, 4);
	return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kartu Ujian</title><style>
		${schoolLetterheadStyles()}
		@page{size:A4 portrait;margin:0}
		*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
		.exam-sheet{width:210mm;height:297mm;padding:9mm 8mm;display:grid;grid-template-columns:repeat(2,94mm);grid-template-rows:repeat(2,123mm);column-gap:6mm;row-gap:7mm;page-break-after:always;break-after:page;overflow:hidden}
		.exam-sheet:last-child{page-break-after:auto;break-after:auto}.exam-card-slot{width:94mm;height:123mm;display:flex;align-items:center;justify-content:center;overflow:visible}
		.exam-card{position:relative;width:94mm;height:123mm;flex:none;border:1.2px solid #111;padding:2.8mm;overflow:hidden;background:#fff}
		.exam-card .school-letterhead{grid-template-columns:10mm minmax(0,1fr) 10mm;gap:1mm;margin:0 0 2mm;padding:0 0 1.3mm;border-bottom:1.2px solid #111}
		.exam-card .school-letterhead__logo{width:10mm;height:10mm}.exam-card .school-letterhead__logo img{max-width:9.5mm;max-height:9.5mm}
		.exam-card .school-letterhead__authority{font-size:6.2pt;line-height:1.05}.exam-card .school-letterhead__unit,.exam-card .school-letterhead__school{margin-top:.25mm;font-size:5.1pt;line-height:1.07}
		.exam-card .school-letterhead__contact{margin-top:.3mm;font-size:3.7pt;line-height:1.1;white-space:normal}
		.exam-title{text-align:center;font-size:9pt;font-weight:800;line-height:1.18;margin:1.5mm 0 4.5mm}.exam-title>div:first-child{font-size:10.8pt;margin-bottom:.6mm}
		.identity{width:100%;font-size:9.5pt;line-height:1.22}.identity-row{display:grid;grid-template-columns:28mm 2.5mm minmax(0,1fr);gap:.5mm;margin:.75mm 0}.identity-row strong{min-width:0;overflow-wrap:anywhere}.identity-row .emphasize{font-size:10pt}
		.attendance-qr{width:30mm;margin-top:2mm;text-align:center;font-size:6.5pt;line-height:1.2;break-inside:avoid}.attendance-qr img{display:block;width:28mm;height:28mm;margin:0 auto .5mm}
		.signature{position:absolute;right:2.8mm;bottom:3.5mm;width:45mm;font-size:8.7pt;line-height:1.25;text-align:left}.signature-space{height:12mm}.signature-name{font-size:9.2pt;font-weight:800;text-decoration:underline;overflow-wrap:anywhere}
	</style></head><body>${sheets.map((sheet) => `<section class="exam-sheet">${sheet.map((participant) => `<div class="exam-card-slot">${card(data, participant)}</div>`).join('')}</section>`).join('')}</body></html>`;
}
