import { createClient } from '@libsql/client';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
	auditMuridIdentity,
	migrateMuridIdentity
} from '../src/lib/server/db/murid-identity-migration.ts';
import { normalizedNisn, validNisn } from '../src/lib/server/murid-identity.ts';

const args = process.argv.slice(2);
const index = args.indexOf('--database');
if (index < 0 || !args[index + 1])
	throw new Error(
		'Gunakan --database <path SQLite>. Audit tidak memakai database default secara diam-diam.'
	);
const databasePath = path.resolve(args[index + 1]);
if (!(await stat(databasePath)).isFile()) throw new Error('Berkas SQLite tidak ditemukan.');
const client = createClient({ url: `file:${databasePath}` });
try {
	if (!args.includes('--apply')) await client.execute('PRAGMA query_only=ON');
	const plan = await auditMuridIdentity(client);
	const rows = (await client.execute('SELECT sekolah_id,nisn FROM murid')).rows;
	const numbers = new Map();
	for (const row of rows) {
		const value = normalizedNisn(row.nisn);
		if (validNisn(value)) {
			const key = JSON.stringify([row.sekolah_id, value]);
			numbers.set(key, (numbers.get(key) || 0) + 1);
		}
	}
	console.log(
		JSON.stringify(
			{
				mode: args.includes('--apply') ? 'apply-with-backup' : 'read-only',
				databasePath,
				totalRows: plan.totalRows,
				internalIdentities: plan.groups.length,
				reviewGroups: plan.reviewGroups,
				recoverableGroups: plan.recoverableGroups,
				missingNisn: rows.filter((row) => !normalizedNisn(row.nisn)).length,
				invalidNisn: rows.filter((row) => normalizedNisn(row.nisn) && !validNisn(row.nisn)).length,
				repeatedValidNisnGroups: [...numbers.values()].filter((n) => n > 1).length
			},
			null,
			2
		)
	);
	if (args.includes('--apply'))
		console.log(JSON.stringify(await migrateMuridIdentity(client, { databasePath }), null, 2));
} finally {
	client.close();
}
