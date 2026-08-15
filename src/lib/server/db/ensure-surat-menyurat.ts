import { ensureSchema } from './ensure-helper';

export async function ensureSuratMenyuratSchema() {
	await ensureSchema('surat-menyurat', [
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
		`CREATE INDEX IF NOT EXISTS "surat_dinas_luar_status_idx" ON "surat_dinas_luar" ("status")`
	]);
}
