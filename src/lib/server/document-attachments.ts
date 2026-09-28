import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
	'application/pdf': 'pdf',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};

function uploadRoot() {
	const configured = process.env.photo || 'file:./data/uploads';
	const base = configured.startsWith('file:') ? configured.slice(5) : configured;
	return path.resolve(base, 'attachments');
}

function hasZipSignature(buffer: Buffer) {
	return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2]);
}

export function detectAttachment(buffer: Buffer, declaredMime: string, originalName: string) {
	let mime: keyof typeof MIME_EXTENSION | null = null;
	if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') mime = 'application/pdf';
	else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) mime = 'image/jpeg';
	else if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';
	else if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
	else if (hasZipSignature(buffer) && originalName.toLowerCase().endsWith('.docx') && declaredMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') mime = declaredMime;
	else if (hasZipSignature(buffer) && originalName.toLowerCase().endsWith('.xlsx') && declaredMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') mime = declaredMime;
	if (!mime) return null;
	return { mime, extension: MIME_EXTENSION[mime] };
}

function resolveStoredPath(relativePath: string) {
	if (!/^[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/.test(relativePath) || relativePath.includes('..') || relativePath.includes('\\')) return null;
	const root = uploadRoot();
	const target = path.resolve(root, ...relativePath.split('/'));
	return target.startsWith(`${root}${path.sep}`) ? target : null;
}

export async function saveAttachment(sekolahId: number, buffer: Buffer, extension: string) {
	const year = new Date().getFullYear();
	const relativePath = `sekolah-${sekolahId}/${year}/${crypto.randomUUID()}.${extension}`;
	const target = resolveStoredPath(relativePath);
	if (!target) throw new Error('Lokasi berkas tidak valid.');
	await fs.mkdir(path.dirname(target), { recursive: true });
	const temporary = `${target}.${crypto.randomUUID()}.tmp`;
	await fs.writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
	await fs.rename(temporary, target);
	return { relativePath, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export async function readAttachment(relativePath: string) {
	const target = resolveStoredPath(relativePath);
	if (!target) return null;
	try { return await fs.readFile(target); } catch { return null; }
}

export async function deleteAttachment(relativePath: string) {
	const target = resolveStoredPath(relativePath);
	if (target) await fs.unlink(target).catch(() => undefined);
}
