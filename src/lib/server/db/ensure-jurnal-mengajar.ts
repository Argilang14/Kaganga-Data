import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
	const result = (await db.$client.execute('PRAGMA table_info(' + tableName + ')')) as unknown as {
		rows?: Array<Record<string, unknown> | unknown[]>;
	};
	const rows = result.rows ?? [];
	const hasColumn = rows.some((row) =>
		Array.isArray(row) ? row[1] === columnName : row.name === columnName
	);
	if (hasColumn) return;

	try {
		await db.$client.execute(
			'ALTER TABLE ' + tableName + ' ADD COLUMN ' + columnName + ' ' + definition
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
		if (message.includes('duplicate column')) return;
		throw error;
	}
}

async function makeLegacyMapelNullable() {
	const result = (await db.$client.execute('PRAGMA table_info(jurnal_mengajar)')) as unknown as {
		rows?: Array<Record<string, unknown> | unknown[]>;
	};
	const mapelColumn = (result.rows ?? []).find((row) =>
		Array.isArray(row) ? row[1] === 'mata_pelajaran_id' : row.name === 'mata_pelajaran_id'
	);
	const isRequired = Array.isArray(mapelColumn)
		? Number(mapelColumn[3]) === 1
		: Number(mapelColumn?.notnull) === 1;
	if (!isRequired) return;

	await db.$client.batch(
		[
			'DROP TABLE IF EXISTS jurnal_mengajar_v2',
			`CREATE TABLE jurnal_mengajar_v2 (
				id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				sekolah_id integer,
				auth_user_id integer NOT NULL,
				kelas_id integer NOT NULL,
				mata_pelajaran_id integer,
				jadwal_mapel_id integer,
				tahun_ajaran_id integer,
				semester_id integer,
				jenis_jadwal text,
				jadwal_template_id integer,
				jadwal_pelajaran_ids text,
				tanggal text NOT NULL,
				jam_pelajaran text NOT NULL,
				pukul text,
				lingkup_materi text NOT NULL,
				tujuan_pembelajaran_id integer,
				tujuan_pembelajaran_manual text,
				catatan text,
				created_at text NOT NULL,
				updated_at text,
				FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE,
				FOREIGN KEY (auth_user_id) REFERENCES auth_user(id) ON DELETE CASCADE,
				FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
				FOREIGN KEY (mata_pelajaran_id) REFERENCES mata_pelajaran(id) ON DELETE SET NULL,
				FOREIGN KEY (jadwal_mapel_id) REFERENCES jadwal_mata_pelajaran(id) ON DELETE SET NULL,
				FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id) ON DELETE SET NULL,
				FOREIGN KEY (semester_id) REFERENCES semester(id) ON DELETE SET NULL,
				FOREIGN KEY (jadwal_template_id) REFERENCES jadwal_template(id) ON DELETE SET NULL,
				FOREIGN KEY (tujuan_pembelajaran_id) REFERENCES tujuan_pembelajaran(id) ON DELETE SET NULL
			)`,
			`INSERT INTO jurnal_mengajar_v2 (
				id, sekolah_id, auth_user_id, kelas_id, mata_pelajaran_id, jadwal_mapel_id,
				tahun_ajaran_id, semester_id, jenis_jadwal, jadwal_template_id,
				jadwal_pelajaran_ids, tanggal, jam_pelajaran, pukul, lingkup_materi,
				tujuan_pembelajaran_id, tujuan_pembelajaran_manual, catatan, created_at, updated_at
			) SELECT
				id, sekolah_id, auth_user_id, kelas_id, mata_pelajaran_id, jadwal_mapel_id,
				tahun_ajaran_id, semester_id, jenis_jadwal, jadwal_template_id,
				jadwal_pelajaran_ids, tanggal, jam_pelajaran, pukul, lingkup_materi,
				tujuan_pembelajaran_id, tujuan_pembelajaran_manual, catatan, created_at, updated_at
			FROM jurnal_mengajar`,
			'DROP TABLE jurnal_mengajar',
			'ALTER TABLE jurnal_mengajar_v2 RENAME TO jurnal_mengajar'
		],
		'write'
	);
}

export async function ensureJurnalMengajarSchema() {
	await ensureSchema('jurnal_mengajar', [
		`CREATE TABLE IF NOT EXISTS "jurnal_mengajar" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"auth_user_id" integer NOT NULL,
			"kelas_id" integer NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"tanggal" text NOT NULL,
			"jam_pelajaran" text NOT NULL,
			"lingkup_materi" text NOT NULL,
			"tujuan_pembelajaran_id" integer,
			"tujuan_pembelajaran_manual" text,
			"catatan" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "jurnal_mengajar_auth_user_id_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth_user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "jurnal_mengajar_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "kelas" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "jurnal_mengajar_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "jurnal_mengajar_tujuan_pembelajaran_id_tujuan_pembelajaran_id_fk" FOREIGN KEY ("tujuan_pembelajaran_id") REFERENCES "tujuan_pembelajaran" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
		)`,
		`CREATE INDEX IF NOT EXISTS "jurnal_mengajar_auth_user_idx" ON "jurnal_mengajar" ("auth_user_id")`
	]);

	await addColumnIfMissing('jurnal_mengajar', 'tujuan_pembelajaran_manual', 'text');
	await addColumnIfMissing('jurnal_mengajar', 'sekolah_id', 'integer');
	await addColumnIfMissing('jurnal_mengajar', 'tahun_ajaran_id', 'integer');
	await addColumnIfMissing('jurnal_mengajar', 'semester_id', 'integer');
	await addColumnIfMissing('jurnal_mengajar', 'jenis_jadwal', 'text');
	await addColumnIfMissing('jurnal_mengajar', 'jadwal_template_id', 'integer');
	await addColumnIfMissing('jurnal_mengajar', 'jadwal_pelajaran_ids', 'text');
	await addColumnIfMissing('jurnal_mengajar', 'pukul', 'text');
	await addColumnIfMissing('jurnal_mengajar', 'jadwal_mapel_id', 'integer');
	await makeLegacyMapelNullable();
	await db.$client.execute(
		'CREATE INDEX IF NOT EXISTS jurnal_mengajar_context_idx ON jurnal_mengajar (sekolah_id, tahun_ajaran_id, jenis_jadwal, tanggal)'
	);
	await db.$client.execute(
		'CREATE INDEX IF NOT EXISTS jurnal_mengajar_kelas_tanggal_idx ON jurnal_mengajar (kelas_id, tanggal)'
	);
	await db.$client.execute(`
		UPDATE jurnal_mengajar
		SET sekolah_id = (SELECT sekolah_id FROM kelas WHERE kelas.id = jurnal_mengajar.kelas_id),
			tahun_ajaran_id = (SELECT tahun_ajaran_id FROM kelas WHERE kelas.id = jurnal_mengajar.kelas_id),
			semester_id = (SELECT semester_id FROM kelas WHERE kelas.id = jurnal_mengajar.kelas_id),
			jenis_jadwal = COALESCE(
				jenis_jadwal,
				(SELECT tipe FROM semester WHERE semester.id = (
					SELECT semester_id FROM kelas WHERE kelas.id = jurnal_mengajar.kelas_id
				))
			)
		WHERE sekolah_id IS NULL OR tahun_ajaran_id IS NULL OR jenis_jadwal IS NULL
	`);
}
