import { env } from '$env/dynamic/private';
import { resolveSession } from '$lib/server/auth';
import db, { closeDbClient, reloadDbClient } from '$lib/server/db';
import {
	createConsistentDatabaseBackup,
	inspectDatabaseFile
} from '$lib/server/db/database-safety';
import { resetStartupEnsures, runStartupEnsures } from '$lib/server/db/ensure-bootstrap';
import { cookieNames } from '$lib/utils';
import { error, json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_DB_URL = 'file:./data/database.sqlite3';

function resolveDatabasePath(url: string) {
	if (!url.startsWith('file:')) throw error(500, 'Database URL tidak didukung untuk import');
	return resolve(process.cwd(), url.replace(/^file:/, ''));
}

function runMigration(databasePath: string) {
	const scriptPath = resolve(process.cwd(), 'scripts', 'migrate-installed-db.mjs');
	return new Promise<void>((resolvePromise, rejectPromise) => {
		execFile(
			process.execPath,
			[scriptPath],
			{
				cwd: process.cwd(),
				env: {
					...process.env,
					DB_URL: `file:${databasePath}`,
					KAGANGA_SKIP_DRIZZLE: '1'
				},
				maxBuffer: 10 * 1024 * 1024,
				windowsHide: true
			},
			(cause, stdout, stderr) => {
				if (stdout.trim()) console.info('[database-import migration]', stdout.trim());
				if (stderr.trim()) console.warn('[database-import migration]', stderr.trim());
				if (cause) rejectPromise(cause);
				else resolvePromise();
			}
		);
	});
}

async function removeDatabaseCompanions(databasePath: string) {
	await Promise.all(
		['-wal', '-shm'].map((suffix) => unlink(databasePath + suffix).catch(() => {}))
	);
}

export async function POST({ request, cookies }) {
	const existingToken = cookies.get(cookieNames.AUTH_SESSION);
	const resolvedSession = existingToken
		? await resolveSession(existingToken).catch(() => null)
		: null;
	if (resolvedSession?.user.type !== 'admin') throw error(403, 'Akses ditolak');

	const formData = await request.formData();
	const file = formData.get('database');
	if (!(file instanceof File)) throw error(400, 'Berkas database tidak ditemukan');
	if (file.size === 0) throw error(400, 'Berkas database kosong');

	const databasePath = resolveDatabasePath(env.DB_URL ?? process.env.DB_URL ?? DEFAULT_DB_URL);
	const databaseDirectory = dirname(databasePath);
	const tempPath = join(databaseDirectory, `database-import-temp-${Date.now()}.sqlite3`);
	let backupPath: string | null = null;
	let databaseSwapStarted = false;

	await mkdir(databaseDirectory, { recursive: true });
	try {
		const uploadedBuffer = Buffer.from(await file.arrayBuffer());
		if (uploadedBuffer.length !== file.size || uploadedBuffer.length < 100) {
			throw error(400, 'Berkas database tidak valid atau tidak lengkap');
		}
		await writeFile(tempPath, uploadedBuffer);
		if ((await stat(tempPath)).size !== uploadedBuffer.length) {
			throw error(500, 'Gagal menulis berkas database secara utuh');
		}

		// Tolak berkas rusak atau database lain sebelum database aktif disentuh.
		await inspectDatabaseFile(tempPath, { requireKagangaTables: true });
		backupPath = await createConsistentDatabaseBackup({
			client: db.$client,
			databasePath,
			label: 'before-import'
		});

		databaseSwapStarted = true;
		await closeDbClient();
		await removeDatabaseCompanions(databasePath);
		await unlink(databasePath).catch(() => {});
		await rename(tempPath, databasePath);

		await runMigration(databasePath);
		await inspectDatabaseFile(databasePath, { requireKagangaTables: true });
		await reloadDbClient();
		resetStartupEnsures();
		await runStartupEnsures();

		const finalInspection = await inspectDatabaseFile(databasePath, {
			requireKagangaTables: true
		});
		if (finalInspection.foreignKeyViolations > 0) {
			console.warn(
				`[database-import] ${finalInspection.foreignKeyViolations} relasi lama perlu ditinjau setelah import`
			);
		}

		cookies.delete(cookieNames.AUTH_SESSION, {
			path: '/',
			secure: process.env.NODE_ENV === 'production'
		});
		console.info('[database-import] selesai; backup aman:', backupPath);
		return json({
			message: 'Database berhasil diimport dan diperbarui. Silakan login ulang.',
			logout: true,
			loginPath: '/login'
		});
	} catch (cause) {
		console.error('[database-import] import gagal:', cause);
		if (databaseSwapStarted && backupPath) {
			try {
				await closeDbClient();
				await removeDatabaseCompanions(databasePath);
				await unlink(databasePath).catch(() => {});
				await copyFile(backupPath, databasePath);
				await reloadDbClient();
				resetStartupEnsures();
				await runStartupEnsures();
				console.warn('[database-import] database sebelumnya berhasil dipulihkan');
			} catch (rollbackCause) {
				console.error('[database-import] pemulihan otomatis gagal:', rollbackCause);
				throw error(500, `Import dan pemulihan otomatis gagal. Backup tersedia di ${backupPath}.`);
			}
		}
		if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
		throw error(500, 'Import gagal. Database sebelumnya tetap aman dan telah dipulihkan.');
	} finally {
		await unlink(tempPath).catch(() => {});
	}
}
