export const careKinds = ['kejadian', 'perkembangan', 'sakit'] as const;
export type CareKind = (typeof careKinds)[number];
export class CareValidationError extends Error {}
export const careStatuses = ['baru', 'diproses', 'selesai'] as const;
export type CareStatus = (typeof careStatuses)[number];
export const careAspects = {
	pendidikan: 'Pendidikan',
	sosial: 'Sosial',
	kemandirian: 'Kemandirian',
	minat_bakat: 'Minat dan bakat'
} as const;
export const careSections = {
	ringkasan: { title: 'Ringkasan Pengasuhan', short: 'Ringkasan', icon: 'grid' },
	piket: { title: 'Laporan Piket', short: 'Laporan Piket', icon: 'book-open' },
	kejadian: { title: 'Kejadian & Tindak Lanjut', short: 'Kejadian', icon: 'alert' },
	perkembangan: { title: 'Perkembangan Anak', short: 'Perkembangan', icon: 'star' },
	sakit: { title: 'Pantau Sakit', short: 'Pantau Sakit', icon: 'activity' }
} as const;
export type CareSection = keyof typeof careSections;
export const careShifts = {
	pagi: { label: 'Pagi', start: '07:01', end: '15:00' },
	sore: { label: 'Sore', start: '15:01', end: '23:00' },
	malam: { label: 'Malam', start: '23:01', end: '07:00' }
} as const;
export function canUsePengasuhan(user?: { type?: string | null } | null) {
	return !!user && ['admin', 'wali_asuh', 'wali_asrama'].includes(user.type ?? '');
}
export function careStatusLabel(kind: CareKind, status: CareStatus) {
	return {
		kejadian: { baru: 'Baru', diproses: 'Ditangani', selesai: 'Selesai' },
		perkembangan: { baru: 'Perlu ditinjau', diproses: 'Ditindaklanjuti', selesai: 'Tercatat' },
		sakit: { baru: 'Sakit', diproses: 'Dipantau', selesai: 'Pulih' }
	}[kind][status];
}
export function validCareTransition(before: CareStatus, after: CareStatus) {
	return (
		careStatuses.includes(before) &&
		careStatuses.includes(after) &&
		careStatuses.indexOf(after) >= careStatuses.indexOf(before)
	);
}
export function careDate(value: unknown, today: string) {
	const date = String(value ?? '');
	const parsed = new Date(`${date}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		!Number.isFinite(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== date ||
		date > today
	)
		throw new CareValidationError('Tanggal harus valid dan tidak melebihi hari ini.');
	return date;
}
export function careText(value: unknown, label: string, max = 3000, min = 1) {
	const text = String(value ?? '').trim();
	if (text.length < min || text.length > max)
		throw new CareValidationError(`${label} harus berisi ${min}-${max} karakter.`);
	return text;
}
export function careRequestKey(value: unknown) {
	const key = String(value ?? '');
	if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
		throw new CareValidationError('Kunci formulir tidak valid. Tutup lalu buka kembali formulir.');
	return key;
}
export function careShiftWindow(date: string, shift: keyof typeof careShifts) {
	const next = new Date(`${date}T00:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return {
		start: `${date} ${careShifts[shift].start}`,
		end: `${shift === 'malam' ? next.toISOString().slice(0, 10) : date} ${careShifts[shift].end}`
	};
}
