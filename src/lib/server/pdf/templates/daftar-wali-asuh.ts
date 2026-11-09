import type { RosterOptions, RosterStudent } from '$lib/caregiver-roster';
import {
	renderSchoolLetterhead,
	schoolLetterheadStyles,
	type SchoolLetterheadData
} from './school-letterhead';

const esc = (value: unknown) =>
	String(value ?? '').replace(/[&<>"']/g, (char) => '&#' + char.charCodeAt(0) + ';');
export function renderCaregiverRosterHTML(data: {
	school: SchoolLetterheadData;
	period: string;
	group: string;
	options: RosterOptions;
	students: RosterStudent[];
}) {
	const { students, options } = data;
	const titles = {
		kelas: 'DAFTAR MURID DAN WALI ASUH',
		asrama: 'DAFTAR NAMA WALI ASUH DAN ANAK ASUH',
		'wali-asuh': 'DAFTAR ANAK ASUH'
	};
	const table = (headers: string[], rows: string[][], widths: string[]) =>
		`<table><colgroup>${widths.map((w) => `<col style="width:${w}">`).join('')}</colgroup><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v, i) => `<td${i === 0 ? ' class="number"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
	let content: string;
	if (options.scope === 'asrama') {
		const groups = new Map<string, { name: string; children: RosterStudent[] }>();
		for (const child of students) {
			const key =
				child.waliAsuhId === null ? `unlinked:${child.waliAsuh}` : `employee:${child.waliAsuhId}`;
			const group = groups.get(key) ?? { name: child.waliAsuh, children: [] };
			group.children.push(child);
			groups.set(key, group);
		}
		const cards: string[] = [];
		for (const group of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'))) {
			// Short, independently paginated cards keep long rosters and wrapped names inside the page.
			for (let start = 0; start < group.children.length; start += 10) {
				cards.push(
					`<section class="caregiver-card"><div class="card-title"><strong>${esc(group.name)}${start ? ' (lanjutan)' : ''}</strong><span>${group.children.length} anak</span></div>${table(
						['No.', 'Nama anak', 'Kelas'],
						group.children
							.slice(start, start + 10)
							.map((child, i) => [String(start + i + 1), child.nama, child.kelas]),
						['9%', '64%', '27%']
					)}</section>`
				);
			}
		}
		content = `<p class="summary">${groups.size} kelompok wali asuh | ${students.length} anak asuh</p>`;
		for (let i = 0; i < cards.length; i += 2)
			content += `<div class="card-pair"><div>${cards[i]}</div><div>${cards[i + 1] ?? ''}</div></div>`;
	} else if (options.scope === 'kelas') {
		content = table(
			['No.', 'Nama murid', 'NIS', 'Asrama', 'Wali asuh'],
			students.map((s, i) => [String(i + 1), s.nama, s.nis, s.asrama, s.waliAsuh]),
			['6%', '30%', '14%', '22%', '28%']
		);
	} else {
		content = table(
			['No.', 'Nama anak', 'Kelas', 'Wali kelas'],
			students.map((s, i) => [String(i + 1), s.nama, s.kelas, s.waliKelas]),
			['7%', '38%', '20%', '35%']
		);
	}
	return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${titles[options.scope]}</title><style>
	@page{size:A4 portrait;margin:12mm 12mm 15mm;@bottom-right{content:"Halaman " counter(page) " dari " counter(pages);font:8pt Arial}}
	*{box-sizing:border-box}body{margin:0;font:10pt Arial,Helvetica,sans-serif;color:#111} ${schoolLetterheadStyles()}
	h1{font-size:13pt;text-align:center;margin:0 0 2mm} .period{text-align:center;margin:0 0 3mm;font-size:10pt}.group{text-align:center;border:1px solid #555;padding:2mm;margin:0 0 4mm;font-weight:bold} .summary{text-align:center;font-size:9pt;margin:0 0 3mm}
	table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #777;padding:2mm;vertical-align:top;overflow-wrap:anywhere;line-height:1.3}th{background:#eee;font-weight:bold;text-align:center}thead{display:table-header-group}tr{break-inside:avoid}.number{text-align:center}
	.card-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4mm;margin-bottom:4mm;break-inside:avoid}.caregiver-card{border:1px solid #555;break-inside:avoid}.card-title{display:flex;justify-content:space-between;gap:2mm;background:#e9e9e9;padding:2mm;font-size:9pt}.card-title strong{min-width:0;overflow-wrap:anywhere}.card-title span{white-space:nowrap}.caregiver-card table{font-size:8.5pt}.caregiver-card th,.caregiver-card td{padding:1.5mm;border-left:0;border-right:0}.caregiver-card tr:last-child td{border-bottom:0}
	</style></head><body>${renderSchoolLetterhead(data.school, true)}<h1>${titles[options.scope]}</h1><p class="period">${esc(data.period)}</p><p class="group">${options.scope === 'kelas' ? 'Kelas' : options.scope === 'asrama' ? 'Asrama' : 'Wali asuh'}: ${esc(data.group)}</p>${options.scope !== 'asrama' ? `<p class="summary">${students.length} murid</p>` : ''}${content}</body></html>`;
}
