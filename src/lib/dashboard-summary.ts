export function jakartaToday(now = new Date()) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export function attendanceSummary(total: number, rows: Array<{ status: string; count: number }>) {
	const recorded = rows.reduce((sum, row) => sum + Number(row.count), 0);
	return { total, recorded, unrecorded: Math.max(0, total - recorded), rows };
}
