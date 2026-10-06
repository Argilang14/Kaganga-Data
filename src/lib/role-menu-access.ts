import { parseAccessPosition } from './access-position.ts';

export type MenuAccessUser =
	| {
			type?: string | null;
			jabatanAkses?: string | null;
			permissions?: readonly string[] | null;
	  }
	| null
	| undefined;

export function roleMenuPermissions(type?: string | null): string[] {
	const shared = ['menu_murid', 'cetak_dokumen', 'surat_sppd', 'surat_dinas_luar'];
	if (type === 'user')
		return [...shared, 'menu_intrakurikuler', 'menu_nilai_intrakurikuler', 'menu_jurnal'];
	if (type === 'wali_asuh' || type === 'wali_asrama')
		return [
			...shared,
			'keasramaan_lihat',
			'keasramaan_input',
			'mata_pelajaran_keasramaan',
			'cetak_keasramaan',
			...(type === 'wali_asrama' ? ['menu_catatan_asrama', 'menu_rekap_asrama'] : [])
		];
	if (type === 'tim_dapur') return ['surat_sppd', 'surat_dinas_luar'];
	return [];
}

function unrestricted(user: MenuAccessUser) {
	const position = parseAccessPosition(user?.jabatanAkses);
	return user?.type === 'admin' || (!!position && position !== 'waka_humas');
}

export function hasMenuPermission(user: MenuAccessUser, permission: string) {
	return (
		unrestricted(user) ||
		roleMenuPermissions(user?.type).includes(permission) ||
		user?.permissions?.includes(permission) === true
	);
}

export function canPrintDocument(user: MenuAccessUser, document: string) {
	if (!user) return false;
	if (unrestricted(user)) return true;
	if (
		parseAccessPosition(user.jabatanAkses) !== 'waka_humas' &&
		['wali_kelas', 'wali_murid'].includes(user.type ?? '')
	)
		return true;
	if (document === 'keasramaan') return hasMenuPermission(user, 'cetak_keasramaan');
	if (
		[
			'kartu-absensi',
			'kartu-ujian',
			'kartu-ujian-meja',
			'jadwal-pelajaran',
			'kalender-pendidikan',
			'jurnal-mengajar',
			'rekap-absensi-kegiatan',
			'buku-tamu'
		].includes(document)
	)
		return hasMenuPermission(user, 'cetak_dokumen');
	return hasMenuPermission(user, 'cetak_akademik');
}

// Longest prefix wins: an allowed parent never opens a protected child.
const rules: [string, string[]][] = [
	['/murid/arsip', ['murid_arsip']],
	['/murid', ['menu_murid']],
	['/sekolah', ['sekolah_lihat', 'sekolah_manage']],
	['/pegawai', ['sekolah_manage']],
	['/kelas', ['kelas_lihat', 'kelas_manage']],
	['/akademik', ['rapor_manage']],
	['/riwayat-pertumbuhan', ['menu_pertumbuhan']],
	['/jurnal-mengajar', ['menu_jurnal']],
	['/intrakurikuler', ['menu_intrakurikuler']],
	['/asesmen-formatif', ['menu_nilai_intrakurikuler']],
	['/asesmen-sumatif', ['menu_nilai_intrakurikuler']],
	['/keasramaan', ['keasramaan_lihat', 'keasramaan_manage']],
	['/asesmen-keasramaan', ['keasramaan_input']],
	['/catatan-wali-asrama', ['menu_catatan_asrama']],
	['/rekap-nilai-asrama', ['menu_rekap_asrama']],
	['/kokurikuler', ['menu_kokurikuler']],
	['/asesmen-kokurikuler', ['menu_kokurikuler']],
	['/ekstrakurikuler', ['menu_ekstrakurikuler']],
	['/nilai-ekstrakurikuler', ['menu_ekstrakurikuler']],
	['/absen', ['rapor_manage']],
	['/catatan-wali-kelas', ['rapor_manage']],
	['/nilai-akhir', ['rapor_manage']],
	['/status-akhir', ['rapor_manage']],
	['/asesmen-martikulasi', ['menu_martikulasi']],
	['/martikulasi', ['menu_martikulasi']],
	['/data-mata-pelajaran', ['menu_kurikulum']],
	['/rpm', ['kurikulum_rpm']],
	['/rapor/jadwal-pelajaran', ['administrasi_jadwal']],
	['/jadwal', ['administrasi_jadwal']],
	['/ruangan', ['ruangan_lihat', 'ruangan_manage']],
	['/ujian', ['ujian_manage']],
	['/administrasi/absensi/kegiatan/pengaturan', ['absensi_pengaturan']],
	['/administrasi/absensi/kartu-qr', ['absensi_qr_manage']],
	['/administrasi/absensi/kegiatan', ['absensi_lihat']],
	['/administrasi/absensi/scan', ['absensi_scan']],
	['/administrasi/absensi/monitoring', ['absensi_lihat']],
	['/administrasi/absensi', ['menu_absensi_harian']],
	['/presensi-pegawai', ['administrasi_presensi_pegawai']],
	['/surat-menyurat/sppd', ['surat_sppd']],
	['/surat-menyurat/dinas-luar', ['surat_dinas_luar']],
	['/surat-menyurat/arsip', ['surat_arsip']],
	['/persetujuan', ['persetujuan_lihat']],
	['/berkas', ['berkas_lihat']],
	['/buku-tamu', ['administrasi_buku_tamu']],
	['/inventaris', ['inventaris_lihat', 'inventaris_manage']],
	['/pimpinan', ['pimpinan_lihat']],
	['/portal-wali', ['portal_wali_lihat']],
	['/komunikasi', ['komunikasi_lihat']],
	['/pengumuman', ['pengumuman_lihat']],
	['/notifikasi', ['notifikasi_lihat']],
	['/pengguna', ['user_list']],
	['/operasional', ['operasional_lihat']],
	['/cetak-raport', ['cetak_akademik', 'cetak_keasramaan']],
	['/cetak-sr', ['cetak_dokumen', 'cetak_akademik', 'cetak_keasramaan']],
	['/cetak/pdf', ['cetak_dokumen', 'cetak_akademik', 'cetak_keasramaan']],
	['/cetak', ['cetak_dokumen']],
	['/api/murid', ['menu_murid']],
	['/api/murid-photo', ['menu_murid', 'absensi_lihat']],
	['/api/murid-bulk-photo', ['kelas_manage']],
	['/api/rapor', ['menu_murid']],
	['/api/pegawai-photo', ['menu_profil']],
	['/api/keasramaan', ['keasramaan_lihat']],
	['/api/asesmen-keasramaan', ['keasramaan_input']],
	['/api/asesmen-sumatif', ['menu_nilai_intrakurikuler']],
	['/api/assigned-mapel', ['menu_intrakurikuler']],
	['/api/mapel', ['menu_intrakurikuler']],
	['/api/tujuan-count', ['menu_intrakurikuler']],
	['/api/ai', ['menu_nilai_intrakurikuler']],
	['/api/sekolah/sumatif-bobot', ['menu_nilai_intrakurikuler']],
	['/api/sekolah/rapor-kriteria', ['cetak_akademik', 'cetak_keasramaan']],
	['/api/administrasi/absensi', ['absensi_lihat']],
	['/api/dinas-luar', ['surat_dinas_luar']],
	['/api/administrasi/absensi/rekap', ['menu_absensi_harian']],
	['/api/absensi/kartu-qr', ['cetak_dokumen', 'absensi_qr_manage']],
	['/api/pdf/sppd', ['surat_sppd']],
	['/api/pdf/dinas-luar', ['surat_dinas_luar']],
	['/api/pdf/rpm', ['kurikulum_rpm']],
	['/api/pdf/combine', ['kurikulum_rpm']],
	['/api/pdf/lampiran', ['kurikulum_rpm']],
	['/api/pdf/presensi-pegawai', ['administrasi_presensi_pegawai']],
	['/api/pdf/martikulasi', ['cetak_akademik']],
	['/api/pdf', ['cetak_dokumen', 'cetak_keasramaan', 'cetak_akademik']],
	['/api/jadwal', ['administrasi_jadwal']],
	['/api/buku-tamu', ['administrasi_buku_tamu']],
	['/api/pengguna', ['user_list']],
	['/api/berkas', ['berkas_lihat']],
	['/api/komunikasi', ['komunikasi_lihat']]
].sort((a, b) => (b[0] as string).length - (a[0] as string).length) as [string, string[]][];

export function canAccessMenu(user: MenuAccessUser, pathname: string) {
	if (!user) return false;
	if (
		unrestricted(user) ||
		(parseAccessPosition(user.jabatanAkses) !== 'waka_humas' &&
			['wali_kelas', 'wali_murid'].includes(user.type ?? ''))
	)
		return true;
	const path = pathname.replace(/\/+$/, '') || '/';
	if (
		[
			'/',
			'/login',
			'/logout',
			'/forbidden',
			'/tentang',
			'/pengaturan',
			'/pengaturan/profil',
			'/api/server-time',
			'/api/system/status',
			'/api/favorites',
			'/api/tasks',
			'/api/notifikasi/ringkasan',
			'/api/dashboard/daily'
		].includes(path) ||
		path.startsWith('/tamu/') ||
		/^\/api\/buku-tamu\/[^/]+$/.test(path)
	)
		return true;
	if (user.type === 'tim_dapur' && path.startsWith('/api/murid-photo/')) return true;
	const printed = /^\/cetak\/([^/]+?)(?:\.pdf)?$/.exec(path);
	if (printed) return canPrintDocument(user, printed[1]);
	const rule = rules.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
	return (
		!!rule &&
		rule[1].some(
			(permission) => permission === 'menu_profil' || hasMenuPermission(user, permission)
		)
	);
}
