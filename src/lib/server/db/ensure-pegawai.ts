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

export async function ensurePegawaiSchema() {
	if (ensured) return;

	await addColumnIfMissing('pegawai', 'sekolah_id', 'INTEGER');
	await addColumnIfMissing('pegawai', 'jenis', "TEXT NOT NULL DEFAULT 'guru'");
	await addColumnIfMissing('pegawai', 'jabatan', 'TEXT');
	await addColumnIfMissing('pegawai', 'status', "TEXT NOT NULL DEFAULT 'aktif'");
	await addColumnIfMissing('pegawai', 'telepon', 'TEXT');
	await addColumnIfMissing('pegawai', 'email', 'TEXT');
	await addColumnIfMissing('pegawai', 'catatan', 'TEXT');

	// Kaitkan data wali kelas lama ke sekolahnya tanpa membuat pegawai atau akun baru.
	await db.$client.execute(`
		UPDATE pegawai
		SET sekolah_id = (
			SELECT MIN(k.sekolah_id)
			FROM kelas k
			WHERE k.wali_kelas_id = pegawai.id
		)
		WHERE sekolah_id IS NULL
			AND 1 = (
				SELECT COUNT(DISTINCT k.sekolah_id)
				FROM kelas k
				WHERE k.wali_kelas_id = pegawai.id
			)
	`);
	await db.$client.execute('CREATE INDEX IF NOT EXISTS pegawai_sekolah_idx ON pegawai(sekolah_id)');
	await db.$client.execute('CREATE INDEX IF NOT EXISTS pegawai_jenis_idx ON pegawai(jenis)');
	await db.$client.execute('CREATE INDEX IF NOT EXISTS pegawai_status_idx ON pegawai(status)');

	ensured = true;
}
