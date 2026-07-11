import { relations } from 'drizzle-orm';
import { blob, index, int, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

const audit = {
	createdAt: text()
		.$defaultFn(() => new Date().toISOString())
		.notNull(),
	updatedAt: text()
};

export const tableAuthUser = sqliteTable(
	'auth_user',
	{
		id: int().primaryKey({ autoIncrement: true }),
		username: text().notNull(),
		usernameNormalized: text().notNull(),
		passwordHash: text().notNull(),
		passwordSalt: text().notNull(),
		passwordUpdatedAt: text(),
		permissions: text({ mode: 'json' }).notNull().default('[]').$type<UserPermission[]>(),
		// tipe user: admin (penuh), wali_kelas (terbatas ke kelas_id), wali_asuh (terbatas ke keasramaan), atau user (default/other)
		type: text({ enum: ['admin', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'user'] })
			.notNull()
			.default('admin'),
		// optional: directly associate a user to a sekolah so login can pick it reliably
		sekolahId: int().references(() => tableSekolah.id),
		// referensi opsional ke pegawai (nama wali kelas disimpan di tablePegawai)
		pegawaiId: int().references(() => tablePegawai.id),
		// untuk wali_kelas kita bisa menyimpan kelas_id yang diijinkan
		kelasId: int().references(() => tableKelas.id),
		// untuk akun tipe 'user' kita simpan pilihan mata pelajaran yang diassign saat pembuatan akun
		mataPelajaranId: int().references(() => tableMataPelajaran.id),
		...audit
	},
	(table) => [unique().on(table.usernameNormalized)]
);

export const tableAuthSession = sqliteTable(
	'auth_session',
	{
		id: int().primaryKey({ autoIncrement: true }),
		userId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		tokenHash: text().notNull(),
		userAgent: text(),
		ipAddress: text(),
		expiresAt: text().notNull(),
		...audit
	},
	(table) => [unique().on(table.tokenHash), index('auth_session_user_id_idx').on(table.userId)]
);

export const tableAlamat = sqliteTable('alamat', {
	id: int().primaryKey({ autoIncrement: true }),
	jalan: text().notNull(),
	desa: text().notNull(),
	kecamatan: text().notNull(),
	kabupaten: text().notNull(),
	provinsi: text(),
	kodePos: text(),
	...audit
});

export const tablePegawai = sqliteTable(
	'pegawai',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int(),
		nama: text().notNull(),
		nip: text().notNull(),
		jenis: text({
			enum: [
				'guru',
				'kepala_sekolah',
				'operator',
				'tu',
				'kebersihan',
				'keamanan',
				'wali_asuh',
				'wali_asrama',
				'lainnya'
			]
		})
			.default('guru')
			.notNull(),
		jabatan: text(),
		status: text({ enum: ['aktif', 'nonaktif'] })
			.default('aktif')
			.notNull(),
		telepon: text(),
		email: text(),
		catatan: text(),
		...audit
	},
	(table) => [
		index('pegawai_sekolah_idx').on(table.sekolahId),
		index('pegawai_jenis_idx').on(table.jenis),
		index('pegawai_status_idx').on(table.status)
	]
);

export const tableSekolah = sqliteTable('sekolah', {
	id: int().primaryKey({ autoIncrement: true }),
	// include 'slb' and 'srt' as supported jenjang pendidikan
	jenjangPendidikan: text({ enum: ['sd', 'smp', 'sma', 'slb', 'pkbm', 'srt'] }).notNull(),
	// optional variant (e.g. mi, mts, smk, ma, mak, slb-dasar) stored as text
	jenjangVariant: text(),
	nama: text().notNull(),
	npsn: text().notNull(),
	alamatId: int()
		.references(() => tableAlamat.id)
		.notNull(),
	logo: blob().$type<Uint8Array>(),
	logoType: text(),
	logoDinas: blob().$type<Uint8Array>(),
	logoDinasType: text(),
	website: text(),
	email: text().notNull(),
	kepalaSekolahId: int()
		.references(() => tablePegawai.id)
		.notNull(),
	lokasiTandaTangan: text(),
	// Naungan (organisasi pengelola sekolah)
	naungan: text({ enum: ['kemendikbud', 'kemsos', 'kemenag'] })
		.default('kemendikbud')
		.notNull(),
	// Default weight distribution for sumatif: lingkup 60%, STS 20%, SAS 20%
	sumatifBobotLingkup: int().default(60).notNull(),
	sumatifBobotSts: int().default(20).notNull(),
	sumatifBobotSas: int().default(20).notNull(),
	// Rapor Tengah Semester weight distribution: lingkup 70%, STS 30%
	sumatifBobotRtsLingkup: int().default(70).notNull(),
	sumatifBobotRtsSts: int().default(30).notNull(),
	// Rapor: kriteria intrakurikuler (batas atas untuk kategori Cukup / Baik)
	raporKriteriaCukup: int().default(85).notNull(),
	raporKriteriaBaik: int().default(95).notNull(),
	// Status kepala sekolah: definitif atau PLT (Pelaksana Tugas)
	statusKepalaSekolah: text({ enum: ['definitif', 'plt'] })
		.default('definitif')
		.notNull(),
	...audit
});

export const tableFeatureUnlock = sqliteTable(
	'feature_unlock',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		featureKey: text().notNull(),
		unlockedAt: text()
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.featureKey)]
);

export const tableTahunAjaran = sqliteTable(
	'tahun_ajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id)
			.notNull(),
		nama: text().notNull(),
		tanggalMulai: text(),
		tanggalSelesai: text(),
		isAktif: int({ mode: 'boolean' }).default(false).notNull(),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.nama)]
);

export const tableSemester = sqliteTable(
	'semester',
	{
		id: int().primaryKey({ autoIncrement: true }),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		tipe: text({ enum: ['ganjil', 'genap'] }).notNull(),
		nama: text().notNull(),
		tanggalMulai: text(),
		tanggalSelesai: text(),
		tanggalBagiRaport: text(),
		isAktif: int({ mode: 'boolean' }).default(false).notNull(),
		...audit
	},
	(table) => [unique().on(table.tahunAjaranId, table.tipe)]
);

export const tableKelas = sqliteTable(
	'kelas',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		nama: text().notNull(),
		fase: text(),
		waliKelasId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		waliAsramaId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		waliAsuhId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.semesterId, table.nama)]
);

export const tableTasks = sqliteTable('tasks', {
	id: int().primaryKey({ autoIncrement: true }),
	sekolahId: int()
		.references(() => tableSekolah.id, { onDelete: 'cascade' })
		.notNull(),
	kelasId: int().references(() => tableKelas.id, { onDelete: 'cascade' }),
	title: text().notNull(),
	status: text({ enum: ['active', 'completed'] })
		.default('active')
		.notNull(),
	...audit
});

export const tableSekolahRelations = relations(tableSekolah, ({ one, many }) => ({
	alamat: one(tableAlamat, { fields: [tableSekolah.alamatId], references: [tableAlamat.id] }),
	kepalaSekolah: one(tablePegawai, {
		fields: [tableSekolah.kepalaSekolahId],
		references: [tablePegawai.id]
	}),
	tahunAjaran: many(tableTahunAjaran),
	tasks: many(tableTasks),
	featureUnlocks: many(tableFeatureUnlock)
}));

export const tableFeatureUnlockRelations = relations(tableFeatureUnlock, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableFeatureUnlock.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableTahunAjaranRelations = relations(tableTahunAjaran, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableTahunAjaran.sekolahId],
		references: [tableSekolah.id]
	}),
	semester: many(tableSemester)
}));

export const tableSemesterRelations = relations(tableSemester, ({ one }) => ({
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableSemester.tahunAjaranId],
		references: [tableTahunAjaran.id]
	})
}));

export const tableTasksRelations = relations(tableTasks, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableTasks.sekolahId],
		references: [tableSekolah.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableTasks.kelasId],
		references: [tableKelas.id]
	})
}));

export const tableAuthUserRelations = relations(tableAuthUser, ({ many, one }) => ({
	sessions: many(tableAuthSession),
	// optional relation to pegawai (teacher/staff)
	pegawai: one(tablePegawai, { fields: [tableAuthUser.pegawaiId], references: [tablePegawai.id] }),
	// optional relation to kelas (for wali_kelas users)
	kelas: one(tableKelas, { fields: [tableAuthUser.kelasId], references: [tableKelas.id] }),
	// optional relation to a preferred mata pelajaran for 'user' accounts
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableAuthUser.mataPelajaranId],
		references: [tableMataPelajaran.id]
	}),
	// many-to-many: guru bisa mengajar multiple mata pelajaran
	mataPelajaranList: many(tableAuthUserMataPelajaran),
	// many-to-many: guru bisa mengakses multiple kelas
	kelasList: many(tableAuthUserKelas),
	// optional relation to a sekolah (when user was created for a specific sekolah)
	sekolah: one(tableSekolah, {
		fields: [tableAuthUser.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableAuthSessionRelations = relations(tableAuthSession, ({ one }) => ({
	user: one(tableAuthUser, {
		fields: [tableAuthSession.userId],
		references: [tableAuthUser.id]
	})
}));

export const tableKelasRelations = relations(tableKelas, ({ one, many }) => ({
	sekolah: one(tableSekolah, { fields: [tableKelas.sekolahId], references: [tableSekolah.id] }),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableKelas.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableKelas.semesterId],
		references: [tableSemester.id]
	}),
	waliKelas: one(tablePegawai, { fields: [tableKelas.waliKelasId], references: [tablePegawai.id] }),
	waliAsrama: one(tablePegawai, {
		fields: [tableKelas.waliAsramaId],
		references: [tablePegawai.id]
	}),
	waliAsuh: one(tablePegawai, {
		fields: [tableKelas.waliAsuhId],
		references: [tablePegawai.id]
	}),
	// many-to-many: kelas bisa diakses oleh multiple guru
	authUsers: many(tableAuthUserKelas)
}));

export const tableWaliMurid = sqliteTable('wali_murid', {
	id: int().primaryKey({ autoIncrement: true }),
	nama: text().notNull(),
	pekerjaan: text().notNull(),
	kontak: text(),
	alamat: text(),
	...audit
});

export const tableMurid = sqliteTable(
	'murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		nis: text().notNull(),
		nisn: text().notNull(),
		sekolahId: int()
			.references(() => tableSekolah.id)
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		nama: text().notNull(),
		tempatLahir: text().notNull(),
		tanggalLahir: text().notNull(),
		jenisKelamin: text({ enum: ['L', 'P'] }).notNull(),
		agama: text().notNull(),
		pendidikanSebelumnya: text().notNull(),
		tanggalMasuk: text().notNull(),
		alamatId: int()
			.references(() => tableAlamat.id)
			.notNull(),
		ibuId: int().references(() => tableWaliMurid.id),
		ayahId: int().references(() => tableWaliMurid.id),
		waliId: int().references(() => tableWaliMurid.id),
		// optional: path/filename (or url) ke foto murid
		foto: text(),
		// wali asuh (nama + nip) per murid, bukan per kelas
		waliAsramaNama: text(),
		waliAsramaNip: text(),
		waliAsuhNama: text(),
		waliAsuhNip: text(),
		qrToken: text(),
		...audit
	},
	(t) => [unique().on(t.sekolahId, t.semesterId, t.nis)]
);

export const tableCatatanWaliKelas = sqliteTable(
	'catatan_wali_kelas',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		catatan: text(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('catatan_wali_kelas_murid_idx').on(table.muridId)]
);

export const tableCatatanWaliAsrama = sqliteTable(
	'catatan_wali_asrama',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		catatan: text(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('catatan_wali_asrama_murid_idx').on(table.muridId)]
);
export const tableKesehatanMurid = sqliteTable(
	'kesehatan_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'set null' }),
		tanggalPengukuran: text().notNull(),
		tinggiBadan: real(),
		beratBadan: real(),
		zScore: real(),
		statusGizi: text({ enum: ['gizi_buruk', 'gizi_kurang', 'normal', 'gizi_lebih', 'obesitas'] }),
		kondisiFisik: text(),
		ukuranBaju: text(),
		ukuranCelana: text(),
		ukuranSepatu: text(),
		catatan: text(),
		petugasUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.tanggalPengukuran),
		index('kesehatan_murid_sekolah_idx').on(table.sekolahId),
		index('kesehatan_murid_murid_tanggal_idx').on(table.muridId, table.tanggalPengukuran),
		index('kesehatan_murid_semester_idx').on(table.semesterId),
		index('kesehatan_murid_status_gizi_idx').on(table.statusGizi)
	]
);
export const tableKehadiranMurid = sqliteTable(
	'kehadiran_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		sakit: int().default(0).notNull(),
		izin: int().default(0).notNull(),
		alfa: int().default(0).notNull(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('kehadiran_murid_murid_idx').on(table.muridId)]
);

export const tableMuridRelations = relations(tableMurid, ({ one, many }) => ({
	kelas: one(tableKelas, { fields: [tableMurid.kelasId], references: [tableKelas.id] }),
	semester: one(tableSemester, { fields: [tableMurid.semesterId], references: [tableSemester.id] }),
	alamat: one(tableAlamat, { fields: [tableMurid.alamatId], references: [tableAlamat.id] }),
	ibu: one(tableWaliMurid, { fields: [tableMurid.ibuId], references: [tableWaliMurid.id] }),
	ayah: one(tableWaliMurid, { fields: [tableMurid.ayahId], references: [tableWaliMurid.id] }),
	wali: one(tableWaliMurid, { fields: [tableMurid.waliId], references: [tableWaliMurid.id] }),
	kehadiran: one(tableKehadiranMurid, {
		fields: [tableMurid.id],
		references: [tableKehadiranMurid.muridId]
	}),
	catatanWali: one(tableCatatanWaliKelas, {
		fields: [tableMurid.id],
		references: [tableCatatanWaliKelas.muridId]
	}),
	keputusan: one(tableKeputusanMurid, {
		fields: [tableMurid.id],
		references: [tableKeputusanMurid.muridId]
	}),
	muridMataPelajaran: many(tableMuridMataPelajaran),
	absensi: many(tableAbsensi)
}));

export const tableKesehatanMuridRelations = relations(tableKesehatanMurid, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableKesehatanMurid.sekolahId],
		references: [tableSekolah.id]
	}),
	murid: one(tableMurid, {
		fields: [tableKesehatanMurid.muridId],
		references: [tableMurid.id]
	}),
	semester: one(tableSemester, {
		fields: [tableKesehatanMurid.semesterId],
		references: [tableSemester.id]
	}),
	petugas: one(tableAuthUser, {
		fields: [tableKesehatanMurid.petugasUserId],
		references: [tableAuthUser.id]
	})
}));
export const tableCatatanWaliKelasRelations = relations(tableCatatanWaliKelas, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableCatatanWaliKelas.muridId],
		references: [tableMurid.id]
	})
}));

export const tableCatatanWaliAsramaRelations = relations(tableCatatanWaliAsrama, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableCatatanWaliAsrama.muridId],
		references: [tableMurid.id]
	})
}));

export const tableKehadiranMuridRelations = relations(tableKehadiranMurid, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableKehadiranMurid.muridId],
		references: [tableMurid.id]
	})
}));

export const tableAbsensi = sqliteTable(
	'absensi',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		waktu: text().notNull(),
		mode: text({ enum: ['masuk', 'pulang'] })
			.default('masuk')
			.notNull(),
		metode: text({ enum: ['qr', 'manual'] })
			.default('qr')
			.notNull(),
		...audit
	},
	(table) => [index('absensi_murid_waktu_idx').on(table.muridId, table.waktu)]
);

export const tableAbsensiRelations = relations(tableAbsensi, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAbsensi.muridId],
		references: [tableMurid.id]
	})
}));

export const tableKeputusanMurid = sqliteTable(
	'keputusan_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		naik: int({ mode: 'boolean' }).default(true).notNull(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('keputusan_murid_murid_idx').on(table.muridId)]
);

export const tableKeputusanMuridRelations = relations(tableKeputusanMurid, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableKeputusanMurid.muridId],
		references: [tableMurid.id]
	})
}));

// Join table untuk many-to-many relationship antara auth_user dan mata_pelajaran
// Memungkinkan satu guru mengajar multiple mata pelajaran
export const tableAuthUserMataPelajaran = sqliteTable(
	'auth_user_mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		authUserId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		...audit
	},
	(table) => [
		unique().on(table.authUserId, table.mataPelajaranId),
		index('auth_user_mata_pelajaran_user_idx').on(table.authUserId),
		index('auth_user_mata_pelajaran_mapel_idx').on(table.mataPelajaranId)
	]
);

// Join table untuk many-to-many relationship antara auth_user dan kelas
// Memungkinkan satu guru mengakses multiple kelas (dengan permission kelas_pindah)
export const tableAuthUserKelas = sqliteTable(
	'auth_user_kelas',
	{
		id: int().primaryKey({ autoIncrement: true }),
		authUserId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		...audit
	},
	(table) => [
		unique().on(table.authUserId, table.kelasId),
		index('auth_user_kelas_user_idx').on(table.authUserId),
		index('auth_user_kelas_kelas_idx').on(table.kelasId)
	]
);

export const tableMataPelajaran = sqliteTable(
	'mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		nama: text().notNull(),
		// optional short code for subjects (e.g. PAPB for Pendidikan Agama dan Budi Pekerti)
		kode: text(),
		kkm: int().notNull().default(0),
		jenis: text({ enum: ['wajib', 'pilihan', 'mulok', 'kejuruan'] }).notNull(),
		...audit
	},
	(table) => [unique().on(table.kelasId, table.nama)]
);

export const tableTujuanPembelajaran = sqliteTable('tujuan_pembelajaran', {
	id: int().primaryKey({ autoIncrement: true }),
	mataPelajaranId: int()
		.references(() => tableMataPelajaran.id)
		.notNull(),
	deskripsi: text().notNull(),
	lingkupMateri: text().notNull(),
	bobot: real().default(0).notNull(),
	...audit
});

export const tableAsesmenSumatif = sqliteTable(
	'asesmen_sumatif',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		naLingkup: real(),
		stsTes: real(),
		stsNonTes: real(),
		sts: real(),
		sasTes: real(),
		sasNonTes: real(),
		sas: real(),
		nilaiAkhir: real(),
		nilaiAkhirRts: real(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.mataPelajaranId),
		index('asesmen_sumatif_murid_idx').on(table.muridId),
		index('asesmen_sumatif_mapel_idx').on(table.mataPelajaranId)
	]
);

export const tableAsesmenSumatifTujuan = sqliteTable(
	'asesmen_sumatif_tujuan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanPembelajaranId: int()
			.references(() => tableTujuanPembelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		nilai: real(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.tujuanPembelajaranId),
		index('asesmen_sumatif_tujuan_murid_idx').on(table.muridId),
		index('asesmen_sumatif_tujuan_mapel_idx').on(table.mataPelajaranId),
		index('asesmen_sumatif_tujuan_tp_idx').on(table.tujuanPembelajaranId)
	]
);

export const tableAsesmenFormatif = sqliteTable(
	'asesmen_formatif',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanPembelajaranId: int()
			.references(() => tableTujuanPembelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		tuntas: int({ mode: 'boolean' }).default(false).notNull(),
		catatan: text(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [unique().on(table.muridId, table.tujuanPembelajaranId)]
);

export const tableMataPelajaranRelations = relations(tableMataPelajaran, ({ one, many }) => ({
	tujuanPembelajaran: many(tableTujuanPembelajaran),
	asesmenFormatif: many(tableAsesmenFormatif),
	asesmenSumatif: many(tableAsesmenSumatif),
	asesmenSumatifTujuan: many(tableAsesmenSumatifTujuan),
	kelas: one(tableKelas, { fields: [tableMataPelajaran.kelasId], references: [tableKelas.id] }),
	// many-to-many: mata pelajaran bisa diajar oleh multiple guru
	authUsers: many(tableAuthUserMataPelajaran),
	muridMataPelajaran: many(tableMuridMataPelajaran)
}));

export const tableTujuanPembelajaranRelations = relations(tableTujuanPembelajaran, ({ one }) => ({
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableTujuanPembelajaran.mataPelajaranId],
		references: [tableMataPelajaran.id]
	})
}));

export const tableAuthUserMataPelajaranRelations = relations(
	tableAuthUserMataPelajaran,
	({ one }) => ({
		authUser: one(tableAuthUser, {
			fields: [tableAuthUserMataPelajaran.authUserId],
			references: [tableAuthUser.id]
		}),
		mataPelajaran: one(tableMataPelajaran, {
			fields: [tableAuthUserMataPelajaran.mataPelajaranId],
			references: [tableMataPelajaran.id]
		})
	})
);

export const tableAuthUserKelasRelations = relations(tableAuthUserKelas, ({ one }) => ({
	authUser: one(tableAuthUser, {
		fields: [tableAuthUserKelas.authUserId],
		references: [tableAuthUser.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableAuthUserKelas.kelasId],
		references: [tableKelas.id]
	})
}));

export const tableAsesmenFormatifRelations = relations(tableAsesmenFormatif, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenFormatif.muridId],
		references: [tableMurid.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableAsesmenFormatif.mataPelajaranId],
		references: [tableMataPelajaran.id]
	}),
	tujuanPembelajaran: one(tableTujuanPembelajaran, {
		fields: [tableAsesmenFormatif.tujuanPembelajaranId],
		references: [tableTujuanPembelajaran.id]
	})
}));

export const tableAsesmenSumatifRelations = relations(tableAsesmenSumatif, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenSumatif.muridId],
		references: [tableMurid.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableAsesmenSumatif.mataPelajaranId],
		references: [tableMataPelajaran.id]
	})
}));

export const tableAsesmenSumatifTujuanRelations = relations(
	tableAsesmenSumatifTujuan,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableAsesmenSumatifTujuan.muridId],
			references: [tableMurid.id]
		}),
		mataPelajaran: one(tableMataPelajaran, {
			fields: [tableAsesmenSumatifTujuan.mataPelajaranId],
			references: [tableMataPelajaran.id]
		}),
		tujuanPembelajaran: one(tableTujuanPembelajaran, {
			fields: [tableAsesmenSumatifTujuan.tujuanPembelajaranId],
			references: [tableTujuanPembelajaran.id]
		})
	})
);

export const tableEkstrakurikuler = sqliteTable(
	'ekstrakurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		nama: text().notNull(),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		...audit
	},
	(table) => [unique().on(table.kelasId, table.nama)]
);

export const tableMuridEkstrakurikuler = sqliteTable(
	'murid_ekstrakurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		ekstrakurikulerId: int()
			.references(() => tableEkstrakurikuler.id, { onDelete: 'cascade' })
			.notNull(),
		nilaiKosong: int().notNull().default(0),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.ekstrakurikulerId),
		index('murid_ekstrakurikuler_murid_idx').on(table.muridId),
		index('murid_ekstrakurikuler_ekstrak_idx').on(table.ekstrakurikulerId)
	]
);

export const tableMuridMataPelajaran = sqliteTable(
	'murid_mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		nilaiKosong: int().notNull().default(0),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.mataPelajaranId),
		index('murid_mata_pelajaran_murid_idx').on(table.muridId),
		index('murid_mata_pelajaran_mapel_idx').on(table.mataPelajaranId)
	]
);

export const tableEkstrakurikulerTujuan = sqliteTable('ekstrakurikuler_tujuan', {
	id: int().primaryKey({ autoIncrement: true }),
	ekstrakurikulerId: int()
		.references(() => tableEkstrakurikuler.id, { onDelete: 'cascade' })
		.notNull(),
	deskripsi: text().notNull(),
	...audit
});

export const tableAsesmenEkstrakurikuler = sqliteTable(
	'asesmen_ekstrakurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		ekstrakurikulerId: int()
			.references(() => tableEkstrakurikuler.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanId: int()
			.references(() => tableEkstrakurikulerTujuan.id, { onDelete: 'cascade' })
			.notNull(),
		kategori: text({ enum: ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'] }).notNull(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.ekstrakurikulerId, table.tujuanId),
		index('asesmen_ekstrakurikuler_murid_idx').on(table.muridId),
		index('asesmen_ekstrakurikuler_ekstrak_idx').on(table.ekstrakurikulerId),
		index('asesmen_ekstrakurikuler_tujuan_idx').on(table.tujuanId)
	]
);

export const tableKokurikuler = sqliteTable('kokurikuler', {
	id: int().primaryKey({ autoIncrement: true }),
	kelasId: int()
		.references(() => tableKelas.id)
		.notNull(),
	kode: text().notNull().unique(),
	dimensi: text({ mode: 'json' }).$type<string[]>().notNull(),
	tujuan: text().notNull(),
	...audit
});

export const tableEkstrakurikulerRelations = relations(tableEkstrakurikuler, ({ one, many }) => ({
	kelas: one(tableKelas, {
		fields: [tableEkstrakurikuler.kelasId],
		references: [tableKelas.id]
	}),
	tujuan: many(tableEkstrakurikulerTujuan),
	asesmen: many(tableAsesmenEkstrakurikuler),
	muridEkstrakurikuler: many(tableMuridEkstrakurikuler)
}));

export const tableMuridEkstrakurikulerRelations = relations(
	tableMuridEkstrakurikuler,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableMuridEkstrakurikuler.muridId],
			references: [tableMurid.id]
		}),
		ekstrakurikuler: one(tableEkstrakurikuler, {
			fields: [tableMuridEkstrakurikuler.ekstrakurikulerId],
			references: [tableEkstrakurikuler.id]
		})
	})
);

export const tableMuridMataPelajaranRelations = relations(tableMuridMataPelajaran, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableMuridMataPelajaran.muridId],
		references: [tableMurid.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableMuridMataPelajaran.mataPelajaranId],
		references: [tableMataPelajaran.id]
	})
}));

export const tableEkstrakurikulerTujuanRelations = relations(
	tableEkstrakurikulerTujuan,
	({ one, many }) => ({
		ekstrakurikuler: one(tableEkstrakurikuler, {
			fields: [tableEkstrakurikulerTujuan.ekstrakurikulerId],
			references: [tableEkstrakurikuler.id]
		}),
		asesmen: many(tableAsesmenEkstrakurikuler)
	})
);

export const tableAsesmenEkstrakurikulerRelations = relations(
	tableAsesmenEkstrakurikuler,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableAsesmenEkstrakurikuler.muridId],
			references: [tableMurid.id]
		}),
		ekstrakurikuler: one(tableEkstrakurikuler, {
			fields: [tableAsesmenEkstrakurikuler.ekstrakurikulerId],
			references: [tableEkstrakurikuler.id]
		}),
		tujuan: one(tableEkstrakurikulerTujuan, {
			fields: [tableAsesmenEkstrakurikuler.tujuanId],
			references: [tableEkstrakurikulerTujuan.id]
		})
	})
);

export const tableKokurikulerRelations = relations(tableKokurikuler, ({ one }) => ({
	kelas: one(tableKelas, {
		fields: [tableKokurikuler.kelasId],
		references: [tableKelas.id]
	})
}));
export const tableBellSettings = sqliteTable(
	'bell_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		jamPelajaranMenit: int().notNull().default(35),
		durasiIstirahat: int().notNull().default(30),
		durasiUpacara: int().notNull().default(70),
		jamMulai: text().notNull().default('07:00'),
		isActive: int({ mode: 'boolean' }).notNull().default(false),
		...audit
	},
	(table) => [unique().on(table.sekolahId)]
);

export const tableKegiatanCustom = sqliteTable(
	'kegiatan_custom',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		nama: text().notNull(),
		kode: text().notNull(),
		durasi: int(),
		soundFileName: text(),
		soundMimeType: text(),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.kode)]
);

export const tableBellSounds = sqliteTable(
	'bell_sounds',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tipe: text().notNull(),
		fileName: text().notNull(),
		mimeType: text().notNull().default('audio/mpeg'),
		ttsMessage: text(),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.tipe)]
);

export const tableJadwalTemplate = sqliteTable(
	'jadwal_template',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'cascade' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'cascade' }),
		nama: text().notNull(),
		jenjang: text({ enum: ['semua', 'sd', 'smp', 'sma'] })
			.default('semua')
			.notNull(),
		aktif: int({ mode: 'boolean' }).default(true).notNull(),
		...audit
	},
	(table) => [
		index('jadwal_template_sekolah_idx').on(table.sekolahId),
		index('jadwal_template_semester_idx').on(table.semesterId),
		index('jadwal_template_jenjang_idx').on(table.jenjang)
	]
);

export const tableJadwalJam = sqliteTable(
	'jadwal_jam',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		templateId: int().references(() => tableJadwalTemplate.id, { onDelete: 'cascade' }),
		jenjang: text({ enum: ['srd', 'srmp', 'srma'] })
			.default('srma')
			.notNull(),
		hari: text({ enum: ['senin', 'selasa', 'rabu', 'kamis', 'jumat'] }).notNull(),
		jamKe: int().notNull(),
		label: text(),
		pukulMulai: text().notNull(),
		pukulSelesai: text().notNull(),
		tipe: text({ enum: ['pelajaran', 'kegiatan', 'istirahat', 'kosong'] })
			.default('pelajaran')
			.notNull(),
		namaDefault: text(),
		urutan: int().default(0).notNull(),
		aktif: int({ mode: 'boolean' }).default(true).notNull(),
		...audit
	},
	(table) => [
		unique().on(table.sekolahId, table.templateId, table.hari, table.jamKe),
		index('jadwal_jam_sekolah_hari_idx').on(table.sekolahId, table.hari),
		index('jadwal_jam_jenjang_idx').on(table.jenjang),
		index('jadwal_jam_template_idx').on(table.templateId)
	]
);

export const tableJadwalKegiatan = sqliteTable(
	'jadwal_kegiatan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		kode: text().notNull(),
		nama: text().notNull(),
		kategori: text({ enum: ['umum', 'kokurikuler', 'keagamaan', 'istirahat'] })
			.default('umum')
			.notNull(),
		warna: text(),
		aktif: int({ mode: 'boolean' }).default(true).notNull(),
		...audit
	},
	(table) => [
		unique().on(table.sekolahId, table.kode),
		index('jadwal_kegiatan_sekolah_idx').on(table.sekolahId),
		index('jadwal_kegiatan_kategori_idx').on(table.kategori)
	]
);

export const tableJadwalMapel = sqliteTable(
	'jadwal_mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		kode: text().notNull(),
		nama: text().notNull(),
		jenjang: text({ enum: ['semua', 'srd', 'srmp', 'srma'] })
			.default('semua')
			.notNull(),
		fase: text(),
		kategori: text({ enum: ['akademik', 'kokurikuler', 'keasramaan', 'muatan_lokal'] })
			.default('akademik')
			.notNull(),
		jpPerMinggu: int('jp_per_minggu').default(0).notNull(),
		guruPegawaiId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		warna: text(),
		aktif: int({ mode: 'boolean' }).default(true).notNull(),
		catatan: text(),
		...audit
	},
	(table) => [
		unique().on(table.sekolahId, table.kode),
		index('jadwal_mapel_sekolah_idx').on(table.sekolahId),
		index('jadwal_mapel_jenjang_idx').on(table.jenjang),
		index('jadwal_mapel_guru_idx').on(table.guruPegawaiId)
	]
);

export const tableJadwalPelajaran = sqliteTable(
	'jadwal_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'cascade' }),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		jamId: int().references(() => tableJadwalJam.id, { onDelete: 'cascade' }),
		hari: text().notNull(),
		jamKe: int(),
		kodeKegiatan: text(),
		tipe: text({ enum: ['pelajaran', 'kegiatan', 'istirahat', 'kosong'] })
			.default('pelajaran')
			.notNull(),
		jadwalMapelId: int().references(() => tableJadwalMapel.id, { onDelete: 'set null' }),
		mataPelajaranId: int().references(() => tableMataPelajaran.id, { onDelete: 'set null' }),
		kokurikulerId: int().references(() => tableKokurikuler.id, { onDelete: 'set null' }),
		kegiatanId: int().references(() => tableJadwalKegiatan.id, { onDelete: 'set null' }),
		guruPegawaiId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		catatan: text(),
		...audit
	},
	(table) => [
		index('jadwal_pelajaran_sekolah_idx').on(table.sekolahId),
		index('jadwal_pelajaran_semester_idx').on(table.semesterId),
		index('jadwal_pelajaran_kelas_hari_idx').on(table.kelasId, table.hari),
		index('jadwal_pelajaran_guru_idx').on(table.guruPegawaiId),
		index('jadwal_pelajaran_mapel_idx').on(table.mataPelajaranId),
		index('jadwal_pelajaran_jadwal_mapel_idx').on(table.jadwalMapelId)
	]
);

export const tableKalenderPendidikan = sqliteTable(
	'kalender_pendidikan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'cascade' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'cascade' }),
		kelasId: int().references(() => tableKelas.id, { onDelete: 'cascade' }),
		tanggalMulai: text().notNull(),
		tanggalSelesai: text().notNull(),
		judul: text().notNull(),
		jenis: text({
			enum: [
				'hari_efektif',
				'libur_nasional',
				'libur_sekolah',
				'ujian',
				'asesmen',
				'pembagian_rapor',
				'kegiatan_sekolah',
				'lainnya'
			]
		})
			.default('lainnya')
			.notNull(),
		jenjang: text({ enum: ['semua', 'srd', 'srmp', 'srma'] })
			.default('semua')
			.notNull(),
		keterangan: text(),
		warna: text(),
		...audit
	},
	(table) => [
		index('kalender_pendidikan_sekolah_tanggal_idx').on(table.sekolahId, table.tanggalMulai),
		index('kalender_pendidikan_tahun_idx').on(table.tahunAjaranId),
		index('kalender_pendidikan_semester_idx').on(table.semesterId),
		index('kalender_pendidikan_kelas_idx').on(table.kelasId),
		index('kalender_pendidikan_jenis_idx').on(table.jenis),
		index('kalender_pendidikan_jenjang_idx').on(table.jenjang)
	]
);
export const tableBellSettingsRelations = relations(tableBellSettings, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableBellSettings.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableKegiatanCustomRelations = relations(tableKegiatanCustom, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableKegiatanCustom.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableBellSoundsRelations = relations(tableBellSounds, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableBellSounds.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableJadwalTemplateRelations = relations(tableJadwalTemplate, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableJadwalTemplate.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableJadwalTemplate.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableJadwalTemplate.semesterId],
		references: [tableSemester.id]
	}),
	jam: many(tableJadwalJam)
}));

export const tableJadwalJamRelations = relations(tableJadwalJam, ({ one, many }) => ({
	sekolah: one(tableSekolah, { fields: [tableJadwalJam.sekolahId], references: [tableSekolah.id] }),
	template: one(tableJadwalTemplate, {
		fields: [tableJadwalJam.templateId],
		references: [tableJadwalTemplate.id]
	}),
	jadwalPelajaran: many(tableJadwalPelajaran)
}));

export const tableJadwalKegiatanRelations = relations(tableJadwalKegiatan, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableJadwalKegiatan.sekolahId],
		references: [tableSekolah.id]
	}),
	jadwalPelajaran: many(tableJadwalPelajaran)
}));

export const tableJadwalMapelRelations = relations(tableJadwalMapel, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableJadwalMapel.sekolahId],
		references: [tableSekolah.id]
	}),
	guru: one(tablePegawai, {
		fields: [tableJadwalMapel.guruPegawaiId],
		references: [tablePegawai.id]
	}),
	jadwalPelajaran: many(tableJadwalPelajaran)
}));

export const tableJadwalPelajaranRelations = relations(tableJadwalPelajaran, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableJadwalPelajaran.sekolahId],
		references: [tableSekolah.id]
	}),
	semester: one(tableSemester, {
		fields: [tableJadwalPelajaran.semesterId],
		references: [tableSemester.id]
	}),
	kelas: one(tableKelas, { fields: [tableJadwalPelajaran.kelasId], references: [tableKelas.id] }),
	jam: one(tableJadwalJam, {
		fields: [tableJadwalPelajaran.jamId],
		references: [tableJadwalJam.id]
	}),
	jadwalMapel: one(tableJadwalMapel, {
		fields: [tableJadwalPelajaran.jadwalMapelId],
		references: [tableJadwalMapel.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableJadwalPelajaran.mataPelajaranId],
		references: [tableMataPelajaran.id]
	}),
	kokurikuler: one(tableKokurikuler, {
		fields: [tableJadwalPelajaran.kokurikulerId],
		references: [tableKokurikuler.id]
	}),
	kegiatan: one(tableJadwalKegiatan, {
		fields: [tableJadwalPelajaran.kegiatanId],
		references: [tableJadwalKegiatan.id]
	}),
	guru: one(tablePegawai, {
		fields: [tableJadwalPelajaran.guruPegawaiId],
		references: [tablePegawai.id]
	})
}));

export const tableKalenderPendidikanRelations = relations(tableKalenderPendidikan, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableKalenderPendidikan.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableKalenderPendidikan.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableKalenderPendidikan.semesterId],
		references: [tableSemester.id]
	}),
	kelas: one(tableKelas, { fields: [tableKalenderPendidikan.kelasId], references: [tableKelas.id] })
}));

export const tableAsesmenKokurikuler = sqliteTable(
	'asesmen_kokurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		kokurikulerId: int()
			.references(() => tableKokurikuler.id, { onDelete: 'cascade' })
			.notNull(),
		dimensi: text().notNull(),
		kategori: text({ enum: ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'] }).notNull(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.kokurikulerId, table.dimensi),
		index('asesmen_kokurikuler_murid_idx').on(table.muridId),
		index('asesmen_kokurikuler_kokurikuler_idx').on(table.kokurikulerId)
	]
);

export const tableAsesmenKokurikulerRelations = relations(tableAsesmenKokurikuler, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenKokurikuler.muridId],
		references: [tableMurid.id]
	}),
	kokurikuler: one(tableKokurikuler, {
		fields: [tableAsesmenKokurikuler.kokurikulerId],
		references: [tableKokurikuler.id]
	})
}));

export const tableKeasramaan = sqliteTable(
	'keasramaan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		nama: text().notNull(),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		...audit
	},
	(table) => [unique().on(table.kelasId, table.nama)]
);

export const tableKeasramaanIndikator = sqliteTable('keasramaan_indikator', {
	id: int().primaryKey({ autoIncrement: true }),
	keasramaanId: int()
		.references(() => tableKeasramaan.id, { onDelete: 'cascade' })
		.notNull(),
	deskripsi: text().notNull(),
	...audit
});

export const tableKeasramaanRelations = relations(tableKeasramaan, ({ one, many }) => ({
	kelas: one(tableKelas, {
		fields: [tableKeasramaan.kelasId],
		references: [tableKelas.id]
	}),
	indikator: many(tableKeasramaanIndikator),
	asesmen: many(tableAsesmenKeasramaan)
}));

export const tableKeasramaanIndikatorRelations = relations(
	tableKeasramaanIndikator,
	({ one, many }) => ({
		keasramaan: one(tableKeasramaan, {
			fields: [tableKeasramaanIndikator.keasramaanId],
			references: [tableKeasramaan.id]
		}),
		tujuan: many(tableKeasramaanTujuan)
	})
);

export const tableKeasramaanTujuan = sqliteTable('keasramaan_tujuan', {
	id: int().primaryKey({ autoIncrement: true }),
	indikatorId: int()
		.references(() => tableKeasramaanIndikator.id, { onDelete: 'cascade' })
		.notNull(),
	deskripsi: text().notNull(),
	...audit
});

export const tableKeasramaanTujuanRelations = relations(tableKeasramaanTujuan, ({ one, many }) => ({
	indikator: one(tableKeasramaanIndikator, {
		fields: [tableKeasramaanTujuan.indikatorId],
		references: [tableKeasramaanIndikator.id]
	}),
	asesmen: many(tableAsesmenKeasramaan)
}));

export const tableAsesmenKeasramaan = sqliteTable(
	'asesmen_keasramaan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		keasramaanId: int()
			.references(() => tableKeasramaan.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanId: int()
			.references(() => tableKeasramaanTujuan.id, { onDelete: 'cascade' })
			.notNull(),
		kategori: text({ enum: ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'] }).notNull(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.keasramaanId, table.tujuanId),
		index('asesmen_keasramaan_murid_idx').on(table.muridId),
		index('asesmen_keasramaan_keasramaan_idx').on(table.keasramaanId),
		index('asesmen_keasramaan_tujuan_idx').on(table.tujuanId)
	]
);

export const tableAsesmenKeasramaanRelations = relations(tableAsesmenKeasramaan, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenKeasramaan.muridId],
		references: [tableMurid.id]
	}),
	keasramaan: one(tableKeasramaan, {
		fields: [tableAsesmenKeasramaan.keasramaanId],
		references: [tableKeasramaan.id]
	}),
	tujuan: one(tableKeasramaanTujuan, {
		fields: [tableAsesmenKeasramaan.tujuanId],
		references: [tableKeasramaanTujuan.id]
	})
}));
