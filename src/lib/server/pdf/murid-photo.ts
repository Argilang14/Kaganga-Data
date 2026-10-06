import { readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const MAX_PRINT_PHOTO_BYTES = 8 * 1024 * 1024;

function uploadsDir() {
	const configured = process.env.photo || 'file:./data/uploads';
	return resolve(configured.startsWith('file:') ? configured.slice(5) : configured);
}

export function readMuridPhotoDataUri(filename: string | null | undefined): string | null {
	if (!filename) return null;
	try {
		const baseDir = uploadsDir();
		const filePath = resolve(baseDir, filename);
		if (!filePath.startsWith(`${baseDir}${sep}`)) return null;
		if (statSync(filePath).size > MAX_PRINT_PHOTO_BYTES) return null;

		const mime =
			extname(filename).toLowerCase() === '.png'
				? 'image/png'
				: extname(filename).toLowerCase() === '.webp'
					? 'image/webp'
					: 'image/jpeg';
		return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
	} catch {
		return null;
	}
}
