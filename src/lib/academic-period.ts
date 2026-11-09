type Period = {
	id: number;
	nama: string;
	semester: {
		id: number;
		tanggalMulai?: string | null;
		tanggalMasuk?: string | null;
		tanggalSelesai?: string | null;
		tanggalBagiRaport?: string | null;
	}[];
};

// Historical dates must never inherit the year selected for today's operations.
export function academicPeriodForDate<T extends Period>(years: T[], date: string) {
	const explicit = years.flatMap((year) =>
		year.semester.flatMap((semester) => {
			const start = semester.tanggalMulai || semester.tanggalMasuk;
			const end = semester.tanggalSelesai || semester.tanggalBagiRaport;
			return start && end && date >= start && date <= end ? [{ year, semester }] : [];
		})
	);
	if (explicit.length === 1) return explicit[0];
	if (explicit.length > 1) return null;
	const matches = years.filter((year) => {
		const range = year.nama.match(/^(\d{4})\s*[/-]\s*(\d{4})$/);
		return (
			range &&
			Number(range[2]) === Number(range[1]) + 1 &&
			date >= `${range[1]}-07-01` &&
			date <= `${range[2]}-06-30`
		);
	});
	return matches.length === 1 ? { year: matches[0], semester: null } : null;
}
