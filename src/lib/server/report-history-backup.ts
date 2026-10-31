import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function fileSha256(filename: string) {
	const digest = createHash('sha256');
	for await (const bytes of createReadStream(filename)) digest.update(bytes);
	return digest.digest('hex');
}

type BackupFile = { root: number; relativePath: string; bytes: number; sha256: string };
function child(root: string, relative: string) {
	const full = path.resolve(root, relative);
	if (!full.startsWith(path.resolve(root) + path.sep))
		throw new Error('Lokasi berkas keluar dari folder backup.');
	return full;
}

// A new directory per run; never overwrite a backup or remove source files.
export async function createReportHistoryBackup(options: {
	database: string;
	directory: string;
	uploads: string[];
}) {
	const sourcePath = path.resolve(options.database),
		directory = path.resolve(options.directory);
	if (!(await lstat(sourcePath)).isFile()) throw new Error('Sumber SQLite tidak valid.');
	for (const root of options.uploads) {
		if (directory === path.resolve(root) || directory.startsWith(path.resolve(root) + path.sep))
			throw new Error('Backup tidak boleh berada di dalam folder unggahan sumber.');
	}
	await mkdir(directory, { recursive: false });
	const database = child(directory, 'database.sqlite3');
	const source = createClient({ url: `file:${sourcePath}` });
	try {
		await source.execute('PRAGMA busy_timeout=10000');
		await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
	} finally {
		source.close();
	}
	const snapshot = createClient({ url: `file:${database}` });
	try {
		await snapshot.execute('PRAGMA query_only=ON');
		const check = await snapshot.execute('PRAGMA integrity_check');
		if (check.rows.some((row) => row.integrity_check !== 'ok'))
			throw new Error('Snapshot database gagal integrity check.');
	} finally {
		snapshot.close();
	}
	const files: BackupFile[] = [];
	const roots: { index: number; source: string; exists: boolean }[] = [];
	for (const [index, configured] of [
		...new Set(options.uploads.map((v) => path.resolve(v)))
	].entries()) {
		let info;
		try {
			info = await lstat(configured);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		roots.push({ index, source: configured, exists: !!info });
		if (!info) continue;
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new Error('Folder unggahan harus direktori biasa, bukan symlink/junction.');
		const targetRoot = child(directory, `uploads-${index}`);
		await mkdir(targetRoot);
		async function copyTree(relative = '') {
			const current = relative ? child(configured, relative) : configured;
			for (const entry of await readdir(current, { withFileTypes: true })) {
				const name = path.join(relative, entry.name),
					from = child(configured, name),
					to = child(targetRoot, name);
				if (entry.isSymbolicLink())
					throw new Error('Symlink di folder unggahan harus diperiksa sebelum backup.');
				if (entry.isDirectory()) {
					await mkdir(to);
					await copyTree(name);
				} else if (entry.isFile()) {
					const before = await fileSha256(from);
					await copyFile(from, to);
					const after = await fileSha256(from),
						copied = await fileSha256(to);
					if (before !== after || before !== copied)
						throw new Error('Berkas berubah selama backup. Ulangi saat tidak ada unggahan.');
					files.push({
						root: index,
						relativePath: name.split(path.sep).join('/'),
						bytes: (await lstat(to)).size,
						sha256: copied
					});
				} else throw new Error('Jenis berkas unggahan tidak didukung.');
			}
		}
		await copyTree();
	}
	const referenceClient = createClient({ url: `file:${database}` });
	const references: { table: string; id: number | string; relativePath: string; status: string }[] =
		[];
	try {
		await referenceClient.execute('PRAGMA query_only=ON');
		const tables = new Set(
			(await referenceClient.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(
				(r) => String(r.name)
			)
		);
		for (const spec of [
			{ table: 'murid', field: 'foto', prefix: '' },
			{ table: 'pegawai', field: 'foto', prefix: 'pegawai/' },
			{ table: 'pegawai_dokumen', field: 'file_path', prefix: 'pegawai-documents/' },
			{ table: 'document_attachment', field: 'stored_path', prefix: 'attachments/' },
			{ table: 'murid_profil_foto', field: 'storage_key', prefix: 'murid-profil/' },
			{ table: 'rapor_arsip', field: 'storage_key', prefix: 'rapor-arsip/' },
			{ table: 'rapor_arsip_revisi', field: 'storage_key', prefix: 'rapor-arsip/' },
			{ table: 'rapor_martikulasi_arsip', field: 'storage_key', prefix: 'rapor-arsip/' },
			{ table: 'rapor_martikulasi_revisi', field: 'storage_key', prefix: 'rapor-arsip/' }
		]) {
			if (!tables.has(spec.table)) continue;
			const fields = new Set(
				(await referenceClient.execute(`PRAGMA table_info("${spec.table}")`)).rows.map((r) =>
					String(r.name)
				)
			);
			if (!fields.has(spec.field)) continue;
			const rows = (
				await referenceClient.execute(
					`SELECT * FROM "${spec.table}" WHERE "${spec.field}" IS NOT NULL AND length(trim("${spec.field}"))>0`
				)
			).rows;
			for (const row of rows) {
				const value = String(row[spec.field]).replaceAll('\\', '/');
				const relativePath = spec.prefix + value;
				const unsafe =
					value.startsWith('/') ||
					value.split('/').includes('..') ||
					value.includes(':') ||
					((spec.field === 'foto' || spec.field === 'file_path') && value.includes('/'));
				const matches = files.filter((file) => file.relativePath === relativePath);
				const expectedHash = row.sha256 ? String(row.sha256) : null;
				const expectedSize = row.size_bytes ?? row.ukuran_bytes ?? row.ukuran;
				const matching = matches.some(
					(file) =>
						(!expectedHash || file.sha256 === expectedHash) &&
						(expectedSize === null ||
							expectedSize === undefined ||
							file.bytes === Number(expectedSize))
				);
				references.push({
					table: spec.table,
					id: typeof row.id === 'number' ? row.id : String(row.id),
					relativePath,
					status: unsafe ? 'unsafe' : !matches.length ? 'missing' : matching ? 'ok' : 'mismatch'
				});
			}
		}
	} finally {
		referenceClient.close();
	}
	const manifest = {
		version: 1,
		createdAt: new Date().toISOString(),
		sourceDatabase: sourcePath,
		databaseSha256: await fileSha256(database),
		roots,
		files,
		references,
		complete: references.every((reference) => reference.status === 'ok'),
		note: 'Snapshot SQLite konsisten; berkas disalin dan diperiksa hash. Unggahan bersamaan setelah snapshot perlu backup ulang sebelum pemulihan produksi.'
	};
	await writeFile(child(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), {
		flag: 'wx'
	});
	return { database, directory, manifest };
}

export async function restoreReportHistoryBackup(directory: string, target: string) {
	const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as {
		version: number;
		databaseSha256: string;
		roots: { index: number; source: string; exists: boolean }[];
		files: BackupFile[];
	};
	if (manifest.version !== 1) throw new Error('Versi manifest backup tidak didukung.');
	const database = child(directory, 'database.sqlite3');
	if ((await fileSha256(database)) !== manifest.databaseSha256)
		throw new Error('Checksum database backup berbeda.');
	await mkdir(target, { recursive: false });
	await copyFile(database, child(target, 'database.sqlite3'));
	for (const root of manifest.roots) {
		if (!Number.isSafeInteger(root.index) || root.index < 0)
			throw new Error('Indeks folder backup tidak valid.');
		if (root.exists) await mkdir(child(target, `uploads-${root.index}`));
	}
	for (const file of manifest.files) {
		if (!manifest.roots.some((root) => root.index === file.root && root.exists))
			throw new Error('Root berkas backup tidak dikenal.');
		const from = child(child(directory, `uploads-${file.root}`), file.relativePath),
			to = child(child(target, `uploads-${file.root}`), file.relativePath);
		if ((await fileSha256(from)) !== file.sha256 || (await lstat(from)).size !== file.bytes)
			throw new Error('Checksum lampiran backup berbeda.');
		await mkdir(path.dirname(to), { recursive: true });
		await copyFile(from, to);
		if ((await fileSha256(to)) !== file.sha256)
			throw new Error('Lampiran pada salinan pengujian tidak cocok.');
	}
	if ((await fileSha256(child(target, 'database.sqlite3'))) !== manifest.databaseSha256)
		throw new Error('Salinan SQLite tidak cocok.');
	return { database: child(target, 'database.sqlite3'), files: manifest.files.length };
}
