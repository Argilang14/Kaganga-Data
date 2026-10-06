import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_SIGNATURE_BYTES = 350 * 1024;
const PNG_PREFIX = 'data:image/png;base64,';
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

function signatureDirectory() {
	const configured = process.env.photo || 'file:./data/uploads';
	const raw = configured.startsWith('file:') ? configured.slice(5) : configured;
	return path.resolve(raw, 'buku-tamu-signatures');
}

function safeFilename(value: string | null | undefined) {
	return value && SAFE_FILENAME.test(value) && path.basename(value) === value ? value : null;
}

export async function saveBukuTamuSignature(dataUrl: string) {
	if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error('Format tanda tangan harus PNG.');
	const buffer = Buffer.from(dataUrl.slice(PNG_PREFIX.length), 'base64');
	if (!buffer.length || buffer.length > MAX_SIGNATURE_BYTES) {
		throw new Error('Ukuran tanda tangan tidak valid atau melebihi 350 KB.');
	}
	if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
		throw new Error('Isi gambar tanda tangan tidak valid.');
	}
	const filename = `tamu-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;
	const directory = signatureDirectory();
	await fs.mkdir(directory, { recursive: true });
	const temporaryPath = path.join(directory, `${filename}.tmp`);
	const finalPath = path.join(directory, filename);
	try {
		await fs.writeFile(temporaryPath, buffer, { flag: 'wx', mode: 0o644 });
		await fs.rename(temporaryPath, finalPath);
		return filename;
	} catch (error) {
		await fs.unlink(temporaryPath).catch(() => undefined);
		await fs.unlink(finalPath).catch(() => undefined);
		throw error;
	}
}

export async function readBukuTamuSignature(filename: string | null | undefined) {
	const safe = safeFilename(filename);
	if (!safe) return null;
	try {
		return await fs.readFile(path.join(signatureDirectory(), safe));
	} catch {
		return null;
	}
}

export async function removeBukuTamuSignature(filename: string | null | undefined) {
	const safe = safeFilename(filename);
	if (safe) await fs.unlink(path.join(signatureDirectory(), safe)).catch(() => undefined);
}

export async function bukuTamuSignatureDataUrl(filename: string | null | undefined) {
	const buffer = await readBukuTamuSignature(filename);
	return buffer ? `${PNG_PREFIX}${buffer.toString('base64')}` : null;
}
