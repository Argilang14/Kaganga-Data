import { getUserRoles, type RoleUser, type UserRole } from './user-role.ts';
const shared = ['menu_murid', 'cetak_dokumen', 'surat_sppd', 'surat_dinas_luar'];
const basicAttendance = [
	'absensi_lihat',
	'absensi_scan',
	'absensi_input',
	'absensi_koreksi',
	'absensi_export'
];
export const systemPermissions = [
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
];
const roleRules: Partial<Record<UserRole, readonly string[]>> = {
	user: [
		...shared,
		...basicAttendance,
		'menu_intrakurikuler',
		'menu_nilai_intrakurikuler',
		'menu_jurnal',
		'class_monitoring_lihat',
		'class_monitoring_scan'
	],
	wali_asuh: [
		...shared,
		...basicAttendance,
		'asrama_lihat',
		'keasramaan_lihat',
		'keasramaan_input',
		'mata_pelajaran_keasramaan',
		'cetak_keasramaan'
	],
	wali_asrama: [
		...shared,
		...basicAttendance,
		'asrama_lihat',
		'asrama_penempatan',
		'keasramaan_lihat',
		'keasramaan_manage',
		'mata_pelajaran_keasramaan',
		'cetak_keasramaan',
		'menu_catatan_asrama',
		'menu_rekap_asrama'
	],
	tim_dapur: [...basicAttendance, 'surat_sppd', 'surat_dinas_luar'],
	tim_keamanan: ['absensi_scan', 'absensi_perjalanan'],
	wali_murid: ['portal_wali_lihat'],
	waka_kurikulum: [
		'menu_kurikulum',
		'kurikulum_rpm',
		'administrasi_jadwal',
		'ujian_*',
		'menu_jurnal',
		'menu_intrakurikuler',
		'menu_nilai_intrakurikuler',
		'menu_kokurikuler',
		'menu_ekstrakurikuler',
		'menu_martikulasi',
		'rapor_manage',
		'kelas_lihat',
		'kelas_pindah',
		'menu_murid',
		'cetak_*',
		'rapor_arsip_*',
		'asrama_*',
		'keasramaan_*',
		'mata_pelajaran_keasramaan',
		'menu_catatan_asrama',
		'menu_rekap_asrama',
		'pimpinan_lihat'
	],
	waka_kesiswaan: [
		'menu_murid',
		'murid_arsip',
		'kelas_lihat',
		'kelas_pindah',
		'absensi_*',
		'class_monitoring_*',
		'administrasi_absensi',
		'menu_absensi_harian',
		'cetak_dokumen',
		'cetak_akademik',
		'menu_pertumbuhan',
		'pimpinan_lihat'
	],
	waka_sarpras: ['inventaris_*', 'ruangan_*', 'berkas_*', 'cetak_dokumen', 'pimpinan_lihat'],
	waka_keasramaan: [
		'asrama_*',
		'keasramaan_lihat',
		'keasramaan_manage',
		'mata_pelajaran_keasramaan',
		'menu_catatan_asrama',
		'menu_rekap_asrama',
		'cetak_keasramaan',
		'cetak_dokumen',
		'menu_murid',
		'kelas_lihat',
		'kelas_pindah',
		'pimpinan_lihat'
	],
	waka_humas: [
		'absensi_*',
		'class_monitoring_*',
		'surat_*',
		'persetujuan_*',
		'berkas_*',
		'komunikasi_*',
		'pengumuman_*',
		'administrasi_absensi',
		'administrasi_presensi_pegawai',
		'administrasi_buku_tamu',
		'menu_absensi_harian',
		'cetak_dokumen'
	]
};
export function roleGrants(user: RoleUser, permission: string) {
	return getUserRoles(user).some((role) => {
		if (role === 'admin' || role === 'kepala_sekolah') return true;
		if (systemPermissions.includes(permission)) return false;
		if (role === 'operator') return true;
		return (
			roleRules[role]?.some((rule) =>
				rule.endsWith('*') ? permission.startsWith(rule.slice(0, -1)) : permission === rule
			) ?? false
		);
	});
}
export function rolePermissionList<T extends string>(
	user: RoleUser,
	permissions: readonly T[]
): T[] {
	return permissions.filter((permission) => roleGrants(user, permission));
}
