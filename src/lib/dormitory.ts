import { hasSchoolWideOperationalAccess } from './access-position.ts';

export type DormUser =
	| {
			type?: string | null;
			jabatanAkses?: string | null;
			sekolahId?: number | null;
			pegawaiId?: number | null;
			permissions?: readonly string[] | null;
			mustChangePassword?: boolean;
	  }
	| null
	| undefined;
export type DormRoom = {
	id: number;
	asramaId: number;
	asrama: string;
	nama: string;
	kategori: string;
	kapasitas: number;
	penghuni: number;
	aktif: number;
	versi: number;
	wali: string | null;
};
export const dormToday = () =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
export function canDorm(user: DormUser, action: 'lihat' | 'manage' | 'penempatan' | 'penugasan') {
	if (!user || user.mustChangePassword) return false;
	return (
		user.type === 'admin' ||
		(hasSchoolWideOperationalAccess(user) && user.jabatanAkses !== 'waka_humas') ||
		user.permissions?.includes(`asrama_${action}`) === true ||
		(action === 'lihat' && ['wali_asrama', 'wali_asuh'].includes(user.type ?? ''))
	);
}
export class DormValidationError extends Error {}
export function dormId(value: unknown, allowZero = false) {
	const s = String(value ?? '');
	const id = Number(s);
	if (!/^\d+$/.test(s) || !Number.isSafeInteger(id) || id < (allowZero ? 0 : 1))
		throw new DormValidationError('Pilihan data tidak valid.');
	return id;
}
export function dormText(value: unknown, max = 100) {
	const text = String(value ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	if (!text || text.length > max)
		throw new DormValidationError(`Isi keterangan antara 1 dan ${max} karakter.`);
	return text;
}
export function dormDate(value: unknown, today = dormToday()) {
	const date = String(value ?? '');
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
		new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
		date > today ||
		date < '2000-01-01'
	)
		throw new DormValidationError('Pilih tanggal yang valid, bukan tanggal mendatang.');
	return date;
}
export function dormStudentIds(values: unknown[]) {
	const ids = [...new Set(values.map((value) => dormId(value)))].sort((a, b) => a - b);
	if (!ids.length || ids.length > 100) throw new DormValidationError('Pilih 1 sampai 100 murid.');
	return ids;
}
export function dormViewHref(pathname: string, search: string, roomId: number) {
	const supported =
		pathname.startsWith('/pengasuhan/') || pathname === '/administrasi/absensi/monitoring';
	const params = new URLSearchParams(
		supported || pathname === '/asrama' || pathname.startsWith('/asrama/') ? search : ''
	);
	for (const key of ['kelas_id', 'kelas', 'jenjang', 'page']) params.delete(key);
	params.set('kamar_id', String(roomId));
	params.delete('view');
	return `${supported ? pathname : '/asrama/penghuni'}?${params}`;
}

export const dormSections = [
	{ key: 'gedung', slug: 'gedung', title: 'Gedung / Blok Asrama', menu: 'Gedung / Blok' },
	{ key: 'kamar', slug: 'kamar', title: 'Data Kamar Asrama', menu: 'Kamar' },
	{ key: 'penghuni', slug: 'penghuni', title: 'Penghuni Asrama', menu: 'Penghuni' },
	{ key: 'penugasan', slug: 'penugasan', title: 'Penugasan Wali Asrama', menu: 'Penugasan Wali' },
	{ key: 'riwayat', slug: 'riwayat', title: 'Riwayat Penempatan', menu: 'Riwayat' },
	{ key: 'pemetaan', slug: 'penempatan', title: 'Penempatan Murid', menu: 'Penempatan Murid' }
] as const;
export function dormSectionVisible(user: DormUser, key: string) {
	if (!canDorm(user, 'lihat')) return false;
	if (key === 'gedung') return canDorm(user, 'manage');
	if (key === 'pemetaan') return canDorm(user, 'penempatan');
	if (key === 'riwayat') return canDorm(user, 'manage') || canDorm(user, 'penempatan');
	return dormSections.some((section) => section.key === key);
}
export function dormPageHref(key: string, search: string | URLSearchParams = '') {
	const section =
		dormSections.find((section) => section.key === key || section.slug === key) ?? dormSections[1];
	const params = new URLSearchParams(search);
	params.delete('view');
	return `/asrama/${section.slug}${params.size ? `?${params}` : ''}`;
}
