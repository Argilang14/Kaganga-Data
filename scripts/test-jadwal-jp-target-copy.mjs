#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { JADWAL_TARGET_JP_SCHEMA } = await import(
	'../src/lib/server/db/jadwal-target-jp-schema' + '.ts'
);

const sourceUrl = process.env.DB_URL || 'file:./data/database.sqlite3';
if (!sourceUrl.startsWith('file:')) {
	throw new Error('Pengujian target JP hanya mendukung database SQLite lokal.');
}

const directory = await mkdtemp(path.join(tmpdir(), 'kaganga-jadwal-jp-copy-'));
const targetPath = path.join(directory, 'database.sqlite3');
const source = createClient({ url: sourceUrl });
let qa;

try {
	const quotedTarget = targetPath.replaceAll('\\', '/').replaceAll("'", "''");
	await source.execute(`VACUUM INTO '${quotedTarget}'`);
	await source.close();

	qa = createClient({ url: `file:${targetPath}` });
	const count = async (table) =>
		Number((await qa.execute(`SELECT COUNT(*) AS total FROM ${table}`)).rows[0]?.total ?? 0);
	const before = {
		sekolah: await count('sekolah'),
		kelas: await count('kelas'),
		mapel: await count('jadwal_mata_pelajaran'),
		jadwal: await count('jadwal_pelajaran')
	};

	for (let run = 0; run < 2; run += 1) {
		for (const statement of JADWAL_TARGET_JP_SCHEMA) await qa.execute(statement);
	}

	const after = {
		sekolah: await count('sekolah'),
		kelas: await count('kelas'),
		mapel: await count('jadwal_mata_pelajaran'),
		jadwal: await count('jadwal_pelajaran')
	};
	const quickCheck = String((await qa.execute('PRAGMA quick_check')).rows[0]?.quick_check ?? '');
	const foreignKeyIssues = (await qa.execute('PRAGMA foreign_key_check')).rows.length;
	const indexes = (
		await qa.execute(
			`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jadwal_target_jp' ORDER BY name`
		)
	).rows.map((row) => String(row.name));

	const result = { before, after, quickCheck, foreignKeyIssues, indexes };
	if (JSON.stringify(before) !== JSON.stringify(after)) {
		throw new Error(`Jumlah data utama berubah: ${JSON.stringify(result)}`);
	}
	if (quickCheck !== 'ok' || foreignKeyIssues || indexes.length !== 4) {
		throw new Error(`Validasi snapshot gagal: ${JSON.stringify(result)}`);
	}
	console.log(JSON.stringify(result, null, 2));
} finally {
	try {
		await source.close();
	} catch {
		// Koneksi sumber sudah ditutup setelah VACUUM INTO.
	}
	if (qa) {
		try {
			await qa.close();
		} catch {
			// Pembersihan folder sementara tetap dilanjutkan.
		}
	}
	await new Promise((resolve) => setTimeout(resolve, 250));
	await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
