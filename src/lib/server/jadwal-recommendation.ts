export type RecommendationInput = {
	classes: Array<{ id: number; nama: string; jenjang: string }>;
	subjects: Array<{
		id: number;
		kode: string;
		nama: string;
		jenjang: string;
		guruPegawaiId: number | null;
		target: number;
		kelasId?: number | null;
	}>;
	slots: Array<{ hari: string; jamKe: number; jenjang: string }>;
	entries: Array<{
		kelasId: number;
		hari: string;
		jamKe: number;
		kode: string;
		guruPegawaiId: number | null;
	}>;
	unavailable: Array<{ pegawaiId: number; hari: string; jamKe: number }>;
};

export function buildScheduleRecommendations(input: RecommendationInput) {
	const classBusy = new Set(
		input.entries.map((item) => `${item.kelasId}|${item.hari}|${item.jamKe}`)
	);
	const teacherBusy = new Set(
		input.entries
			.filter((item) => item.guruPegawaiId)
			.map((item) => `${item.guruPegawaiId}|${item.hari}|${item.jamKe}`)
	);
	const unavailable = new Set(
		input.unavailable.map((item) => `${item.pegawaiId}|${item.hari}|${item.jamKe}`)
	);
	const actual = new Map<string, number>();
	for (const entry of input.entries) {
		const key = `${entry.kelasId}|${entry.kode}`;
		actual.set(key, (actual.get(key) ?? 0) + 1);
	}
	const proposals: Array<{
		kelasId: number;
		kelas: string;
		hari: string;
		jamKe: number;
		kode: string;
		mapel: string;
		guruPegawaiId: number | null;
		reason: string;
	}> = [];
	const unresolved: Array<{ kelas: string; kode: string; missing: number; reason: string }> = [];
	for (const kelas of input.classes) {
		const grouped = new Map<string, (typeof input.subjects)[number]>();
		for (const subject of input.subjects) {
			if (subject.jenjang !== 'semua' && subject.jenjang !== kelas.jenjang) continue;
			if (subject.kelasId && subject.kelasId !== kelas.id) continue;
			const old = grouped.get(subject.kode);
			if (!old || subject.kelasId === kelas.id) grouped.set(subject.kode, subject);
		}
		for (const subject of grouped.values()) {
			let missing = Math.max(0, subject.target - (actual.get(`${kelas.id}|${subject.kode}`) ?? 0));
			for (const slot of input.slots.filter((item) => item.jenjang === kelas.jenjang)) {
				if (!missing) break;
				const classKey = `${kelas.id}|${slot.hari}|${slot.jamKe}`;
				const teacherKey = `${subject.guruPegawaiId}|${slot.hari}|${slot.jamKe}`;
				if (classBusy.has(classKey)) continue;
				if (subject.guruPegawaiId && (teacherBusy.has(teacherKey) || unavailable.has(teacherKey)))
					continue;
				proposals.push({
					kelasId: kelas.id,
					kelas: kelas.nama,
					hari: slot.hari,
					jamKe: slot.jamKe,
					kode: subject.kode,
					mapel: subject.nama,
					guruPegawaiId: subject.guruPegawaiId,
					reason: `Mengisi kekurangan target ${subject.target} JP/minggu`
				});
				classBusy.add(classKey);
				if (subject.guruPegawaiId) teacherBusy.add(teacherKey);
				missing--;
			}
			if (missing)
				unresolved.push({
					kelas: kelas.nama,
					kode: subject.kode,
					missing,
					reason: subject.guruPegawaiId
						? 'Tidak ada slot bebas yang cocok dengan ketersediaan guru.'
						: 'Mata pelajaran belum memiliki guru tunggal atau slot bebas.'
				});
		}
	}
	return { proposals, unresolved };
}
