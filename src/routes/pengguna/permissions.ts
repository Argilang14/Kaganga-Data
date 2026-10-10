import { parseAccessPosition, type AccessPosition } from '../../lib/access-position.ts';
import { roleMenuPermissions } from '../../lib/role-menu-access.ts';

export const groupedUserPermissions = {
	menu: {
		values: [
			['murid', 'Akses Data Murid sesuai penugasan'],
			['intrakurikuler', 'Akses Mata Pelajaran Intrakurikuler'],
			['nilai_intrakurikuler', 'Input Nilai Intrakurikuler'],
			['jurnal', 'Akses Jurnal Mengajar'],
			['catatan_asrama', 'Akses Catatan Wali Asrama'],
			['rekap_asrama', 'Akses Rekap Nilai Keasramaan'],
			['kurikulum', 'Akses Data Mata Pelajaran'],
			['kokurikuler', 'Akses Kokurikuler'],
			['ekstrakurikuler', 'Akses Ekstrakurikuler'],
			['martikulasi', 'Akses Martikulasi'],
			['pertumbuhan', 'Akses Riwayat Pertumbuhan'],
			['absensi_harian', 'Akses Absensi Harian']
		], description: 'Akses Menu Tambahan (cakupan penugasan tetap berlaku)'
	},
	cetak: {
		values: [['dokumen', 'Akses Cetak Dokumen'], ['akademik', 'Cetak Raport Akademik'], ['keasramaan', 'Cetak Raport Keasramaan']],
		description: 'Akses Cetak'
	},
	user: {
		values: [
			['list', 'Lihat daftar pengguna'],
			['detail', 'Lihat detail pengguna'],
			['add', 'Tambah pengguna'],
			['delete', 'Hapus pengguna'],
			['suspend', 'Tangguhkan pengguna'],
			['set_permissions', 'Atur izin pengguna']
		],
		description: 'Manajemen Pengguna'
	},

	dashboard: {
		values: [['manage', 'Kelola Tindakan Cepat']],
		description: 'Dashboard'
	},
	pimpinan: {
		values: [['lihat', 'Lihat Ringkasan Pengawasan Dashboard']],
		description: 'Pengawasan Dashboard'
	},
	inventaris: {
		values: [
			['lihat', 'Lihat Inventaris dan Sarana Prasarana'],
			['manage', 'Kelola aset, peminjaman, dan perawatan']
		],
		description: 'Inventaris dan Sarana Prasarana'
	},
	pengumuman: {
		values: [
			['lihat', 'Lihat Pengumuman dan Agenda'],
			['manage', 'Kelola Pengumuman']
		],
		description: 'Pengumuman dan Kalender Terpadu'
	},
	portal_wali: {
		values: [
			['lihat', 'Lihat Portal Wali Murid'],
			['manage', 'Kelola akun dan hubungan wali murid']
		],
		description: 'Portal Wali Murid'
	},
	ruangan: {
		values: [
			['lihat', 'Lihat data dan pemakaian ruangan'],
			['manage', 'Kelola ruangan dan penempatannya']
		],
		description: 'Manajemen Ruangan'
	},
	penjadwalan: {
		values: [
			['rekomendasi', 'Lihat rekomendasi jadwal'],
			['preferensi', 'Kelola preferensi waktu guru']
		],
		description: 'Penjadwalan Semiotomatis'
	},
	sekolah: {
		values: [
			['lihat', 'Lihat Data Sekolah'],
			['manage', 'Kelola Identitas Sekolah']
		],
		description: 'Sekolah'
	},
	app: {
		values: [['check_update', 'Cek Pembaruan Aplikasi']],
		description: 'Aplikasi'
	},
	server: {
		values: [['stop', 'Hentikan Server']],
		description: 'Server'
	},
	rapor: {
		values: [['manage', 'Kelola Akademik']],
		description: 'Akademik'
	},
	kurikulum: {
		values: [['rpm', 'Buat dan cetak RPM']],
		description: 'Kurikulum'
	},
	ujian: {
		values: [
			['manage', 'Kelola sesi dan peserta ujian'],
			['cetak', 'Cetak kartu ujian']
		],
		description: 'Kartu Ujian'
	},
	kelas: {
		values: [
			['lihat', 'Lihat Daftar Kelas'],
			['manage', 'Kelola Data Kelas'],
			['pindah', 'Pindah dan akses kelas lain']
		],
		description: 'Data Kelas'
	},
	murid: {
		values: [['arsip', 'Kelola Arsip Murid, Alumni, dan Kenaikan Kelas']],
		description: 'Arsip Murid dan Alumni'
	},
	audit: {
		values: [['lihat', 'Lihat Riwayat Aktivitas Sistem']],
		description: 'Audit Aktivitas'
	},
	administrasi: {
		values: [
			['absensi', 'Akses dasar absensi (izin lama; tidak membuka pengaturan)'],
			['jadwal', 'Kelola Jadwal Pelajaran'],
			['buku_tamu', 'Kelola Buku Tamu Digital'],
			['presensi_pegawai', 'Kelola Presensi Pegawai']
		],
		description: 'Administrasi'
	},
	absensi: {
		values: [
			['lihat', 'Lihat Absensi, Rekap, dan Monitoring Sesuai Penugasan'],
			['scan', 'Scan QR Sesuai Penugasan'],
			['input', 'Input Absensi Hari Ini'],
			['koreksi', 'Koreksi Absensi Hari Ini dengan Alasan'],
			['koreksi_lama', 'Input dan Koreksi Tanggal Lama'],
			['export', 'Ekspor Rekap Sesuai Penugasan'],
			['izin_pulang', 'Kelola Izin Pulang dan Kepulangan'],
			['impor', 'Impor Absensi Massal'],
			['pengaturan', 'Kelola Pengaturan Kegiatan'],
			['qr_manage', 'Terbitkan Ulang atau Reset QR'],
			['sinkron_rapor', 'Sinkronkan Absensi ke Raport']
		],
		description: 'Absensi - Izin Tindakan, Tetap Mengikuti Penugasan'
	},
	mata_pelajaran: {
		values: [['keasramaan', 'Ekspor Mata Evaluasi Keasramaan pada Kelas Ditugaskan']],
		description: 'Ekspor Keasramaan'
	},
	keasramaan: {
		values: [
			['lihat', 'Lihat Menu dan Rekap Keasramaan'],
			['manage', 'Kelola Mata Evaluasi dan Catatan Keasramaan'],
			['input', 'Input Nilai Keasramaan']
		],
		description: 'Keasramaan - Pengecualian Akses Sesuai Penugasan'
	},
	surat: {
		values: [
			['sppd', 'Kelola SPPD'],
			['dinas_luar', 'Kelola Dinas Luar'],
			['arsip', 'Kelola Surat Masuk dan Keluar'],
			['persetujuan', 'Menyetujui dan Menolak Dokumen Surat']
		],
		description: 'Surat Menyurat'
	},
	notifikasi: {
		values: [['lihat', 'Lihat Pusat Notifikasi']],
		description: 'Pusat Notifikasi'
	},
	operasional: {
		values: [['lihat', 'Lihat kesehatan server, backup, dan sesi perangkat']],
		description: 'Operasional dan Pemeliharaan Sistem'
	},
	komunikasi: {
		values: [
			['lihat', 'Lihat antrean komunikasi'],
			['manage', 'Kelola template dan draf komunikasi'],
			['approve', 'Setujui komunikasi sebelum dikirim']
		],
		description: 'Komunikasi Terintegrasi'
	},
	berkas: {
		values: [
			['lihat', 'Lihat dan unduh berkas'],
			['manage', 'Unggah dan kelola metadata berkas'],
			['delete', 'Hapus berkas']
		],
		description: 'Manajemen Berkas'
	},
	persetujuan: {
		values: [
			['lihat', 'Lihat Pusat Persetujuan'],
			['ajukan', 'Buat dan ajukan dokumen'],
			['periksa', 'Periksa dokumen sebagai Waka'],
			['setujui', 'Setujui atau tolak dokumen'],
			['terbitkan', 'Terbitkan dokumen final']
		],
		description: 'Persetujuan Dokumen'
	}
} as const;

export const userPermissions = Object.entries(groupedUserPermissions) //
	.flatMap(([key, { values }]) => values.map((value) => `${key}_${value[0]}` as UserPermission));

export const systemOnlyPermissions = new Set<UserPermission>([
	'user_list',
	'user_detail',
	'user_add',
	'user_delete',
	'user_suspend',
	'user_set_permissions',
	'app_check_update',
	'server_stop',
	'audit_lihat',
	'operasional_lihat'
]);

const operatorExcludedPermissions = new Set<UserPermission>([
	'surat_persetujuan',
	'persetujuan_periksa',
	'persetujuan_setujui',
	'persetujuan_terbitkan',
	'komunikasi_approve'
]);

export function permissionsForAccessPosition(position?: AccessPosition | null): UserPermission[] {
	const resolvedPosition = parseAccessPosition(position);
	if (!resolvedPosition) return [];
	if (resolvedPosition === 'waka_humas') return userPermissions.filter((permission) =>
		permission.startsWith('absensi_') || permission.startsWith('surat_') || permission.startsWith('persetujuan_') || permission.startsWith('berkas_') || ['administrasi_absensi', 'administrasi_presensi_pegawai', 'administrasi_buku_tamu', 'menu_absensi_harian'].includes(permission));
	return userPermissions.filter(
		(permission) =>
			!systemOnlyPermissions.has(permission) &&
			(resolvedPosition !== 'operator' || !operatorExcludedPermissions.has(permission))
	);
}

export function basicAttendancePermissionsForType(type?: string | null): UserPermission[] {
	return ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'tim_dapur'].includes(type ?? '')
		? ['absensi_lihat', 'absensi_scan', 'absensi_input', 'absensi_koreksi', 'absensi_export']
		: [];
}

export function effectivePermissions(
	user?: {
		type?: string | null;
		permissions?: readonly UserPermission[] | null;
		jabatanAkses?: AccessPosition | null;
	} | null
): UserPermission[] {
	if (!user) return [];
	if (user.type === 'admin') return [...userPermissions];
	const position = parseAccessPosition(user.jabatanAkses);
	const positionPermissions = permissionsForAccessPosition(position);
	const stored = (user.permissions ?? []).filter(
		(permission) => !position || !systemOnlyPermissions.has(permission)
	);
	const basic = basicAttendancePermissionsForType(user.type);
	return [...new Set([...positionPermissions, ...basic, ...roleMenuPermissions(user.type) as UserPermission[], ...stored])];
}

export function defaultPermissionsForType(
	type: AuthUser['type'],
	options: { kelasCount?: number } = {}
): UserPermission[] {
	if (type === 'admin') return [...userPermissions];
	if (type === 'wali_murid') return ['portal_wali_lihat'];
	if (type === 'user' && (options.kelasCount ?? 0) > 1) return ['kelas_pindah'];
	return [];
}

export function isAuthorizedUser(
	allowedPermissions: UserPermission[],
	// include 'type' so we can treat admins as authorized
	user?: Pick<AuthUser, 'permissions' | 'type'> & { jabatanAkses?: AuthUser['jabatanAkses'] }
) {
	if (!user) return false;
	// Admins are authorized for everything by policy
	// wali_kelas and wali_asuh are NOT admins and must check permissions
	if ('type' in user && user.type === 'admin') return true;
	const granted = effectivePermissions(user);
	return allowedPermissions.some((permission) => granted.includes(permission));
}
