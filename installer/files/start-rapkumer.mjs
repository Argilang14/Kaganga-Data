import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import net from 'net';
import os from 'os';

const DEFAULT_PORT = 1206;
const APP_NAME = 'Kaganga';
const USER_STATE_DIR = 'Kaganga-data';
const LEGACY_USER_STATE_DIR = 'Rapkumer-data';

function timeStamp() {
	return new Date().toISOString();
}

async function ensureDir(dir) {
	try {
		await fsPromises.mkdir(dir, { recursive: true });
	} catch {
		void 0;
	}
}

async function appendLog(logFile, msg) {
	const line = `[${timeStamp()}] ${msg}\n`;
	try {
		await fsPromises.appendFile(logFile, line, { encoding: 'utf8' });
	} catch {
		try {
			fs.writeFileSync(logFile, line, { flag: 'a' });
		} catch {
			void 0;
		}
	}
}

async function waitForPort(port, attempts = 10, delayMs = 1000) {
	for (let i = 0; i < attempts; i++) {
		const ok = await new Promise((resolve) => {
			const socket = new net.Socket();
			socket.setTimeout(1000);
			socket.once('error', () => {
				socket.destroy();
				resolve(false);
			});
			socket.once('timeout', () => {
				socket.destroy();
				resolve(false);
			});
			socket.connect(port, '127.0.0.1', () => {
				socket.end();
				resolve(true);
			});
		});
		if (ok) return true;
		await new Promise((r) => setTimeout(r, delayMs));
	}
	return false;
}

async function isKagangaServer(port) {
	return new Promise((resolve) => {
		const request = http.get(
			{ hostname: '127.0.0.1', port, path: '/login', timeout: 2500 },
			(response) => {
				let body = '';
				response.setEncoding('utf8');
				response.on('data', (chunk) => {
					if (body.length < 64 * 1024) body += chunk;
				});
				response.on('end', () => resolve(/Kaganga/i.test(body)));
			}
		);
		request.once('timeout', () => {
			request.destroy();
			resolve(false);
		});
		request.once('error', () => resolve(false));
	});
}

function openBrowser(url) {
	if (process.platform !== 'win32') return;
	const cmdPath = process.env.ComSpec || 'cmd.exe';
	const opener = spawn(cmdPath, ['/c', 'start', '', url], {
		windowsHide: true,
		detached: true,
		stdio: 'ignore'
	});
	opener.on('error', () => void 0);
	opener.unref();
}

async function checkpointDatabase(databasePath, logFile) {
	if (!fs.existsSync(databasePath)) return;
	try {
		const { createClient } = await import('@libsql/client');
		const client = createClient({ url: 'file:' + databasePath.replace(/\\/g, '/') });
		try {
			await client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
		} finally {
			if (typeof client.close === 'function') await client.close();
		}
	} catch (error) {
		await appendLog(logFile, `Peringatan: checkpoint database dilewati: ${String(error)}`);
	}
}

async function copyLegacyState(legacyRoot, targetRoot, logFile) {
	const targetDb = path.join(targetRoot, 'database.sqlite3');
	const legacyDb = path.join(legacyRoot, 'database.sqlite3');
	if (fs.existsSync(targetDb) || !fs.existsSync(legacyDb)) return;

	await appendLog(logFile, `Menyalin data lama dari ${legacyRoot} ke ${targetRoot}`);
	await checkpointDatabase(legacyDb, logFile);
	await fsPromises.copyFile(legacyDb, targetDb);
	for (const suffix of ['-wal', '-shm']) {
		if (fs.existsSync(legacyDb + suffix)) {
			await fsPromises.copyFile(legacyDb + suffix, targetDb + suffix);
		}
	}
	for (const folder of ['uploads', 'sounds']) {
		const source = path.join(legacyRoot, folder);
		const destination = path.join(targetRoot, folder);
		if (fs.existsSync(source) && !fs.existsSync(destination)) {
			await fsPromises.cp(source, destination, { recursive: true, errorOnExist: false });
		}
	}
	const legacyOrigins = path.join(legacyRoot, 'csrf-origins.txt');
	const targetOrigins = path.join(targetRoot, 'csrf-origins.txt');
	if (fs.existsSync(legacyOrigins) && !fs.existsSync(targetOrigins)) {
		await fsPromises.copyFile(legacyOrigins, targetOrigins);
	}
	await appendLog(logFile, 'Data lama berhasil disalin. Data sumber tetap dipertahankan.');
}

async function readAppVersion(appHome) {
	try {
		const pkg = JSON.parse(await fsPromises.readFile(path.join(appHome, 'package.json'), 'utf8'));
		return String(pkg.version || 'unknown');
	} catch {
		return 'unknown';
	}
}

async function backupDatabaseForVersion(databasePath, stateRoot, version, logFile) {
	if (!fs.existsSync(databasePath)) return null;
	const marker = path.join(stateRoot, '.last-migrated-version');
	const migratedVersion = await fsPromises.readFile(marker, 'utf8').catch(() => '');
	if (migratedVersion.trim() === version) return marker;

	await checkpointDatabase(databasePath, logFile);
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupPath = path.join(stateRoot, `database-backup-before-${version}-${stamp}.sqlite3`);
	await fsPromises.copyFile(databasePath, backupPath);
	await appendLog(logFile, `Backup sebelum migrasi dibuat: ${backupPath}`);
	return marker;
}

async function main() {
	const __filename = fileURLToPath(import.meta.url);
	const APP_HOME = path.dirname(__filename);

	const PORT = Number(process.env.PORT || DEFAULT_PORT);
	if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
		throw new Error(`PORT tidak valid: ${process.env.PORT}`);
	}
	const NODE_ENV = process.env.NODE_ENV || 'production';

	const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
	const USER_STATE_ROOT = path.join(localAppData, USER_STATE_DIR);
	const LEGACY_STATE_ROOT = path.join(localAppData, LEGACY_USER_STATE_DIR);
	const LOG_DIR = path.join(USER_STATE_ROOT, 'logs');
	const LOG_FILE = path.join(LOG_DIR, 'kaganga.log');

	await ensureDir(LOG_DIR);
	await ensureDir(USER_STATE_ROOT);

	await appendLog(LOG_FILE, `Starting ${APP_NAME} (app home: ${APP_HOME})`);

	if (await waitForPort(PORT, 1, 0)) {
		const url = `http://localhost:${PORT}`;
		if (await isKagangaServer(PORT)) {
			await appendLog(
				LOG_FILE,
				`${APP_NAME} sudah berjalan pada ${url}; menggunakan proses yang ada.`
			);
			openBrowser(url);
			return;
		}
		throw new Error(`Port ${PORT} sedang digunakan aplikasi lain. ${APP_NAME} tidak dijalankan.`);
	}

	await copyLegacyState(LEGACY_STATE_ROOT, USER_STATE_ROOT, LOG_FILE);

	// Ensure database exists in user folder
	const srcDb = path.join(APP_HOME, 'data', 'database.sqlite3');
	const dstDb = path.join(USER_STATE_ROOT, 'database.sqlite3');
	try {
		if (!fs.existsSync(dstDb)) {
			await appendLog(LOG_FILE, 'Menyalin basis data awal ke direktori pengguna...');
			if (fs.existsSync(srcDb)) {
				await fsPromises.copyFile(srcDb, dstDb);
				await appendLog(LOG_FILE, `Database awal disalin ke ${dstDb}`);
			} else {
				await appendLog(LOG_FILE, `Peringatan: file database sumber tidak ditemukan di ${srcDb}`);
			}
		}
	} catch (err) {
		await appendLog(LOG_FILE, `Error while ensuring database: ${String(err)}`);
	}

	// PagedJS + Puppeteer will use system Chrome/Chromium for PDF generation

	// Prepare DB URL (replace backslashes with slashes)
	const DB_URL = 'file:' + dstDb.replace(/\\/g, '/');

	await appendLog(LOG_FILE, `Using DB_URL=${DB_URL}`);

	console.log(`Menjalankan ${APP_NAME} pada http://localhost:${PORT}`);
	await appendLog(
		LOG_FILE,
		`Starting ${APP_NAME} using node start-build.mjs on port ${PORT} with DB_URL=${DB_URL}`
	);

	const childEnv = {
		...process.env,
		PORT: String(PORT),
		NODE_ENV,
		BODY_SIZE_LIMIT: '536870912',
		DB_URL,
		DATABASE_URL: DB_URL,
		KAGANGA_SKIP_DRIZZLE: '1'
	};
	const nodeBin = process.execPath || 'node';

	const version = await readAppVersion(APP_HOME);
	const migrationMarker = await backupDatabaseForVersion(dstDb, USER_STATE_ROOT, version, LOG_FILE);

	// Run database migration synchronously before starting the server.
	const migrateScript = path.join(APP_HOME, 'scripts', 'migrate-installed-db.mjs');
	if (fs.existsSync(migrateScript)) {
		await appendLog(LOG_FILE, 'Menjalankan migrasi database...');
		try {
			const result = spawnSync(nodeBin, [migrateScript], {
				cwd: APP_HOME,
				env: childEnv,
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 120000
			});
			if (result.error) {
				await appendLog(LOG_FILE, `Migrasi database error: ${result.error.message}`);
				throw result.error;
			} else if (result.status === 0) {
				await appendLog(LOG_FILE, 'Migrasi database berhasil');
				if (migrationMarker) await fsPromises.writeFile(migrationMarker, version, 'utf8');
			} else {
				const stderr = result.stderr?.toString() || '';
				const stdout = result.stdout?.toString() || '';
				await appendLog(
					LOG_FILE,
					`Migrasi database gagal (exit code ${result.status}): ${stderr}${stdout}`
				);
				throw new Error(`Migrasi database gagal (exit code ${result.status}): ${stderr || stdout}`);
			}
		} catch (err) {
			await appendLog(LOG_FILE, `Error saat migrasi database: ${String(err)}`);
			throw err;
		}
	} else {
		throw new Error(`Script migrasi tidak ditemukan di ${migrateScript}`);
	}

	// Spawn the start-build script as a detached background process.
	// Redirect stdout/stderr directly into the log file so the parent can exit.
	let outFd = null;
	try {
		outFd = fs.openSync(LOG_FILE, 'a');
	} catch (e) {
		await appendLog(LOG_FILE, `Failed to open log file descriptor: ${String(e)}`);
	}

	const stdio = outFd !== null ? ['ignore', outFd, outFd] : ['ignore', 'ignore', 'ignore'];

	const child = spawn(nodeBin, ['start-build.mjs'], {
		cwd: APP_HOME,
		env: childEnv,
		detached: true,
		stdio,
		windowsHide: true
	});

	child.on('error', async (err) => {
		await appendLog(LOG_FILE, `Failed to spawn start-build.mjs: ${String(err)}`);
	});

	try {
		child.unref();
	} catch {
		void 0;
	}

	// Close our copy of the descriptor; the child has its own copy.
	if (outFd !== null) {
		try {
			fs.closeSync(outFd);
		} catch {
			void 0;
		}
	}

	// Wait for server to be available, then open browser on Windows
	const listening = await waitForPort(Number(PORT), 10, 1000);
	if (listening) {
		await appendLog(LOG_FILE, 'Server is listening on port ' + PORT);
		if (process.platform === 'win32') {
			const url = `http://localhost:${PORT}`;
			console.log(`Sedang membuka ${APP_NAME}...`);
			await appendLog(LOG_FILE, `Opening browser to ${url}`);
			try {
				openBrowser(url);
			} catch (err) {
				await appendLog(LOG_FILE, `Failed to open browser: ${String(err)}`);
			}

			// Exit parent process so the terminal closes, leaving the detached server running
			process.exit(0);
		}
	} else {
		await appendLog(LOG_FILE, 'Warning: server did not respond after waiting');
	}
}

main().catch(async (err) => {
	const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
	const LOG_FILE = path.join(localAppData, USER_STATE_DIR, 'logs', 'kaganga.log');
	try {
		await appendLog(LOG_FILE, `Fatal: ${String(err)}`);
	} catch {
		void 0;
	}
	console.error(err);

	// Detect @libsql native addon failure
	const msg = (err && (err.message || String(err))) || '';
	if (
		msg.includes('@libsql') &&
		(msg.includes('index.node') || msg.includes('ERR_DLOPEN_FAILED'))
	) {
		console.error('');
		console.error('=====================================================================');
		console.error('KESALAHAN: Native addon @libsql/win32-x64-msvc gagal dimuat.');
		console.error('');
		console.error('Kemungkinan penyebab: Microsoft Visual C++ Redistributable');
		console.error('2015-2022 (x64) belum terinstall di komputer ini.');
		console.error('');
		console.error(`Solusi: Jalankan ulang installer ${APP_NAME}, atau unduh dan`);
		console.error('install langsung dari Microsoft:');
		console.error('  https://aka.ms/vs/17/release/vc_redist.x64.exe');
		console.error('=====================================================================');
	}

	process.exit(1);
});
