import fs from 'node:fs/promises';
import path from 'node:path';

const SAFE_FILE = /^[A-Za-z0-9._-]+$/;

function uploadRoot() {
	const configured = process.env.photo || 'file:./data/uploads';
	const base = configured.startsWith('file:') ? configured.slice(5) : configured;
	return path.resolve(base, 'dinas-luar');
}

export function sanitizeUploadName(value: string) {
	return (
		value
			.trim()
			.replace(/[^A-Za-z0-9._-]+/g, '_')
			.replace(/^[._-]+|[._-]+$/g, '')
			.slice(0, 80) || 'file'
	);
}

function resolveStoredPath(relativePath: string) {
	if (!relativePath || relativePath.includes('..') || relativePath.includes('\\')) return null;
	const parts = relativePath.split('/');
	if (parts.length < 2 || parts.some((part) => !SAFE_FILE.test(part))) return null;
	const root = uploadRoot();
	const resolved = path.resolve(root, ...parts);
	return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function save(relativeDirectory: string, filename: string, buffer: Buffer) {
	const safeName = sanitizeUploadName(filename);
	const relativePath = `${relativeDirectory}/${safeName}`;
	const target = resolveStoredPath(relativePath);
	if (!target || !buffer.length) throw new Error('Berkas tidak valid.');
	await fs.mkdir(path.dirname(target), { recursive: true });
	const temporary = `${target}.${crypto.randomUUID()}.tmp`;
	await fs.writeFile(temporary, buffer, { mode: 0o600, flag: 'wx' });
	await fs.rename(temporary, target);
	return relativePath;
}

export function saveUndanganFile(sekolahId: number, filename: string, buffer: Buffer) {
	return save(`sekolah-${sekolahId}/undangan`, filename, buffer);
}

export function saveBuktiFile(sekolahId: number, sppdId: number, filename: string, buffer: Buffer) {
	return save(`sekolah-${sekolahId}/sppd-${sppdId}`, filename, buffer);
}

export async function readDinasLuarFile(relativePath: string) {
	const target = resolveStoredPath(relativePath);
	if (!target) return null;
	try {
		return await fs.readFile(target);
	} catch {
		return null;
	}
}

export async function deleteDinasLuarFile(relativePath: string | null | undefined) {
	if (!relativePath) return;
	const target = resolveStoredPath(relativePath);
	if (target) await fs.unlink(target).catch(() => undefined);
}
