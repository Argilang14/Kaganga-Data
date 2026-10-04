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
		jabatanAkses: text('jabatan_akses', {
			enum: [
				'kepala_sekolah',
				'waka_kesiswaan',
				'waka_kurikulum',
				'waka_sarpras',
				'waka_keasramaan',
				'operator'
			]
		}).$type<import('$lib/access-position').AccessPosition | null>(),
		// tipe user: admin (penuh), wali_kelas (terbatas ke kelas_id), wali_asuh (terbatas ke keasramaan), atau user (default/other)
		type: text({ enum: ['admin', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'wali_murid', 'user'] })
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
		mustChangePassword: int({ mode: 'boolean' }).notNull().default(false),
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

export const tableLoginAttempt = sqliteTable(
	'login_attempt',
	{
		id: int().primaryKey({ autoIncrement: true }),
		keyHash: text().notNull(),
		failedCount: int().notNull().default(0),
		windowStartedAt: text().notNull(),
		blockedUntil: text(),
		...audit
	},
	(table) => [
		unique('login_attempt_key_hash_unique').on(table.keyHash),
		index('login_attempt_blocked_until_idx').on(table.blockedUntil)
	]
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
		kodePegawai: text(),
		nama: text().notNull(),
		nip: text().notNull(),
		nik: text(),
		nomorIndukPppk: text(),
		nuptk: text(),
		dapodikPtkId: text(),
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
		jenisKelamin: text({ enum: ['laki-laki', 'perempuan'] }),
		tempatLahir: text(),
		tanggalLahir: text(),
		agama: text(),
		statusPerkawinan: text(),
		telepon: text(),
		email: text(),
		alamat: text(),
		desa: text(),
		kecamatan: text(),
		kabupaten: text(),
		provinsi: text(),
		kodePos: text(),
		kontakDaruratNama: text(),
		kontakDaruratHubungan: text(),
		kontakDaruratTelepon: text(),
		statusKepegawaian: text(),
		tanggalMulaiKerja: text(),
		unitPenempatan: text(),
		pangkatGolongan: text(),
		nomorSk: text(),
		tanggalSk: text(),
		foto: text(),
		catatan: text(),
		...audit
	},
	(table) => [
		unique('pegawai_sekolah_kode_unique').on(table.sekolahId, table.kodePegawai),
		index('pegawai_sekolah_idx').on(table.sekolahId),
		index('pegawai_jenis_idx').on(table.jenis),
		index('pegawai_status_idx').on(table.status),
		index('pegawai_nama_idx').on(table.nama),
		index('pegawai_nip_idx').on(table.nip),
		index('pegawai_nik_idx').on(table.nik)
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
	dapodikSekolahId: text(),
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
		dapodikTahunAjaranId: text(),
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
		tanggalMasuk: text(),
		isAktif: int({ mode: 'boolean' }).default(false).notNull(),
		dapodikSemesterId: text(),
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
		dapodikRombonganBelajarId: text(),
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
	absensiHarian: many(tableAbsensiHarian),
	kegiatanAbsensi: many(tableKegiatanAbsensi),
	absensiKegiatan: many(tableAbsensiKegiatan),
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
	absensiKegiatan: many(tableAbsensiKegiatan),
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
		dapodikPesertaDidikId: text(),
		dapodikAnggotaRombelId: text(),
		nik: text(),
		anakKe: int(),
		...audit
	},
	(t) => [unique().on(t.sekolahId, t.semesterId, t.nis)]
);

export const tableAuthUserMurid = sqliteTable(
	'auth_user_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		authUserId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		hubungan: text().notNull().default('wali'),
		...audit
	},
	(table) => [
		unique('auth_user_murid_unique').on(table.authUserId, table.muridId),
		index('auth_user_murid_user_idx').on(table.authUserId),
		index('auth_user_murid_murid_idx').on(table.muridId)
	]
);

export const tableMuridLifecycle = sqliteTable(
	'murid_lifecycle',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		identityKey: text().notNull(),
		nis: text().notNull(),
		nisn: text(),
		namaSnapshot: text().notNull(),
		status: text({ enum: ['aktif', 'pindah', 'keluar', 'alumni'] })
			.notNull()
			.default('aktif'),
		tanggalStatus: text(),
		alasan: text(),
		lastMuridId: int().references(() => tableMurid.id, { onDelete: 'set null' }),
		needsIdentityReview: int().notNull().default(0),
		...audit
	},
	(table) => [
		unique('murid_lifecycle_sekolah_identity_unique').on(table.sekolahId, table.identityKey),
		index('murid_lifecycle_sekolah_status_idx').on(table.sekolahId, table.status),
		index('murid_lifecycle_last_murid_idx').on(table.lastMuridId)
	]
);

export const tableMuridIdentityLink = sqliteTable(
	'murid_identity_link',
	{
		muridId: int()
			.primaryKey()
			.references(() => tableMurid.id, { onDelete: 'cascade' }),
		sekolahId: int()
			.notNull()
			.references(() => tableSekolah.id, { onDelete: 'cascade' }),
		semesterId: int()
			.notNull()
			.references(() => tableSemester.id, { onDelete: 'cascade' }),
		identityUid: text().notNull()
	},
	(table) => [
		unique('murid_identity_link_context_unique').on(
			table.sekolahId,
			table.semesterId,
			table.identityUid
		),
		index('murid_identity_link_identity_idx').on(table.sekolahId, table.identityUid)
	]
);

export const tableMuridRiwayatKelas = sqliteTable(
	'murid_riwayat_kelas',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		identityKey: text().notNull(),
		muridId: int().references(() => tableMurid.id, { onDelete: 'set null' }),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'set null' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'set null' }),
		kelasId: int().references(() => tableKelas.id, { onDelete: 'set null' }),
		namaSnapshot: text().notNull(),
		nisSnapshot: text().notNull(),
		nisnSnapshot: text(),
		tahunAjaranSnapshot: text().notNull(),
		semesterSnapshot: text().notNull(),
		kelasSnapshot: text().notNull(),
		faseSnapshot: text(),
		statusSnapshot: text().notNull().default('aktif'),
		recordedAt: text()
			.$defaultFn(() => new Date().toISOString())
			.notNull()
	},
	(table) => [
		unique('murid_riwayat_kelas_murid_unique').on(table.muridId),
		index('murid_riwayat_kelas_identity_idx').on(table.sekolahId, table.identityKey),
		index('murid_riwayat_kelas_context_idx').on(
			table.tahunAjaranId,
			table.semesterId,
			table.kelasId
		)
	]
);

export const tableAuditLog = sqliteTable(
	'audit_log',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int().references(() => tableSekolah.id, { onDelete: 'set null' }),
		userId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		usernameSnapshot: text().notNull(),
		roleSnapshot: text().notNull(),
		action: text().notNull(),
		entityType: text().notNull(),
		entityId: text(),
		summary: text().notNull(),
		beforeData: text({ mode: 'json' }).$type<Record<string, unknown> | null>(),
		afterData: text({ mode: 'json' }).$type<Record<string, unknown> | null>(),
		ipAddress: text(),
		userAgent: text(),
		createdAt: text()
			.$defaultFn(() => new Date().toISOString())
			.notNull()
	},
	(table) => [
		index('audit_log_sekolah_created_idx').on(table.sekolahId, table.createdAt),
		index('audit_log_user_created_idx').on(table.userId, table.createdAt),
		index('audit_log_entity_idx').on(table.entityType, table.entityId)
	]
);

export const tableDapodikSettings = sqliteTable(
	'dapodik_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		url: text().notNull(),
		token: text().notNull(),
		npsn: text(),
		semesterIdDapodikTerakhir: text(),
		lastSyncAt: text(),
		lastPreviewAt: text(),
		lastPreviewFingerprint: text(),
		lastNilaiPreviewAt: text(),
		lastNilaiPreviewFingerprint: text(),
		...audit
	},
	(table) => [unique().on(table.sekolahId)]
);

export const tableDapodikSyncLog = sqliteTable(
	'dapodik_sync_log',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		semesterDapodik: text(),
		action: text({ enum: ['test', 'preview', 'apply', 'preview_nilai', 'send_nilai'] }).notNull(),
		status: text({ enum: ['success', 'failed'] }).notNull(),
		summary: text({ mode: 'json' }).$type<Record<string, unknown>>(),
		message: text(),
		...audit
	},
	(table) => [
		index('dapodik_sync_log_sekolah_idx').on(table.sekolahId),
		index('dapodik_sync_log_created_idx').on(table.createdAt)
	]
);

export const tableDapodikMataPelajaran = sqliteTable(
	'dapodik_mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: text().notNull(),
		nama: text().notNull(),
		jurusanId: text(),
		pilihanSekolah: int({ mode: 'boolean' }).default(false).notNull(),
		pilihanBuku: int({ mode: 'boolean' }).default(false).notNull(),
		pilihanKepengawasan: int({ mode: 'boolean' }).default(false).notNull(),
		pilihanEvaluasi: int({ mode: 'boolean' }).default(false).notNull(),
		...audit
	},
	(table) => [
		unique().on(table.sekolahId, table.semesterId, table.mataPelajaranId),
		index('dapodik_mapel_context_idx').on(table.sekolahId, table.semesterId)
	]
);

export const tableDapodikPembelajaran = sqliteTable(
	'dapodik_pembelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		pembelajaranId: text().notNull(),
		mataPelajaranId: text(),
		nama: text().notNull(),
		ptkId: text(),
		...audit
	},
	(table) => [
		unique().on(table.kelasId, table.pembelajaranId),
		index('dapodik_pembelajaran_kelas_idx').on(table.kelasId)
	]
);

export const tableDapodikNilaiKirim = sqliteTable(
	'dapodik_nilai_kirim',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		dapodikNilaiId: text().notNull(),
		dapodikIdEvaluasi: text().notNull(),
		payloadHash: text().notNull(),
		status: text({ enum: ['sent', 'failed'] }).notNull(),
		message: text(),
		sentAt: text(),
		...audit
	},
	(table) => [
		unique().on(table.sekolahId, table.semesterId, table.mataPelajaranId, table.muridId),
		index('dapodik_nilai_kirim_context_idx').on(table.sekolahId, table.semesterId),
		index('dapodik_nilai_kirim_status_idx').on(table.status)
	]
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
export const tableStatusAkhirRapor = sqliteTable(
	'status_akhir_rapor',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		status: text(),
		tanggalPenetapan: text(),
		catatan: text(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('status_akhir_rapor_murid_idx').on(table.muridId)]
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
		hadir: int().default(0).notNull(),
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
	statusAkhirRapor: one(tableStatusAkhirRapor, {
		fields: [tableMurid.id],
		references: [tableStatusAkhirRapor.muridId]
	}),
	keputusan: one(tableKeputusanMurid, {
		fields: [tableMurid.id],
		references: [tableKeputusanMurid.muridId]
	}),
	muridMataPelajaran: many(tableMuridMataPelajaran),
	absensiHarian: many(tableAbsensiHarian),
	absensiKegiatan: many(tableAbsensiKegiatan),
	qrMurid: many(tableQrMurid),
	absensi: many(tableAbsensi),
	ketidakhadiranHarian: many(tableKetidakhadiranHarian)
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

export const tableStatusAkhirRaporRelations = relations(tableStatusAkhirRapor, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableStatusAkhirRapor.muridId],
		references: [tableMurid.id]
	})
}));
export const tableKehadiranMuridRelations = relations(tableKehadiranMurid, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableKehadiranMurid.muridId],
		references: [tableMurid.id]
	})
}));

export const tableAbsensiHarian = sqliteTable(
	'absensi_harian',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		tanggal: text().notNull(),
		status: text({ enum: ['hadir', 'terlambat', 'sakit', 'izin', 'alfa'] }).notNull(),
		waktuScan: text(),
		metode: text({ enum: ['qr', 'manual'] }).notNull(),
		petugasUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		catatan: text(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.tanggal),
		index('absensi_harian_sekolah_tanggal_idx').on(table.sekolahId, table.tanggal),
		index('absensi_harian_kelas_tanggal_idx').on(table.kelasId, table.tanggal),
		index('absensi_harian_semester_idx').on(table.semesterId),
		index('absensi_harian_status_idx').on(table.status)
	]
);

export const tableKegiatanAbsensi = sqliteTable(
	'kegiatan_absensi',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		kode: text().notNull(),
		nama: text().notNull(),
		kategori: text({ enum: ['sekolah', 'asrama', 'makan', 'sholat'] }).notNull(),
		urutan: int().default(0).notNull(),
		jamMulai: text(),
		batasTerlambat: text(),
		jamSelesai: text(),
		autoAlfa: int({ mode: 'boolean' }).default(true).notNull(),
		masukRapor: int({ mode: 'boolean' }).default(false).notNull(),
		aktif: int({ mode: 'boolean' }).default(true).notNull(),
		aksesEdit: text({ enum: ['sekolah', 'asrama', 'semua'] })
			.default('semua')
			.notNull(),
		...audit
	},
	(table) => [
		unique().on(table.sekolahId, table.kode),
		index('kegiatan_absensi_sekolah_idx').on(table.sekolahId),
		index('kegiatan_absensi_kategori_idx').on(table.kategori),
		index('kegiatan_absensi_aktif_idx').on(table.aktif)
	]
);

export const tableAbsensiKegiatan = sqliteTable(
	'absensi_kegiatan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		kegiatanId: int()
			.references(() => tableKegiatanAbsensi.id, { onDelete: 'cascade' })
			.notNull(),
		tanggal: text().notNull(),
		status: text({ enum: ['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang'] }).notNull(),
		waktuScan: text(),
		metode: text({ enum: ['qr', 'manual', 'auto'] }).notNull(),
		petugasUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		catatan: text(),
		autoAlfa: int({ mode: 'boolean' }).default(false).notNull(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.kegiatanId, table.tanggal),
		index('absensi_kegiatan_sekolah_tanggal_idx').on(table.sekolahId, table.tanggal),
		index('absensi_kegiatan_kelas_tanggal_idx').on(table.kelasId, table.tanggal),
		index('absensi_kegiatan_semester_idx').on(table.semesterId),
		index('absensi_kegiatan_kegiatan_tanggal_idx').on(table.kegiatanId, table.tanggal),
		index('absensi_kegiatan_status_idx').on(table.status),
		index('absensi_kegiatan_metode_idx').on(table.metode)
	]
);

export const tableIzinPulangMurid = sqliteTable(
	'izin_pulang_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'set null' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'set null' }),
		kelasId: int().references(() => tableKelas.id, { onDelete: 'set null' }),
		muridId: int().references(() => tableMurid.id, { onDelete: 'set null' }),
		nisSnapshot: text().notNull(),
		nisnSnapshot: text(),
		namaSnapshot: text().notNull(),
		kelasSnapshot: text().notNull(),
		tanggalKeluar: text().notNull(),
		waktuKeluar: text(),
		alasan: text().notNull(),
		penjemputNama: text(),
		penjemputHubungan: text(),
		penjemputKontak: text(),
		rencanaKembali: text().notNull(),
		waktuRencanaKembali: text(),
		tanggalKembali: text(),
		waktuKembali: text(),
		status: text({
			enum: ['sedang_izin', 'sudah_kembali', 'terlambat_kembali', 'dibatalkan']
		})
			.default('sedang_izin')
			.notNull(),
		nomorDokumen: text(),
		petugasKeluarUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		petugasKembaliUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		catatan: text(),
		...audit
	},
	(table) => [
		index('izin_pulang_murid_sekolah_status_idx').on(table.sekolahId, table.status),
		index('izin_pulang_murid_sekolah_tanggal_idx').on(
			table.sekolahId,
			table.tanggalKeluar,
			table.rencanaKembali
		),
		index('izin_pulang_murid_murid_status_idx').on(table.muridId, table.status),
		index('izin_pulang_murid_context_idx').on(table.tahunAjaranId, table.semesterId, table.kelasId)
	]
);

export const tableTindakLanjutAbsensi = sqliteTable(
	'tindak_lanjut_absensi',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		muridId: int().references(() => tableMurid.id, { onDelete: 'set null' }),
		namaSnapshot: text().notNull(),
		kelasSnapshot: text().notNull(),
		jenis: text({
			enum: ['sakit_beruntun', 'sakit_berulang', 'alfa_berulang', 'izin_pulang_terlambat']
		}).notNull(),
		periodeMulai: text().notNull(),
		periodeSelesai: text().notNull(),
		status: text({ enum: ['baru', 'diproses', 'selesai'] })
			.notNull()
			.default('baru'),
		catatan: text(),
		ditanganiOlehUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		ditanganiPada: text(),
		...audit
	},
	(table) => [
		unique('tindak_lanjut_absensi_unique').on(
			table.sekolahId,
			table.muridId,
			table.jenis,
			table.periodeMulai
		),
		index('tindak_lanjut_absensi_sekolah_status_idx').on(table.sekolahId, table.status),
		index('tindak_lanjut_absensi_murid_jenis_idx').on(table.muridId, table.jenis)
	]
);

export const tableQrMurid = sqliteTable(
	'qr_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		tokenHash: text().notNull(),
		tokenVersion: int().default(1).notNull(),
		issuedAt: text().notNull(),
		revokedAt: text(),
		...audit
	},
	(table) => [
		unique().on(table.tokenHash),
		index('qr_murid_murid_idx').on(table.muridId),
		index('qr_murid_revoked_idx').on(table.revokedAt)
	]
);

export const tableAbsensiHarianRelations = relations(tableAbsensiHarian, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableAbsensiHarian.sekolahId],
		references: [tableSekolah.id]
	}),
	semester: one(tableSemester, {
		fields: [tableAbsensiHarian.semesterId],
		references: [tableSemester.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableAbsensiHarian.kelasId],
		references: [tableKelas.id]
	}),
	murid: one(tableMurid, {
		fields: [tableAbsensiHarian.muridId],
		references: [tableMurid.id]
	}),
	petugas: one(tableAuthUser, {
		fields: [tableAbsensiHarian.petugasUserId],
		references: [tableAuthUser.id]
	})
}));

export const tableKegiatanAbsensiRelations = relations(tableKegiatanAbsensi, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableKegiatanAbsensi.sekolahId],
		references: [tableSekolah.id]
	}),
	absensi: many(tableAbsensiKegiatan)
}));

export const tableAbsensiKegiatanRelations = relations(tableAbsensiKegiatan, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableAbsensiKegiatan.sekolahId],
		references: [tableSekolah.id]
	}),
	semester: one(tableSemester, {
		fields: [tableAbsensiKegiatan.semesterId],
		references: [tableSemester.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableAbsensiKegiatan.kelasId],
		references: [tableKelas.id]
	}),
	murid: one(tableMurid, {
		fields: [tableAbsensiKegiatan.muridId],
		references: [tableMurid.id]
	}),
	kegiatan: one(tableKegiatanAbsensi, {
		fields: [tableAbsensiKegiatan.kegiatanId],
		references: [tableKegiatanAbsensi.id]
	}),
	petugas: one(tableAuthUser, {
		fields: [tableAbsensiKegiatan.petugasUserId],
		references: [tableAuthUser.id]
	})
}));

export const tableIzinPulangMuridRelations = relations(tableIzinPulangMurid, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableIzinPulangMurid.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableIzinPulangMurid.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableIzinPulangMurid.semesterId],
		references: [tableSemester.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableIzinPulangMurid.kelasId],
		references: [tableKelas.id]
	}),
	murid: one(tableMurid, {
		fields: [tableIzinPulangMurid.muridId],
		references: [tableMurid.id]
	}),
	petugasKeluar: one(tableAuthUser, {
		fields: [tableIzinPulangMurid.petugasKeluarUserId],
		references: [tableAuthUser.id],
		relationName: 'izinPulangPetugasKeluar'
	}),
	petugasKembali: one(tableAuthUser, {
		fields: [tableIzinPulangMurid.petugasKembaliUserId],
		references: [tableAuthUser.id],
		relationName: 'izinPulangPetugasKembali'
	})
}));

export const tableTindakLanjutAbsensiRelations = relations(tableTindakLanjutAbsensi, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableTindakLanjutAbsensi.sekolahId],
		references: [tableSekolah.id]
	}),
	murid: one(tableMurid, {
		fields: [tableTindakLanjutAbsensi.muridId],
		references: [tableMurid.id]
	}),
	ditanganiOleh: one(tableAuthUser, {
		fields: [tableTindakLanjutAbsensi.ditanganiOlehUserId],
		references: [tableAuthUser.id]
	})
}));

export const tableQrMuridRelations = relations(tableQrMurid, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableQrMurid.muridId],
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
		mataPelajaranId: int().references(() => tableMataPelajaran.id, { onDelete: 'set null' }),
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
		namaLokal: text(),
		// optional short code for subjects (e.g. PAPB for Pendidikan Agama dan Budi Pekerti)
		kode: text(),
		kkm: int().notNull().default(0),
		jenis: text({
			enum: ['belum_dipetakan', 'wajib', 'pilihan', 'mulok', 'kejuruan', 'pemberdayaan']
		}).notNull(),
		urutan: int(),
		pengampuId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		dapodikPembelajaranId: text(),
		dapodikMataPelajaranId: text(),
		dapodikIndukPembelajaranId: text(),
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
		jenis: text({ enum: ['persiapan', 'ganjil', 'genap'] })
			.default('ganjil')
			.notNull(),
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
		jenjang: text({ enum: ['semua', 'srd', 'srmp', 'srma', 'sd', 'smp', 'sma'] })
			.default('semua')
			.notNull(),
		fase: text(),
		kategori: text({
			enum: ['masa_persiapan', 'akademik', 'kokurikuler', 'keasramaan', 'muatan_lokal']
		})
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

export const tableJadwalTargetJp = sqliteTable(
	'jadwal_target_jp',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		jenis: text({ enum: ['persiapan', 'ganjil', 'genap'] }).notNull(),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		jadwalMapelId: int()
			.references(() => tableJadwalMapel.id, { onDelete: 'cascade' })
			.notNull(),
		jpPerMinggu: int('jp_per_minggu').default(0).notNull(),
		...audit
	},
	(table) => [
		unique().on(
			table.sekolahId,
			table.tahunAjaranId,
			table.jenis,
			table.kelasId,
			table.jadwalMapelId
		),
		index('jadwal_target_jp_context_idx').on(table.sekolahId, table.tahunAjaranId, table.jenis),
		index('jadwal_target_jp_kelas_idx').on(table.kelasId),
		index('jadwal_target_jp_mapel_idx').on(table.jadwalMapelId)
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
		templateId: int().references(() => tableJadwalTemplate.id, { onDelete: 'cascade' }),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		jamId: int().references(() => tableJadwalJam.id, { onDelete: 'cascade' }),
		hari: text().notNull(),
		jamKe: int().notNull(),
		kodeKegiatan: text().notNull(),
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
		index('jadwal_pelajaran_template_idx').on(table.templateId),
		index('jadwal_pelajaran_kelas_hari_idx').on(table.kelasId, table.hari),
		index('jadwal_pelajaran_guru_idx').on(table.guruPegawaiId),
		index('jadwal_pelajaran_mapel_idx').on(table.mataPelajaranId),
		index('jadwal_pelajaran_jadwal_mapel_idx').on(table.jadwalMapelId)
	]
);

export const tableRuangan = sqliteTable(
	'ruangan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		kode: text().notNull(),
		nama: text().notNull(),
		jenis: text().notNull().default('kelas'),
		kapasitas: int(),
		lokasi: text(),
		kondisi: text({ enum: ['baik', 'rusak_ringan', 'rusak_berat', 'tidak_aktif'] })
			.notNull()
			.default('baik'),
		fasilitas: text(),
		catatan: text(),
		...audit
	},
	(table) => [
		unique('ruangan_sekolah_kode_unique').on(table.sekolahId, table.kode),
		index('ruangan_sekolah_jenis_idx').on(table.sekolahId, table.jenis)
	]
);

export const tableJadwalRuangan = sqliteTable(
	'jadwal_ruangan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		jadwalPelajaranId: int()
			.references(() => tableJadwalPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		ruanganId: int()
			.references(() => tableRuangan.id, { onDelete: 'cascade' })
			.notNull(),
		...audit
	},
	(table) => [
		unique('jadwal_ruangan_jadwal_unique').on(table.jadwalPelajaranId),
		index('jadwal_ruangan_ruang_idx').on(table.ruanganId)
	]
);

export const tableJadwalPreferensiGuru = sqliteTable(
	'jadwal_preferensi_guru',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'cascade' })
			.notNull(),
		hari: text().notNull(),
		jamKe: int().notNull(),
		tersedia: int({ mode: 'boolean' }).notNull().default(false),
		catatan: text(),
		...audit
	},
	(table) => [
		unique('jadwal_preferensi_unique').on(
			table.sekolahId,
			table.pegawaiId,
			table.hari,
			table.jamKe
		),
		index('jadwal_preferensi_context_idx').on(table.sekolahId, table.hari, table.jamKe)
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
				'kegiatan_asrama',
				'lainnya'
			]
		})
			.default('lainnya')
			.notNull(),
		jenjang: text({ enum: ['semua', 'srd', 'srmp', 'srma', 'sd', 'smp', 'sma'] })
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
	jadwalPelajaran: many(tableJadwalPelajaran),
	targetJp: many(tableJadwalTargetJp)
}));

export const tableJadwalTargetJpRelations = relations(tableJadwalTargetJp, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableJadwalTargetJp.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableJadwalTargetJp.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableJadwalTargetJp.kelasId],
		references: [tableKelas.id]
	}),
	mapel: one(tableJadwalMapel, {
		fields: [tableJadwalTargetJp.jadwalMapelId],
		references: [tableJadwalMapel.id]
	})
}));

export const tableJadwalPelajaranRelations = relations(tableJadwalPelajaran, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableJadwalPelajaran.sekolahId],
		references: [tableSekolah.id]
	}),
	template: one(tableJadwalTemplate, {
		fields: [tableJadwalPelajaran.templateId],
		references: [tableJadwalTemplate.id]
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

export const tablePresensiSettings = sqliteTable(
	'presensi_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		jamMasuk: text().notNull().default('07:30'),
		jamPulang: text().notNull().default('15:00'),
		hariSekolah: int().notNull().default(6),
		tipePresensi: text({ enum: ['masuk_pulang', 'masuk_saja', 'awal_mapel', 'awal_akhir_mapel'] })
			.notNull()
			.default('masuk_pulang'),
		liburNasional: text().notNull().default('[]'),
		liburSemester: text().notNull().default('[]'),
		jenisPresensi: text({ enum: ['wali_kelas_saja', 'tiap_mapel'] })
			.notNull()
			.default('wali_kelas_saja'),
		presensiPegawaiEnabled: int({ mode: 'boolean' }).notNull().default(true),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.tahunAjaranId)]
);

export const tablePresensiSettingsRelations = relations(tablePresensiSettings, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tablePresensiSettings.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tablePresensiSettings.tahunAjaranId],
		references: [tableTahunAjaran.id]
	})
}));

export const tableKetidakhadiranHarian = sqliteTable(
	'ketidakhadiran_harian',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		tanggal: text().notNull(),
		mataPelajaranId: int().references(() => tableMataPelajaran.id, { onDelete: 'set null' }),
		keterangan: text(),
		keteranganPulang: text(),
		...audit
	},
	(table) => [
		unique('ketidakhadiran_murid_tanggal_mapel_idx').on(
			table.muridId,
			table.tanggal,
			table.mataPelajaranId
		)
	]
);

export const tablePresensiPegawai = sqliteTable(
	'presensi_pegawai',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'set null' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'set null' }),
		pegawaiId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		namaPegawai: text().notNull(),
		tanggal: text().notNull(),
		status: text({ enum: ['hadir', 'izin', 'sakit', 'dinas_luar', 'cuti'] }).notNull(),
		waktuMasuk: text(),
		waktuPulang: text(),
		tandaTangan: text(),
		keterangan: text(),
		petugasUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		...audit
	},
	(table) => [
		unique('presensi_pegawai_sekolah_pegawai_tanggal_unique').on(
			table.sekolahId,
			table.pegawaiId,
			table.tanggal
		),
		index('presensi_pegawai_sekolah_tanggal_idx').on(table.sekolahId, table.tanggal),
		index('presensi_pegawai_pegawai_idx').on(table.pegawaiId)
	]
);

export const tablePresensiPegawaiRelations = relations(tablePresensiPegawai, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tablePresensiPegawai.sekolahId],
		references: [tableSekolah.id]
	}),
	pegawai: one(tablePegawai, {
		fields: [tablePresensiPegawai.pegawaiId],
		references: [tablePegawai.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tablePresensiPegawai.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tablePresensiPegawai.semesterId],
		references: [tableSemester.id]
	}),
	petugas: one(tableAuthUser, {
		fields: [tablePresensiPegawai.petugasUserId],
		references: [tableAuthUser.id]
	})
}));

export const tableKetidakhadiranHarianRelations = relations(
	tableKetidakhadiranHarian,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableKetidakhadiranHarian.muridId],
			references: [tableMurid.id]
		})
	})
);

export const tableKetidakhadiranRapor = sqliteTable(
	'ketidakhadiran_rapor',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		sakit: int(),
		izin: int(),
		alfa: int(),
		...audit
	},
	(table) => [unique('ketidakhadiran_rapor_murid_semester_idx').on(table.muridId, table.semesterId)]
);

export const tableKetidakhadiranRaporRelations = relations(tableKetidakhadiranRapor, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableKetidakhadiranRapor.muridId],
		references: [tableMurid.id]
	}),
	semester: one(tableSemester, {
		fields: [tableKetidakhadiranRapor.semesterId],
		references: [tableSemester.id]
	})
}));

export const tableUserFavorites = sqliteTable(
	'user_favorites',
	{
		id: int().primaryKey({ autoIncrement: true }),
		userId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		path: text().notNull(),
		title: text().notNull(),
		...audit
	},
	(table) => [
		unique().on(table.userId, table.path),
		index('user_favorites_user_idx').on(table.userId)
	]
);

export const tableUserFavoritesRelations = relations(tableUserFavorites, ({ one }) => ({
	user: one(tableAuthUser, {
		fields: [tableUserFavorites.userId],
		references: [tableAuthUser.id]
	})
}));

export const tableJurnalMengajar = sqliteTable(
	'jurnal_mengajar',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int().references(() => tableSekolah.id, { onDelete: 'cascade' }),
		authUserId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int().references(() => tableMataPelajaran.id, { onDelete: 'set null' }),
		jadwalMapelId: int().references(() => tableJadwalMapel.id, { onDelete: 'set null' }),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'set null' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'set null' }),
		jenisJadwal: text({ enum: ['persiapan', 'ganjil', 'genap'] }),
		jadwalTemplateId: int().references(() => tableJadwalTemplate.id, { onDelete: 'set null' }),
		jadwalPelajaranIds: text(),
		tanggal: text().notNull(),
		jamPelajaran: text().notNull(),
		pukul: text(),
		lingkupMateri: text().notNull(),
		tujuanPembelajaranId: int().references(() => tableTujuanPembelajaran.id, {
			onDelete: 'set null'
		}),
		tujuanPembelajaranManual: text(),
		catatan: text(),
		...audit
	},
	(table) => [
		index('jurnal_mengajar_auth_user_idx').on(table.authUserId),
		index('jurnal_mengajar_context_idx').on(
			table.sekolahId,
			table.tahunAjaranId,
			table.jenisJadwal,
			table.tanggal
		),
		index('jurnal_mengajar_kelas_tanggal_idx').on(table.kelasId, table.tanggal)
	]
);

export const tableJurnalMengajarRelations = relations(tableJurnalMengajar, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableJurnalMengajar.sekolahId],
		references: [tableSekolah.id]
	}),
	authUser: one(tableAuthUser, {
		fields: [tableJurnalMengajar.authUserId],
		references: [tableAuthUser.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableJurnalMengajar.kelasId],
		references: [tableKelas.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableJurnalMengajar.mataPelajaranId],
		references: [tableMataPelajaran.id]
	}),
	jadwalMapel: one(tableJadwalMapel, {
		fields: [tableJurnalMengajar.jadwalMapelId],
		references: [tableJadwalMapel.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableJurnalMengajar.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableJurnalMengajar.semesterId],
		references: [tableSemester.id]
	}),
	jadwalTemplate: one(tableJadwalTemplate, {
		fields: [tableJurnalMengajar.jadwalTemplateId],
		references: [tableJadwalTemplate.id]
	}),
	tujuanPembelajaran: one(tableTujuanPembelajaran, {
		fields: [tableJurnalMengajar.tujuanPembelajaranId],
		references: [tableTujuanPembelajaran.id]
	})
}));

export const tablePegawaiPenugasan = sqliteTable(
	'pegawai_penugasan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'set null' }),
		jenis: text().notNull(),
		namaJabatan: text(),
		jenjang: text(),
		unit: text(),
		kelasId: int().references(() => tableKelas.id, { onDelete: 'set null' }),
		mataPelajaranId: int().references(() => tableMataPelajaran.id, { onDelete: 'set null' }),
		tanggalMulai: text(),
		tanggalSelesai: text(),
		status: text({ enum: ['aktif', 'selesai'] })
			.default('aktif')
			.notNull(),
		catatan: text(),
		...audit
	},
	(table) => [
		index('pegawai_penugasan_pegawai_idx').on(table.pegawaiId),
		index('pegawai_penugasan_sekolah_tahun_idx').on(table.sekolahId, table.tahunAjaranId),
		index('pegawai_penugasan_status_idx').on(table.status)
	]
);

export const tablePegawaiPendidikan = sqliteTable(
	'pegawai_pendidikan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'cascade' })
			.notNull(),
		jenjang: text().notNull(),
		institusi: text().notNull(),
		programStudi: text(),
		tahunLulus: int(),
		nomorIjazah: text(),
		isTerakhir: int({ mode: 'boolean' }).default(false).notNull(),
		...audit
	},
	(table) => [index('pegawai_pendidikan_pegawai_idx').on(table.pegawaiId)]
);

export const tablePegawaiSertifikasi = sqliteTable(
	'pegawai_sertifikasi',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'cascade' })
			.notNull(),
		jenis: text().notNull(),
		nama: text().notNull(),
		penyelenggara: text(),
		nomor: text(),
		tanggalMulai: text(),
		tanggalSelesai: text(),
		berlakuSampai: text(),
		catatan: text(),
		...audit
	},
	(table) => [index('pegawai_sertifikasi_pegawai_idx').on(table.pegawaiId)]
);

export const tablePegawaiDokumen = sqliteTable(
	'pegawai_dokumen',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'cascade' })
			.notNull(),
		jenis: text().notNull(),
		nama: text().notNull(),
		nomor: text(),
		tanggal: text(),
		filePath: text().notNull(),
		mimeType: text(),
		ukuran: int(),
		...audit
	},
	(table) => [index('pegawai_dokumen_pegawai_idx').on(table.pegawaiId)]
);

export const tablePegawaiRiwayat = sqliteTable(
	'pegawai_riwayat',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'cascade' })
			.notNull(),
		authUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		aksi: text().notNull(),
		bagian: text().notNull(),
		ringkasan: text(),
		dataSebelum: text({ mode: 'json' }).$type<Record<string, unknown>>(),
		dataSesudah: text({ mode: 'json' }).$type<Record<string, unknown>>(),
		...audit
	},
	(table) => [
		index('pegawai_riwayat_pegawai_idx').on(table.pegawaiId),
		index('pegawai_riwayat_sekolah_created_idx').on(table.sekolahId, table.createdAt)
	]
);

export const tablePegawaiRelations = relations(tablePegawai, ({ many }) => ({
	penugasan: many(tablePegawaiPenugasan),
	pendidikan: many(tablePegawaiPendidikan),
	sertifikasi: many(tablePegawaiSertifikasi),
	dokumen: many(tablePegawaiDokumen),
	riwayat: many(tablePegawaiRiwayat)
}));

export const tablePegawaiPenugasanRelations = relations(tablePegawaiPenugasan, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tablePegawaiPenugasan.sekolahId],
		references: [tableSekolah.id]
	}),
	pegawai: one(tablePegawai, {
		fields: [tablePegawaiPenugasan.pegawaiId],
		references: [tablePegawai.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tablePegawaiPenugasan.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	kelas: one(tableKelas, {
		fields: [tablePegawaiPenugasan.kelasId],
		references: [tableKelas.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tablePegawaiPenugasan.mataPelajaranId],
		references: [tableMataPelajaran.id]
	})
}));

export const tablePegawaiPendidikanRelations = relations(tablePegawaiPendidikan, ({ one }) => ({
	pegawai: one(tablePegawai, {
		fields: [tablePegawaiPendidikan.pegawaiId],
		references: [tablePegawai.id]
	}),
	sekolah: one(tableSekolah, {
		fields: [tablePegawaiPendidikan.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tablePegawaiSertifikasiRelations = relations(tablePegawaiSertifikasi, ({ one }) => ({
	pegawai: one(tablePegawai, {
		fields: [tablePegawaiSertifikasi.pegawaiId],
		references: [tablePegawai.id]
	}),
	sekolah: one(tableSekolah, {
		fields: [tablePegawaiSertifikasi.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tablePegawaiDokumenRelations = relations(tablePegawaiDokumen, ({ one }) => ({
	pegawai: one(tablePegawai, {
		fields: [tablePegawaiDokumen.pegawaiId],
		references: [tablePegawai.id]
	}),
	sekolah: one(tableSekolah, {
		fields: [tablePegawaiDokumen.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tablePegawaiRiwayatRelations = relations(tablePegawaiRiwayat, ({ one }) => ({
	pegawai: one(tablePegawai, {
		fields: [tablePegawaiRiwayat.pegawaiId],
		references: [tablePegawai.id]
	}),
	sekolah: one(tableSekolah, {
		fields: [tablePegawaiRiwayat.sekolahId],
		references: [tableSekolah.id]
	}),
	authUser: one(tableAuthUser, {
		fields: [tablePegawaiRiwayat.authUserId],
		references: [tableAuthUser.id]
	})
}));

export const tableSppd = sqliteTable(
	'surat_sppd',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'restrict' })
			.notNull(),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'set null' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'set null' }),
		nomorSurat: text(),
		tanggalSurat: text(),
		dasarSurat: text(),
		maksud: text().notNull(),
		alatAngkut: text(),
		tempatBerangkat: text(),
		tempatTujuan: text().notNull(),
		tanggalBerangkat: text().notNull(),
		tanggalKembali: text().notNull(),
		status: text({ enum: ['draft', 'terbit', 'selesai'] })
			.notNull()
			.default('draft'),
		keterangan: text(),
		lamanya: text(),
		keteranganPengikut: text(),
		kodeRekening: text(),
		tingkatBiaya: text(),
		keteranganLain: text(),
		undanganFile: text(),
		...audit
	},
	(table) => [
		index('surat_sppd_sekolah_idx').on(table.sekolahId),
		index('surat_sppd_pegawai_idx').on(table.pegawaiId),
		index('surat_sppd_tanggal_berangkat_idx').on(table.tanggalBerangkat)
	]
);

export const tableSppdPegawai = sqliteTable(
	'surat_sppd_pegawai',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sppdId: int()
			.references(() => tableSppd.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		nama: text().notNull(),
		urutan: int().notNull().default(0),
		...audit
	},
	(table) => [
		unique('surat_sppd_pegawai_unique').on(table.sppdId, table.pegawaiId),
		index('surat_sppd_pegawai_sppd_idx').on(table.sppdId)
	]
);

export const tableSppdPengikut = sqliteTable(
	'surat_sppd_pengikut',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sppdId: int()
			.references(() => tableSppd.id, { onDelete: 'cascade' })
			.notNull(),
		nama: text().notNull(),
		tempatLahir: text().notNull(),
		tanggalLahir: text().notNull(),
		...audit
	},
	(table) => [index('surat_sppd_pengikut_sppd_idx').on(table.sppdId)]
);

export const tableDinasLuarPermohonan = sqliteTable(
	'surat_dinas_luar',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int()
			.references(() => tablePegawai.id, { onDelete: 'restrict' })
			.notNull(),
		sppdId: int().references(() => tableSppd.id, { onDelete: 'set null' }),
		maksud: text().notNull(),
		tempatTujuan: text().notNull(),
		tanggalBerangkat: text().notNull(),
		tanggalKembali: text().notNull(),
		status: text({ enum: ['diajukan', 'disetujui', 'ditolak', 'selesai'] })
			.notNull()
			.default('diajukan'),
		catatan: text(),
		undanganFile: text(),
		...audit
	},
	(table) => [
		index('surat_dinas_luar_sekolah_idx').on(table.sekolahId),
		index('surat_dinas_luar_pegawai_idx').on(table.pegawaiId),
		index('surat_dinas_luar_status_idx').on(table.status)
	]
);

export const tableDinasLuarBukti = sqliteTable(
	'surat_dinas_luar_bukti',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sppdId: int()
			.references(() => tableSppd.id, { onDelete: 'cascade' })
			.notNull(),
		authUserId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		jenis: text({ enum: ['pdf', 'foto'] }).notNull(),
		namaFile: text().notNull(),
		...audit
	},
	(table) => [index('surat_dinas_luar_bukti_sppd_idx').on(table.sppdId)]
);

export const tableSuratArsip = sqliteTable(
	'surat_arsip',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		arah: text({ enum: ['masuk', 'keluar'] }).notNull(),
		nomorSurat: text(),
		tanggalSurat: text().notNull(),
		tanggalDiterima: text(),
		pengirimPenerima: text().notNull(),
		perihal: text().notNull(),
		ringkasan: text(),
		status: text({
			enum: ['draft', 'diajukan', 'disetujui', 'ditolak', 'diarsipkan']
		})
			.notNull()
			.default('draft'),
		dibuatOlehId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		disetujuiOlehId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		tanggalPersetujuan: text(),
		catatanPersetujuan: text(),
		snapshotJson: text(),
		...audit
	},
	(table) => [
		index('surat_arsip_sekolah_arah_idx').on(table.sekolahId, table.arah),
		index('surat_arsip_sekolah_status_idx').on(table.sekolahId, table.status),
		index('surat_arsip_tanggal_idx').on(table.tanggalSurat)
	]
);

export const tableDocumentAttachment = sqliteTable(
	'document_attachment',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		entityType: text().notNull(),
		entityId: text().notNull(),
		entityLabelSnapshot: text().notNull(),
		category: text().notNull(),
		originalName: text().notNull(),
		storedPath: text().notNull(),
		mimeType: text().notNull(),
		sizeBytes: int().notNull(),
		sha256: text().notNull(),
		expiresAt: text(),
		uploadedById: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		...audit
	},
	(table) => [
		index('document_attachment_school_entity_idx').on(
			table.sekolahId,
			table.entityType,
			table.entityId
		),
		index('document_attachment_school_category_idx').on(table.sekolahId, table.category),
		unique('document_attachment_stored_path_unique').on(table.storedPath)
	]
);

export const tableServerIdentity = sqliteTable('server_identity', {
	id: int().primaryKey(),
	instanceId: text().notNull(),
	machineName: text().notNull(),
	processId: int().notNull(),
	role: text({ enum: ['primary', 'standby'] })
		.notNull()
		.default('primary'),
	databasePathHash: text().notNull(),
	startedAt: text().notNull(),
	heartbeatAt: text().notNull(),
	...audit
});

export const tableMaintenanceRun = sqliteTable(
	'maintenance_run',
	{
		id: int().primaryKey({ autoIncrement: true }),
		type: text({ enum: ['backup', 'cleanup', 'health', 'restore_test', 'update_test'] }).notNull(),
		status: text({ enum: ['running', 'success', 'failed', 'warning'] }).notNull(),
		summary: text(),
		detailsJson: text(),
		startedAt: text().notNull(),
		finishedAt: text(),
		...audit
	},
	(table) => [index('maintenance_run_type_created_idx').on(table.type, table.createdAt)]
);

export const tableCommunicationTemplate = sqliteTable(
	'communication_template',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		name: text().notNull(),
		channel: text({ enum: ['internal', 'email', 'whatsapp'] })
			.notNull()
			.default('internal'),
		audience: text().notNull().default('semua'),
		subject: text(),
		body: text().notNull(),
		active: int({ mode: 'boolean' }).notNull().default(true),
		...audit
	},
	(table) => [
		index('communication_template_school_idx').on(table.sekolahId),
		unique('communication_template_school_name_unique').on(table.sekolahId, table.name)
	]
);

export const tableCommunicationQueue = sqliteTable(
	'communication_queue',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		templateId: int().references(() => tableCommunicationTemplate.id, { onDelete: 'set null' }),
		channel: text({ enum: ['internal', 'email', 'whatsapp'] }).notNull(),
		audience: text().notNull(),
		recipient: text(),
		subject: text(),
		body: text().notNull(),
		status: text({ enum: ['draft', 'pending_approval', 'approved', 'sent', 'failed', 'cancelled'] })
			.notNull()
			.default('draft'),
		containsSensitiveData: int({ mode: 'boolean' }).notNull().default(false),
		createdById: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		approvedById: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		approvedAt: text(),
		sentAt: text(),
		attempts: int().notNull().default(0),
		lastError: text(),
		...audit
	},
	(table) => [
		index('communication_queue_school_status_idx').on(table.sekolahId, table.status),
		index('communication_queue_created_idx').on(table.createdAt)
	]
);

export const tableDocumentApproval = sqliteTable(
	'document_approval',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		documentType: text().notNull(),
		entityId: text(),
		titleSnapshot: text().notNull(),
		version: int().notNull().default(1),
		status: text({
			enum: ['draft', 'diajukan', 'diperiksa', 'disetujui', 'ditolak', 'diterbitkan']
		})
			.notNull()
			.default('draft'),
		submittedById: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		reviewedById: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		approvedById: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		submittedAt: text(),
		reviewedAt: text(),
		approvedAt: text(),
		publishedAt: text(),
		note: text(),
		snapshotJson: text(),
		parentApprovalId: int(),
		...audit
	},
	(table) => [
		index('document_approval_school_status_idx').on(table.sekolahId, table.status),
		index('document_approval_entity_idx').on(table.sekolahId, table.documentType, table.entityId),
		index('document_approval_parent_idx').on(table.parentApprovalId)
	]
);

export const tableInventaris = sqliteTable(
	'inventaris',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		kode: text().notNull(),
		nama: text().notNull(),
		kategori: text().notNull(),
		lokasi: text(),
		kondisi: text({ enum: ['baik', 'rusak_ringan', 'rusak_berat', 'hilang'] })
			.notNull()
			.default('baik'),
		jumlah: int().notNull().default(1),
		satuan: text().notNull().default('unit'),
		sumberDana: text(),
		tahunPerolehan: int(),
		nilaiPerolehan: real(),
		penanggungJawabId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		qrToken: text().notNull(),
		catatan: text(),
		...audit
	},
	(table) => [
		unique('inventaris_sekolah_kode_unique').on(table.sekolahId, table.kode),
		unique('inventaris_qr_token_unique').on(table.qrToken),
		index('inventaris_sekolah_kategori_idx').on(table.sekolahId, table.kategori),
		index('inventaris_sekolah_kondisi_idx').on(table.sekolahId, table.kondisi)
	]
);

export const tableInventarisPeminjaman = sqliteTable(
	'inventaris_peminjaman',
	{
		id: int().primaryKey({ autoIncrement: true }),
		inventarisId: int()
			.references(() => tableInventaris.id, { onDelete: 'cascade' })
			.notNull(),
		peminjamPegawaiId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		peminjamNama: text().notNull(),
		jumlah: int().notNull().default(1),
		tanggalPinjam: text().notNull(),
		rencanaKembali: text(),
		tanggalKembali: text(),
		status: text({ enum: ['dipinjam', 'dikembalikan'] })
			.notNull()
			.default('dipinjam'),
		kondisiKembali: text(),
		catatan: text(),
		...audit
	},
	(table) => [index('inventaris_peminjaman_asset_status_idx').on(table.inventarisId, table.status)]
);

export const tableInventarisPerawatan = sqliteTable(
	'inventaris_perawatan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		inventarisId: int()
			.references(() => tableInventaris.id, { onDelete: 'cascade' })
			.notNull(),
		tanggal: text().notNull(),
		jenis: text().notNull(),
		biaya: real(),
		keterangan: text(),
		pegawaiId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		...audit
	},
	(table) => [index('inventaris_perawatan_asset_tanggal_idx').on(table.inventarisId, table.tanggal)]
);

export const tablePengumuman = sqliteTable(
	'pengumuman',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		judul: text().notNull(),
		isi: text().notNull(),
		kategori: text({ enum: ['umum', 'sekolah', 'asrama', 'akademik'] })
			.notNull()
			.default('umum'),
		audiens: text({ enum: ['semua', 'admin', 'guru', 'wali_kelas', 'wali_asuh', 'wali_asrama'] })
			.notNull()
			.default('semua'),
		prioritas: text({ enum: ['normal', 'penting'] })
			.notNull()
			.default('normal'),
		tanggalMulai: text().notNull(),
		tanggalSelesai: text(),
		aktif: int({ mode: 'boolean' }).notNull().default(true),
		dibuatOlehId: int().references(() => tableAuthUser.id, { onDelete: 'set null' }),
		...audit
	},
	(table) => [
		index('pengumuman_sekolah_periode_idx').on(
			table.sekolahId,
			table.tanggalMulai,
			table.tanggalSelesai
		),
		index('pengumuman_sekolah_audiens_idx').on(table.sekolahId, table.audiens, table.aktif)
	]
);

export const tableBukuTamu = sqliteTable(
	'buku_tamu',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int().references(() => tableTahunAjaran.id, { onDelete: 'set null' }),
		semesterId: int().references(() => tableSemester.id, { onDelete: 'set null' }),
		nama: text().notNull(),
		asalInstansi: text().notNull(),
		nip: text(),
		keperluan: text().notNull(),
		pesanKesan: text(),
		tandaTangan: text(),
		...audit
	},
	(table) => [
		index('buku_tamu_sekolah_idx').on(table.sekolahId),
		index('buku_tamu_tanggal_idx').on(table.createdAt)
	]
);

export const tableBukuTamuSettings = sqliteTable(
	'buku_tamu_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		publicToken: text().notNull(),
		passkeyHash: text(),
		passkeySalt: text(),
		unlockToken: text(),
		...audit
	},
	(table) => [unique().on(table.sekolahId), unique().on(table.publicToken)]
);

export const tableAiSettings = sqliteTable(
	'ai_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		provider: text({ enum: ['gemini', 'openai_compatible'] })
			.default('gemini')
			.notNull(),
		apiKey: text().notNull(),
		model: text().notNull(),
		baseUrl: text().notNull(),
		...audit
	},
	(table) => [unique('ai_settings_sekolah_unique').on(table.sekolahId)]
);

export const tableUserAiSettings = sqliteTable(
	'user_ai_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		authUserId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		provider: text({ enum: ['gemini', 'openai_compatible'] })
			.default('gemini')
			.notNull(),
		apiKey: text().notNull(),
		model: text().notNull(),
		baseUrl: text().notNull(),
		...audit
	},
	(table) => [unique('user_ai_settings_user_unique').on(table.authUserId)]
);

export const tableSppdRelations = relations(tableSppd, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableSppd.sekolahId],
		references: [tableSekolah.id]
	}),
	pegawai: one(tablePegawai, {
		fields: [tableSppd.pegawaiId],
		references: [tablePegawai.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableSppd.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableSppd.semesterId],
		references: [tableSemester.id]
	}),
	permohonan: many(tableDinasLuarPermohonan),
	pelaksana: many(tableSppdPegawai),
	pengikut: many(tableSppdPengikut),
	bukti: many(tableDinasLuarBukti)
}));

export const tableSppdPegawaiRelations = relations(tableSppdPegawai, ({ one }) => ({
	sppd: one(tableSppd, { fields: [tableSppdPegawai.sppdId], references: [tableSppd.id] }),
	pegawai: one(tablePegawai, {
		fields: [tableSppdPegawai.pegawaiId],
		references: [tablePegawai.id]
	})
}));

export const tableSppdPengikutRelations = relations(tableSppdPengikut, ({ one }) => ({
	sppd: one(tableSppd, { fields: [tableSppdPengikut.sppdId], references: [tableSppd.id] })
}));

export const tableDinasLuarBuktiRelations = relations(tableDinasLuarBukti, ({ one }) => ({
	sppd: one(tableSppd, { fields: [tableDinasLuarBukti.sppdId], references: [tableSppd.id] }),
	authUser: one(tableAuthUser, {
		fields: [tableDinasLuarBukti.authUserId],
		references: [tableAuthUser.id]
	})
}));

export const tableDinasLuarPermohonanRelations = relations(tableDinasLuarPermohonan, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableDinasLuarPermohonan.sekolahId],
		references: [tableSekolah.id]
	}),
	pegawai: one(tablePegawai, {
		fields: [tableDinasLuarPermohonan.pegawaiId],
		references: [tablePegawai.id]
	}),
	sppd: one(tableSppd, {
		fields: [tableDinasLuarPermohonan.sppdId],
		references: [tableSppd.id]
	})
}));

export const tableBukuTamuRelations = relations(tableBukuTamu, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableBukuTamu.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableBukuTamu.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableBukuTamu.semesterId],
		references: [tableSemester.id]
	})
}));

export const tableBukuTamuSettingsRelations = relations(tableBukuTamuSettings, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableBukuTamuSettings.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableAiSettingsRelations = relations(tableAiSettings, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableAiSettings.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableUserAiSettingsRelations = relations(tableUserAiSettings, ({ one }) => ({
	user: one(tableAuthUser, {
		fields: [tableUserAiSettings.authUserId],
		references: [tableAuthUser.id]
	})
}));

export const tableMartikulasiSettings = sqliteTable(
	'martikulasi_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		periodeMulai: text(),
		periodeSelesai: text(),
		nomorSk: text(),
		tanggalSk: text(),
		lokasiPenetapan: text(),
		formatNomorSttm: text().notNull().default('{urut}/STTM/SR/{bulan_romawi}/{tahun}'),
		nomorUrutSttmBerikutnya: int().notNull().default(1),
		sekolahNamaSnapshot: text(),
		npsnSnapshot: text(),
		naunganSnapshot: text(),
		alamatSnapshot: text(),
		emailSnapshot: text(),
		kepalaSekolahNamaSnapshot: text(),
		kepalaSekolahNipSnapshot: text(),
		kepalaSekolahStatusSnapshot: text(),
		...audit
	},
	(table) => [
		unique('martikulasi_settings_sekolah_tahun_unique').on(table.sekolahId, table.tahunAjaranId),
		index('martikulasi_settings_sekolah_idx').on(table.sekolahId)
	]
);

export const tableMartikulasiTim = sqliteTable(
	'martikulasi_tim',
	{
		id: int().primaryKey({ autoIncrement: true }),
		settingsId: int()
			.references(() => tableMartikulasiSettings.id, { onDelete: 'cascade' })
			.notNull(),
		pegawaiId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		namaSnapshot: text().notNull(),
		nipSnapshot: text(),
		jabatanTim: text().notNull(),
		tugas: text(),
		urutan: int().notNull().default(0),
		...audit
	},
	(table) => [index('martikulasi_tim_settings_idx').on(table.settingsId)]
);

export const tableMartikulasiHasil = sqliteTable(
	'martikulasi_hasil',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		statusKelengkapan: text({ enum: ['belum_lengkap', 'lengkap'] })
			.notNull()
			.default('belum_lengkap'),
		levelPenempatan: text({ enum: ['dasar', 'madya', 'mahir'] }),
		rekomendasi: text(),
		catatanUmum: text(),
		nomorSttm: text(),
		tanggalSttm: text(),
		muridNamaSnapshot: text(),
		nisSnapshot: text(),
		nisnSnapshot: text(),
		kelasNamaSnapshot: text(),
		jenjangSnapshot: text(),
		waliKelasNamaSnapshot: text(),
		waliKelasNipSnapshot: text(),
		sekolahNamaSnapshot: text(),
		npsnSnapshot: text(),
		naunganSnapshot: text(),
		alamatSnapshot: text(),
		emailSnapshot: text(),
		kepalaSekolahNamaSnapshot: text(),
		kepalaSekolahNipSnapshot: text(),
		kepalaSekolahStatusSnapshot: text(),
		lokasiPenetapanSnapshot: text(),
		levelPenempatanSnapshot: text(),
		...audit
	},
	(table) => [
		unique('martikulasi_hasil_sekolah_tahun_murid_unique').on(
			table.sekolahId,
			table.tahunAjaranId,
			table.muridId
		),
		index('martikulasi_hasil_sekolah_tahun_idx').on(table.sekolahId, table.tahunAjaranId),
		index('martikulasi_hasil_kelas_idx').on(table.kelasId)
	]
);

export const tableMartikulasiNilai = sqliteTable(
	'martikulasi_nilai',
	{
		id: int().primaryKey({ autoIncrement: true }),
		hasilId: int()
			.references(() => tableMartikulasiHasil.id, { onDelete: 'cascade' })
			.notNull(),
		aspekKode: text().notNull(),
		kelompok: text({ enum: ['akademik', 'karakter'] }).notNull(),
		capaianAwal: text(),
		capaianAkhir: text(),
		ketuntasan: text({ enum: ['tuntas', 'belum_tuntas', 'perlu_pendampingan'] }),
		catatan: text(),
		deskripsiCapaian: text(),
		...audit
	},
	(table) => [
		unique('martikulasi_nilai_hasil_aspek_unique').on(table.hasilId, table.aspekKode),
		index('martikulasi_nilai_hasil_idx').on(table.hasilId)
	]
);

export const tableMartikulasiSettingsRelations = relations(
	tableMartikulasiSettings,
	({ one, many }) => ({
		sekolah: one(tableSekolah, {
			fields: [tableMartikulasiSettings.sekolahId],
			references: [tableSekolah.id]
		}),
		tahunAjaran: one(tableTahunAjaran, {
			fields: [tableMartikulasiSettings.tahunAjaranId],
			references: [tableTahunAjaran.id]
		}),
		tim: many(tableMartikulasiTim)
	})
);

export const tableMartikulasiTimRelations = relations(tableMartikulasiTim, ({ one }) => ({
	settings: one(tableMartikulasiSettings, {
		fields: [tableMartikulasiTim.settingsId],
		references: [tableMartikulasiSettings.id]
	}),
	pegawai: one(tablePegawai, {
		fields: [tableMartikulasiTim.pegawaiId],
		references: [tablePegawai.id]
	})
}));

export const tableMartikulasiHasilRelations = relations(tableMartikulasiHasil, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableMartikulasiHasil.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableMartikulasiHasil.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableMartikulasiHasil.kelasId],
		references: [tableKelas.id]
	}),
	murid: one(tableMurid, {
		fields: [tableMartikulasiHasil.muridId],
		references: [tableMurid.id]
	}),
	nilai: many(tableMartikulasiNilai)
}));

export const tableMartikulasiNilaiRelations = relations(tableMartikulasiNilai, ({ one }) => ({
	hasil: one(tableMartikulasiHasil, {
		fields: [tableMartikulasiNilai.hasilId],
		references: [tableMartikulasiHasil.id]
	})
}));
