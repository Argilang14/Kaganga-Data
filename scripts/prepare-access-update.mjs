import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const evidence = [
	['tmp/test-bulk-users-unit.log', /\bpass [1-9]\d*\b/, /\bfail 0\b/],
	['tmp/check-bulk-users.log', /found 0 errors/],
	['tmp/build-bulk-users.log', /built in/],
	['tmp/qa-bulk-users.log', /QA_RESULT/],
	['tmp/qa-access-absensi.log', /QA_RESULT/],
	['tmp/qa-murid-identity.log', /PASS migration\/review/, /QA artifacts:/]
];
const buildTime = (await lstat(path.join(root, 'build/index.js'))).mtimeMs;
const verification = [];
for (const [file, ...patterns] of evidence) {
	const text = await readFile(path.join(root, file), 'utf8');
	assert.ok(
		patterns.every((pattern) => pattern.test(text)),
		`Pengujian belum lulus: ${file}`
	);
	assert.ok(!/AssertionError|ERR_ASSERTION|\bError:/.test(text), `Periksa kegagalan: ${file}`);
	if (file.startsWith('tmp/qa-'))
		assert.ok(
			(await lstat(path.join(root, file))).mtimeMs >= buildTime,
			`Ulangi QA setelah build: ${file}`
		);
	verification.push({ file, sha256: createHash('sha256').update(text).digest('hex') });
}
const candidateId = `kaganga-${packageInfo.version}-akses-akun-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const destination = path.join(root, 'dist/windows/candidates', candidateId);
await mkdir(destination, { recursive: true });
const files = [];
async function copy(relative) {
	const source = path.join(root, relative);
	const stat = await lstat(source);
	assert.ok(!stat.isSymbolicLink(), `Symlink tidak diizinkan: ${relative}`);
	if (stat.isDirectory()) {
		for (const entry of (await readdir(source)).sort()) {
			if (entry === '.well-known') continue;
			await copy(path.join(relative, entry));
		}
		return;
	}
	assert.ok(stat.isFile(), `Bukan berkas biasa: ${relative}`);
	if (relative.endsWith('.map')) return;
	assert.ok(
		!/(^|[\\/])(?:\.env(?:\..*)?|database.*|uploads|data|tmp)(?:[\\/]|$)|\.(?:sqlite3?|db)(?:-(?:wal|shm))?$/i.test(
			relative
		),
		`Data pribadi tidak diizinkan: ${relative}`
	);
	const target = path.join(destination, relative);
	await mkdir(path.dirname(target), { recursive: true });
	await copyFile(source, target);
	files.push({
		path: relative.replace(/\\/g, '/'),
		bytes: stat.size,
		sha256: createHash('sha256')
			.update(await readFile(target))
			.digest('hex')
	});
}
for (const relative of [
	'build',
	'package.json',
	'pnpm-lock.yaml',
	'docs/akun-massal-dan-penerapan.md',
	'docs/perbaikan-akses-absensi.md',
	'docs/perbaikan-identitas-murid.md'
])
	await copy(relative);
await writeFile(
	path.join(destination, 'manifest.json'),
	JSON.stringify(
		{
			name: 'Kaganga',
			version: packageInfo.version,
			candidateId,
			createdAt: new Date().toISOString(),
			kind: 'review-candidate-not-installer',
			productionInstallationApproved: false,
			requires:
				'Compatible Node runtime and dependencies; official installer and copied-school upgrade test before production.',
			excludes: ['database', 'uploads', '.env', 'credentials', 'QA data', 'source maps'],
			verification,
			files
		},
		null,
		2
	)
);
console.log('CANDIDATE', destination);
console.log('Berkas', files.length, '- bukan installer; tidak dipasang ke produksi.');
