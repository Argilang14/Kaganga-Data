export type SemesterScore = {
	id: number;
	nama: string;
	nilaiRataRata: number | null;
	jumlahMapelDinilai: number;
	totalMapelRelevan: number;
};

type HighlightClass = {
	id: number;
	nama: string;
	jenjang: string;
	complete: boolean;
	rows: Array<{ id: number; nama: string; nilaiRataRata: number | null; peringkat: number }>;
};

export function semesterHighlights(classes: HighlightClass[]) {
	return ['sd', 'smp', 'sma']
		.filter((level) => classes.some((kelas) => kelas.jenjang === level))
		.map((jenjang) => {
			const levelClasses = classes.filter((kelas) => kelas.jenjang === jenjang);
			const candidates = levelClasses
				.filter((kelas) => kelas.complete)
				.flatMap((kelas) =>
					kelas.rows
						.filter((row) => row.peringkat === 1 && row.nilaiRataRata !== null)
						.map((row) => ({ ...row, kelas: kelas.nama, kelasId: kelas.id }))
				);
			candidates.sort(
				(a, b) =>
					b.nilaiRataRata! - a.nilaiRataRata! ||
					a.kelas.localeCompare(b.kelas, 'id', { numeric: true }) ||
					a.nama.localeCompare(b.nama, 'id') ||
					a.id - b.id
			);
			const student = candidates[0] ?? null;
			return {
				jenjang,
				student,
				tied: student
					? candidates.filter(
							(row) => Math.abs(row.nilaiRataRata! - student.nilaiRataRata!) <= 0.0001
						).length
					: 0,
				incompleteClasses: levelClasses.filter((kelas) => !kelas.complete).length
			};
		});
}

export function semesterLeaders(rows: SemesterScore[]) {
	const complete =
		rows.length > 0 &&
		rows.every(
			(row) =>
				row.totalMapelRelevan > 0 &&
				row.jumlahMapelDinilai === row.totalMapelRelevan &&
				row.nilaiRataRata !== null &&
				Number.isFinite(row.nilaiRataRata)
		);
	if (!complete) return { complete, rows: [] as Array<SemesterScore & { peringkat: number }> };
	const sorted = [...rows].sort(
		(a, b) => b.nilaiRataRata! - a.nilaiRataRata! || a.nama.localeCompare(b.nama, 'id')
	);
	let rank = 0;
	let last: number | null = null;
	const ranked = sorted.map((row, index) => {
		if (last === null || Math.abs(last - row.nilaiRataRata!) > 0.0001) rank = index + 1;
		last = row.nilaiRataRata;
		return { ...row, peringkat: rank };
	});
	return { complete, rows: ranked.filter((row) => row.peringkat <= 3) };
}

export function consistentAttendance(
	days: string[],
	statuses: ReadonlyMap<string, string>,
	enrolled: string
) {
	if (!days.length) return 'no_days';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(enrolled) || enrolled > days[0]) return 'partial_month';
	if (
		days.some(
			(date) =>
				!['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang', 'izin_pulang'].includes(
					statuses.get(date) ?? ''
				)
		)
	)
		return 'incomplete';
	return days.every((date) => ['hadir', 'terlambat'].includes(statuses.get(date)!))
		? 'consistent'
		: 'absent';
}

export function configuredHolidays(values: Array<string | null | undefined>, days: string[]) {
	const holidays = new Set<string>();
	for (const value of values) {
		try {
			const parsed: unknown = JSON.parse(value || '[]');
			if (!Array.isArray(parsed)) continue;
			for (const entry of parsed) {
				if (typeof entry === 'string') holidays.add(entry);
				else if (entry && typeof entry === 'object') {
					const range = entry as Record<string, unknown>;
					const start = String(range.start ?? range.tanggalMulai ?? '');
					const end = String(range.end ?? range.tanggalSelesai ?? start);
					for (const date of days) if (start && date >= start && date <= end) holidays.add(date);
				}
			}
		} catch {
			// Legacy invalid JSON must not prevent the dashboard from loading.
		}
	}
	return holidays;
}
