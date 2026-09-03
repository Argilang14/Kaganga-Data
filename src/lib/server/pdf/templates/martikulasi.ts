import {
	martikulasiAspekAkademik,
	martikulasiAspekKarakter,
	martikulasiKetuntasanOptions,
	martikulasiLevelLabel
} from '../../../martikulasi.ts';
import {
	renderSchoolLetterhead,
	schoolLetterheadStyles,
	type SchoolLetterheadData
} from './school-letterhead.ts';

const esc = (value: string | number | null | undefined) =>
	String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
const value = (input: string | number | null | undefined) => esc(input || '-');

export type MartikulasiSchoolPrint = SchoolLetterheadData & {
	npsn: string;
	kepalaSekolah: { nama: string; nip: string | null; status: string | null };
};

export type MartikulasiSettingsPrint = {
	tahunAjaran: string;
	periodeMulai: string;
	periodeSelesai: string;
	nomorSk: string | null;
	tanggalSk: string;
	lokasiPenetapan: string;
};

export type MartikulasiStudentPrint = {
	nama: string;
	nis: string;
	nisn: string;
	jenjang: string;
	kelas: string;
	nomorSttm: string | null;
	tanggalSttm: string;
	levelPenempatan: string | null;
	rekomendasi: string | null;
	catatanUmum: string | null;
	waliKelas: { nama: string; nip: string | null } | null;
	schoolSnapshot?: MartikulasiSchoolPrint | null;
	lokasiPenetapanSnapshot?: string | null;
	nilai: Array<{
		aspekKode: string;
		capaianAwal: string | null;
		capaianAkhir: string | null;
		ketuntasan: string | null;
		catatan: string | null;
		deskripsiCapaian: string | null;
	}>;
};

function styles() {
	return `
${schoolLetterheadStyles()}
@page { size: A4 portrait; margin: 14mm 15mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { break-after: page; page-break-after: always; min-height: 267mm; }
.page:last-child { break-after: auto; page-break-after: auto; }
.kop { display: grid; grid-template-columns: 24mm 1fr 24mm; gap: 4mm; align-items: center; padding-bottom: 3mm; margin-bottom: 6mm; border-bottom: 2px solid #b91c1c; }
.kop-logo { width: 24mm; height: 22mm; display: flex; align-items: center; justify-content: center; }
.kop-logo img { max-width: 21mm; max-height: 21mm; object-fit: contain; }
.kop-text { text-align: center; }
.kop-text strong { display: block; font-size: 14pt; text-transform: uppercase; }
.kop-text .name { font-size: 12pt; font-weight: 800; text-transform: uppercase; }
.kop-text small { display: block; color: #374151; font-size: 7.5pt; }
h1 { margin: 0 0 1mm; text-align: center; font-size: 14pt; text-transform: uppercase; }
.number { text-align: center; margin-bottom: 6mm; }
.accent { color: #b91c1c; }
.identity { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; }
.identity td { padding: 1mm 1.5mm; vertical-align: top; }
.identity td:first-child { width: 38mm; }
.data-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0 5mm; font-size: 9pt; }
.data-table th, .data-table td { border: 1.2px solid #111; padding: 1.8mm; vertical-align: top; overflow-wrap: anywhere; }
.data-table th { background: #c94f49; color: white; text-align: center; font-weight: 700; }
.section-title { margin: 4mm 0 1.5mm; color: #b91c1c; font-weight: 800; }
.signatures { width: 100%; border-collapse: collapse; margin-top: 8mm; break-inside: avoid; }
.signatures td { width: 50%; text-align: center; vertical-align: top; border: 0; padding: 1mm 4mm; }
.signature-space { height: 20mm; }
.underline { font-weight: 700; text-decoration: underline; }
.sk-list { width: 100%; border-collapse: collapse; margin: 4mm 0; }
.sk-list th, .sk-list td { border: 1px solid #111; padding: 2mm; vertical-align: top; }
.sk-list th { background: #f3f4f6; text-align: center; }
.statement { text-align: justify; line-height: 1.6; }
.sttm-title { margin-top: 8mm; color: #b91c1c; }
.sttm-body { margin-top: 7mm; font-size: 11pt; line-height: 1.7; text-align: justify; }
.draft { margin: 3mm auto; width: fit-content; border: 1px solid #b91c1c; color: #b91c1c; padding: 1mm 3mm; font-weight: bold; }
.report-page { min-height: 0; font-size: 8.5pt; line-height: 1.2; }
.report-page .kop { height: 25mm; margin-bottom: 3mm; padding-bottom: 2mm; }
.report-page .kop-logo { height: 19mm; }
.report-page .kop-logo img { max-height: 18mm; }
.report-page .kop-text strong { font-size: 12pt; }
.report-page .kop-text .name { font-size: 10pt; }
.report-page h1 { font-size: 12pt; }
.report-page .identity { margin: 1.5mm 0 2.5mm; }
.report-page .identity td { padding: 0.6mm 1mm; }
.report-page .data-table { margin: 1mm 0 2.5mm; font-size: 7.5pt; }
.report-page .data-table th, .report-page .data-table td { padding: 0.9mm 1mm; }
.report-page .section-title { margin: 2mm 0 1mm; }
.report-page .signatures { margin-top: 3mm; font-size: 8.5pt; }
.report-page .signature-space { height: 12mm; }
`;
}

function head(school: MartikulasiSchoolPrint) {
	return renderSchoolLetterhead(school, true);
}

function signature(
	school: MartikulasiSchoolPrint,
	settings: MartikulasiSettingsPrint,
	left?: { label: string; nama: string; nip: string | null } | null
) {
	const headLabel =
		school.kepalaSekolah.status === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';
	return `<table class="signatures"><tr><td>${left?.label ?? ''}</td><td>${value(settings.lokasiPenetapan)}, ${value(settings.tanggalSk)}</td></tr><tr><td></td><td>${headLabel}</td></tr><tr><td class="signature-space"></td><td class="signature-space"></td></tr><tr><td>${left ? `<span class="underline">${value(left.nama)}</span><br>NIP ${value(left.nip)}` : ''}</td><td><span class="underline">${value(school.kepalaSekolah.nama)}</span><br>NIP ${value(school.kepalaSekolah.nip)}</td></tr></table>`;
}

function document(html: string) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>${styles()}</style></head><body>${html}</body></html>`;
}

export function renderSkMartikulasiHTML(input: {
	school: MartikulasiSchoolPrint;
	settings: MartikulasiSettingsPrint;
	tim: Array<{ nama: string; nip: string | null; jabatan: string; tugas: string | null }>;
}) {
	const rows = input.tim
		.map(
			(item, index) =>
				`<tr><td style="text-align:center">${index + 1}</td><td>${value(item.nama)}<br><small>NIP ${value(item.nip)}</small></td><td>${value(item.jabatan)}</td><td>${value(item.tugas)}</td></tr>`
		)
		.join('');
	return document(
		`<section class="page">${head(input.school)}<h1>Keputusan Kepala Sekolah</h1><div class="number">Nomor: ${value(input.settings.nomorSk)}</div><h1 class="accent">Tentang Pembentukan Tim Martikulasi</h1><p class="statement"><strong>Menimbang:</strong> bahwa untuk menjamin pelaksanaan program Martikulasi yang terarah, terukur, dan bertanggung jawab, perlu dibentuk Tim Martikulasi pada ${value(input.school.nama)}.</p><p class="statement"><strong>Mengingat:</strong> peraturan dan dokumen rujukan penyelenggaraan pendidikan yang berlaku serta Panduan Pelaksanaan Martikulasi Sekolah Rakyat.</p><p class="statement"><strong>Memperhatikan:</strong> kebutuhan pelaksanaan Program Martikulasi Tahun Ajaran ${value(input.settings.tahunAjaran)}.</p><h1 class="accent" style="margin-top:6mm">Memutuskan</h1><p><strong>Menetapkan:</strong> susunan Tim Martikulasi sebagai berikut:</p><table class="sk-list"><thead><tr><th style="width:9mm">No</th><th style="width:52mm">Nama</th><th style="width:43mm">Jabatan Tim</th><th>Uraian Tugas</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="text-align:center">Tim belum diisi</td></tr>'}</tbody></table><p>Keputusan ini berlaku pada periode ${value(input.settings.periodeMulai)} sampai dengan ${value(input.settings.periodeSelesai)}. Apabila terdapat kekeliruan, akan diperbaiki sebagaimana mestinya.</p>${signature(input.school, input.settings)}</section>`
	);
}

export function renderRaportMartikulasiHTML(input: {
	school: MartikulasiSchoolPrint;
	settings: MartikulasiSettingsPrint;
	students: MartikulasiStudentPrint[];
}) {
	const completeness = Object.fromEntries(
		martikulasiKetuntasanOptions.map((item) => [item.value, item.label])
	);
	return document(
		input.students
			.map((student) => {
				const byCode = new Map(student.nilai.map((item) => [item.aspekKode, item]));
				const academic = martikulasiAspekAkademik
					.map((aspect) => {
						const row = byCode.get(aspect.kode);
						return `<tr><td>${value(aspect.label)}</td><td>${value(row?.capaianAwal)}</td><td>${value(row?.capaianAkhir)}</td><td>${value(row?.ketuntasan ? completeness[row.ketuntasan] : null)}</td><td>${value(row?.catatan)}</td></tr>`;
					})
					.join('');
				const character = martikulasiAspekKarakter
					.map(
						(aspect) =>
							`<tr><td>${value(aspect.label)}</td><td>${value(byCode.get(aspect.kode)?.deskripsiCapaian)}</td></tr>`
					)
					.join('');
				return `<section class="page report-page">${head(input.school)}<h1 class="accent">Raport Hasil Martikulasi</h1><table class="identity"><tr><td>Nama Murid</td><td>: <strong>${value(student.nama)}</strong></td><td>Jenjang</td><td>: ${value(student.jenjang)}</td></tr><tr><td>Nomor Induk / ID</td><td>: ${value(student.nis)} / ${value(student.nisn)}</td><td>Kelas Martikulasi</td><td>: ${value(student.kelas)}</td></tr><tr><td>Satuan Pendidikan</td><td>: ${value(input.school.nama)}</td><td>Tahun Ajaran</td><td>: ${value(input.settings.tahunAjaran)}</td></tr></table><div class="section-title">Capaian Akademik</div><table class="data-table"><thead><tr><th style="width:20%">Aspek</th><th style="width:15%">Capaian Awal</th><th style="width:15%">Capaian Akhir</th><th style="width:18%">Ketuntasan</th><th>Catatan</th></tr></thead><tbody>${academic}</tbody></table><div class="section-title">Capaian Karakter, Keagamaan, dan Keasramaan</div><table class="data-table"><thead><tr><th style="width:32%">Aspek</th><th>Deskripsi Capaian</th></tr></thead><tbody>${character}</tbody></table><div class="section-title">Penetapan Level Akhir dan Rekomendasi</div><table class="identity"><tr><td>Level akhir / penempatan</td><td>: <strong>${value(martikulasiLevelLabel(student.levelPenempatan))}</strong></td></tr><tr><td>Rekomendasi tindak lanjut</td><td>: ${value(student.rekomendasi)}</td></tr><tr><td>Catatan</td><td>: ${value(student.catatanUmum)}</td></tr></table>${signature(input.school, input.settings, student.waliKelas ? { label: 'Wali Kelas / Guru', ...student.waliKelas } : null)}</section>`;
			})
			.join('')
	);
}

export function renderSttmMartikulasiHTML(input: {
	school: MartikulasiSchoolPrint;
	settings: MartikulasiSettingsPrint;
	students: MartikulasiStudentPrint[];
}) {
	return document(
		input.students
			.map((student) => {
				const school = student.schoolSnapshot ?? input.school;
				const settings = {
					...input.settings,
					lokasiPenetapan: student.lokasiPenetapanSnapshot || input.settings.lokasiPenetapan,
					tanggalSk: student.tanggalSttm || input.settings.tanggalSk
				};
				return `<section class="page">${head(school)}<h1 class="sttm-title">Surat Tanda Tamat Martikulasi</h1><div class="number">Nomor: ${value(student.nomorSttm)}</div>${student.nomorSttm ? '' : '<div class="draft">DRAF - NOMOR BELUM DITERBITKAN</div>'}<div class="sttm-body"><p>Yang bertanda tangan di bawah ini, ${school.kepalaSekolah.status === 'plt' ? 'Plt. ' : ''}Kepala ${value(school.nama)}, dengan ini menerangkan bahwa:</p><table class="identity"><tr><td>Nama Murid</td><td>: <strong>${value(student.nama)}</strong></td></tr><tr><td>Nomor Induk / ID</td><td>: ${value(student.nis)} / ${value(student.nisn)}</td></tr><tr><td>Jenjang</td><td>: ${value(student.jenjang)}</td></tr></table><p>telah <strong>menyelesaikan Program Martikulasi</strong> sebagai bagian dari Program Persiapan Sekolah Rakyat Tahun Ajaran ${value(input.settings.tahunAjaran)}, dan dinyatakan siap mengikuti pembelajaran reguler pada:</p><table class="identity"><tr><td>Level penempatan</td><td>: <strong>${value(martikulasiLevelLabel(student.levelPenempatan))}</strong></td></tr></table><p>Surat ini diberikan untuk dipergunakan sebagaimana mestinya.</p></div>${signature(school, settings)}</section>`;
			})
			.join('')
	);
}
