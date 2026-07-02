import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { copyFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { closeDbClient, reloadDbClient } from '$lib/server/db';
import { execFile } from 'node:child_process';
import { cookieNames } from '$lib/utils';
import { resolveSession } from '$lib/server/auth';
import { createClient } from '@libsql/client';

const DEFAULT_DB_URL = 'file:./data/database.sqlite3';
const importLockKey = '__rapkumerDatabaseImportInProgress';
const RETRYABLE_FILE_ERROR_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFileError(cause: unknown) {
	const errorCode = (cause as NodeJS.ErrnoException | undefined)?.code;
	return !!errorCode && RETRYABLE_FILE_ERROR_CODES.has(errorCode);
}

async function retryFileOperation<T>(label: string, operation: () => Promise<T>) {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 15; attempt += 1) {
		try {
			return await operation();
		} catch (cause) {
			lastError = cause;
			if (!isRetryableFileError(cause) || attempt === 15) break;
			const waitMs = 150 + attempt * 100;
			console.warn(
				`[database-import] ${label} masih terkunci, mencoba lagi (${attempt}/15) dalam ${waitMs}ms`,
				cause
			);
			await closeDbClient().catch(() => undefined);
			await sleep(waitMs);
		}
	}
	throw lastError;
}

function resolveDatabasePath(url: string) {
	if (url.startsWith('file:')) {
		const cleaned = url.replace(/^file:/, '');
		return resolve(process.cwd(), cleaned);
	}

	throw error(500, 'Database URL tidak didukung untuk import');
}

async function checkpointWAL(dbUrl: string) {
	let client: ReturnType<typeof createClient> | null = null;
	try {
		client = createClient({ url: dbUrl });
		await client.execute({ sql: 'PRAGMA busy_timeout=10000' });
		// Force checkpoint to flush all WAL changes to main database file before backup
		await client.execute({ sql: 'PRAGMA wal_checkpoint(FULL)' });
	} catch (err) {
		console.warn('[import] WAL checkpoint warning:', err);
		// Continue with backup even if checkpoint fails
	} finally {
		if (client && typeof client.close === 'function') {
			await Promise.resolve(client.close()).catch((err: unknown) => {
				console.warn('[import] WAL checkpoint close warning:', err);
			});
		}
	}
}

async function validateSqliteDatabase(dbPath: string) {
	let client: ReturnType<typeof createClient> | null = null;

	try {
		client = createClient({ url: `file:${dbPath}` });
		await client.execute({ sql: 'PRAGMA busy_timeout=10000' });
		const result = await client.execute({ sql: 'PRAGMA integrity_check' });
		const integrity = String(result.rows?.[0]?.integrity_check ?? '').toLowerCase();
		if (integrity !== 'ok') {
			throw new Error(`Integrity check failed: ${integrity || 'unknown result'}`);
		}
	} finally {
		if (client && typeof client.close === 'function') await client.close();
	}
}

async function validateRaporkumerDatabase(dbPath: string) {
	let client: ReturnType<typeof createClient> | null = null;
	const requiredTables = ['auth_user', 'sekolah', 'tahun_ajaran', 'semester', 'kelas', 'murid'];

	try {
		client = createClient({ url: `file:${dbPath}` });
		await client.execute({ sql: 'PRAGMA busy_timeout=10000' });
		const result = await client.execute({
			sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables
				.map(() => '?')
				.join(',')})`,
			args: requiredTables
		});
		const found = new Set((result.rows ?? []).map((row) => String(row.name ?? row[0] ?? '')));
		const missing = requiredTables.filter((table) => !found.has(table));
		if (missing.length) {
			throw new Error(`Missing required tables: ${missing.join(', ')}`);
		}

		await client.execute({ sql: `SELECT id, username, type FROM auth_user LIMIT 1` });
		await client.execute({ sql: `SELECT id, nama FROM sekolah LIMIT 1` });
	} finally {
		if (client && typeof client.close === 'function') await client.close();
	}
}

async function removeSqliteSidecars(dbPath: string) {
	for (const suffix of ['-wal', '-shm']) {
		const sidecarPath = `${dbPath}${suffix}`;
		try {
			await retryFileOperation(`hapus sidecar SQLite ${suffix}`, () => unlink(sidecarPath));
			console.info('[database-import] removed stale SQLite sidecar:', sidecarPath);
		} catch (cause) {
			const errorCode = (cause as NodeJS.ErrnoException | undefined)?.code;
			if (errorCode !== 'ENOENT') {
				console.warn('[database-import] failed to remove SQLite sidecar:', sidecarPath, cause);
			}
		}
	}
}

async function runNodeScript(scriptName: string, dbUrl: string, required = true) {
	const script = resolve(process.cwd(), 'scripts', scriptName);
	console.info('[database-import] running script:', script);
	await new Promise((resolvePromise, rejectPromise) => {
		const child = execFile(
			process.execPath,
			[script],
			{
				windowsHide: true,
				cwd: process.cwd(),
				env: { ...process.env, DB_URL: dbUrl, RAPKUMER_SKIP_NOTIFY_RELOAD: '1' }
			},
			(err, stdout, stderr) => {
				if (stdout && String(stdout).trim())
					console.info(`[${scriptName} stdout]`, String(stdout).trim());
				if (stderr && String(stderr).trim())
					console.warn(`[${scriptName} stderr]`, String(stderr).trim());
				if (err) {
					if (required) return rejectPromise(err);
					console.warn(`[database-import] optional script failed: ${scriptName}`, err);
				}
				resolvePromise(null);
			}
		);
		child.on('error', (e) => rejectPromise(e));
	});
	console.info('[database-import] script completed:', scriptName);
}

async function normalizeImportedDatabase(dbUrl: string) {
	await runNodeScript('fix-drizzle-indexes.mjs', dbUrl);
	await runNodeScript('ensure-columns.mjs', dbUrl);
	await runNodeScript('seed-default-admin.mjs', dbUrl);
	await runNodeScript('grant-admin-permissions.mjs', dbUrl);
	await runNodeScript('migrate-installed-db.mjs', dbUrl, false);
}

async function replaceDatabaseFileWithRollback(
	uploadPath: string,
	dbPath: string,
	backupPath: string
) {
	let activeDatabaseRemoved = false;
	try {
		await retryFileOperation('hapus database aktif sebelum import', async () => {
			await unlink(dbPath).catch((cause) => {
				const errorCode = (cause as NodeJS.ErrnoException | undefined)?.code;
				if (errorCode !== 'ENOENT') throw cause;
			});
			activeDatabaseRemoved = true;
		});
		await retryFileOperation('memasang database hasil import', () => rename(uploadPath, dbPath));
	} catch (cause) {
		console.error('[database-import] gagal mengganti database aktif, mencoba rollback', cause);
		await unlink(uploadPath).catch(() => undefined);
		if (activeDatabaseRemoved) {
			try {
				await copyFile(backupPath, dbPath);
				console.warn('[database-import] rollback berhasil memakai backup sebelum import');
			} catch (rollbackCause) {
				console.error('[database-import] rollback database gagal', rollbackCause);
			}
		}
		throw error(500, 'Gagal menyimpan berkas database. Database lama dipertahankan dari backup.');
	}
}

export async function POST({ request, cookies }) {
	const store = globalThis as unknown as Record<string, boolean | undefined>;
	if (store[importLockKey]) {
		throw error(409, 'Import database sedang berjalan. Tunggu sampai selesai lalu coba lagi.');
	}
	store[importLockKey] = true;
	let appDbClientClosed = false;

	try {
		const formData = await request.formData();
		const file = formData.get('database');
		console.log('[database-import] menerima permintaan import');

		// Preserve admin access across the DB swap: verify the caller is an admin
		// using the currently-open DB before we overwrite it. After the import we
		// will create a fresh session in the newly-imported DB so the client stays
		// authenticated.
		const existingToken = cookies?.get?.(cookieNames.AUTH_SESSION);
		if (!existingToken) {
			console.warn('[database-import] tidak ada cookie sesi pada permintaan');
			throw error(403, 'Akses ditolak');
		}
		const resolved = await resolveSession(existingToken).catch((e) => {
			console.warn('[database-import] gagal memverifikasi sesi sebelum import', e);
			return null;
		});
		if (!resolved || !resolved.user || resolved.user.type !== 'admin') {
			console.warn('[database-import] user tidak memiliki izin admin');
			throw error(403, 'Akses ditolak');
		}

		if (!(file instanceof File)) {
			console.warn('[database-import] gagal: field database tidak ditemukan dalam formData');
			throw error(400, 'Berkas database tidak ditemukan');
		}

		if (file.size === 0) {
			console.warn('[database-import] gagal: berkas kosong');
			throw error(400, 'Berkas database kosong');
		}

		console.log('[database-import] ukuran berkas', file.size, 'byte');

		const dbUrl = process.env.DB_URL ?? env.DB_URL ?? DEFAULT_DB_URL;
		const dbPath = resolveDatabasePath(dbUrl);
		const dbDir = dirname(dbPath);
		const uploadedBuffer = Buffer.from(await file.arrayBuffer());

		await mkdir(dbDir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupPath = join(dbDir, `database-backup-before-import-${timestamp}.sqlite3`);
		const uploadPath = join(dbDir, `database-import-upload-${timestamp}.sqlite3`);

		try {
			await writeFile(uploadPath, uploadedBuffer);
			await validateSqliteDatabase(uploadPath);
			await normalizeImportedDatabase(`file:${uploadPath}`);
			await checkpointWAL(`file:${uploadPath}`);
			await validateSqliteDatabase(uploadPath);
			await validateRaporkumerDatabase(uploadPath);
			await removeSqliteSidecars(uploadPath);
		} catch (cause) {
			console.error(
				'[database-import] database upload tidak valid atau gagal dinormalisasi',
				cause
			);
			await unlink(uploadPath).catch(() => undefined);
			await removeSqliteSidecars(uploadPath);
			throw error(400, 'Berkas backup database tidak valid, rusak, atau bukan database RaporKumer');
		}

		// Flush WAL before copying the active database, then close the app client
		// so Windows can release the SQLite file handles before replacement.
		await checkpointWAL(dbUrl);
		await closeDbClient();
		appDbClientClosed = true;
		await sleep(350);

		try {
			await copyFile(dbPath, backupPath);
		} catch (cause) {
			const errorCode = (cause as NodeJS.ErrnoException | undefined)?.code;
			if (errorCode && errorCode !== 'ENOENT') {
				console.error('[database-import] gagal membuat backup database sebelum import', cause);
				await unlink(uploadPath).catch(() => undefined);
				throw error(500, 'Gagal membuat backup database sebelum import');
			}
		}

		await removeSqliteSidecars(dbPath);
		await replaceDatabaseFileWithRollback(uploadPath, dbPath, backupPath);

		try {
			await stat(dbPath);
		} catch (cause) {
			console.error('[database-import] database hasil import tidak ditemukan', cause);
			throw error(500, 'Import database gagal, berkas tidak ditemukan setelah penulisan');
		}

		console.log('[database-import] import selesai. Backup disimpan di', backupPath);

		try {
			await reloadDbClient();
			appDbClientClosed = false;
			console.info('[database-import] reloaded DB client after import normalization');
		} catch (e) {
			console.error('[database-import] reload failed after import', e);
			await reloadDbClient().catch((reloadError) => {
				console.warn(
					'[database-import] failed to reload DB client after reload failure:',
					reloadError
				);
			});
			appDbClientClosed = false;
			throw error(
				500,
				'Database sudah diimport, tetapi server gagal memuat ulang koneksi. Coba restart server lalu login ulang.'
			);
		}

		// After an import we require the client to re-authenticate. Clear any
		// existing auth session cookie so the user is logged out and must sign in
		// against the newly-imported database. The client will be informed via the
		// JSON response (logout: true) and should redirect to the login page.
		try {
			const secure = process.env.NODE_ENV === 'production';
			// Expire the session cookie immediately.
			cookies.set(cookieNames.AUTH_SESSION, '', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure,
				expires: new Date(0)
			});
			console.info(
				'[database-import] cleared auth session cookie to require re-login after import'
			);
		} catch (e) {
			console.warn('[database-import] failed to clear auth session cookie (non-fatal):', e);
		}

		return json({
			message: 'Database berhasil diimport dan dinormalisasi. Silakan login ulang.',
			logout: true,
			loginPath: '/login'
		});
	} finally {
		if (appDbClientClosed) {
			await reloadDbClient()
				.then(() => {
					console.info('[database-import] reloaded DB client after failed import attempt');
				})
				.catch((reloadError) => {
					console.error(
						'[database-import] failed to reload DB client after failed import attempt:',
						reloadError
					);
				});
		}
		store[importLockKey] = false;
	}
}
