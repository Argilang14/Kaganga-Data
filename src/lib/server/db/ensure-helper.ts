import db from '$lib/server/db';

const ensured = new Map<string, boolean>();

export async function ensureSchema(name: string, statements: string[]) {
	if (ensured.get(name)) return;
	for (const statement of statements) {
		await db.$client.execute(statement);
	}
	ensured.set(name, true);
}

/** Reset cache setelah koneksi diarahkan ke file database lain. */
export function resetEnsuredSchemas() {
	ensured.clear();
}
