#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const project = process.cwd();
const source = path.resolve(
	(process.env.DB_URL || 'file:./data/database.sqlite3').replace(/^file:/, '')
);
const directory = await mkdtemp(path.join(os.tmpdir(), 'kaganga-ops-qa-'));
const database = path.join(directory, 'database.sqlite3');
const dataRoot = path.join(directory, 'data');
const port = 5153;
const base = `http://127.0.0.1:${port}`;
await copyFile(source, database);
await mkdir(path.join(dataRoot, 'uploads'), { recursive: true });

const child = spawn(process.execPath, ['build/index.js'], {
	cwd: project,
	windowsHide: true,
	env: {
		...process.env,
		PORT: String(port),
		HOST: '127.0.0.1',
		ORIGIN: base,
		DB_URL: `file:${database}`,
		KAGANGA_DATA_DIR: dataRoot,
		photo: `file:${path.join(dataRoot, 'uploads')}`,
		NODE_ENV: 'production'
	},
	stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

async function waitForServer() {
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const response = await fetch(`${base}/login`);
			if (response.status === 200) return;
		} catch {
			// Server masih mulai.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Server QA tidak siap.\n${output}`);
}

try {
	await waitForServer();
	const db = createClient({ url: `file:${database}` });
	try {
		const tables = [
			'server_identity',
			'maintenance_run',
			'communication_template',
			'communication_queue'
		];
		for (const table of tables) {
			const row = await db.execute({
				sql: `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`,
				args: [table]
			});
			if (!row.rows.length) throw new Error(`Tabel ${table} belum dibuat.`);
		}
		const column = await db.execute(
			"SELECT 1 AS ok FROM pragma_table_info('document_attachment') WHERE name='expires_at'"
		);
		if (!column.rows.length) throw new Error('Kolom document_attachment.expires_at belum dibuat.');
		const admin = (
			await db.execute(
				"SELECT id, sekolah_id FROM auth_user WHERE type='admin' ORDER BY id LIMIT 1"
			)
		).rows[0];
		const schoolId =
			admin?.sekolah_id ??
			(await db.execute('SELECT id FROM sekolah ORDER BY id LIMIT 1')).rows[0]?.id;
		if (!admin || !schoolId) throw new Error('Admin atau sekolah QA tidak ditemukan.');
		const token = randomBytes(32).toString('base64url');
		const tokenHash = createHash('sha256').update(token).digest('hex');
		const now = new Date().toISOString();
		await db.execute({
			sql: 'INSERT INTO auth_session(user_id,token_hash,user_agent,ip_address,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
			args: [
				admin.id,
				tokenHash,
				'Stage 16-20 QA',
				'127.0.0.1',
				new Date(Date.now() + 600000).toISOString(),
				now,
				now
			]
		});
		const headers = { cookie: `rapkumer-session=${token}; active-sekolah-id=${schoolId}` };
		for (const route of [
			'/pengaturan/operasional',
			'/komunikasi',
			'/notifikasi',
			'/analisis-peringatan',
			'/api/system/status'
		]) {
			const response = await fetch(`${base}${route}`, { headers, redirect: 'manual' });
			console.log(`${route}=${response.status}`);
			if (response.status !== 200)
				throw new Error(`Route ${route} mengembalikan ${response.status}.`);
		}
		const quick = await db.execute('PRAGMA quick_check');
		const foreignKeys = await db.execute('PRAGMA foreign_key_check');
		console.log(
			`quick_check=${quick.rows[0]?.quick_check} foreign_keys=${foreignKeys.rows.length}`
		);
		if (quick.rows[0]?.quick_check !== 'ok' || foreignKeys.rows.length)
			throw new Error('Database QA tidak sehat.');
		await db.execute({ sql: 'DELETE FROM auth_session WHERE token_hash=?', args: [tokenHash] });
	} finally {
		await db.close();
	}
} finally {
	child.kill();
	await new Promise((resolve) => child.once('exit', resolve));
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
			break;
		} catch (error) {
			if (attempt === 4) {
				console.warn(
					`QA_CLEANUP_DEFERRED=${directory}`,
					error instanceof Error ? error.message : error
				);
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 750));
		}
	}
}
