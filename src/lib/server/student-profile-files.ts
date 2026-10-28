import { createClient, type Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadsDir } from './data-dirs.ts';

export function profileFilePath(
	school: number,
	key: string,
	root = path.join(uploadsDir(), 'murid-profil')
) {
	if (!Number.isSafeInteger(school) || school < 1) return null;
	const match =
		/^sekolah-([1-9][0-9]*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/.exec(
			key
		);
	if (!match || Number(match[1]) !== school) return null;
	return path.resolve(root, ...key.split('/'));
}

export async function profileFileRows(client: Client, schema = 'main') {
	if (!['main', 'kaganga_restore'].includes(schema)) throw new Error('Skema tidak valid.');
	const tables = await client.execute(
		`SELECT name FROM ${schema}.sqlite_master WHERE type='table' AND name='murid_profil_foto'`
	);
	if (!tables.rows.length) return [];
	return (
		await client.execute(
			`SELECT sekolah_id, storage_key, ukuran_bytes, sha256 FROM ${schema}.murid_profil_foto`
		)
	).rows;
}

// Check against the snapshot, not live metadata that can change during a backup.
export async function backupStudentProfileFiles(backupPath: string) {
	const snapshot = createClient({ url: `file:${backupPath}` });
	try {
		const rows = await profileFileRows(snapshot);
		if (!rows.length) return;
		const root = `${backupPath}.murid-profil`;
		await mkdir(root, { recursive: true });
		for (const row of rows) {
			const source = profileFilePath(Number(row.sekolah_id), String(row.storage_key));
			const target = profileFilePath(Number(row.sekolah_id), String(row.storage_key), root);
			if (!source || !target)
				throw new Error('Lokasi dokumentasi murid tidak valid; backup dibatalkan.');
			const bytes = await readFile(source);
			if (
				bytes.length !== Number(row.ukuran_bytes) ||
				createHash('sha256').update(bytes).digest('hex') !== row.sha256
			)
				throw new Error(
					'Dokumentasi murid hilang atau berubah; periksa penyimpanan sebelum backup.'
				);
			await mkdir(path.dirname(target), { recursive: true });
			await copyFile(source, target);
		}
		await writeFile(
			`${backupPath}.murid-profil.json`,
			JSON.stringify({ version: 1, files: rows }, null, 2),
			{ flag: 'wx' }
		);
	} finally {
		snapshot.close();
	}
}

export async function verifyStudentProfileFiles(client: Client, schema = 'main') {
	const rows = await profileFileRows(client, schema);
	for (const row of rows) {
		const file = profileFilePath(Number(row.sekolah_id), String(row.storage_key));
		if (!file) throw new Error('Lokasi dokumentasi murid pada backup tidak valid.');
		try {
			const info = await stat(file);
			if (!info.isFile() || info.size !== Number(row.ukuran_bytes)) throw new Error('size');
			const hash = createHash('sha256')
				.update(await readFile(file))
				.digest('hex');
			if (hash !== row.sha256) throw new Error('hash');
		} catch {
			throw new Error(
				'Foto profil murid pada backup belum tersedia. Pulihkan folder .murid-profil ke folder unggahan murid-profil sebelum memulihkan database.'
			);
		}
	}
}
