import type { Client } from '@libsql/client';
import { createConsistentDatabaseBackup } from './database-safety.ts';

export async function migrateUnassignedMurid(client: Client, databasePath?: string) {
	const columns = await client.execute('PRAGMA table_info(murid)');
	if (!columns.rows.some((column) => column.name === 'kelas_id' && Number(column.notnull))) return;
	if (databasePath)
		await createConsistentDatabaseBackup({ client, databasePath, label: 'murid-tanpa-kelas' });
	const definition = await client.execute(
		"SELECT sql FROM sqlite_master WHERE type='table' AND name='murid'"
	);
	const original = String(definition.rows[0]?.sql ?? '');
	const sequence = /AUTOINCREMENT/i.test(original)
		? Number(
				(await client.execute("SELECT seq FROM sqlite_sequence WHERE name='murid'")).rows[0]?.seq ??
					0
			)
		: 0;
	const updated = original.replace(/([`"[]?kelas_id[`"\]]?\s+INTEGER)\s+NOT\s+NULL/i, '$1');
	if (updated === original)
		throw new Error('Definisi kelas murid tidak dikenali; migrasi dibatalkan.');
	const objects = await client.execute(
		"SELECT sql FROM sqlite_master WHERE tbl_name='murid' AND type IN ('index','trigger') AND sql IS NOT NULL"
	);
	const foreignKeys = await client.execute('PRAGMA foreign_keys');
	const legacyAlter = await client.execute('PRAGMA legacy_alter_table');
	const violations = await client.execute('PRAGMA foreign_key_check');
	const knownViolations = new Set(violations.rows.map((row) => JSON.stringify(row)));
	const names = columns.rows
		.map((column) => '"' + String(column.name).replaceAll('"', '""') + '"')
		.join(',');
	try {
		await client.execute('PRAGMA foreign_keys=OFF');
		await client.execute('PRAGMA legacy_alter_table=ON');
		const transaction = await client.transaction('write');
		try {
			await transaction.execute(
				updated.replace(
					/^(CREATE TABLE\s+)(?:"murid"|`murid`|\[murid\]|murid)/i,
					'$1murid_unassigned_migration'
				)
			);
			await transaction.execute(
				`INSERT INTO murid_unassigned_migration (${names}) SELECT ${names} FROM murid`
			);
			await transaction.execute('DROP TABLE murid');
			await transaction.execute('ALTER TABLE murid_unassigned_migration RENAME TO murid');
			for (const object of objects.rows) await transaction.execute(String(object.sql));
			if (sequence)
				await transaction.execute({
					sql: "UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='murid'",
					args: [sequence]
				});
			const after = await transaction.execute('PRAGMA foreign_key_check');
			if (after.rows.some((row) => !knownViolations.has(JSON.stringify(row))))
				throw new Error('Relasi murid berubah; migrasi dibatalkan.');
			await transaction.commit();
		} catch (cause) {
			await transaction.rollback();
			throw cause;
		} finally {
			transaction.close();
		}
	} finally {
		await client.execute(
			`PRAGMA legacy_alter_table=${Number(legacyAlter.rows[0]?.legacy_alter_table ?? 0)}`
		);
		await client.execute(`PRAGMA foreign_keys=${Number(foreignKeys.rows[0]?.foreign_keys ?? 0)}`);
	}
}
