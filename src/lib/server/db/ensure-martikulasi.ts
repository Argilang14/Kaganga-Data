import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

const MARTIKULASI = 'martikulasi-v2';

async function addColumnIfMissing(table: string, column: string, definition: string) {
	const info = await db.$client.execute(`PRAGMA table_info(${table})`);
	if (!info.rows.some((row) => String(row.name) === column)) {
		await db.$client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	}
}

export async function ensureMartikulasiSchema() {
	await ensureSchema(MARTIKULASI, [
		`CREATE TABLE IF NOT EXISTS martikulasi_settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			tahun_ajaran_id INTEGER NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
			periode_mulai TEXT,
			periode_selesai TEXT,
			nomor_sk TEXT,
			tanggal_sk TEXT,
			lokasi_penetapan TEXT,
			format_nomor_sttm TEXT NOT NULL DEFAULT '{urut}/STTM/SR/{bulan_romawi}/{tahun}',
			nomor_urut_sttm_berikutnya INTEGER NOT NULL DEFAULT 1,
			sekolah_nama_snapshot TEXT,
			npsn_snapshot TEXT,
			naungan_snapshot TEXT,
			alamat_snapshot TEXT,
			email_snapshot TEXT,
			kepala_sekolah_nama_snapshot TEXT,
			kepala_sekolah_nip_snapshot TEXT,
			kepala_sekolah_status_snapshot TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(sekolah_id, tahun_ajaran_id)
		)`,
		`CREATE INDEX IF NOT EXISTS martikulasi_settings_sekolah_idx ON martikulasi_settings(sekolah_id)`,
		`CREATE TABLE IF NOT EXISTS martikulasi_tim (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			settings_id INTEGER NOT NULL REFERENCES martikulasi_settings(id) ON DELETE CASCADE,
			pegawai_id INTEGER REFERENCES pegawai(id) ON DELETE SET NULL,
			nama_snapshot TEXT NOT NULL,
			nip_snapshot TEXT,
			jabatan_tim TEXT NOT NULL,
			tugas TEXT,
			urutan INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS martikulasi_tim_settings_idx ON martikulasi_tim(settings_id)`,
		`CREATE TABLE IF NOT EXISTS martikulasi_hasil (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			tahun_ajaran_id INTEGER NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
			kelas_id INTEGER NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
			status_kelengkapan TEXT NOT NULL DEFAULT 'belum_lengkap',
			level_penempatan TEXT,
			rekomendasi TEXT,
			catatan_umum TEXT,
			nomor_sttm TEXT,
			tanggal_sttm TEXT,
			murid_nama_snapshot TEXT,
			nis_snapshot TEXT,
			nisn_snapshot TEXT,
			kelas_nama_snapshot TEXT,
			jenjang_snapshot TEXT,
			wali_kelas_nama_snapshot TEXT,
			wali_kelas_nip_snapshot TEXT,
			sekolah_nama_snapshot TEXT,
			npsn_snapshot TEXT,
			naungan_snapshot TEXT,
			alamat_snapshot TEXT,
			email_snapshot TEXT,
			kepala_sekolah_nama_snapshot TEXT,
			kepala_sekolah_nip_snapshot TEXT,
			kepala_sekolah_status_snapshot TEXT,
			lokasi_penetapan_snapshot TEXT,
			level_penempatan_snapshot TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(sekolah_id, tahun_ajaran_id, murid_id)
		)`,
		`CREATE INDEX IF NOT EXISTS martikulasi_hasil_sekolah_tahun_idx ON martikulasi_hasil(sekolah_id, tahun_ajaran_id)`,
		`CREATE INDEX IF NOT EXISTS martikulasi_hasil_kelas_idx ON martikulasi_hasil(kelas_id)`,
		`CREATE TABLE IF NOT EXISTS martikulasi_nilai (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			hasil_id INTEGER NOT NULL REFERENCES martikulasi_hasil(id) ON DELETE CASCADE,
			aspek_kode TEXT NOT NULL,
			kelompok TEXT NOT NULL,
			capaian_awal TEXT,
			capaian_akhir TEXT,
			ketuntasan TEXT,
			catatan TEXT,
			deskripsi_capaian TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT,
			UNIQUE(hasil_id, aspek_kode)
		)`,
		`CREATE INDEX IF NOT EXISTS martikulasi_nilai_hasil_idx ON martikulasi_nilai(hasil_id)`
	]);

	for (const [column, definition] of [
		['sekolah_nama_snapshot', 'TEXT'],
		['npsn_snapshot', 'TEXT'],
		['naungan_snapshot', 'TEXT'],
		['alamat_snapshot', 'TEXT'],
		['email_snapshot', 'TEXT'],
		['kepala_sekolah_nama_snapshot', 'TEXT'],
		['kepala_sekolah_nip_snapshot', 'TEXT'],
		['kepala_sekolah_status_snapshot', 'TEXT']
	]) {
		await addColumnIfMissing('martikulasi_settings', column, definition);
	}
	for (const [column, definition] of [
		['murid_nama_snapshot', 'TEXT'],
		['nis_snapshot', 'TEXT'],
		['nisn_snapshot', 'TEXT'],
		['kelas_nama_snapshot', 'TEXT'],
		['jenjang_snapshot', 'TEXT'],
		['wali_kelas_nama_snapshot', 'TEXT'],
		['wali_kelas_nip_snapshot', 'TEXT'],
		['sekolah_nama_snapshot', 'TEXT'],
		['npsn_snapshot', 'TEXT'],
		['naungan_snapshot', 'TEXT'],
		['alamat_snapshot', 'TEXT'],
		['email_snapshot', 'TEXT'],
		['kepala_sekolah_nama_snapshot', 'TEXT'],
		['kepala_sekolah_nip_snapshot', 'TEXT'],
		['kepala_sekolah_status_snapshot', 'TEXT'],
		['lokasi_penetapan_snapshot', 'TEXT'],
		['level_penempatan_snapshot', 'TEXT']
	]) {
		await addColumnIfMissing('martikulasi_hasil', column, definition);
	}

	await db.$client.execute(`UPDATE martikulasi_hasil
		SET level_penempatan = CASE level_penempatan
			WHEN 'perlu_penguatan' THEN 'dasar'
			WHEN 'siap_dengan_pendampingan' THEN 'madya'
			WHEN 'siap' THEN 'mahir'
			ELSE level_penempatan
		END
		WHERE level_penempatan IN ('perlu_penguatan', 'siap_dengan_pendampingan', 'siap')`);
}
