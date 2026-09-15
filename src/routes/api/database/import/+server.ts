import { env } from '$env/dynamic/private';
import { DATABASE_IMPORT_MAX_BYTES, DATABASE_IMPORT_MAX_LABEL } from '$lib/database-import';
import { resolveSession } from '$lib/server/auth';
import { startBellScheduler, stopBellScheduler } from '$lib/server/bell-scheduler';
import { beginDatabaseMaintenance, endDatabaseMaintenance } from '$lib/server/database-maintenance';
import db, { reloadDbClient } from '$lib/server/db';
import { restoreDatabaseContents } from '$lib/server/db/database-restore';
import {
	createConsistentDatabaseBackup,
	inspectDatabaseFile
} from '$lib/server/db/database-safety';
import { resetStartupEnsures, runStartupEnsures } from '$lib/server/db/ensure-bootstrap';
import { cookieNames } from '$lib/utils';
import { error, json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { mkdir, open, stat, unlink, writeFile } from 'node:fs/promises';
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

const WINDOWS_FILE_RETRY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

function delay(milliseconds: number) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function retryWindowsFileOperation(operation: () => Promise<void>) {
	for (let attempt = 0; ; attempt += 1) {
		try {
			await operation();
			return;
		} catch (cause) {
			const code = (cause as NodeJS.ErrnoException).code;
			if (!WINDOWS_FILE_RETRY_CODES.has(code ?? '') || attempt >= 59) throw cause;
			await delay(Math.min(100 + attempt * 50, 500));
		}
	}
}

async function removeWithRetry(filePath: string) {
	try {
		await retryWindowsFileOperation(() => unlink(filePath));
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
	}
}

async function cleanupStaging(tempPath: string) {
	for (const suffix of ['-wal', '-shm', '']) {
		await removeWithRetry(tempPath + suffix).catch((cause) => {
			console.warn('[database-import] berkas staging belum dapat dihapus:', cause);
		});
	}
}

function assertAllowedSize(size: number) {
	if (size > DATABASE_IMPORT_MAX_BYTES) {
		throw error(413, `Ukuran backup melebihi batas ${DATABASE_IMPORT_MAX_LABEL}.`);
	}
}

async function writeRawDatabase(request: Request, tempPath: string) {
	const declaredSize = Number(request.headers.get('content-length'));
	if (Number.isFinite(declaredSize)) assertAllowedSize(declaredSize);
	if (!request.body) throw error(400, 'Berkas database tidak ditemukan');

	const fileHandle = await open(tempPath, 'wx');
	const reader = request.body.getReader();
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			assertAllowedSize(size);
			await fileHandle.writeFile(value);
		}
	} finally {
		reader.releaseLock();
		await fileHandle.close();
	}
	return size;
}

async function persistUpload(request: Request, tempPath: string) {
	const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
	if (!contentType.startsWith('multipart/form-data')) {
		return writeRawDatabase(request, tempPath);
	}

	// Kompatibilitas untuk halaman lama yang masih mengirim multipart setelah server diperbarui.
	const formData = await request.formData();
	const file = formData.get('database');
	if (!(file instanceof File)) throw error(400, 'Berkas database tidak ditemukan');
	assertAllowedSize(file.size);
	await writeFile(tempPath, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
	return file.size;
}

export async function POST({ request, cookies }) {
	const existingToken = cookies.get(cookieNames.AUTH_SESSION);
	const resolvedSession = existingToken
		? await resolveSession(existingToken).catch(() => null)
		: null;
	if (resolvedSession?.user.type !== 'admin') throw error(403, 'Akses ditolak');

	const databasePath = resolveDatabasePath(env.DB_URL ?? process.env.DB_URL ?? DEFAULT_DB_URL);
	const databaseDirectory = dirname(databasePath);
	const tempPath = join(databaseDirectory, `database-import-temp-${Date.now()}.sqlite3`);
	let backupPath: string | null = null;
	let restoreStarted = false;
	let schedulerStopped = false;

	await mkdir(databaseDirectory, { recursive: true });
	if (!beginDatabaseMaintenance()) throw error(409, 'Proses pemulihan database sedang berjalan');
	try {
		const uploadedSize = await persistUpload(request, tempPath);
		if (uploadedSize < 100) {
			throw error(400, 'Berkas database tidak valid atau tidak lengkap');
		}
		if ((await stat(tempPath)).size !== uploadedSize) {
			throw error(500, 'Gagal menulis berkas database secara utuh');
		}

		// Tolak berkas rusak atau database lain sebelum database aktif disentuh.
		try {
			await inspectDatabaseFile(tempPath, { requireKagangaTables: true });
		} catch (cause) {
			console.warn('[database-import] backup ditolak:', cause);
			throw error(400, 'Berkas backup bukan database Kaganga yang valid atau mengalami kerusakan.');
		}
		stopBellScheduler();
		schedulerStopped = true;
		// Migrasi dilakukan pada berkas staging, bukan database aktif.
		await runMigration(tempPath);
		await inspectDatabaseFile(tempPath, { requireKagangaTables: true });
		backupPath = await createConsistentDatabaseBackup({
			client: db.$client,
			databasePath,
			label: 'before-import'
		});

		restoreStarted = true;
		await restoreDatabaseContents(db.$client, tempPath);
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
		if (restoreStarted && backupPath) {
			try {
				await reloadDbClient();
				await restoreDatabaseContents(db.$client, backupPath);
				await reloadDbClient();
				resetStartupEnsures();
				await runStartupEnsures();
				console.warn('[database-import] database sebelumnya berhasil dipulihkan');
			} catch (rollbackCause) {
				console.error('[database-import] pemulihan otomatis gagal:', rollbackCause);
				throw error(500, `Pemulihan otomatis gagal. Backup tersedia di ${backupPath}.`);
			}
		}
		if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
		throw error(500, 'Import gagal. Database sebelumnya tetap aman dan telah dipulihkan.');
	} finally {
		endDatabaseMaintenance();
		if (schedulerStopped) startBellScheduler().catch(console.error);
		// Pembersihan file yang ditahan Windows tidak boleh menunda respons hasil import.
		cleanupStaging(tempPath).catch(console.error);
	}
}
