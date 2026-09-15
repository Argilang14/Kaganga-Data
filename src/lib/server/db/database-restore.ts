import type { Client } from '@libsql/client';

function identifier(value: string) {
	return `"${value.replaceAll('"', '""')}"`;
}

// Restore in a transaction; do not replace files held open by Windows.
export async function restoreDatabaseContents(client: Client, sourcePath: string) {
	const foreignKeys = await client.execute('PRAGMA foreign_keys');
	let attached = false;
	try {
		const source = sourcePath.replaceAll('\\', '/').replaceAll("'", "''");
		await client.execute(`ATTACH DATABASE '${source}' AS kaganga_restore`);
		attached = true;
		const incoming = await client.execute(
			"SELECT type, name, sql FROM kaganga_restore.sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name"
		);
		const current = await client.execute(
			"SELECT type, name, sql FROM main.sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'view')"
		);
		if (
			[...incoming.rows, ...current.rows].some((row) =>
				/^CREATE\s+VIRTUAL\s+TABLE/i.test(String(row.sql))
			)
		) {
			throw new Error('Backup dengan virtual table belum didukung untuk pemulihan.');
		}
		const violations = await client.execute('PRAGMA kaganga_restore.foreign_key_check');
		const statements: string[] = [];
		for (const type of ['view', 'table']) {
			for (const row of current.rows.filter((row) => row.type === type)) {
				statements.push(`DROP ${type.toUpperCase()} main.${identifier(String(row.name))}`);
			}
		}
		const tables = incoming.rows.filter((row) => row.type === 'table');
		for (const row of tables) statements.push(String(row.sql));
		for (const row of tables) {
			const name = identifier(String(row.name));
			const columns = await client.execute(`PRAGMA kaganga_restore.table_xinfo(${name})`);
			const writable = columns.rows
				.filter((column) => Number(column.hidden) === 0)
				.map((column) => identifier(String(column.name)))
				.join(', ');
			statements.push(
				`INSERT INTO main.${name} (${writable}) SELECT ${writable} FROM kaganga_restore.${name}`
			);
		}
		const sequence = await client.execute(
			"SELECT name FROM kaganga_restore.sqlite_master WHERE name='sqlite_sequence'"
		);
		if (sequence.rows.length) {
			statements.push('DELETE FROM main.sqlite_sequence');
			statements.push(
				'INSERT INTO main.sqlite_sequence SELECT * FROM kaganga_restore.sqlite_sequence'
			);
		}
		for (const type of ['index', 'view', 'trigger']) {
			for (const row of incoming.rows.filter((row) => row.type === type))
				statements.push(String(row.sql));
		}
		// Constraint failures roll back schema and data together.
		statements.push('CREATE TEMP TABLE kaganga_restore_check (value INTEGER CHECK(value=0))');
		for (const row of tables) {
			const name = identifier(String(row.name));
			statements.push(
				`INSERT INTO temp.kaganga_restore_check SELECT (SELECT COUNT(*) FROM main.${name}) - (SELECT COUNT(*) FROM kaganga_restore.${name})`
			);
		}
		statements.push(
			`INSERT INTO temp.kaganga_restore_check SELECT COUNT(*) - ${violations.rows.length} FROM pragma_foreign_key_check`
		);
		statements.push(
			"INSERT INTO temp.kaganga_restore_check SELECT COUNT(*) FROM pragma_quick_check WHERE quick_check != 'ok'"
		);
		statements.push('DROP TABLE temp.kaganga_restore_check');
		for (const pragma of ['user_version', 'application_id']) {
			const result = await client.execute(`PRAGMA kaganga_restore.${pragma}`);
			statements.push(`PRAGMA main.${pragma}=${Number(result.rows[0]?.[pragma] ?? 0)}`);
		}
		await client.execute('PRAGMA foreign_keys=OFF');
		await client.batch(statements, 'write');
	} finally {
		try {
			if (attached) await client.execute('DETACH DATABASE kaganga_restore');
		} finally {
			await client.execute(`PRAGMA foreign_keys=${Number(foreignKeys.rows[0]?.foreign_keys ?? 0)}`);
		}
	}
}
