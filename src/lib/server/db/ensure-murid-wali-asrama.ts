import db from '$lib/server/db';

let ensured = false;

async function hasColumn(table: string, column: string) {
	const result = await db.$client.execute(`PRAGMA table_info("${table}")`);
	return result.rows.some((row) => String(row.name) === column);
}

async function addColumnIfMissing(table: string, column: string, type: string) {
	if (await hasColumn(table, column)) return;
	await db.$client.execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
}

export async function ensureMuridWaliAsramaSchema() {
	if (ensured) return;

	await addColumnIfMissing('murid', 'wali_asrama_nama', 'TEXT');
	await addColumnIfMissing('murid', 'wali_asrama_nip', 'TEXT');

	ensured = true;
}
