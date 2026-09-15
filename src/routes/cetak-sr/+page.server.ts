import { redirect } from '@sveltejs/kit';
import { generalPrintDocuments } from '$lib/school-print-format';
export function load({ url }: { url: URL }) {
	const params = new URLSearchParams(url.search);
	params.delete('sr');
	const isGeneral = generalPrintDocuments.some((doc) => doc === params.get('dokumen'));
	redirect(303, `${isGeneral ? '/cetak' : '/cetak-raport'}${params.size ? `?${params}` : ''}`);
}
