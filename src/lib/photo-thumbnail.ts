const THUMBNAIL_MAX_EDGE = 240;

export async function createPhotoThumbnail(file: File) {
	const bitmap = await createImageBitmap(file);
	try {
		const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas foto tidak tersedia.');

		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
		context.drawImage(bitmap, 0, 0, width, height);
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(result) => (result ? resolve(result) : reject(new Error('Thumbnail gagal dibuat.'))),
				'image/jpeg',
				0.78
			);
		});
		return new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
	} finally {
		bitmap.close();
	}
}
