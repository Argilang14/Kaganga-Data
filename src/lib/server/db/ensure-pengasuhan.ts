import { ensureSchema } from './ensure-helper';

export async function ensurePengasuhanSchema() {
	await ensureSchema('pengasuhan-v1', [
		`CREATE TABLE IF NOT EXISTS pengasuhan_catatan (
			id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			murid_id INTEGER REFERENCES murid(id) ON DELETE SET NULL, identity_uid TEXT NOT NULL,
			nama_snapshot TEXT NOT NULL, kelas_snapshot TEXT NOT NULL,
			jenis TEXT NOT NULL CHECK(jenis IN ('kejadian','perkembangan','sakit')), aspek TEXT,
			tanggal TEXT NOT NULL, waktu TEXT NOT NULL, judul TEXT NOT NULL, uraian TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'baru' CHECK(status IN ('baru','diproses','selesai')),
			petugas_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL, petugas_nama TEXT NOT NULL,
			request_key TEXT NOT NULL, request_hash TEXT NOT NULL, revisi INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL, updated_at TEXT,
			CONSTRAINT pengasuhan_catatan_request_unique UNIQUE(sekolah_id,petugas_id,request_key))`,
		`CREATE INDEX IF NOT EXISTS pengasuhan_catatan_roster_idx ON pengasuhan_catatan(sekolah_id,identity_uid,tanggal)`,
		`CREATE INDEX IF NOT EXISTS pengasuhan_catatan_list_idx ON pengasuhan_catatan(sekolah_id,jenis,status,tanggal)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS pengasuhan_sakit_aktif_unique ON pengasuhan_catatan(sekolah_id,identity_uid) WHERE jenis='sakit' AND status<>'selesai'`,
		`CREATE TABLE IF NOT EXISTS pengasuhan_pembaruan (
			id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, catatan_id INTEGER NOT NULL REFERENCES pengasuhan_catatan(id),
			uraian TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('baru','diproses','selesai')),
			petugas_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL, petugas_nama TEXT NOT NULL,
			request_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT,
			CONSTRAINT pengasuhan_pembaruan_request_unique UNIQUE(catatan_id,petugas_id,request_key))`,
		`CREATE INDEX IF NOT EXISTS pengasuhan_pembaruan_catatan_idx ON pengasuhan_pembaruan(catatan_id,id)`,
		`CREATE TABLE IF NOT EXISTS pengasuhan_piket (
			id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			petugas_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL, petugas_nama TEXT NOT NULL,
			tanggal TEXT NOT NULL, shift TEXT NOT NULL CHECK(shift IN ('pagi','sore','malam')),
			ringkasan TEXT NOT NULL, serah_terima TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draf' CHECK(status IN ('draf','selesai')),
			revisi INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT,
			CONSTRAINT pengasuhan_piket_petugas_shift_unique UNIQUE(sekolah_id,petugas_id,tanggal,shift))`,
		`CREATE INDEX IF NOT EXISTS pengasuhan_piket_school_idx ON pengasuhan_piket(sekolah_id,tanggal)`
	]);
}
