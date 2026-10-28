import { error } from '@sveltejs/kit';
import { getBrowser } from './pdf/pagedpdf';
import { MAX_STUDENT_PROFILE_PHOTO_BYTES } from './murid-profile-storage';

let validating = false;

export async function normalizeStudentProfileImage(file: File) {
	if (!file.size || file.size > MAX_STUDENT_PROFILE_PHOTO_BYTES)
		error(400, 'Foto harus berukuran 1 byte sampai 5 MB. Pilih foto yang lebih kecil.');
	const bytes = Buffer.from(await file.arrayBuffer());
	const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
		? 'image/png'
		: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
			? 'image/jpeg'
			: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
				? 'image/webp'
				: null;
	if (!mime || mime !== file.type)
		error(400, 'Isi foto tidak sesuai. Pilih gambar JPG, PNG, atau WebP yang valid.');
	if (validating) error(429, 'Foto lain sedang diproses. Tunggu sebentar lalu unggah kembali.');
	validating = true;
	let page: Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>['newPage']>> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		page = await (await getBrowser()).newPage();
		await page.setContent(
			'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:">'
		);
		const result = await Promise.race([
			page.evaluate(
				async ({ base64, mime }) => {
					const binary = atob(base64);
					const blob = new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], { type: mime });
					const image = await createImageBitmap(blob);
					try {
						if (image.width > 8000 || image.height > 8000 || image.width * image.height > 32000000)
							return null;
						const ratio = Math.min(1, 1800 / Math.max(image.width, image.height));
						const canvas = document.createElement('canvas');
						canvas.width = Math.max(1, Math.round(image.width * ratio));
						canvas.height = Math.max(1, Math.round(image.height * ratio));
						const ctx = canvas.getContext('2d')!;
						ctx.fillStyle = '#ffffff';
						ctx.fillRect(0, 0, canvas.width, canvas.height);
						ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
						return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
					} finally {
						image.close();
					}
				},
				{ base64: bytes.toString('base64'), mime }
			),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('timeout')), 10000);
				timer.unref();
			})
		]);
		if (!result)
			error(
				400,
				'Dimensi foto terlalu besar. Gunakan foto maksimal 8.000 piksel dan 32 megapiksel.'
			);
		return Buffer.from(result, 'base64');
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
		if (!page)
			error(
				503,
				'Pengolahan foto di server belum tersedia. Hubungi admin untuk memeriksa Chrome atau Edge.'
			);
		error(
			400,
			'Foto tidak dapat dibaca. Simpan ulang sebagai JPG, PNG, atau WebP, lalu coba lagi.'
		);
	} finally {
		clearTimeout(timer);
		validating = false;
		await page?.close();
	}
}
