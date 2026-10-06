import { ensureSchema } from './ensure-helper';

export async function ensureAbsenceMonitoringSchema() {
	await ensureSchema('absence-monitoring-v2', [
		`CREATE TABLE IF NOT EXISTS "izin_pulang_murid" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL REFERENCES "sekolah"("id") ON DELETE CASCADE,
			"tahun_ajaran_id" integer REFERENCES "tahun_ajaran"("id") ON DELETE SET NULL,
			"semester_id" integer REFERENCES "semester"("id") ON DELETE SET NULL,
			"kelas_id" integer REFERENCES "kelas"("id") ON DELETE SET NULL,
			"murid_id" integer REFERENCES "murid"("id") ON DELETE SET NULL,
			"nis_snapshot" text NOT NULL,
			"nisn_snapshot" text,
			"nama_snapshot" text NOT NULL,
			"kelas_snapshot" text NOT NULL,
			"tanggal_keluar" text NOT NULL,
			"waktu_keluar" text,
			"alasan" text NOT NULL,
			"penjemput_nama" text,
			"penjemput_hubungan" text,
			"penjemput_kontak" text,
			"rencana_kembali" text NOT NULL,
			"waktu_rencana_kembali" text,
			"tanggal_kembali" text,
			"waktu_kembali" text,
			"status" text NOT NULL DEFAULT 'sedang_izin' CHECK("status" IN ('sedang_izin','sudah_kembali','terlambat_kembali','dibatalkan')),
			"nomor_dokumen" text,
			"petugas_keluar_user_id" integer REFERENCES "auth_user"("id") ON DELETE SET NULL,
			"petugas_kembali_user_id" integer REFERENCES "auth_user"("id") ON DELETE SET NULL,
			"catatan" text,
			"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updated_at" text
		)`,
		`CREATE INDEX IF NOT EXISTS "izin_pulang_murid_sekolah_status_idx" ON "izin_pulang_murid" ("sekolah_id", "status")`,
		`CREATE INDEX IF NOT EXISTS "izin_pulang_murid_sekolah_tanggal_idx" ON "izin_pulang_murid" ("sekolah_id", "tanggal_keluar", "rencana_kembali")`,
		`CREATE INDEX IF NOT EXISTS "izin_pulang_murid_murid_status_idx" ON "izin_pulang_murid" ("murid_id", "status")`,
		`CREATE INDEX IF NOT EXISTS "izin_pulang_murid_context_idx" ON "izin_pulang_murid" ("tahun_ajaran_id", "semester_id", "kelas_id")`,
		`CREATE TABLE IF NOT EXISTS "tindak_lanjut_absensi" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL REFERENCES "sekolah"("id") ON DELETE CASCADE,
			"murid_id" integer REFERENCES "murid"("id") ON DELETE SET NULL,
			"nama_snapshot" text NOT NULL,
			"kelas_snapshot" text NOT NULL,
			"jenis" text NOT NULL CHECK("jenis" IN ('sakit_beruntun','sakit_berulang','alfa_berulang','izin_pulang_terlambat')),
			"periode_mulai" text NOT NULL,
			"periode_selesai" text NOT NULL,
			"status" text NOT NULL DEFAULT 'baru' CHECK("status" IN ('baru','diproses','selesai')),
			"catatan" text,
			"ditangani_oleh_user_id" integer REFERENCES "auth_user"("id") ON DELETE SET NULL,
			"ditangani_pada" text,
			"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updated_at" text,
			UNIQUE("sekolah_id", "murid_id", "jenis", "periode_mulai")
		)`,
		`CREATE INDEX IF NOT EXISTS "tindak_lanjut_absensi_sekolah_status_idx" ON "tindak_lanjut_absensi" ("sekolah_id", "status")`,
		`CREATE INDEX IF NOT EXISTS "tindak_lanjut_absensi_murid_jenis_idx" ON "tindak_lanjut_absensi" ("murid_id", "jenis")`
	]);
}
