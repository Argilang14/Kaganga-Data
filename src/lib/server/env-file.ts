import fs from 'node:fs/promises';
import path from 'node:path';

export function envFilePath() { return path.resolve(process.cwd(), '.env'); }

export async function updateEnvFile(updates: Record<string, string>) {
	const file = envFilePath();
	let lines: string[] = [];
	try { lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/); } catch {}
	const pending = new Set(Object.keys(updates));
	const output = lines.map((line) => {
		const match = line.match(/^([A-Za-z0-9_]+)\s*=/);
		if (!match || !pending.has(match[1])) return line;
		pending.delete(match[1]);
		return `${match[1]}=${JSON.stringify(updates[match[1]])}`;
	});
	for (const key of pending) output.push(`${key}=${JSON.stringify(updates[key])}`);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(`${file}.tmp`, `${output.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
	await fs.rename(`${file}.tmp`, file);
}
