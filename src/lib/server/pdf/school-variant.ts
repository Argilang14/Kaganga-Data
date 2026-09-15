import { error } from '@sveltejs/kit';
import { getSchoolPrintFormat } from '$lib/school-print-format';

export function resolveSchoolPdfVariant(docType: string, locals: App.Locals): 'sr' | 'default' {
	if (!['cover', 'biodata', 'rapor', 'piagam', 'keasramaan'].includes(docType)) return 'default';
	const format = getSchoolPrintFormat(locals.sekolah);
	if (!format) throw error(400, 'Jenis sekolah belum dikenali. Periksa jenjang pada Data Sekolah.');
	return format;
}
