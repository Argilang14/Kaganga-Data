import { isSummaryDate } from './attendance-summary.ts';

export const permitRecapColumns = [
	{ key: 'izinPulang', label: 'Izin pulang (kali)' },
	{ key: 'durasiPulang', label: 'Durasi pulang (hari kalender)' },
	{ key: 'belumTercatat', label: 'Belum tercatat (hari sekolah)' },
	{ key: 'belumDiverifikasi', label: 'Belum diverifikasi security (izin)' },
	{ key: 'perluDiperiksa', label: 'Perlu diperiksa (izin)' }
] as const;

export type PermitRecapCounts = Record<(typeof permitRecapColumns)[number]['key'], number>;
export type SchoolPermitRecap = PermitRecapCounts & {
	counts: Record<'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa', number>;
};

export function monthlyRecapPeriods(start: string, end: string) {
	if (
		!isSummaryDate(start) ||
		!isSummaryDate(end) ||
		start > end ||
		Date.parse(end) - Date.parse(start) > 366 * 86400000
	)
		throw new Error('Pilih rentang tanggal valid, maksimal satu tahun.');
	const periods: Array<{ start: string; end: string }> = [];
	for (let cursor = start; cursor <= end;) {
		const next = new Date(`${cursor}T00:00:00Z`);
		next.setUTCMonth(next.getUTCMonth() + 1, 1);
		const monthEnd = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
		periods.push({ start: cursor, end: end < monthEnd ? end : monthEnd });
		cursor = next.toISOString().slice(0, 10);
	}
	return periods;
}

type MonthlyFollowUp = {
	muridId: number | null;
	jenis: string;
	periodeMulai: string;
	periodeSelesai: string;
	status: 'baru' | 'diproses' | 'selesai';
	catatan: string | null;
};

export function monthlyAttendanceIndicators(
	student: { id: number; nama: string },
	recap: SchoolPermitRecap,
	period: { start: string; end: string },
	followUps: MonthlyFollowUp[] = []
) {
	const rules = [
		{
			count: recap.counts.izin,
			minimum: 4,
			label: 'Izin lebih dari 3 hari',
			unit: 'hari sekolah',
			types: [] as string[],
			note: 'Konfirmasi alasan izin kepada orang tua/wali.'
		},
		{
			count: recap.counts.alfa,
			minimum: 1,
			label: 'Alfa',
			unit: 'hari sekolah',
			types: ['alfa_berulang'],
			note: 'Klarifikasi ketidakhadiran dan lakukan pembinaan.'
		},
		{
			count: recap.durasiPulang,
			minimum: 4,
			label: 'Pulang lebih dari 3 hari',
			unit: 'hari kalender',
			types: ['izin_pulang_terlambat'],
			note: 'Evaluasi alasan dan durasi izin pulang.'
		},
		{
			count: recap.counts.sakit,
			minimum: 4,
			label: 'Sakit lebih dari 3 hari',
			unit: 'hari sekolah',
			types: ['sakit_beruntun', 'sakit_berulang'],
			note: 'Koordinasikan kondisi kesehatan dan pendampingan belajar.'
		},
		{
			count: recap.belumTercatat,
			minimum: 4,
			label: 'Presensi harian belum tercatat',
			unit: 'hari sekolah',
			types: [] as string[],
			note: 'Konfirmasi kehadiran dan ingatkan murid melakukan presensi. Data kosong bukan alfa otomatis.'
		}
	];
	return rules
		.filter((rule) => rule.count >= rule.minimum)
		.map((rule) => {
			// A partial or previous-period follow-up must not close the whole monthly indicator.
			const followUp = followUps.find(
				(item) =>
					item.muridId === student.id &&
					rule.types.includes(item.jenis) &&
					item.periodeMulai === period.start &&
					item.periodeSelesai === period.end
			);
			return {
				nama: student.nama,
				indikator: rule.label,
				periodeMulai: period.start,
				periodeSelesai: period.end,
				akumulasi: `${rule.count} ${rule.unit}`,
				status: followUp?.status ?? 'baru',
				catatan: followUp?.catatan ?? rule.note
			};
		});
}
