import { getUserRoles, hasRole, isFullAccess, type RoleUser } from '../../lib/user-role.ts';
import {
	curriculumPermissions,
	canManageCurriculum,
	roleGrants,
	rolePermissionList
} from '../../lib/role-policy.ts';
import { isHomeroomTeacher } from '../../lib/homeroom-access.ts';
import { parseAccessPosition, type AccessPosition } from '../../lib/access-position.ts';
import { studentProfilePermissions } from '../../lib/murid-profile.ts';

export const groupedUserPermissions = {
	asrama: {
		values: [
			['lihat', 'Lihat Data Asrama sesuai penugasan'],
			['manage', 'Kelola gedung dan kamar asrama'],
			['penempatan', 'Kelola penempatan dan mutasi penghuni'],
			['penugasan', 'Kelola penugasan wali asrama']
		],
		description: 'Data Asrama'
	},
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
		],
		description: 'Akses Menu Tambahan (cakupan penugasan tetap berlaku)'
	},
	cetak: {
		values: [
			['dokumen', 'Akses Cetak Dokumen'],
			['akademik', 'Cetak Raport Akademik'],
			['keasramaan', 'Cetak Raport Keasramaan']
		],
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
		values: [['arsip', 'Kelola Status, Riwayat, dan Kenaikan Kelas di Semua Murid']],
		description: 'Status dan Riwayat Murid'
	},
	rapor_arsip: {
		values: [
			['lihat', 'Lihat Riwayat Rapor Sesuai Penugasan'],
			['finalisasi', 'Finalisasi Rapor Setelah Pemeriksaan'],
			['revisi', 'Terbitkan Revisi Rapor Final'],
			['massal', 'Finalisasi Rapor Massal per Kelas']
		],
		description: 'Arsip Rapor - Finalisasi dan Revisi Memerlukan Persetujuan Khusus'
	},
	murid_profil: {
		values: [
			['lihat', 'Lihat informasi keluarga dan dokumentasi murid'],
			['manage', 'Kelola profil tambahan dan dokumentasi murid'],
			['cetak', 'Cetak Informasi Siswa berisi data pribadi']
		],
		description: 'Profil Tambahan Murid - Izin Khusus, Tetap Sesuai Cakupan Penugasan'
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
	class_monitoring: {
		values: [
			['lihat', 'Lihat Monitoring Kelas'],
			['scan', 'Scan QR Kelas untuk Pertemuan Sendiri atau Penggantian Ditugaskan'],
			['manage', 'Kelola QR Kelas, Guru Berhalangan, dan Guru Pengganti']
		],
		description: 'Monitoring Kelas dan Kehadiran Mengajar'
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
			['perjalanan', 'Scan Keberangkatan dan Kedatangan Berdasarkan Izin Pulang'],
			['impor', 'Impor Absensi Massal'],
			['pengaturan', 'Kelola Pengaturan Kegiatan'],
			['qr_manage', 'Terbitkan Ulang atau Reset QR'],
			['sinkron_rapor', 'Sinkronkan Absensi ke Raport']
		],
		description: 'Absensi - Izin Tindakan, Tetap Mengikuti Penugasan'
	},
	mata_pelajaran: {
		values: [['keasramaan', 'Ekspor Mata Evaluasi Keasramaan pada Asrama Ditugaskan']],
		description: 'Ekspor Keasramaan'
	},
	keasramaan: {
		values: [
			['lihat', 'Lihat Data Keasramaan sesuai Penugasan'],
			['manage', 'Kelola Mata Evaluasi dan Catatan Keasramaan'],
			['input', 'Input Nilai Keasramaan']
		],
		description: 'Keasramaan - Hak Akses Sesuai Peran dan Penugasan'
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

export function permissionsForAccessPosition(position?: AccessPosition | null): UserPermission[] {
	const resolved = parseAccessPosition(position);
	return resolved ? rolePermissionList({ roles: [resolved] }, userPermissions) : [];
}
export function basicAttendancePermissionsForType(type?: string | null): UserPermission[] {
	return rolePermissionList({ type }, userPermissions).filter((permission) =>
		permission.startsWith('absensi_')
	);
}
export function permissionAppliesToUser(
	user: NonNullable<RoleUser> & { waliKelasIds?: readonly number[] },
	permission: string
) {
	if (isFullAccess(user)) return true;
	if (curriculumPermissions.includes(permission)) return canManageCurriculum(user);
	if (permission === 'menu_martikulasi') return roleGrants(user, permission);
	if (systemOnlyPermissions.has(permission as UserPermission)) return false;
	if (roleGrants(user, permission)) return true;
	if (isHomeroomTeacher(user) && ['rapor_manage', 'cetak_akademik'].includes(permission))
		return true;
	const roles = getUserRoles(user);
	if (
		permission.startsWith('keasramaan_') ||
		[
			'mata_pelajaran_keasramaan',
			'menu_catatan_asrama',
			'menu_rekap_asrama',
			'cetak_keasramaan'
		].includes(permission)
	)
		return false;
	if (
		[
			'rapor_arsip_lihat',
			'rapor_arsip_finalisasi',
			'rapor_arsip_revisi',
			'rapor_arsip_massal',
			...studentProfilePermissions
		].includes(permission as never)
	)
		return roles.some((role) =>
			[
				'user',
				'wali_asuh',
				'wali_asrama',
				'waka_kurikulum',
				'waka_kesiswaan',
				'waka_keasramaan',
				'operator'
			].includes(role)
		);
	if (hasRole(user, 'user') && permission.startsWith('class_monitoring_')) return true;
	if (hasRole(user, 'user', 'wali_asuh', 'wali_asrama'))
		return (
			permission === 'kelas_pindah' ||
			permission === 'kurikulum_rpm' ||
			permission.startsWith('absensi_')
		);
	return false;
}
export function effectivePermissions(
	user?:
		| (NonNullable<RoleUser> & {
				permissions?: readonly UserPermission[] | null;
				waliKelasIds?: readonly number[];
		  })
		| null
): UserPermission[] {
	if (!user) return [];
	const automatic = rolePermissionList(user, userPermissions);
	const stored = (user.permissions ?? []).filter(
		(permission) =>
			userPermissions.includes(permission) && permissionAppliesToUser(user, permission)
	);
	return [
		...new Set([
			...automatic,
			...stored,
			...(isHomeroomTeacher(user)
				? [
						'rapor_manage' as UserPermission,
						'cetak_akademik' as UserPermission,
						'menu_martikulasi' as UserPermission
					]
				: [])
		])
	];
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
	user?: Pick<AuthUser, 'permissions' | 'type'> & {
		jabatanAkses?: AuthUser['jabatanAkses'];
		roles?: readonly string[] | null;
		waliKelasIds?: readonly number[];
	}
) {
	if (!user) return false;
	// Admins are authorized for everything by policy
	// wali_kelas and wali_asuh are NOT admins and must check permissions
	if (isFullAccess(user)) return true;
	const granted = effectivePermissions(user);
	return allowedPermissions.some((permission) => granted.includes(permission));
}
