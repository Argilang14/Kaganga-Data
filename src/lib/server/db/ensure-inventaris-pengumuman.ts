import { ensureSchema } from './ensure-helper';

export async function ensureInventarisPengumumanSchema() {
	await ensureSchema('inventaris-pengumuman-v1', [
		`CREATE TABLE IF NOT EXISTS inventaris (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			kode TEXT NOT NULL,
			nama TEXT NOT NULL,
			kategori TEXT NOT NULL,
			lokasi TEXT,
			kondisi TEXT NOT NULL DEFAULT 'baik' CHECK(kondisi IN ('baik','rusak_ringan','rusak_berat','hilang')),
			jumlah INTEGER NOT NULL DEFAULT 1,
			satuan TEXT NOT NULL DEFAULT 'unit',
			sumber_dana TEXT,
			tahun_perolehan INTEGER,
			nilai_perolehan REAL,
			penanggung_jawab_id INTEGER REFERENCES pegawai(id) ON DELETE SET NULL,
			qr_token TEXT NOT NULL,
			catatan TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT,
			UNIQUE(sekolah_id, kode),
			UNIQUE(qr_token)
		)`,
		`CREATE INDEX IF NOT EXISTS inventaris_sekolah_kategori_idx ON inventaris(sekolah_id, kategori)`,
		`CREATE INDEX IF NOT EXISTS inventaris_sekolah_kondisi_idx ON inventaris(sekolah_id, kondisi)`,
		`CREATE TABLE IF NOT EXISTS inventaris_peminjaman (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			inventaris_id INTEGER NOT NULL REFERENCES inventaris(id) ON DELETE CASCADE,
			peminjam_pegawai_id INTEGER REFERENCES pegawai(id) ON DELETE SET NULL,
			peminjam_nama TEXT NOT NULL,
			jumlah INTEGER NOT NULL DEFAULT 1,
			tanggal_pinjam TEXT NOT NULL,
			rencana_kembali TEXT,
			tanggal_kembali TEXT,
			status TEXT NOT NULL DEFAULT 'dipinjam' CHECK(status IN ('dipinjam','dikembalikan')),
			kondisi_kembali TEXT,
			catatan TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS inventaris_peminjaman_asset_status_idx ON inventaris_peminjaman(inventaris_id, status)`,
		`CREATE TABLE IF NOT EXISTS inventaris_perawatan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			inventaris_id INTEGER NOT NULL REFERENCES inventaris(id) ON DELETE CASCADE,
			tanggal TEXT NOT NULL,
			jenis TEXT NOT NULL,
			biaya REAL,
			keterangan TEXT,
			pegawai_id INTEGER REFERENCES pegawai(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS inventaris_perawatan_asset_tanggal_idx ON inventaris_perawatan(inventaris_id, tanggal)`,
		`CREATE TABLE IF NOT EXISTS pengumuman (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			judul TEXT NOT NULL,
			isi TEXT NOT NULL,
			kategori TEXT NOT NULL DEFAULT 'umum' CHECK(kategori IN ('umum','sekolah','asrama','akademik')),
			audiens TEXT NOT NULL DEFAULT 'semua' CHECK(audiens IN ('semua','admin','guru','wali_kelas','wali_asuh','wali_asrama')),
			prioritas TEXT NOT NULL DEFAULT 'normal' CHECK(prioritas IN ('normal','penting')),
			tanggal_mulai TEXT NOT NULL,
			tanggal_selesai TEXT,
			aktif INTEGER NOT NULL DEFAULT 1,
			dibuat_oleh_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS pengumuman_sekolah_periode_idx ON pengumuman(sekolah_id, tanggal_mulai, tanggal_selesai)`,
		`CREATE INDEX IF NOT EXISTS pengumuman_sekolah_audiens_idx ON pengumuman(sekolah_id, audiens, aktif)`
	]);
}
