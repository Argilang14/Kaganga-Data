export type WeeklyJpStatus = 'kurang' | 'tepat' | 'lebih';

export type WeeklyJpClass = {
	id: number;
	nama: string;
	jenjang: string;
};

export type WeeklyJpTarget = {
	id?: number;
	kelasId?: number | null;
	kode: string;
	nama: string;
	jenjang: string;
	jpPerMinggu: number;
};

export type WeeklyJpSlot = {
	hari: string;
	jamKe: number;
	jenjang: string;
	tipe: string;
	aktif: boolean;
};

export type WeeklyJpEntry = {
	hari: string;
	jamKe: number;
	kelasId: number;
	kode: string;
};

export type WeeklyJpResult = {
	kelasId: number;
	kelas: string;
	jenjang: string;
	kode: string;
	nama: string;
	target: number;
	actual: number;
	difference: number;
	status: WeeklyJpStatus;
};

function targetMatchesClass(targetJenjang: string, classJenjang: string) {
	return targetJenjang === 'semua' || targetJenjang === classJenjang;
}

export function calculateWeeklyJp(options: {
	classes: WeeklyJpClass[];
	targets: WeeklyJpTarget[];
	slots: WeeklyJpSlot[];
	entries: WeeklyJpEntry[];
}): WeeklyJpResult[] {
	const lessonSlots = [
		...new Map(
			options.slots
				.filter((slot) => slot.aktif && slot.tipe === 'pelajaran')
				.map((slot) => [`${slot.jenjang}|${slot.hari}|${slot.jamKe}`, slot])
		).values()
	];
	const activeLessonSlots = new Set(
		lessonSlots.map((slot) => `${slot.jenjang}|${slot.hari}|${slot.jamKe}`)
	);
	const entries = new Set(
		options.entries.map((entry) => `${entry.kelasId}|${entry.hari}|${entry.jamKe}|${entry.kode}`)
	);
	const results: WeeklyJpResult[] = [];

	for (const kelas of options.classes) {
		const classTargets = new Map<string, { target: WeeklyJpTarget; specific: boolean }>();
		for (const target of options.targets) {
			if (!targetMatchesClass(target.jenjang, kelas.jenjang)) continue;
			if (target.kelasId != null && target.kelasId !== kelas.id) continue;
			const specific = target.kelasId === kelas.id;
			const existing = classTargets.get(target.kode);
			if (!existing || (specific && !existing.specific))
				classTargets.set(target.kode, { target, specific });
		}

		for (const { target } of classTargets.values()) {
			if (target.jpPerMinggu <= 0) continue;
			let actual = 0;
			for (const slot of lessonSlots) {
				if (
					!activeLessonSlots.has(`${kelas.jenjang}|${slot.hari}|${slot.jamKe}`) ||
					slot.jenjang !== kelas.jenjang
				)
					continue;
				if (entries.has(`${kelas.id}|${slot.hari}|${slot.jamKe}|${target.kode}`)) actual += 1;
			}
			const difference = actual - target.jpPerMinggu;
			results.push({
				kelasId: kelas.id,
				kelas: kelas.nama,
				jenjang: kelas.jenjang,
				kode: target.kode,
				nama: target.nama,
				target: target.jpPerMinggu,
				actual,
				difference,
				status: difference < 0 ? 'kurang' : difference > 0 ? 'lebih' : 'tepat'
			});
		}
	}

	return results.sort(
		(a, b) => a.kelas.localeCompare(b.kelas, 'id') || a.kode.localeCompare(b.kode, 'id')
	);
}

export function summarizeWeeklyJp(results: WeeklyJpResult[]) {
	return results.reduce(
		(summary, result) => {
			summary[result.status] += 1;
			return summary;
		},
		{ kurang: 0, tepat: 0, lebih: 0 }
	);
}

export function summarizeWeeklyJpBySubject(results: WeeklyJpResult[]) {
	const summaries = new Map<
		string,
		{
			kode: string;
			nama: string;
			actual: number;
			target: number;
			kurangJp: number;
			lebihJp: number;
			kurangKelas: number;
			tepatKelas: number;
			lebihKelas: number;
		}
	>();
	for (const result of results) {
		const summary = summaries.get(result.kode) ?? {
			kode: result.kode,
			nama: result.nama,
			actual: 0,
			target: 0,
			kurangJp: 0,
			lebihJp: 0,
			kurangKelas: 0,
			tepatKelas: 0,
			lebihKelas: 0
		};
		summary.actual += result.actual;
		summary.target += result.target;
		if (result.difference < 0) {
			summary.kurangJp += Math.abs(result.difference);
			summary.kurangKelas += 1;
		} else if (result.difference > 0) {
			summary.lebihJp += result.difference;
			summary.lebihKelas += 1;
		} else summary.tepatKelas += 1;
		summaries.set(result.kode, summary);
	}
	return summaries;
}
