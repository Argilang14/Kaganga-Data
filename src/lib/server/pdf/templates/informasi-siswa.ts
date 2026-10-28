import {
	safeInformationImage,
	type InformationRow,
	type StudentInformationPage
} from '../../../student-profile-print.ts';

function escape(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
function rows(items: InformationRow[]) {
	return `<dl>${items.map(([label, value]) => `<div class="row"><dt>${escape(label)}</dt><dd>${escape(value || '-')}</dd></div>`).join('')}</dl>`;
}
function panel(title: string, body: string, className = '') {
	return `<section class="panel ${className}"><h2>${escape(title)}</h2>${body}</section>`;
}
function photo(label: string, src: string | null) {
	const image = safeInformationImage(src);
	return `<figure>${image ? `<img src="${image}" alt="${escape(label)}">` : `<div class="missing">${escape(label)}<br>Belum tersedia</div>`}<figcaption>${escape(label)}</figcaption></figure>`;
}

export function renderStudentInformationHTML(
	students: StudentInformationPage[],
	options: { background: 'default' | 'custom' | 'none'; backgroundImage?: string | null }
) {
	const background =
		options.background === 'custom' ? safeInformationImage(options.backgroundImage) : null;
	if (options.background === 'custom' && !background)
		throw new Error('Background cetak belum tersedia.');
	const pages = students
		.map((student, index) => {
			const logo = safeInformationImage(student.logo);
			return `<article class="poster ${options.background === 'none' ? 'plain' : ''}" data-student-page="${index + 1}">
		${background ? `<img class="background" src="${background}" alt="">` : ''}
		<header>
			<div class="school">${logo ? `<img src="${logo}" alt="Logo sekolah">` : ''}<div><strong>${escape(student.sekolah)}</strong><span>${escape(student.jenjang)} / ${escape(student.kelas)}</span></div></div>
			<div class="heading"><h1>INFORMASI MURID</h1><p><span>NAMA :</span> ${escape(student.nama)}</p></div>
		</header>
		<div class="content">
			<aside class="photo-column">
				<h2 class="photo-title student-photo-title">FOTO MURID</h2>
				<div class="photos student-photos">${student.photos
					.slice(0, 2)
					.map((p) => photo(p.label, p.src))
					.join('')}</div>
				<h2 class="photo-title">FOTO RUMAH &amp; ORANG TUA</h2>
				<div class="photos family-photos">${student.photos
					.slice(2, 4)
					.map((p) => photo(p.label, p.src))
					.join('')}</div>
			</aside>
			<div class="housing">${student.hunian.map(([label, value]) => `<div><strong>${escape(label)}</strong><span>${escape(value)}</span></div>`).join('')}</div>
			${panel('INFORMASI MURID', rows(student.murid), 'student-panel')}
			${panel('INFORMASI ORANG TUA', rows(student.orangTua), 'parents-panel')}
			${panel('PERLENGKAPAN SEKOLAH', rows(student.perlengkapan), 'equipment-panel')}
			<div class="column side-column">
				${panel('INFORMASI ALAMAT', rows(student.alamat))}
				${panel('INFORMASI ASRAMA', rows(student.asrama))}
				${panel('INFORMASI PETUGAS', rows(student.petugas))}
				${panel('CATATAN PETUGAS', `<p class="notes">${escape(student.catatan || '-')}</p>`, 'note-panel')}
			</div>
		</div>
		<footer><span>Data profil terkini${student.maskIdentity ? ' / NIK dan KK disamarkan' : ' / NIK dan KK lengkap'}</span><span>Dokumen internal sekolah / ${index + 1} dari ${students.length}</span></footer>
		</article>`;
		})
		.join('');
	return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Informasi Siswa</title><style>
	@page { size: A4 landscape; margin: 0; }
	* { box-sizing: border-box; }
	html,body { margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; }
	.poster { --ink:#fff; --value:#ffce26; --paper:#084dad; position:relative; isolation:isolate; width:297mm; height:210mm; padding:8mm; background:var(--paper); color:var(--ink); display:flex; flex-direction:column; gap:4mm; break-after:page; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
	.poster:last-child { break-after:auto; }
	.plain { --ink:#17212d; --value:#143e6b; --paper:#fff; }
	.background { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:-1; }
	header { display:grid; grid-template-columns:72mm minmax(0,1fr); gap:5mm; align-items:center; flex:none; }
	.school { display:flex; align-items:center; gap:3mm; min-height:22mm; border-radius:2mm; padding:3mm; background:#fff; color:#17212d; }
	.school img { width:14mm; height:14mm; object-fit:contain; }
	.school strong { display:block; font-size:9pt; line-height:1.2; overflow-wrap:anywhere; }
	.school span { display:block; font-size:7.5pt; margin-top:2mm; }
	h1 { font-size:24pt; line-height:1; color:var(--value); margin:0 0 2mm; }
	.heading p { font-size:15pt; line-height:1.18; font-weight:700; margin:0; color:var(--value); overflow-wrap:anywhere; text-transform:uppercase; }
	.heading p span { color:var(--ink); }
	.content { flex:1; min-height:0; display:grid; grid-template-columns:72mm minmax(0,1fr) minmax(0,1fr); grid-template-rows:auto auto auto; column-gap:5mm; row-gap:4mm; align-items:start; align-content:start; }
	.column { display:flex; flex-direction:column; gap:4mm; min-width:0; min-height:0; }
	.student-panel { grid-column:2; grid-row:1; }
	.parents-panel { grid-column:2; grid-row:2; }
	.equipment-panel { grid-column:2; grid-row:3; align-self:stretch; }
	.side-column { grid-column:3; grid-row:1/4; align-self:stretch; }
	.panel { border:.45mm solid var(--ink); border-radius:2mm; padding:3mm 2.5mm 2.5mm; position:relative; min-width:0; flex:none; }
	.panel h2 { display:table; max-width:100%; margin:-5.5mm 0 2mm; padding:1.2mm 2mm; background:#ffd138; color:#17212d; border-radius:1.5mm; font-size:8.5pt; line-height:1.1; }
	dl { margin:0; }
	.row { display:grid; grid-template-columns:minmax(0,46%) minmax(0,54%); gap:1mm; padding:.65mm 0; font-size:8pt; line-height:1.22; }
	dt { font-weight:700; margin:0; overflow-wrap:anywhere; }
	dd { margin:0; color:var(--value); font-weight:700; overflow-wrap:anywhere; white-space:pre-wrap; }
	.note-panel { flex:1; min-height:12mm; }
	.notes { font-size:8pt; line-height:1.28; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font-weight:700; }
	.photo-column { grid-column:1; grid-row:1/3; min-width:0; min-height:0; display:flex; flex-direction:column; gap:3mm; }
	.photos { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:3mm; min-height:0; }
	figure { margin:0; min-width:0; display:flex; flex-direction:column; min-height:0; }
	figure img,.missing { display:block; width:100%; height:auto; aspect-ratio:3/4; flex:none; min-height:0; object-fit:contain; border-radius:1.5mm; background:#fff; }
	.missing { display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; border:.3mm dashed #aabdd5; color:#56677b; font-size:8pt; }
	figcaption { font-size:7pt; text-align:center; line-height:1.2; padding-top:1mm; }
	.student-photos,.family-photos { flex:none; }
	.photo-title { margin:0; color:var(--value); font-size:10pt; line-height:1.2; }
	.housing { grid-column:1; grid-row:3; min-width:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:2mm; }
	.housing>div { border:.4mm solid var(--ink); border-radius:1.5mm; padding:2mm 1mm; text-align:center; }
	.housing strong { display:block; font-size:6.5pt; line-height:1.2; }
	.housing span { display:block; margin-top:1.5mm; font-size:7pt; color:var(--value); font-weight:700; overflow-wrap:anywhere; }
	footer { flex:none; display:flex; justify-content:space-between; gap:3mm; font-size:6.5pt; line-height:1; }
	</style></head><body>${pages}</body></html>`;
}
