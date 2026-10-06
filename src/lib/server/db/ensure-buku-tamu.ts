import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

async function hasColumn(table: string, column: string) {
	const result = (await db.$client.execute(`PRAGMA table_info(${table})`)) as unknown as {
		rows?: Array<Record<string, unknown> | unknown[]>;
	};
	return (result.rows ?? []).some((row) =>
		Array.isArray(row) ? row[1] === column : row.name === column
	);
}

export async function ensureBukuTamuSchema() {
	await ensureSchema('buku-tamu', [
		`CREATE TABLE IF NOT EXISTS buku_tamu (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			sekolah_id integer NOT NULL,
			tahun_ajaran_id integer,
			semester_id integer,
			nama text NOT NULL,
			asal_instansi text NOT NULL,
			nip text,
			keperluan text NOT NULL,
			pesan_kesan text,
			tanda_tangan text,
			created_at text NOT NULL,
			updated_at text,
			FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE,
			FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id) ON DELETE SET NULL,
			FOREIGN KEY (semester_id) REFERENCES semester(id) ON DELETE SET NULL
		)`,
		`CREATE INDEX IF NOT EXISTS buku_tamu_sekolah_idx ON buku_tamu (sekolah_id)`,
		`CREATE INDEX IF NOT EXISTS buku_tamu_tanggal_idx ON buku_tamu (created_at)`,
		`CREATE TABLE IF NOT EXISTS buku_tamu_settings (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			sekolah_id integer NOT NULL,
			public_token text,
			passkey_hash text,
			passkey_salt text,
			unlock_token text,
			created_at text NOT NULL,
			updated_at text,
			FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE,
			UNIQUE (sekolah_id)
		)`
	]);

	if (!(await hasColumn('buku_tamu_settings', 'public_token'))) {
		await db.$client.execute('ALTER TABLE buku_tamu_settings ADD COLUMN public_token text');
	}
	await db.$client.execute(
		'CREATE UNIQUE INDEX IF NOT EXISTS buku_tamu_settings_public_token_idx ON buku_tamu_settings (public_token)'
	);
}
