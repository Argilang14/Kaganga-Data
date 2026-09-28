import { renderSchoolLetterhead, schoolLetterheadStyles, type SchoolLetterheadData } from './school-letterhead.ts';

type Participant = {
	nomorPeserta?: string | null;
	nama: string;
	nis?: string | null;
	nisn?: string | null;
	kelas?: string | null;
	ruang?: string | null;
	usernameLms?: string | null;
	passwordLms?: string | null;
};

type ExamCardData = {
	sekolah: SchoolLetterheadData;
	ujian: { nama: string; singkatan?: string | null; tahunAjaran: string; semester?: string | null; tanggalCetak?: string | null };
	peserta: Participant[];
	tandaTangan: { tempatTanggal: string; nama: string; nip?: string | null; jabatan: string };
};

const esc = (value: string | number | null | undefined) =>
	String(value ?? '').replace(/[\x26\x3c\x3e\x22\x27]/g, (char) => `&#${char.charCodeAt(0)};`);

function chunks<T>(items: T[], size: number) {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
	return result;
}

function row(label: string, value: string | null | undefined, emphasize = false) {
	return `<div class="identity-row"><span>${esc(label)}</span><b>:</b><strong${emphasize ? ' class="emphasize"' : ''}>${esc(value || '-')}</strong></div>`;
}

function card(data: ExamCardData, participant: Participant) {
	const examTitle = [data.ujian.nama, data.ujian.semester, `TP. ${data.ujian.tahunAjaran}`].filter(Boolean);
	return `<article class="exam-card">
		${renderSchoolLetterhead(data.sekolah, true)}
		<div class="exam-title"><div>KARTU PESERTA</div>${examTitle.map((line) => `<div>${esc(line).toUpperCase()}</div>`).join('')}</div>
		<section class="identity">
			${row('No. Peserta', participant.nomorPeserta, true)}
			${row('Nama Siswa', participant.nama, true)}
			${row('NIS', participant.nis)}
			${row('NISN', participant.nisn)}
			${row('Kelas', participant.kelas)}
			${row('Username LMS', participant.usernameLms)}
			${row('Password LMS', participant.passwordLms)}
			${row('Ruang', participant.ruang)}
		</section>
		<footer class="signature"><div>${esc(data.tandaTangan.tempatTanggal)}</div><div>${esc(data.tandaTangan.jabatan)},</div><div class="signature-space"></div><div class="signature-name">${esc(data.tandaTangan.nama || '(................................)')}</div><div>${data.tandaTangan.nip ? `NIP. ${esc(data.tandaTangan.nip)}` : 'NIP. -'}</div></footer>
	</article>`;
}

export function renderKartuUjianHTML(data: ExamCardData) {
	const sheets = chunks(data.peserta, 4);
	return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kartu Ujian</title><style>
		${schoolLetterheadStyles()}
		@page{size:A4 portrait;margin:6mm}
		*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
		.exam-sheet{width:198mm;height:285mm;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:3mm;page-break-after:always;break-after:page}
		.exam-sheet:last-child{page-break-after:auto;break-after:auto}.exam-card{position:relative;min-width:0;min-height:0;border:1.2px solid #111;padding:3mm 3.5mm;overflow:hidden;break-inside:avoid;background:#fff}
		.exam-card .school-letterhead{grid-template-columns:10mm minmax(0,1fr) 10mm;gap:1.3mm;margin:0 0 3mm;padding:0 0 1.3mm;border-bottom:1px solid #111}
		.exam-card .school-letterhead__logo{width:10mm;height:10mm}.exam-card .school-letterhead__logo img{max-width:9.5mm;max-height:9.5mm}
		.exam-card .school-letterhead__authority{font-size:6.5pt;line-height:1.05}.exam-card .school-letterhead__unit,.exam-card .school-letterhead__school{margin-top:.3mm;font-size:5.2pt;line-height:1.05}
		.exam-card .school-letterhead__contact{margin-top:.35mm;font-size:3.8pt;line-height:1.1;white-space:normal}
		.exam-title{text-align:center;font-size:9pt;font-weight:800;line-height:1.22;margin:1.5mm 0 6mm}.exam-title>div:first-child{font-size:10.5pt;margin-bottom:.5mm}
		.identity{font-size:8.2pt;line-height:1.25}.identity-row{display:grid;grid-template-columns:27mm 3mm minmax(0,1fr);gap:.5mm;margin:.8mm 0}.identity-row strong{min-width:0;overflow-wrap:anywhere}.identity-row .emphasize{font-size:8.8pt}
		.signature{position:absolute;right:4mm;bottom:4mm;width:47mm;font-size:7.2pt;line-height:1.25;text-align:left}.signature-space{height:14mm}.signature-name{font-weight:800;text-decoration:underline;overflow-wrap:anywhere}
	</style></head><body>${sheets.map((sheet) => `<section class="exam-sheet">${sheet.map((participant) => card(data, participant)).join('')}</section>`).join('')}</body></html>`;
}
