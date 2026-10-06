import { nauganLabelByKey, type NauganKey } from '../../../statics.ts';

export interface SchoolLetterheadData {
	naungan?: NauganKey | string | null;
	nama: string;
	alamat?: string | null;
	email?: string | null;
	logoUrl?: string | null;
	logoDinasUrl?: string | null;
}

const UNIT = 'Pusat Pendidikan, Pelatihan dan Pengembangan Profesi';
const esc = (value: string | null | undefined) =>
	String(value ?? '').replace(/[\x26\x3c\x3e\x22\x27]/g, (char) => '&#' + char.charCodeAt(0) + ';');

export const resolveNaunganLetterhead = (naungan?: NauganKey | string | null) => {
	const key: NauganKey = naungan === 'kemenag' || naungan === 'kemsos' ? naungan : 'kemendikbud';
	return nauganLabelByKey[key].toUpperCase();
};

const logo = (src: string | null | undefined, alt: string) =>
	`<div class="school-letterhead__logo">${src ? `<img src="${esc(src)}" alt="${esc(alt)}" />` : ''}</div>`;

export function renderSchoolLetterhead(data: SchoolLetterheadData, compact = false): string {
	const contact = [data.alamat?.trim(), data.email?.trim() ? `Email: ${data.email.trim()}` : null]
		.filter(Boolean)
		.join(' | ');
	return `<header class="school-letterhead${compact ? ' school-letterhead--compact' : ''}">
		${logo(data.logoDinasUrl, 'Logo kementerian atau pemerintah daerah')}
		<div class="school-letterhead__text"><div class="school-letterhead__authority">${esc(resolveNaunganLetterhead(data.naungan))}</div><div class="school-letterhead__unit">${UNIT}</div><div class="school-letterhead__school">${esc(data.nama)}</div>${contact ? `<div class="school-letterhead__contact">${esc(contact)}</div>` : ''}</div>
		${logo(data.logoUrl, 'Logo sekolah')}
	</header>`;
}

export function schoolLetterheadStyles(): string {
	return `
.school-letterhead{display:grid;grid-template-columns:25mm minmax(0,1fr) 25mm;align-items:center;gap:4mm;margin:0 0 5mm;padding:0 0 3mm;border-bottom:1.5px solid #111;color:#111;font-family:Arial,Helvetica,sans-serif}
.school-letterhead__logo{display:flex;width:25mm;height:22mm;align-items:center;justify-content:center}
.school-letterhead__logo img{display:block;max-width:22mm;max-height:22mm;object-fit:contain}
.school-letterhead__text{min-width:0;text-align:center;line-height:1.12}
.school-letterhead__authority{font-size:15pt;font-weight:800;text-transform:uppercase}
.school-letterhead__unit,.school-letterhead__school{margin-top:.6mm;font-size:12pt;font-weight:700}
.school-letterhead__school{font-weight:800;text-transform:uppercase}
.school-letterhead__contact{margin-top:1mm;font-size:7.5pt;line-height:1.25;overflow-wrap:anywhere}
.school-letterhead--compact{grid-template-columns:21mm minmax(0,1fr) 21mm;gap:3mm;margin-bottom:3mm;padding-bottom:2mm}
.school-letterhead--compact .school-letterhead__logo{width:21mm;height:18mm}
.school-letterhead--compact .school-letterhead__logo img{max-width:18mm;max-height:18mm}
.school-letterhead--compact .school-letterhead__authority{font-size:11pt}
.school-letterhead--compact .school-letterhead__unit,.school-letterhead--compact .school-letterhead__school{font-size:9pt}
.school-letterhead--compact .school-letterhead__contact{margin-top:.6mm;font-size:6.3pt}
`;
}
