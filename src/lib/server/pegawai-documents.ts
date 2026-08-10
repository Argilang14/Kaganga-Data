import fs from 'node:fs/promises';
import path from 'node:path';

export const PEGAWAI_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
export const PEGAWAI_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export function pegawaiDocumentsDir() {
	const configured = process.env.photo || 'file:./data/uploads';
	const raw = configured.startsWith('file:') ? configured.slice(5) : configured;
	return path.resolve(raw, 'pegawai-documents');
}

export function safeDocumentFilename(value: string | null | undefined) {
	return value && path.basename(value) === value ? value : null;
}

function supportedSignature(buffer: Buffer, mimeType: string) {
	if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
	if (mimeType === 'image/png') {
		return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	}
	return mimeType === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8;
}

export async function validatePegawaiDocument(file: File) {
	if (
		!PEGAWAI_DOCUMENT_MIME_TYPES.includes(file.type as (typeof PEGAWAI_DOCUMENT_MIME_TYPES)[number])
	) {
		throw new Error('Dokumen harus berformat PDF, JPG, atau PNG.');
	}
	if (!file.size || file.size > PEGAWAI_DOCUMENT_MAX_BYTES) {
		throw new Error('Ukuran dokumen maksimal 2 MB.');
	}
	const buffer = Buffer.from(await file.arrayBuffer());
	if (!supportedSignature(buffer, file.type)) throw new Error('Isi file dokumen tidak valid.');
	const extension =
		file.type === 'application/pdf' ? '.pdf' : file.type === 'image/png' ? '.png' : '.jpg';
	return { buffer, extension, mimeType: file.type, size: file.size };
}

export async function storePegawaiDocument(pegawaiId: number, file: File) {
	const validated = await validatePegawaiDocument(file);
	const directory = pegawaiDocumentsDir();
	await fs.mkdir(directory, { recursive: true });
	const filename = `pegawai-${pegawaiId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${validated.extension}`;
	const temporaryPath = path.join(directory, `${filename}.tmp`);
	const finalPath = path.join(directory, filename);
	try {
		await fs.writeFile(temporaryPath, validated.buffer, { mode: 0o644, flag: 'wx' });
		await fs.rename(temporaryPath, finalPath);
		return { filename, mimeType: validated.mimeType, size: validated.size };
	} catch (error) {
		await fs.unlink(temporaryPath).catch(() => undefined);
		await fs.unlink(finalPath).catch(() => undefined);
		throw error;
	}
}

export async function removePegawaiDocument(filename: string | null | undefined) {
	const safe = safeDocumentFilename(filename);
	if (safe) await fs.unlink(path.join(pegawaiDocumentsDir(), safe)).catch(() => undefined);
}

export async function readPegawaiDocument(filename: string) {
	const safe = safeDocumentFilename(filename);
	if (!safe) throw new Error('Nama berkas dokumen tidak valid.');
	return fs.readFile(path.join(pegawaiDocumentsDir(), safe));
}
