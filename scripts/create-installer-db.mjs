#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(
	process.argv[2] || path.join(root, 'dist/windows/installer-database.sqlite3')
);
const dbUrl = `file:${output.replace(/\\/g, '/')}`;

function run(script, args = []) {
	const result = spawnSync(process.execPath, [script, ...args], {
		cwd: root,
		env: { ...process.env, DB_URL: dbUrl },
		stdio: 'inherit'
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${path.basename(script)} gagal (${result.status})`);
}

async function main() {
	fs.mkdirSync(path.dirname(output), { recursive: true });
	for (const suffix of ['', '-wal', '-shm']) fs.rmSync(output + suffix, { force: true });

	const drizzle = path.join(root, 'node_modules/drizzle-kit/bin.cjs');
	if (!fs.existsSync(drizzle)) {
		throw new Error('drizzle-kit tidak tersedia untuk membuat database installer');
	}
	run(drizzle, ['push', '--force']);
	run(path.join(root, 'scripts/ensure-columns.mjs'));
	run(path.join(root, 'scripts/seed-default-admin.mjs'));
	run(path.join(root, 'scripts/grant-admin-permissions.mjs'));

	const db = createClient({ url: dbUrl });
	try {
		const integrity = await db.execute('PRAGMA integrity_check');
		if (integrity.rows[0]?.integrity_check !== 'ok') {
			throw new Error('Integrity check database installer gagal');
		}
		for (const table of ['sekolah', 'pegawai', 'kelas', 'murid', 'mata_pelajaran']) {
			const count = await db.execute(`SELECT COUNT(*) AS total FROM ${table}`);
			if (Number(count.rows[0]?.total) !== 0) {
				throw new Error(`Database installer memuat data ${table}`);
			}
		}
	} finally {
		if (typeof db.close === 'function') await db.close();
	}
	console.info(`[installer-db] Database awal bersih dibuat: ${output}`);
}

main().catch((error) => {
	console.error('[installer-db] Gagal:', error?.message || error);
	process.exitCode = 1;
});