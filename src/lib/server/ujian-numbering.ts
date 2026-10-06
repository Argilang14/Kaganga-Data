export function isValidExamNpsn(value: string): boolean {
	return /^\d{8}$/.test(value);
}

export function examParticipantNumber(npsn: string, sequence: number): string {
	if (!isValidExamNpsn(npsn) || !Number.isSafeInteger(sequence) || sequence < 1) {
		throw new Error('NPSN atau urutan peserta tidak valid.');
	}
	return `${npsn}${String(sequence).padStart(2, '0')}`;
}

export function nextExamSequence(npsn: string, numbers: Array<string | null>): number {
	let highest = numbers.length;
	for (const number of numbers) {
		if (!number) continue;
		const suffix = number.startsWith(npsn)
			? number.slice(npsn.length)
			: /^\d{1,3}$/.test(number)
				? number
				: '';
		if (!/^\d+$/.test(suffix)) continue;
		const value = Number(suffix);
		if (Number.isSafeInteger(value) && value > highest) highest = value;
	}
	return highest + 1;
}

export function participantsInClassAdditionOrder<T extends { kelas: string | null }>(
	participants: T[]
): T[] {
	const classes = new Map<string | null, T[]>();
	for (const participant of participants) {
		const group = classes.get(participant.kelas) ?? [];
		group.push(participant);
		classes.set(participant.kelas, group);
	}
	return [...classes.values()].flat();
}
