import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';

const root = process.cwd();
const latest = JSON.parse(await readFile('tmp/report-archive-latest.json', 'utf8'));
const fixture = JSON.parse(await readFile(path.join(latest.folder, 'ui-fixture.json'), 'utf8'));
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/report-archive-upgrade-')),
	database = path.join(folder, 'database.sqlite3');
assert.ok(database.startsWith(path.resolve('tmp') + path.sep));
assert.notEqual(path.resolve(database), path.resolve('data/database.sqlite3'));
const source = createClient({ url: `file:${fixture.database}` });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
process.env.photo = fixture.uploadRoot;
const client = createClient({ url: process.env.DB_URL });
let vite, connection;
try {
	// Only this disposable copy is reduced to the v1 layout; the source QA database stays intact.
	await client.execute('DROP TABLE rapor_arsip_revisi');
	const before = (await client.execute('SELECT * FROM rapor_arsip ORDER BY id')).rows;
	assert.ok(before.length > 0);
	vite = await createServer({
		configFile: false,
		resolve: { alias: { $lib: path.join(root, 'src/lib') } },
		plugins: [
			{
				name: 'qa-env',
				resolveId(id) {
					if (id === '$env/dynamic/private') return '\0qa-env';
				},
				load(id) {
					if (id === '\0qa-env') return 'export const env=process.env;';
				}
			}
		],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		appType: 'custom',
		logLevel: 'error'
	});
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const migration = await vite.ssrLoadModule('/src/lib/server/db/ensure-report-archive.ts');
	await migration.ensureReportArchiveSchema();
	await migration.ensureReportArchiveSchema();
	assert.deepEqual((await client.execute('SELECT * FROM rapor_arsip ORDER BY id')).rows, before);
	assert.equal((await client.execute('SELECT COUNT(*) n FROM rapor_arsip_revisi')).rows[0].n, 0);
	const row = before.find((v) => v.id === fixture.baseArchiveId);
	assert.ok(row);
	const bytes = await readFile(path.join(fixture.uploadRoot, 'rapor-arsip', row.storage_key));
	assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
	assert.equal((await client.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	await assert.rejects(() =>
		client.execute({
			sql: "UPDATE rapor_arsip SET source_hash='changed' WHERE id=?",
			args: [row.id]
		})
	);
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify(
			{
				schemaUpgrade: 'v1 to v2 additive',
				idempotent: true,
				baseRowsPreserved: before.length,
				pdfHashVerified: true,
				productionUnchanged: true
			},
			null,
			2
		)
	);
	console.log(
		'PASS v1 to v2 schema upgrade preserves original snapshots and PDFs, is idempotent and passes FK/integrity checks'
	);
	console.log(folder);
} finally {
	await connection?.closeDbClient();
	await vite?.close();
	client.close();
}
