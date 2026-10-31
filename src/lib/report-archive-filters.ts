export type ReportClassOption = {
	id: number;
	label: string;
	yearId: number;
	yearLabel: string;
	semesterId: number;
	semesterLabel: string;
	semesterType: string;
};
export type ReportArchiveFilterInput = { classId: number; yearId?: number; semesterId?: number };

// Work only with classes already restricted by the caller's school and assignments.
export function reportArchiveFilters(
	options: ReportClassOption[],
	input: ReportArchiveFilterInput,
	active: { yearId?: number | null; semesterId?: number | null } = {}
) {
	const years = [
		...new Map(options.map((c) => [c.yearId, { id: c.yearId, label: c.yearLabel }])).values()
	].sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }) || b.id - a.id);
	const legacy = options.find((c) => c.id === input.classId);
	const requestedYear =
		input.yearId ??
		legacy?.yearId ??
		(years.some((y) => y.id === active.yearId) ? active.yearId : years[0]?.id) ??
		0;
	const yearId = years.some((y) => y.id === requestedYear) ? requestedYear : 0;
	const yearClasses = options.filter((c) => c.yearId === yearId);
	const semesters = [
		...new Map(
			yearClasses.map((c) => [
				c.semesterId,
				{ id: c.semesterId, label: c.semesterLabel, type: c.semesterType }
			])
		).values()
	].sort((a, b) => (a.type === 'ganjil' ? 0 : 1) - (b.type === 'ganjil' ? 0 : 1) || a.id - b.id);
	const requestedSemester =
		input.semesterId ??
		(legacy?.yearId === yearId ? legacy.semesterId : undefined) ??
		(semesters.some((s) => s.id === active.semesterId) ? active.semesterId : semesters[0]?.id) ??
		0;
	const semesterId = semesters.some((s) => s.id === requestedSemester) ? requestedSemester : 0;
	const classes = yearClasses
		.filter((c) => c.semesterId === semesterId)
		.map((c) => ({ id: c.id, label: c.label }));
	return {
		years,
		yearId,
		semesters,
		semesterId,
		classes,
		classId: classes.some((c) => c.id === input.classId) ? input.classId : 0
	};
}

export function reportFilterId(value: string | null) {
	if (value === null) return undefined;
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
		throw new Error('Filter tahun pelajaran atau semester tidak valid.');
	return Number(value);
}
