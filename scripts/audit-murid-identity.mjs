import { createClient } from '@libsql/client';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
	auditMuridIdentity,
	migrateMuridIdentity
} from '../src/lib/server/db/murid-identity-migration.ts';
import { normalizedNisn, validNisn } from '../src/lib/server/murid-identity.ts';
import { identityIntegrityProblem } from '../src/lib/server/murid-identity-integrity.ts';

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
	const tables = new Set(
		(await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(
			(row) => row.name
		)
	);
	const currentGroups = new Map();
	if (tables.has('murid_identity_link')) {
		const links =
			await client.execute(`SELECT mi.identity_uid,mi.sekolah_id AS link_school_id,mi.semester_id AS link_semester_id,m.*
			FROM murid_identity_link mi JOIN murid m ON m.id=mi.murid_id`);
		for (const row of links.rows) {
			const key = JSON.stringify([row.link_school_id, row.identity_uid]);
			const group = currentGroups.get(key) || {
				schoolId: Number(row.link_school_id),
				uid: row.identity_uid,
				members: []
			};
			group.members.push({
				id: Number(row.id),
				sekolahId: Number(row.sekolah_id),
				semesterId: Number(row.semester_id),
				linkSchoolId: Number(row.link_school_id),
				linkSemesterId: Number(row.link_semester_id),
				nis: row.nis,
				nama: row.nama,
				tanggalLahir: row.tanggal_lahir
			});
			currentGroups.set(key, group);
		}
	}
	const identityConflicts = [...currentGroups.values()].flatMap((group) => {
		const problem = identityIntegrityProblem(group.members, group.schoolId);
		return problem
			? [
					{
						schoolId: group.schoolId,
						identityUid: group.uid,
						muridIds: group.members.map((row) => row.id),
						problem
					}
				]
			: [];
	});
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
				identityConflicts,
				pendingReviews: plan.groups
					.filter((group) => group.review)
					.map((group) => ({
						schoolId: group.rows[0].sekolah_id,
						identityUid: group.uid,
						muridIds: group.rows.map((row) => row.id),
						nama: group.rows.at(-1).nama,
						status: group.status,
						reason: group.reason
					})),
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
