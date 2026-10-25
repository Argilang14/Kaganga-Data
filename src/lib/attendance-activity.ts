const activityCodeAliases: Record<string, string> = {
	sholat_dzuhur: 'sholat_zuhur',
	sholat_ashar: 'sholat_asar',
	sholat_maghrib: 'sholat_magrib'
};

export function canonicalAttendanceActivityCode(code: string) {
	return Object.hasOwn(activityCodeAliases, code) ? activityCodeAliases[code] : code;
}

// Select one existing source without renaming, merging, or deleting historical records.
export function selectAttendanceActivitySources<T extends { id: number; kode: string }>(
	activities: readonly T[]
) {
	const sources = new Map<string, T>();
	for (const activity of activities) {
		const code = canonicalAttendanceActivityCode(activity.kode);
		const existing = sources.get(code);
		if (
			!existing ||
			(activity.kode === code && existing.kode !== code) ||
			((activity.kode === code) === (existing.kode === code) && activity.id < existing.id)
		)
			sources.set(code, activity);
	}
	const selected = new Set([...sources.values()].map((activity) => activity.id));
	return activities.filter((activity) => selected.has(activity.id));
}
