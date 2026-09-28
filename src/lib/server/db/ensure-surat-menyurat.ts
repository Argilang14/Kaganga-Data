import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

async function addColumn(sql: string) {
	try {
		await db.$client.execute(sql);
	} catch {
		// Kolom sudah ada pada instalasi yang pernah dimigrasikan.
	}
}

export async function ensureSuratMenyuratSchema() {
	await ensureSchema('surat-menyurat-v2', [
		`CREATE TABLE IF NOT EXISTS "surat_sppd" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"pegawai_id" integer NOT NULL,
			"tahun_ajaran_id" integer,
			"semester_id" integer,
			"nomor_surat" text,
			"tanggal_surat" text,
			"dasar_surat" text,
			"maksud" text NOT NULL,
			"alat_angkut" text,
			"tempat_berangkat" text,
			"tempat_tujuan" text NOT NULL,
			"tanggal_berangkat" text NOT NULL,
			"tanggal_kembali" text NOT NULL,
			"status" text NOT NULL DEFAULT 'draft',
			"keterangan" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			FOREIGN KEY ("sekolah_id") REFERENCES "sekolah" ("id") ON DELETE CASCADE,
			FOREIGN KEY ("pegawai_id") REFERENCES "pegawai" ("id") ON DELETE RESTRICT,
			FOREIGN KEY ("tahun_ajaran_id") REFERENCES "tahun_ajaran" ("id") ON DELETE SET NULL,
			FOREIGN KEY ("semester_id") REFERENCES "semester" ("id") ON DELETE SET NULL
		)`,
		`CREATE INDEX IF NOT EXISTS "surat_sppd_sekolah_idx" ON "surat_sppd" ("sekolah_id")`,
		`CREATE INDEX IF NOT EXISTS "surat_sppd_pegawai_idx" ON "surat_sppd" ("pegawai_id")`,
		`CREATE INDEX IF NOT EXISTS "surat_sppd_tanggal_berangkat_idx" ON "surat_sppd" ("tanggal_berangkat")`,
		`CREATE TABLE IF NOT EXISTS "surat_sppd_pegawai" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sppd_id" integer NOT NULL,
			"pegawai_id" integer,
			"nama" text NOT NULL,
			"urutan" integer NOT NULL DEFAULT 0,
			"created_at" text NOT NULL,
			"updated_at" text,
			FOREIGN KEY ("sppd_id") REFERENCES "surat_sppd" ("id") ON DELETE CASCADE,
			FOREIGN KEY ("pegawai_id") REFERENCES "pegawai" ("id") ON DELETE SET NULL
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "surat_sppd_pegawai_unique" ON "surat_sppd_pegawai" ("sppd_id", "pegawai_id")`,
		`CREATE INDEX IF NOT EXISTS "surat_sppd_pegawai_sppd_idx" ON "surat_sppd_pegawai" ("sppd_id")`,
		`CREATE TABLE IF NOT EXISTS "surat_sppd_pengikut" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sppd_id" integer NOT NULL,
			"nama" text NOT NULL,
			"tempat_lahir" text NOT NULL,
			"tanggal_lahir" text NOT NULL,
			"created_at" text NOT NULL,
			"updated_at" text,
			FOREIGN KEY ("sppd_id") REFERENCES "surat_sppd" ("id") ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS "surat_sppd_pengikut_sppd_idx" ON "surat_sppd_pengikut" ("sppd_id")`,
		`CREATE TABLE IF NOT EXISTS "surat_dinas_luar" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"pegawai_id" integer NOT NULL,
			"sppd_id" integer,
			"maksud" text NOT NULL,
			"tempat_tujuan" text NOT NULL,
			"tanggal_berangkat" text NOT NULL,
			"tanggal_kembali" text NOT NULL,
			"status" text NOT NULL DEFAULT 'diajukan',
			"catatan" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			FOREIGN KEY ("sekolah_id") REFERENCES "sekolah" ("id") ON DELETE CASCADE,
			FOREIGN KEY ("pegawai_id") REFERENCES "pegawai" ("id") ON DELETE RESTRICT,
			FOREIGN KEY ("sppd_id") REFERENCES "surat_sppd" ("id") ON DELETE SET NULL
		)`,
		`CREATE INDEX IF NOT EXISTS "surat_dinas_luar_sekolah_idx" ON "surat_dinas_luar" ("sekolah_id")`,
		`CREATE INDEX IF NOT EXISTS "surat_dinas_luar_pegawai_idx" ON "surat_dinas_luar" ("pegawai_id")`,
		`CREATE INDEX IF NOT EXISTS "surat_dinas_luar_status_idx" ON "surat_dinas_luar" ("status")`,
		`CREATE TABLE IF NOT EXISTS "surat_dinas_luar_bukti" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sppd_id" integer NOT NULL,
			"auth_user_id" integer,
			"jenis" text NOT NULL,
			"nama_file" text NOT NULL,
			"created_at" text NOT NULL,
			"updated_at" text,
			FOREIGN KEY ("sppd_id") REFERENCES "surat_sppd" ("id") ON DELETE CASCADE,
			FOREIGN KEY ("auth_user_id") REFERENCES "auth_user" ("id") ON DELETE SET NULL
		)`,
		`CREATE INDEX IF NOT EXISTS "surat_dinas_luar_bukti_sppd_idx" ON "surat_dinas_luar_bukti" ("sppd_id")`
		,
		`CREATE TABLE IF NOT EXISTS "surat_arsip" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"arah" text NOT NULL CHECK("arah" IN ('masuk','keluar')),
			"nomor_surat" text,
			"tanggal_surat" text NOT NULL,
			"tanggal_diterima" text,
			"pengirim_penerima" text NOT NULL,
			"perihal" text NOT NULL,
			"ringkasan" text,
			"status" text NOT NULL DEFAULT 'draft' CHECK("status" IN ('draft','diajukan','disetujui','ditolak','diarsipkan')),
			"dibuat_oleh_id" integer,
			"disetujui_oleh_id" integer,
			"tanggal_persetujuan" text,
			"catatan_persetujuan" text,
			"snapshot_json" text,
			"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updated_at" text,
			FOREIGN KEY ("sekolah_id") REFERENCES "sekolah" ("id") ON DELETE CASCADE,
			FOREIGN KEY ("dibuat_oleh_id") REFERENCES "auth_user" ("id") ON DELETE SET NULL,
			FOREIGN KEY ("disetujui_oleh_id") REFERENCES "auth_user" ("id") ON DELETE SET NULL
		)`,
		`CREATE INDEX IF NOT EXISTS "surat_arsip_sekolah_arah_idx" ON "surat_arsip" ("sekolah_id", "arah")`,
		`CREATE INDEX IF NOT EXISTS "surat_arsip_sekolah_status_idx" ON "surat_arsip" ("sekolah_id", "status")`,
		`CREATE INDEX IF NOT EXISTS "surat_arsip_tanggal_idx" ON "surat_arsip" ("tanggal_surat")`
	]);

	for (const [table, column] of [
		['surat_sppd', 'lamanya text'],
		['surat_sppd', 'keterangan_pengikut text'],
		['surat_sppd', 'kode_rekening text'],
		['surat_sppd', 'tingkat_biaya text'],
		['surat_sppd', 'keterangan_lain text'],
		['surat_sppd', 'undangan_file text'],
		['surat_dinas_luar', 'undangan_file text']
	] as const) {
		await addColumn(
			`ALTER TABLE "${table}" ADD COLUMN "${column.split(' ')[0]}" ${column.split(' ').slice(1).join(' ')}`
		);
	}

	// Jadikan pegawai utama pada data lama sebagai anggota pertama tanpa menggandakan data.
	await db.$client.execute(`INSERT OR IGNORE INTO "surat_sppd_pegawai"
		("sppd_id", "pegawai_id", "nama", "urutan", "created_at")
		SELECT s.id, s.pegawai_id, p.nama, 0, COALESCE(s.created_at, CURRENT_TIMESTAMP)
		FROM "surat_sppd" s JOIN "pegawai" p ON p.id = s.pegawai_id`);
}
