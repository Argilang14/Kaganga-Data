import { error } from '@sveltejs/kit';
import { getBrowser } from './pagedpdf';

// Fixed posters use Chromium's native page breaks; no shared cache of private profiles.
export async function renderStudentInformationPDF(html: string) {
	const page = await (await getBrowser()).newPage();
	try {
		await page.setRequestInterception(true);
		page.on('request', (request) => {
			if (request.url().startsWith('data:') || request.url() === 'about:blank')
				void request.continue();
			else void request.abort();
		});
		await page.emulateMediaType('print');
		await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
		const fits = await page.evaluate(async () => {
			await document.fonts.ready;
			const broken = [...document.images].some(
				(image) => !image.complete || image.naturalWidth === 0
			);
			const overflow = [
				...document.querySelectorAll('.poster,.panel,.column,.photo-column,.heading,.housing>div')
			].some(
				(element) =>
					element.scrollHeight > element.clientHeight + 2 ||
					element.scrollWidth > element.clientWidth + 2
			);
			return { broken, overflow };
		});
		if (fits.broken)
			error(
				422,
				'Ada gambar yang tidak dapat dibaca. Perbarui foto atau background lalu coba lagi.'
			);
		if (fits.overflow)
			error(
				422,
				'Isi profil terlalu panjang untuk satu halaman A4. Ringkas isian panjang pada Informasi Tambahan, atau cetak satu murid untuk memeriksa datanya.'
			);
		return await page.pdf({
			format: 'A4',
			landscape: true,
			preferCSSPageSize: true,
			printBackground: true,
			timeout: 60000
		});
	} finally {
		await page.close();
	}
}
