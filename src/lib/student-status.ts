export const passiveStatusLabels = {
	naik_kelas: 'Menunggu naik kelas',
	pindah_kelas: 'Menunggu pindah kelas',
	pindah: 'Pindah sekolah',
	keluar: 'Keluar sekolah',
	alumni: 'Lulus'
} as const;
export type PassiveStatus = keyof typeof passiveStatusLabels;

export function passiveInput(form: FormData, today: string) {
	const reason = String(form.get('reason') ?? '');
	const date = String(form.get('tanggal') ?? '');
	const notes = String(form.get('catatan') ?? '').trim();
	if (!Object.hasOwn(passiveStatusLabels, reason)) throw new Error('Pilih alasan menjadi pasif.');
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		!Number.isFinite(Date.parse(date)) ||
		new Date(date).toISOString().slice(0, 10) !== date ||
		date > today
	)
		throw new Error('Tanggal perubahan harus valid dan tidak melewati hari ini.');
	if (notes.length > 500) throw new Error('Catatan maksimal 500 karakter.');
	return { reason: reason as PassiveStatus, date, notes };
}

export function placementPeriodProblem(
	pending: string | null,
	sourceSemester: number,
	targetSemester: number
) {
	if (pending === 'pindah_kelas' && sourceSemester !== targetSemester)
		return 'Pindah kelas harus pada semester yang sama. Ubah alasan pasif jika akan naik kelas.';
	if (pending === 'naik_kelas' && sourceSemester === targetSemester)
		return 'Naik kelas memerlukan semester tujuan yang berbeda. Setel periode tujuan aktif terlebih dahulu.';
	return null;
}
