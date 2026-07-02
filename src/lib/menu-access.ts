export const MENU_ACCESS_KEYS = [
	'inputNilai',
	'administrasi',
	'jadwal',
	'absensi',
	'cetakDokumen'
] as const;

export type MenuAccessKey = (typeof MENU_ACCESS_KEYS)[number];
export type MenuAccessSettings = Record<MenuAccessKey, boolean>;

export const DEFAULT_MENU_ACCESS: MenuAccessSettings = {
	inputNilai: true,
	administrasi: true,
	jadwal: true,
	absensi: true,
	cetakDokumen: true
};

export const MENU_ACCESS_LOCK_PREFIX = 'menu_lock:';

export const MENU_ACCESS_OPTIONS: Array<{
	key: MenuAccessKey;
	label: string;
	description: string;
}> = [
	{
		key: 'inputNilai',
		label: 'Buka/Kunci Input Nilai',
		description: 'Membuka atau mengunci menu penilaian harian, formatif, sumatif, dan nilai akhir.'
	},
	{
		key: 'administrasi',
		label: 'Buka/Kunci Administrasi',
		description:
			'Membuka atau mengunci menu administrasi rapor seperti absensi rapor, catatan wali, rekap, dan status akhir.'
	},
	{
		key: 'jadwal',
		label: 'Buka/Kunci Jadwal',
		description:
			'Membuka atau mengunci menu jadwal pelajaran, aturan generate, kalender pendidikan, dan pengaturan jadwal.'
	},
	{
		key: 'absensi',
		label: 'Buka/Kunci Absensi',
		description:
			'Membuka atau mengunci menu Absensi digital, Scan QR, Rekap Kegiatan, dan Kartu Absensi.'
	},
	{
		key: 'cetakDokumen',
		label: 'Buka/Kunci Cetak Dokumen',
		description: 'Membuka atau mengunci menu Cetak Dokumen dan Cetak Dokumen SR.'
	}
];

export function menuAccessLockKey(key: MenuAccessKey) {
	return `${MENU_ACCESS_LOCK_PREFIX}${key}`;
}

export function isMenuAccessKey(value: string): value is MenuAccessKey {
	return (MENU_ACCESS_KEYS as readonly string[]).includes(value);
}

export function getMenuAccessKeyForItem(item: Pick<MenuItem, 'title'>): MenuAccessKey | null {
	if (item.title === 'Input Nilai') return 'inputNilai';
	if (item.title === 'Administrasi') return 'administrasi';
	if (item.title === 'Jadwal') return 'jadwal';
	if (item.title === 'Absensi') return 'absensi';
	if (item.title === 'Cetak Dokumen' || item.title === 'Cetak Dokumen SR') {
		return 'cetakDokumen';
	}
	return null;
}

export function isMenuItemAllowed(item: Pick<MenuItem, 'title'>, settings: MenuAccessSettings) {
	const key = getMenuAccessKeyForItem(item);
	return key ? settings[key] : true;
}

export function isMenuItemLocked(item: Pick<MenuItem, 'title'>, settings: MenuAccessSettings) {
	const key = getMenuAccessKeyForItem(item);
	return key ? !settings[key] : false;
}

const MENU_ACCESS_ROUTE_PREFIXES: Record<MenuAccessKey, string[]> = {
	inputNilai: [
		'/asesmen-formatif',
		'/asesmen-sumatif',
		'/asesmen-kokurikuler',
		'/nilai-ekstrakurikuler',
		'/asesmen-keasramaan'
	],
	administrasi: [
		'/absen',
		'/catatan-wali-kelas',
		'/catatan-wali-asrama',
		'/nilai-akhir',
		'/rekap-nilai-asrama',
		'/status-akhir'
	],
	jadwal: ['/jadwal'],
	absensi: ['/administrasi/absensi'],
	cetakDokumen: ['/cetak']
};

export function getClosedMenuKeyForPath(pathname: string, settings: MenuAccessSettings) {
	for (const key of MENU_ACCESS_KEYS) {
		if (settings[key]) continue;
		if (
			MENU_ACCESS_ROUTE_PREFIXES[key].some(
				(prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
			)
		) {
			return key;
		}
	}
	return null;
}
