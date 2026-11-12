import { isSummaryDate } from './attendance-summary.ts';

export function attendanceMonthRange(startMonth: string, endMonth: string, today: string) {
	const validMonth = (value: string) =>
		/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && isSummaryDate(`${value}-01`);
	if (!validMonth(startMonth) || !validMonth(endMonth) || startMonth > endMonth)
		throw new Error('Pilih bulan awal dan bulan akhir yang valid dan berurutan.');
	if (!isSummaryDate(today) || endMonth > today.slice(0, 7))
		throw new Error('Bulan laporan tidak boleh melewati bulan berjalan.');
	const start = `${startMonth}-01`;
	const last = new Date(`${endMonth}-01T00:00:00Z`);
	last.setUTCMonth(last.getUTCMonth() + 1, 0);
	const requestedEnd = last.toISOString().slice(0, 10);
	if (Date.parse(requestedEnd) - Date.parse(start) > 366 * 86400000)
		throw new Error('Rentang laporan maksimal 1 tahun.');
	const end = requestedEnd < today ? requestedEnd : today;
	if (start > end) throw new Error('Bulan awal tidak boleh setelah bulan berjalan.');
	return { start, end, requestedEnd };
}
