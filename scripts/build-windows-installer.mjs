import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipPrepare = process.argv.includes('--skip-prepare');

if (!skipPrepare) {
	console.info('Menyiapkan build dan staging Windows terbaru...');
	const prepareResult = spawnSync(process.execPath, ['scripts/prepare-windows.mjs'], {
		cwd: rootDir,
		stdio: 'inherit'
	});
	if (prepareResult.error) throw prepareResult.error;
	if (prepareResult.status !== 0) process.exit(prepareResult.status ?? 1);
} else {
	console.info('Melewati persiapan staging karena --skip-prepare diberikan.');
}

const configuredCompiler = process.env.INNO_SETUP_COMPILER?.trim();
const candidates = [
	configuredCompiler,
	process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
	process.env['ProgramFiles(x86)'] &&
		join(process.env['ProgramFiles(x86)'], 'Inno Setup 6', 'ISCC.exe'),
	process.env.ProgramFiles && join(process.env.ProgramFiles, 'Inno Setup 6', 'ISCC.exe')
].filter(Boolean);

const compiler = candidates.find((candidate) => existsSync(candidate));
if (!compiler) {
	throw new Error(
		'Inno Setup compiler tidak ditemukan. Pasang Inno Setup 6 atau set INNO_SETUP_COMPILER.'
	);
}

console.info(`Menggunakan Inno Setup: ${compiler}`);
const result = spawnSync(compiler, ['installer/rapkumer.iss'], {
	cwd: rootDir,
	stdio: 'inherit'
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
