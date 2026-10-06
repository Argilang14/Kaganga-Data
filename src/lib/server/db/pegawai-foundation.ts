type SqlRow = Record<string, unknown>;

export type PegawaiSchemaClient = {
	execute(statement: string): Promise<{ rows: SqlRow[] }>;
};

const PROFILE_COLUMNS = [
	['sekolah_id', 'INTEGER'],
	['kode_pegawai', 'TEXT'],
	['nik', 'TEXT'],
	['nomor_induk_pppk', 'TEXT'],
	['nuptk', 'TEXT'],
	['jenis', "TEXT NOT NULL DEFAULT 'guru'"],
	['jabatan', 'TEXT'],
	['status', "TEXT NOT NULL DEFAULT 'aktif'"],
	['jenis_kelamin', 'TEXT'],
	['tempat_lahir', 'TEXT'],
	['tanggal_lahir', 'TEXT'],
	['agama', 'TEXT'],
	['status_perkawinan', 'TEXT'],
	['telepon', 'TEXT'],
	['email', 'TEXT'],
	['alamat', 'TEXT'],
	['desa', 'TEXT'],
	['kecamatan', 'TEXT'],
	['kabupaten', 'TEXT'],
	['provinsi', 'TEXT'],
	['kode_pos', 'TEXT'],
	['kontak_darurat_nama', 'TEXT'],
	['kontak_darurat_hubungan', 'TEXT'],
	['kontak_darurat_telepon', 'TEXT'],
	['status_kepegawaian', 'TEXT'],
	['tanggal_mulai_kerja', 'TEXT'],
	['unit_penempatan', 'TEXT'],
	['pangkat_golongan', 'TEXT'],
	['nomor_sk', 'TEXT'],
	['tanggal_sk', 'TEXT'],
	['foto', 'TEXT'],
	['catatan', 'TEXT']
] as const;

const SUPPORT_TABLES = [
	`CREATE TABLE IF NOT EXISTS pegawai_penugasan (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
		pegawai_id INTEGER NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,
		tahun_ajaran_id INTEGER REFERENCES tahun_ajaran(id) ON DELETE SET NULL,
		jenis TEXT NOT NULL,
		nama_jabatan TEXT,
		jenjang TEXT,
		unit TEXT,
		kelas_id INTEGER REFERENCES kelas(id) ON DELETE SET NULL,
		mata_pelajaran_id INTEGER REFERENCES mata_pelajaran(id) ON DELETE SET NULL,
		tanggal_mulai TEXT,
		tanggal_selesai TEXT,
		status TEXT NOT NULL DEFAULT 'aktif',
		catatan TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS pegawai_pendidikan (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
		pegawai_id INTEGER NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,
		jenjang TEXT NOT NULL,
		institusi TEXT NOT NULL,
		program_studi TEXT,
		tahun_lulus INTEGER,
		nomor_ijazah TEXT,
		is_terakhir INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS pegawai_sertifikasi (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
		pegawai_id INTEGER NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,
		jenis TEXT NOT NULL,
		nama TEXT NOT NULL,
		penyelenggara TEXT,
		nomor TEXT,
		tanggal_mulai TEXT,
		tanggal_selesai TEXT,
		berlaku_sampai TEXT,
		catatan TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS pegawai_dokumen (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
		pegawai_id INTEGER NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,
		jenis TEXT NOT NULL,
		nama TEXT NOT NULL,
		nomor TEXT,
		tanggal TEXT,
		file_path TEXT NOT NULL,
		mime_type TEXT,
		ukuran INTEGER,
		created_at TEXT NOT NULL,
		updated_at TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS pegawai_riwayat (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
		pegawai_id INTEGER NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,
		auth_user_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
		aksi TEXT NOT NULL,
		bagian TEXT NOT NULL,
		ringkasan TEXT,
		data_sebelum TEXT,
		data_sesudah TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT
	)`
] as const;

const INDEXES = [
	'CREATE INDEX IF NOT EXISTS pegawai_sekolah_idx ON pegawai(sekolah_id)',
	'CREATE INDEX IF NOT EXISTS pegawai_jenis_idx ON pegawai(jenis)',
	'CREATE INDEX IF NOT EXISTS pegawai_status_idx ON pegawai(status)',
	'CREATE INDEX IF NOT EXISTS pegawai_nama_idx ON pegawai(nama)',
	'CREATE INDEX IF NOT EXISTS pegawai_nip_idx ON pegawai(nip)',
	'CREATE INDEX IF NOT EXISTS pegawai_nik_idx ON pegawai(nik)',
	`CREATE UNIQUE INDEX IF NOT EXISTS pegawai_sekolah_kode_unique
		ON pegawai(sekolah_id, kode_pegawai)
		WHERE sekolah_id IS NOT NULL AND kode_pegawai IS NOT NULL`,
	'CREATE INDEX IF NOT EXISTS pegawai_penugasan_pegawai_idx ON pegawai_penugasan(pegawai_id)',
	'CREATE INDEX IF NOT EXISTS pegawai_penugasan_sekolah_tahun_idx ON pegawai_penugasan(sekolah_id, tahun_ajaran_id)',
	'CREATE INDEX IF NOT EXISTS pegawai_penugasan_status_idx ON pegawai_penugasan(status)',
	'CREATE INDEX IF NOT EXISTS pegawai_pendidikan_pegawai_idx ON pegawai_pendidikan(pegawai_id)',
	'CREATE INDEX IF NOT EXISTS pegawai_sertifikasi_pegawai_idx ON pegawai_sertifikasi(pegawai_id)',
	'CREATE INDEX IF NOT EXISTS pegawai_dokumen_pegawai_idx ON pegawai_dokumen(pegawai_id)',
	'CREATE INDEX IF NOT EXISTS pegawai_riwayat_pegawai_idx ON pegawai_riwayat(pegawai_id)',
	'CREATE INDEX IF NOT EXISTS pegawai_riwayat_sekolah_created_idx ON pegawai_riwayat(sekolah_id, created_at)'
] as const;

async function hasColumn(client: PegawaiSchemaClient, table: string, column: string) {
	const result = await client.execute(`PRAGMA table_info("${table}")`);
	return result.rows.some((row) => String(row.name) === column);
}

async function addColumnIfMissing(
	client: PegawaiSchemaClient,
	table: string,
	column: string,
	type: string
) {
	if (await hasColumn(client, table, column)) return;
	await client.execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
}

async function tableHasColumns(client: PegawaiSchemaClient, table: string, columns: string[]) {
	const result = await client.execute(`PRAGMA table_info("${table}")`);
	const available = new Set(result.rows.map((row) => String(row.name)));
	return columns.every((column) => available.has(column));
}

async function backfillSchool(client: PegawaiSchemaClient) {
	const sources: string[] = [];
	if (await tableHasColumns(client, 'sekolah', ['id', 'kepala_sekolah_id'])) {
		sources.push('(SELECT s.id FROM sekolah s WHERE s.kepala_sekolah_id = pegawai.id LIMIT 1)');
	}
	if (await tableHasColumns(client, 'auth_user', ['pegawai_id', 'sekolah_id'])) {
		sources.push(
			'(SELECT au.sekolah_id FROM auth_user au WHERE au.pegawai_id = pegawai.id AND au.sekolah_id IS NOT NULL LIMIT 1)'
		);
	}
	if (await tableHasColumns(client, 'kelas', ['wali_kelas_id', 'sekolah_id'])) {
		sources.push(
			'(SELECT k.sekolah_id FROM kelas k WHERE k.wali_kelas_id = pegawai.id AND k.sekolah_id IS NOT NULL LIMIT 1)'
		);
	}
	if (await tableHasColumns(client, 'sekolah', ['id'])) {
		sources.push('(SELECT id FROM sekolah WHERE (SELECT COUNT(*) FROM sekolah) = 1 LIMIT 1)');
	}
	if (!sources.length) return;
	await client.execute(
		`UPDATE pegawai SET sekolah_id = COALESCE(${sources.join(', ')}) WHERE sekolah_id IS NULL`
	);
}

export async function ensurePegawaiFoundation(client: PegawaiSchemaClient) {
	for (const [column, type] of PROFILE_COLUMNS) {
		await addColumnIfMissing(client, 'pegawai', column, type);
	}

	await backfillSchool(client);
	await client.execute(`
		UPDATE pegawai
		SET kode_pegawai = 'AUTO-PGW-' || printf('%08d', id)
		WHERE kode_pegawai IS NULL OR trim(kode_pegawai) = ''
	`);

	for (const statement of SUPPORT_TABLES) await client.execute(statement);
	for (const statement of INDEXES) await client.execute(statement);
}
