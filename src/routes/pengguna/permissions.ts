export const groupedUserPermissions = {
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
	sekolah: {
		values: [['manage', 'Kelola Identitas Sekolah']],
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
	kelas: {
		values: [
			['manage', 'Kelola Data Kelas'],
			['pindah', 'Pindah dan akses kelas lain']
		],
		description: 'Data Kelas'
	},
	administrasi: {
		values: [
			['absensi', 'Kelola Absensi Digital dan Kegiatan'],
			['buku_tamu', 'Kelola Buku Tamu Digital'],
			['presensi_pegawai', 'Kelola Presensi Pegawai']
		],
		description: 'Administrasi'
	},
	surat: {
		values: [
			['sppd', 'Kelola SPPD'],
			['dinas_luar', 'Kelola Dinas Luar']
		],
		description: 'Surat Menyurat'
	}
} as const;

export const userPermissions = Object.entries(groupedUserPermissions) //
	.flatMap(([key, { values }]) => values.map((value) => `${key}_${value[0]}` as UserPermission));

export function defaultPermissionsForType(
	type: AuthUser['type'],
	options: { kelasCount?: number } = {}
): UserPermission[] {
	if (type === 'admin') return [...userPermissions];
	if (type === 'user' && (options.kelasCount ?? 0) > 1) return ['kelas_pindah'];
	return [];
}

export function isAuthorizedUser(
	allowedPermissions: UserPermission[],
	// include 'type' so we can treat admins as authorized
	user?: Pick<AuthUser, 'permissions' | 'type'>
) {
	if (!user) return false;
	// Admins are authorized for everything by policy
	// wali_kelas and wali_asuh are NOT admins and must check permissions
	if ('type' in user && user.type === 'admin') return true;
	const userPermissions = user.permissions || [];
	return allowedPermissions.some((r) => userPermissions.includes(r));
}
