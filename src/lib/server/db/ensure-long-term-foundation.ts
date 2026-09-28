import { ensureSchema } from './ensure-helper';

export async function ensureLongTermFoundationSchema() {
	await ensureSchema('long-term-foundation-v1', [
		`CREATE TABLE IF NOT EXISTS auth_user_murid (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			auth_user_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
			murid_id INTEGER NOT NULL REFERENCES murid(id) ON DELETE CASCADE,
			hubungan TEXT NOT NULL DEFAULT 'wali',
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT,
			UNIQUE(auth_user_id, murid_id)
		)`,
		`CREATE INDEX IF NOT EXISTS auth_user_murid_user_idx ON auth_user_murid(auth_user_id)`,
		`CREATE INDEX IF NOT EXISTS auth_user_murid_murid_idx ON auth_user_murid(murid_id)`,
		`CREATE TABLE IF NOT EXISTS ruangan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			kode TEXT NOT NULL,
			nama TEXT NOT NULL,
			jenis TEXT NOT NULL DEFAULT 'kelas',
			kapasitas INTEGER,
			lokasi TEXT,
			kondisi TEXT NOT NULL DEFAULT 'baik' CHECK(kondisi IN ('baik','rusak_ringan','rusak_berat','tidak_aktif')),
			fasilitas TEXT,
			catatan TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT,
			UNIQUE(sekolah_id, kode)
		)`,
		`CREATE INDEX IF NOT EXISTS ruangan_sekolah_jenis_idx ON ruangan(sekolah_id, jenis)`,
		`CREATE TABLE IF NOT EXISTS jadwal_ruangan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			jadwal_pelajaran_id INTEGER NOT NULL REFERENCES jadwal_pelajaran(id) ON DELETE CASCADE,
			ruangan_id INTEGER NOT NULL REFERENCES ruangan(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT,
			UNIQUE(jadwal_pelajaran_id)
		)`,
		`CREATE INDEX IF NOT EXISTS jadwal_ruangan_ruang_idx ON jadwal_ruangan(ruangan_id)`,
		`CREATE TABLE IF NOT EXISTS jadwal_preferensi_guru (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			pegawai_id INTEGER NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,
			hari TEXT NOT NULL,
			jam_ke INTEGER NOT NULL,
			tersedia INTEGER NOT NULL DEFAULT 0,
			catatan TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT,
			UNIQUE(sekolah_id, pegawai_id, hari, jam_ke)
		)`,
		`CREATE INDEX IF NOT EXISTS jadwal_preferensi_context_idx ON jadwal_preferensi_guru(sekolah_id, hari, jam_ke)`
	]);
}
