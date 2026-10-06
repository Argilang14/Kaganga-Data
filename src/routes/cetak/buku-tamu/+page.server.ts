import { redirect } from '@sveltejs/kit';
export function load({ url }: { url: URL }) {
	const params = new URLSearchParams(url.search);
	params.set('dokumen', 'buku-tamu');
	redirect(303, `/cetak?${params}`);
}
