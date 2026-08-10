#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { ensurePegawaiFoundation } = await import('../src/lib/server/db/pegawai-foundation' + '.ts');

const sourceUrl = process.env.DB_URL || 'file:./data/database.sqlite3';
if (!sourceUrl.startsWith('file:')) {
	throw new Error('Pengujian snapshot pegawai hanya mendukung database SQLite lokal.');
}

const directory = await mkdtemp(path.join(tmpdir(), 'kaganga-pegawai-copy-'));
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
		pegawai: await count('pegawai'),
		akun: await count('auth_user'),
		kelas: await count('kelas')
	};

	await ensurePegawaiFoundation(qa);
	await ensurePegawaiFoundation(qa);

	const after = {
		pegawai: await count('pegawai'),
		akun: await count('auth_user'),
		kelas: await count('kelas')
	};
	const missingCodes = Number(
		(
			await qa.execute(
				`SELECT COUNT(*) AS total FROM pegawai
				 WHERE kode_pegawai IS NULL OR trim(kode_pegawai) = ''`
			)
		).rows[0]?.total ?? 0
	);
	const quickCheck = String((await qa.execute('PRAGMA quick_check')).rows[0]?.quick_check ?? '');
	const foreignKeyIssues = (await qa.execute('PRAGMA foreign_key_check')).rows.length;
	const supportTables = Number(
		(
			await qa.execute(`SELECT COUNT(*) AS total FROM sqlite_master
				WHERE type = 'table' AND name IN (
					'pegawai_penugasan', 'pegawai_pendidikan', 'pegawai_sertifikasi',
					'pegawai_dokumen', 'pegawai_riwayat'
				)`)
		).rows[0]?.total ?? 0
	);

	const result = { before, after, missingCodes, quickCheck, foreignKeyIssues, supportTables };
	if (JSON.stringify(before) !== JSON.stringify(after)) {
		throw new Error(`Jumlah data utama berubah: ${JSON.stringify(result)}`);
	}
	if (missingCodes || quickCheck !== 'ok' || foreignKeyIssues || supportTables !== 5) {
		throw new Error(`Validasi snapshot gagal: ${JSON.stringify(result)}`);
	}
	console.log(JSON.stringify(result, null, 2));
} finally {
	try {
		await source.close();
	} catch {
		// Koneksi sumber mungkin sudah ditutup setelah VACUUM INTO.
	}
	if (qa) {
		try {
			await qa.close();
		} catch {
			// Pembersihan folder sementara tetap dicoba di bawah.
		}
	}
	await new Promise((resolve) => setTimeout(resolve, 250));
	await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(
		(error) => console.warn('[pegawai-qa] Folder sementara belum dapat dibersihkan:', error.message)
	);
}
