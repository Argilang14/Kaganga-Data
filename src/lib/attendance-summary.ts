import { parseTingkat } from './tingkat.ts';

export type SummaryLevel = 'sd' | 'smp' | 'sma' | 'unknown';
export type SummaryScope = 'kelas' | 'jenjang' | 'semua';
export type SummaryStatus = 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'pulang';
export type SummaryClass = { id: number; nama: string; jenjang: SummaryLevel };
export type SummaryStudent = { id: number; nama: string; kelasId: number };
export type SummaryCounts = { jumlah: number; hadir: number; tidakHadir: number; belum: number };
export type AttendanceSummary = {
	text: string;
	generatedAt: string;
	warnings: string[];
	totals: SummaryCounts;
	classes: Array<SummaryClass & SummaryCounts>;
};

export const summaryLevelLabels: Record<SummaryLevel, string> = {
	sd: 'SD',
	smp: 'SMP',
	sma: 'SMA',
	unknown: 'Jenjang belum ditentukan'
};

export function inferSummaryLevel(
	kelas: { nama: string; fase?: string | null },
	schoolLevel?: string | null
): SummaryLevel {
	const phase = /^fase\s*([a-f])$/i.exec(kelas.fase?.trim() ?? '')?.[1]?.toLowerCase();
	if (phase) return 'abc'.includes(phase) ? 'sd' : phase === 'd' ? 'smp' : 'sma';
	const grade = parseTingkat(kelas.nama.replace(/[.-]/g, ' '));
	if (grade && grade >= 1 && grade <= 12) return grade <= 6 ? 'sd' : grade <= 9 ? 'smp' : 'sma';
	return ['sd', 'smp', 'sma'].includes(schoolLevel ?? '')
		? (schoolLevel as SummaryLevel)
		: 'unknown';
}

export function isSummaryDate(value: string) {
	const date = new Date(`${value}T00:00:00Z`);
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		Number.isFinite(date.getTime()) &&
		date.toISOString().slice(0, 10) === value
	);
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const emptyCounts = (): SummaryCounts => ({ jumlah: 0, hadir: 0, tidakHadir: 0, belum: 0 });

export function buildAttendanceSummary(input: {
	tanggal: string;
	kegiatan: string;
	cakupan: SummaryScope;
	jenjang?: SummaryLevel;
	classes: SummaryClass[];
	students: SummaryStudent[];
	attendance: Array<{ muridId: number; status: SummaryStatus }>;
	permitStudentIds: number[];
	restrictedStudents?: boolean;
	generatedAt?: string;
}): AttendanceSummary {
	if (!isSummaryDate(input.tanggal)) throw new Error('Tanggal ringkasan tidak valid.');
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const statuses = new Map(input.attendance.map((row) => [row.muridId, row.status]));
	const permits = new Set(input.permitStudentIds);
	const grouped = new Map<number, SummaryStudent[]>();
	for (const student of input.students) {
		const list = grouped.get(student.kelasId) ?? [];
		if (!list.some((item) => item.id === student.id)) list.push(student);
		grouped.set(student.kelasId, list);
	}
	const warnings: string[] = [];
	const title =
		input.cakupan === 'semua'
			? 'Rekap kehadiran seluruh jenjang'
			: input.cakupan === 'jenjang'
				? `Rekap kehadiran jenjang ${summaryLevelLabels[input.jenjang ?? 'unknown']}`
				: `Rekap kehadiran kelas ${clean(input.classes[0]?.nama ?? '-')}`;
	const date = new Date(`${input.tanggal}T00:00:00Z`);
	const day = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'][date.getUTCDay()];
	const lines = [
		title,
		`Hari ${day}, ${date.getUTCDate()}/${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`,
		`Kegiatan : ${clean(input.kegiatan)}`
	];
	if (input.restrictedStudents) lines.push('Cakupan : anak binaan sesuai penugasan');
	const classes: AttendanceSummary['classes'] = [];
	const totals = emptyCounts();
	let previousLevel: SummaryLevel | null = null;
	let unconfirmedPulang = 0;
	const sorted = [...input.classes].sort(
		(a, b) =>
			['sd', 'smp', 'sma', 'unknown'].indexOf(a.jenjang) -
				['sd', 'smp', 'sma', 'unknown'].indexOf(b.jenjang) ||
			a.nama.localeCompare(b.nama, 'id', { numeric: true })
	);
	for (const kelas of sorted) {
		if (kelas.jenjang === 'unknown')
			warnings.push(`Jenjang kelas ${clean(kelas.nama)} belum ditentukan.`);
		if (input.cakupan === 'semua' && previousLevel !== kelas.jenjang) {
			lines.push('', summaryLevelLabels[kelas.jenjang]);
			previousLevel = kelas.jenjang;
		}
		const counts = emptyCounts();
		const absent: string[] = [];
		const missing: string[] = [];
		for (const student of (grouped.get(kelas.id) ?? []).sort((a, b) =>
			a.nama.localeCompare(b.nama, 'id')
		)) {
			counts.jumlah++;
			const status = statuses.get(student.id);
			if (status === 'hadir' || status === 'terlambat') counts.hadir++;
			else if (status === 'sakit' || status === 'alfa') {
				counts.tidakHadir++;
				absent.push(`- ${clean(student.nama)} (${status === 'sakit' ? 's' : 'a'})`);
			} else if (permits.has(student.id)) {
				counts.tidakHadir++;
				absent.push(`- ${clean(student.nama)} (p)`);
			} else if (status === 'izin') {
				counts.tidakHadir++;
				absent.push(`- ${clean(student.nama)} (i)`);
			} else {
				counts.belum++;
				if (status === 'pulang') unconfirmedPulang++;
				missing.push(
					`- ${clean(student.nama)}${status === 'pulang' ? ' (status pulang perlu konfirmasi)' : ''}`
				);
			}
		}
		classes.push({ ...kelas, ...counts });
		for (const key of ['jumlah', 'hadir', 'tidakHadir', 'belum'] as const)
			totals[key] += counts[key];
		lines.push(
			'',
			clean(kelas.nama),
			`Jml : ${counts.jumlah}`,
			`Hadir : ${counts.hadir}`,
			`Tidak Hadir : ${counts.tidakHadir}`,
			...absent
		);
		if (missing.length) lines.push(`Belum tercatat : ${counts.belum}`, ...missing);
	}
	if (unconfirmedPulang)
		warnings.push(
			`${unconfirmedPulang} status Pulang belum memiliki catatan izin pulang; perlu konfirmasi.`
		);
	if (!input.students.length) warnings.push('Tidak ada murid aktif dalam cakupan ini.');
	lines.push(
		'',
		'TOTAL',
		`Jml : ${totals.jumlah}`,
		`Hadir : ${totals.hadir}`,
		`Tidak Hadir : ${totals.tidakHadir}`
	);
	if (totals.belum)
		lines.push(
			`Belum tercatat : ${totals.belum}`,
			'Belum tercatat bukan berarti tidak hadir; mohon konfirmasi.'
		);
	lines.push(
		'',
		'Keterangan : s = sakit, i = izin, a = alfa, p = izin pulang',
		`Diperbarui : ${new Date(generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`
	);
	return { text: lines.join('\n'), generatedAt, warnings, totals, classes };
}
