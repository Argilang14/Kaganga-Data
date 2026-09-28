import db from '$lib/server/db';
import {
	tableDocumentAttachment,
	tableMaintenanceRun,
	tableMurid,
	tablePegawai,
	tableServerIdentity
} from '$lib/server/db/schema';
import { dataRoot, uploadsDir } from '$lib/server/data-dirs';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { ensureProductionOperationsSchema } from '$lib/server/db/ensure-production-operations';
import {
	photoDirectory,
	safePhotoFilename,
	thumbnailDirectory,
	thumbnailFilename
} from '$lib/server/photo-storage';

const ACTIVE_WINDOW_MS = 3 * 60 * 1000;
let lastHeartbeat = 0;
let cachedStatus: ServerIdentityStatus | null = null;

type ServerIdentityStatus = {
	instanceId: string;
	machineName: string;
	heartbeatAt: string;
	conflict: boolean;
	conflictingMachine: string | null;
};

function databasePath() {
	const url = process.env.DB_URL || 'file:./data/database.sqlite3';
	if (!url.startsWith('file:')) return null;
	return path.resolve(url.slice(5));
}

async function localInstanceId() {
	const dbPath = databasePath();
	const root = dbPath ? path.dirname(dbPath) : dataRoot();
	const file = path.join(root, '.kaganga-server-instance');
	try {
		const existing = (await fs.readFile(file, 'utf8')).trim();
		if (existing) return existing;
	} catch {
		// Dibuat saat server pertama kali aktif pada perangkat ini.
	}
	const id = randomUUID();
	await fs.mkdir(root, { recursive: true });
	await fs.writeFile(file, id, { encoding: 'utf8', flag: 'wx' }).catch(async () => {
		const existing = (await fs.readFile(file, 'utf8')).trim();
		if (existing) return existing;
	});
	return (await fs.readFile(file, 'utf8')).trim() || id;
}

export async function recordServerHeartbeat(force = false): Promise<ServerIdentityStatus> {
	await ensureProductionOperationsSchema();
	if (!force && cachedStatus && Date.now() - lastHeartbeat < 60_000) return cachedStatus;
	const instanceId = await localInstanceId();
	const machineName = hostname();
	const now = new Date();
	const nowIso = now.toISOString();
	const existing = await db.query.tableServerIdentity.findFirst({
		where: eq(tableServerIdentity.id, 1)
	});
	let existingProcessAlive = false;
	if (
		existing?.machineName === machineName &&
		existing.processId &&
		existing.processId !== process.pid
	) {
		try {
			process.kill(existing.processId, 0);
			existingProcessAlive = true;
		} catch {
			existingProcessAlive = false;
		}
	}
	const activeOther = Boolean(
		existing &&
		now.getTime() - new Date(existing.heartbeatAt).getTime() < ACTIVE_WINDOW_MS &&
		(existing.instanceId !== instanceId || existingProcessAlive)
	);
	if (!activeOther) {
		const hash = createHash('sha256')
			.update(databasePath() ?? process.env.DB_URL ?? 'remote')
			.digest('hex');
		await db.$client.execute({
			sql: `INSERT INTO server_identity
				(id, instance_id, machine_name, process_id, role, database_path_hash, started_at, heartbeat_at, created_at, updated_at)
				VALUES (1, ?, ?, ?, 'primary', ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET instance_id=excluded.instance_id, machine_name=excluded.machine_name,
				process_id=excluded.process_id, role='primary', database_path_hash=excluded.database_path_hash, heartbeat_at=excluded.heartbeat_at,
				updated_at=excluded.updated_at`,
			args: [
				instanceId,
				machineName,
				process.pid,
				hash,
				existing?.startedAt ?? nowIso,
				nowIso,
				existing?.createdAt ?? nowIso,
				nowIso
			]
		});
	}
	lastHeartbeat = Date.now();
	cachedStatus = {
		instanceId,
		machineName,
		heartbeatAt: activeOther ? existing!.heartbeatAt : nowIso,
		conflict: activeOther,
		conflictingMachine: activeOther ? existing!.machineName : null
	};
	return cachedStatus;
}

async function walkFiles(root: string) {
	const files: Array<{ path: string; size: number; modifiedAt: number }> = [];
	async function visit(directory: string) {
		let entries: import('node:fs').Dirent[] = [];
		try {
			entries = await fs.readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const target = path.join(directory, entry.name);
			if (entry.isDirectory()) await visit(target);
			else if (entry.isFile()) {
				const stat = await fs.stat(target);
				files.push({ path: target, size: stat.size, modifiedAt: stat.mtimeMs });
			}
		}
	}
	await visit(root);
	return files;
}

async function directFiles(root: string) {
	let entries: import('node:fs').Dirent[] = [];
	try {
		entries = await fs.readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}
	const files: Array<{ path: string; size: number; modifiedAt: number }> = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const target = path.join(root, entry.name);
		const stat = await fs.stat(target);
		files.push({ path: target, size: stat.size, modifiedAt: stat.mtimeMs });
	}
	return files;
}

function registeredPhotoPaths(kind: 'murid' | 'pegawai', filenames: Array<string | null>) {
	return new Set(
		filenames
			.map(safePhotoFilename)
			.filter((filename): filename is string => Boolean(filename))
			.map((filename) => path.resolve(photoDirectory(kind), filename))
	);
}

function registeredThumbnailPaths(kind: 'murid' | 'pegawai', filenames: Array<string | null>) {
	return new Set(
		filenames
			.map(safePhotoFilename)
			.filter((filename): filename is string => Boolean(filename))
			.map((filename) => path.resolve(thumbnailDirectory(kind), thumbnailFilename(filename)))
	);
}

function bytes(values: Array<{ size: number }>) {
	return values.reduce((total, item) => total + item.size, 0);
}

export async function getSystemHealth() {
	const dbPath = databasePath();
	const attachmentRoot = path.join(uploadsDir(), 'attachments');
	const [
		quick,
		foreignKeys,
		attachments,
		attachmentFiles,
		muridRows,
		pegawaiRows,
		muridPhotos,
		pegawaiPhotos,
		muridThumbnails,
		pegawaiThumbnails,
		server,
		backups
	] = await Promise.all([
		db.$client.execute('PRAGMA quick_check'),
		db.$client.execute('PRAGMA foreign_key_check'),
		db.select({ storedPath: tableDocumentAttachment.storedPath }).from(tableDocumentAttachment),
		walkFiles(attachmentRoot),
		db.select({ foto: tableMurid.foto }).from(tableMurid),
		db.select({ foto: tablePegawai.foto }).from(tablePegawai),
		directFiles(photoDirectory('murid')),
		directFiles(photoDirectory('pegawai')),
		walkFiles(thumbnailDirectory('murid')),
		walkFiles(thumbnailDirectory('pegawai')),
		recordServerHeartbeat(true),
		walkFiles(dbPath ? path.dirname(dbPath) : dataRoot())
	]);
	const registeredAttachments = new Set(
		attachments.map((item) => path.resolve(attachmentRoot, ...item.storedPath.split('/')))
	);
	const registeredMuridPhotos = registeredPhotoPaths(
		'murid',
		muridRows.map((item) => item.foto)
	);
	const registeredPegawaiPhotos = registeredPhotoPaths(
		'pegawai',
		pegawaiRows.map((item) => item.foto)
	);
	const registeredMuridThumbnails = registeredThumbnailPaths(
		'murid',
		muridRows.map((item) => item.foto)
	);
	const registeredPegawaiThumbnails = registeredThumbnailPaths(
		'pegawai',
		pegawaiRows.map((item) => item.foto)
	);
	const orphanFiles = [
		...attachmentFiles.filter((item) => !registeredAttachments.has(path.resolve(item.path))),
		...muridPhotos.filter(
			(item) =>
				/\.(?:jpe?g|png)$/i.test(item.path) && !registeredMuridPhotos.has(path.resolve(item.path))
		),
		...pegawaiPhotos.filter((item) => !registeredPegawaiPhotos.has(path.resolve(item.path))),
		...muridThumbnails.filter((item) => !registeredMuridThumbnails.has(path.resolve(item.path))),
		...pegawaiThumbnails.filter((item) => !registeredPegawaiThumbnails.has(path.resolve(item.path)))
	];
	const missingFiles = attachments.filter(
		(item) =>
			!attachmentFiles.some(
				(file) =>
					path.resolve(file.path) === path.resolve(attachmentRoot, ...item.storedPath.split('/'))
			)
	);
	const missingPhotos = [
		...muridRows.filter((item) => {
			const filename = safePhotoFilename(item.foto);
			return filename && !muridPhotos.some((file) => path.basename(file.path) === filename);
		}),
		...pegawaiRows.filter((item) => {
			const filename = safePhotoFilename(item.foto);
			return filename && !pegawaiPhotos.some((file) => path.basename(file.path) === filename);
		})
	];
	const physicalFiles = [
		...attachmentFiles,
		...muridPhotos.filter((item) => /\.(?:jpe?g|png)$/i.test(item.path)),
		...pegawaiPhotos,
		...muridThumbnails,
		...pegawaiThumbnails
	];
	const temporaryFiles = physicalFiles.filter((item) =>
		/\.tmp$|\.part$|\.upload$/i.test(item.path)
	);
	let databaseSize = 0;
	let disk = { free: 0, total: 0 };
	if (dbPath) {
		try {
			databaseSize = (await fs.stat(dbPath)).size;
			const stats = await fs.statfs(path.dirname(dbPath));
			disk = {
				free: Number(stats.bavail) * Number(stats.bsize),
				total: Number(stats.blocks) * Number(stats.bsize)
			};
		} catch {
			// Informasi ruang dapat tidak tersedia pada database remote.
		}
	}
	const backupFiles = backups
		.filter((file) => /database-backup-.*\.sqlite3$/i.test(file.path))
		.sort((a, b) => b.modifiedAt - a.modifiedAt);
	return {
		database: {
			path: dbPath,
			size: databaseSize,
			quickCheck: String(quick.rows[0]?.quick_check ?? quick.rows[0]?.['quick_check'] ?? 'unknown'),
			foreignKeyIssues: foreignKeys.rows.length
		},
		storage: {
			attachmentRoot,
			fileCount: physicalFiles.length,
			size: bytes(physicalFiles),
			orphanCount: orphanFiles.length,
			orphanSize: bytes(orphanFiles),
			missingCount: missingFiles.length + missingPhotos.length,
			photoCount: muridPhotos.length + pegawaiPhotos.length,
			thumbnailCount: muridThumbnails.length + pegawaiThumbnails.length,
			temporaryCount: temporaryFiles.length,
			temporarySize: bytes(temporaryFiles),
			diskFree: disk.free,
			diskTotal: disk.total
		},
		backup: {
			lastAt: backupFiles[0] ? new Date(backupFiles[0].modifiedAt).toISOString() : null,
			count: backupFiles.length
		},
		server
	};
}

export async function createTieredBackup(kind: 'daily' | 'weekly' | 'pre-update' | 'manual') {
	await ensureProductionOperationsSchema();
	const dbPath = databasePath();
	if (!dbPath) throw new Error('Backup otomatis hanya tersedia untuk SQLite lokal.');
	const startedAt = new Date().toISOString();
	const timestamp = startedAt.replaceAll(':', '-').replaceAll('.', '-');
	const backupDir = path.join(path.dirname(dbPath), 'backups', kind);
	const target = path.join(backupDir, `database-backup-${kind}-${timestamp}.sqlite3`);
	await fs.mkdir(backupDir, { recursive: true });
	const [run] = await db
		.insert(tableMaintenanceRun)
		.values({ type: 'backup', status: 'running', summary: `Backup ${kind}`, startedAt })
		.returning();
	try {
		await db.$client.execute(`VACUUM INTO '${target.replaceAll('\\', '/').replaceAll("'", "''")}'`);
		const size = (await fs.stat(target)).size;
		const retention = kind === 'daily' ? 14 : kind === 'weekly' ? 12 : null;
		if (retention) {
			const backups = (await walkFiles(backupDir))
				.filter((item) => /\.sqlite3$/i.test(item.path))
				.sort((a, b) => b.modifiedAt - a.modifiedAt);
			for (const old of backups.slice(retention)) await fs.unlink(old.path).catch(() => undefined);
		}
		await db
			.update(tableMaintenanceRun)
			.set({
				status: 'success',
				summary: `Backup ${kind} berhasil (${size} byte).`,
				detailsJson: JSON.stringify({ kind, target, size }),
				finishedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
			.where(eq(tableMaintenanceRun.id, run.id));
		return { target, size };
	} catch (error) {
		await db
			.update(tableMaintenanceRun)
			.set({
				status: 'failed',
				summary: error instanceof Error ? error.message : 'Backup gagal.',
				finishedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
			.where(eq(tableMaintenanceRun.id, run.id));
		throw error;
	}
}

export async function cleanupSafeFiles() {
	await ensureProductionOperationsSchema();
	const attachmentRoot = path.join(uploadsDir(), 'attachments');
	const [registeredRows, muridRows, pegawaiRows] = await Promise.all([
		db.select({ storedPath: tableDocumentAttachment.storedPath }).from(tableDocumentAttachment),
		db.select({ foto: tableMurid.foto }).from(tableMurid),
		db.select({ foto: tablePegawai.foto }).from(tablePegawai)
	]);
	const registeredAttachments = new Set(
		registeredRows.map((item) => path.resolve(attachmentRoot, ...item.storedPath.split('/')))
	);
	const registeredMuridPhotos = registeredPhotoPaths(
		'murid',
		muridRows.map((item) => item.foto)
	);
	const registeredPegawaiPhotos = registeredPhotoPaths(
		'pegawai',
		pegawaiRows.map((item) => item.foto)
	);
	const registeredMuridThumbnails = registeredThumbnailPaths(
		'murid',
		muridRows.map((item) => item.foto)
	);
	const registeredPegawaiThumbnails = registeredThumbnailPaths(
		'pegawai',
		pegawaiRows.map((item) => item.foto)
	);
	const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const [attachmentFiles, muridPhotos, pegawaiPhotos, muridThumbnails, pegawaiThumbnails] =
		await Promise.all([
			walkFiles(attachmentRoot),
			directFiles(photoDirectory('murid')),
			directFiles(photoDirectory('pegawai')),
			walkFiles(thumbnailDirectory('murid')),
			walkFiles(thumbnailDirectory('pegawai'))
		]);
	const candidates = [
		...attachmentFiles.filter(
			(item) =>
				(!registeredAttachments.has(path.resolve(item.path)) ||
					/\.tmp$|\.part$|\.upload$/i.test(item.path)) &&
				item.modifiedAt < cutoff
		),
		...muridPhotos.filter(
			(item) =>
				/\.(?:jpe?g|png)$/i.test(item.path) &&
				!registeredMuridPhotos.has(path.resolve(item.path)) &&
				item.modifiedAt < cutoff
		),
		...pegawaiPhotos.filter(
			(item) => !registeredPegawaiPhotos.has(path.resolve(item.path)) && item.modifiedAt < cutoff
		),
		...muridThumbnails.filter(
			(item) => !registeredMuridThumbnails.has(path.resolve(item.path)) && item.modifiedAt < cutoff
		),
		...pegawaiThumbnails.filter(
			(item) =>
				!registeredPegawaiThumbnails.has(path.resolve(item.path)) && item.modifiedAt < cutoff
		)
	];
	for (const item of candidates) await fs.unlink(item.path).catch(() => undefined);
	const now = new Date().toISOString();
	await db.insert(tableMaintenanceRun).values({
		type: 'cleanup',
		status: 'success',
		summary: `${candidates.length} berkas yatim/sementara lama dibersihkan.`,
		detailsJson: JSON.stringify({ deleted: candidates.length, bytes: bytes(candidates) }),
		startedAt: now,
		finishedAt: now
	});
	return { deleted: candidates.length, bytes: bytes(candidates) };
}

async function newestBackup(kind: 'daily' | 'weekly') {
	const dbPath = databasePath();
	if (!dbPath) return null;
	const files = (await walkFiles(path.join(path.dirname(dbPath), 'backups', kind)))
		.filter((item) => /\.sqlite3$/i.test(item.path))
		.sort((a, b) => b.modifiedAt - a.modifiedAt);
	return files[0] ?? null;
}

async function runScheduledMaintenance() {
	const server = await recordServerHeartbeat(true);
	if (server.conflict) return;
	const daily = await newestBackup('daily');
	if (!daily || Date.now() - daily.modifiedAt > 24 * 60 * 60 * 1000) {
		await createTieredBackup('daily');
	}
	const weekly = await newestBackup('weekly');
	if (!weekly || Date.now() - weekly.modifiedAt > 7 * 24 * 60 * 60 * 1000) {
		await createTieredBackup('weekly');
	}
}

export function startMaintenanceScheduler() {
	const globalStore = globalThis as typeof globalThis & {
		__kagangaMaintenanceTimer?: NodeJS.Timeout;
	};
	if (globalStore.__kagangaMaintenanceTimer) return;
	const run = () =>
		runScheduledMaintenance().catch((error) =>
			console.warn('[maintenance] backup otomatis gagal', error)
		);
	setTimeout(run, 30_000);
	globalStore.__kagangaMaintenanceTimer = setInterval(run, 6 * 60 * 60 * 1000);
}
