import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadsDir } from '$lib/server/data-dirs';

export type PhotoKind = 'murid' | 'pegawai';

export function safePhotoFilename(value: string | null | undefined) {
	return value && path.basename(value) === value ? value : null;
}

export function photoDirectory(kind: PhotoKind) {
	return kind === 'murid' ? uploadsDir() : path.join(uploadsDir(), 'pegawai');
}

export function thumbnailDirectory(kind: PhotoKind) {
	return path.join(uploadsDir(), 'thumbnails', kind);
}

export function thumbnailFilename(originalFilename: string) {
	return `${originalFilename}.jpg`;
}

export function isSupportedPhoto(buffer: Buffer, mimeType: string) {
	if (mimeType === 'image/png') {
		return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	}
	return mimeType === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8;
}

export async function writePhotoThumbnail(kind: PhotoKind, originalFilename: string, file: File) {
	if (file.type !== 'image/jpeg' || !file.size || file.size > 150 * 1024) return false;
	const buffer = Buffer.from(await file.arrayBuffer());
	if (!isSupportedPhoto(buffer, file.type)) return false;
	const directory = thumbnailDirectory(kind);
	const filename = thumbnailFilename(originalFilename);
	const finalPath = path.join(directory, filename);
	const temporaryPath = `${finalPath}.${process.pid}.tmp`;
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(temporaryPath, buffer, { mode: 0o644 });
	await fs.rename(temporaryPath, finalPath).catch(async (error) => {
		await fs.unlink(finalPath).catch(() => undefined);
		await fs.rename(temporaryPath, finalPath).catch(() => {
			throw error;
		});
	});
	return true;
}

export async function removePhotoFiles(kind: PhotoKind, filename: string | null | undefined) {
	const safe = safePhotoFilename(filename);
	if (!safe) return;
	await Promise.all([
		fs.unlink(path.join(photoDirectory(kind), safe)).catch(() => undefined),
		fs.unlink(path.join(thumbnailDirectory(kind), thumbnailFilename(safe))).catch(() => undefined)
	]);
}
