import fs from 'node:fs/promises';
import path from 'node:path';
import { dataRoot, defaultDataRoot } from '$lib/server/data-dirs';
import { envFilePath, updateEnvFile } from '$lib/server/env-file';

export function normalizeStoragePath(value: string) {
	const trimmed = value.trim().replace(/^file:/, '');
	if (!trimmed) return defaultDataRoot();
	if (!path.isAbsolute(trimmed)) throw new Error('Lokasi penyimpanan harus berupa path absolut.');
	return path.normalize(trimmed);
}

async function copyMissing(src: string, dest: string): Promise<number> {
	let entries;
	try { entries = await fs.readdir(src, { withFileTypes: true }); } catch { return 0; }
	await fs.mkdir(dest, { recursive: true });
	let copied = 0;
	for (const entry of entries) {
		const from = path.join(src, entry.name);
		const to = path.join(dest, entry.name);
		if (entry.isDirectory()) copied += await copyMissing(from, to);
		else if (entry.isFile()) {
			try { await fs.access(to); } catch { await fs.copyFile(from, to); copied += 1; }
		}
	}
	return copied;
}

export async function getStorageInfo() {
	return { dataRoot: dataRoot(), defaultDataRoot: defaultDataRoot(), envFile: envFilePath() };
}

export async function saveStorageRoot(value: string) {
	const current = dataRoot();
	const next = normalizeStoragePath(value);
	await fs.mkdir(next, { recursive: true });
	const copied = path.resolve(current) === path.resolve(next) ? 0 : await copyMissing(current, next);
	await updateEnvFile({ KAGANGA_DATA_DIR: next, photo: `file:${path.join(next, 'uploads')}`, sounds: `file:${path.join(next, 'sounds')}` });
	return { next, copied };
}
