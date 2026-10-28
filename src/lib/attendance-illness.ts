export type AttendanceIllness = {
	id: number;
	muridId: number;
	tanggalMulai: string;
	tanggalSelesai: string;
	createdAt: string;
	kembaliPada: string | null;
	dibatalkanPada: string | null;
};

export function illnessDate(value: Date | string) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(value));
}

export function illnessEndDate(start: string) {
	const date = new Date(`${start}T00:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start)
		throw new Error('Tanggal sakit tidak valid.');
	date.setUTCDate(date.getUTCDate() + 2);
	return date.toISOString().slice(0, 10);
}

export function illnessCovers(period: AttendanceIllness, date: string, time: string | null = null) {
	if (period.dibatalkanPada || date < period.tanggalMulai || date > period.tanggalSelesai)
		return false;
	if (!period.kembaliPada) return true;
	const returned = new Date(period.kembaliPada).getTime();
	// Without an activity time, a return on this date ends the derived daily condition.
	const point = new Date(`${date}T${time || '23:59:59'}+07:00`).getTime();
	return point < returned;
}

export function canReturnFromIllness(period: AttendanceIllness, capturedAt: string) {
	return (
		!period.dibatalkanPada &&
		!period.kembaliPada &&
		illnessDate(capturedAt) >= period.tanggalMulai &&
		Date.parse(capturedAt) >= Date.parse(period.createdAt)
	);
}

export function latestIllness<T extends AttendanceIllness>(
	periods: T[],
	muridId: number,
	date: string
) {
	return periods
		.filter(
			(period) =>
				period.muridId === muridId && !period.dibatalkanPada && period.tanggalMulai <= date
		)
		.sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai) || b.id - a.id)[0];
}

export function illnessLabel(period: AttendanceIllness | undefined, date: string) {
	if (!period) return '';
	if (period.kembaliPada && illnessDate(period.kembaliPada) <= date)
		return illnessDate(period.kembaliPada) === date ? 'Sudah kembali hadir' : '';
	if (date > period.tanggalSelesai) return 'Masa keterangan berakhir, perlu diperiksa';
	return `Sakit sampai ${period.tanggalSelesai.split('-').reverse().join('/')}`;
}

// Expiry is not proof of absence. Keep automatic alfa paused until staff review or return.
export function illnessNeedsReview(period: AttendanceIllness | undefined, date: string) {
	return (
		!!period &&
		!period.dibatalkanPada &&
		date >= period.tanggalMulai &&
		(!period.kembaliPada || illnessDate(period.kembaliPada) > date)
	);
}
