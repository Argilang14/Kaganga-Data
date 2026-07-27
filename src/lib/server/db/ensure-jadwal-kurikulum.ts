import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
	const result = (await db.$client.execute(`PRAGMA table_info(${tableName})`)) as unknown as {
		rows?: Array<Record<string, unknown> | unknown[]>;
	};
	const rows = result.rows ?? [];
	const hasColumn = rows.some((row) =>
		Array.isArray(row) ? row[1] === columnName : row.name === columnName
	);
	if (hasColumn) return;

	try {
		await db.$client.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
		if (message.includes('duplicate column')) return;
		throw error;
	}
}

export async function ensureJadwalKurikulumSchema() {
	await ensureSchema('jadwal_kurikulum', [
		`CREATE TABLE IF NOT EXISTS "jadwal_template" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"tahun_ajaran_id" integer,
			"semester_id" integer,
			"jenis" text DEFAULT 'ganjil' NOT NULL,
			"nama" text NOT NULL,
			"jenjang" text DEFAULT 'semua' NOT NULL,
			"aktif" integer DEFAULT 1 NOT NULL,
			"created_at" text NOT NULL,
			"updated_at" text
		)`,
		`CREATE INDEX IF NOT EXISTS "jadwal_template_sekolah_idx" ON "jadwal_template" ("sekolah_id")`,
		`CREATE TABLE IF NOT EXISTS "jadwal_jam" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"template_id" integer,
			"jenjang" text DEFAULT 'srma' NOT NULL,
			"hari" text NOT NULL,
			"jam_ke" integer NOT NULL,
			"label" text,
			"pukul_mulai" text NOT NULL,
			"pukul_selesai" text NOT NULL,
			"tipe" text DEFAULT 'pelajaran' NOT NULL,
			"nama_default" text,
			"urutan" integer DEFAULT 0 NOT NULL,
			"aktif" integer DEFAULT 1 NOT NULL,
			"created_at" text NOT NULL,
			"updated_at" text
		)`,
		`CREATE INDEX IF NOT EXISTS "jadwal_jam_sekolah_hari_idx" ON "jadwal_jam" ("sekolah_id", "hari")`,
		`CREATE TABLE IF NOT EXISTS "jadwal_kegiatan" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"kode" text NOT NULL,
			"nama" text NOT NULL,
			"kategori" text DEFAULT 'umum' NOT NULL,
			"warna" text,
			"aktif" integer DEFAULT 1 NOT NULL,
			"created_at" text NOT NULL,
			"updated_at" text
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "jadwal_kegiatan_sekolah_kode_unique" ON "jadwal_kegiatan" ("sekolah_id", "kode")`,
		`CREATE TABLE IF NOT EXISTS "jadwal_mata_pelajaran" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"kode" text NOT NULL,
			"nama" text NOT NULL,
			"jenjang" text DEFAULT 'semua' NOT NULL,
			"fase" text,
			"kategori" text DEFAULT 'akademik' NOT NULL,
			"guru_pegawai_id" integer,
			"jp_per_minggu" integer DEFAULT 0 NOT NULL,
			"warna" text,
			"aktif" integer DEFAULT 1 NOT NULL,
			"catatan" text,
			"created_at" text NOT NULL,
			"updated_at" text
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "jadwal_mapel_sekolah_kode_unique" ON "jadwal_mata_pelajaran" ("sekolah_id", "kode")`,
		`CREATE TABLE IF NOT EXISTS "kalender_pendidikan" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"tahun_ajaran_id" integer,
			"semester_id" integer,
			"kelas_id" integer,
			"tanggal_mulai" text NOT NULL,
			"tanggal_selesai" text NOT NULL,
			"judul" text NOT NULL,
			"jenis" text DEFAULT 'lainnya' NOT NULL,
			"jenjang" text DEFAULT 'semua' NOT NULL,
			"keterangan" text,
			"warna" text,
			"created_at" text NOT NULL,
			"updated_at" text
		)`,
		`CREATE INDEX IF NOT EXISTS "kalender_pendidikan_sekolah_tanggal_idx" ON "kalender_pendidikan" ("sekolah_id", "tanggal_mulai")`
	]);

	await addColumnIfMissing('jadwal_template', 'jenis', "text DEFAULT 'ganjil' NOT NULL");
	await addColumnIfMissing('jadwal_pelajaran', 'semester_id', 'integer');
	await addColumnIfMissing('jadwal_pelajaran', 'template_id', 'integer');
	await addColumnIfMissing('jadwal_pelajaran', 'jam_id', 'integer');
	await addColumnIfMissing('jadwal_pelajaran', 'tipe', "text DEFAULT 'pelajaran' NOT NULL");
	await addColumnIfMissing('jadwal_pelajaran', 'jadwal_mapel_id', 'integer');
	await addColumnIfMissing('jadwal_pelajaran', 'mata_pelajaran_id', 'integer');
	await addColumnIfMissing('jadwal_pelajaran', 'kokurikuler_id', 'integer');
	await addColumnIfMissing('jadwal_pelajaran', 'kegiatan_id', 'integer');
	await addColumnIfMissing('jadwal_mata_pelajaran', 'jp_per_minggu', 'integer DEFAULT 0 NOT NULL');
	await addColumnIfMissing('jadwal_pelajaran', 'guru_pegawai_id', 'integer');
	await addColumnIfMissing('jadwal_pelajaran', 'catatan', 'text');

	await db.$client.execute(`UPDATE jadwal_pelajaran
		SET jam_ke = COALESCE(
			(SELECT jam_ke FROM jadwal_jam WHERE jadwal_jam.id = jadwal_pelajaran.jam_id),
			jam_ke
		)
		WHERE jam_ke = 0`);
	await db.$client.execute(`UPDATE jadwal_pelajaran
		SET kode_kegiatan = COALESCE(
			(SELECT kode FROM jadwal_mata_pelajaran WHERE jadwal_mata_pelajaran.id = jadwal_pelajaran.jadwal_mapel_id),
			(SELECT kode FROM jadwal_kegiatan WHERE jadwal_kegiatan.id = jadwal_pelajaran.kegiatan_id),
			NULLIF(tipe, ''),
			'-'
		)
		WHERE kode_kegiatan = ''`);
}