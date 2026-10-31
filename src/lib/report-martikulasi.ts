import { martikulasiAspek, isMartikulasiKetuntasan, isMartikulasiLevel } from './martikulasi.ts';

type Grade = {
	aspekKode: string;
	kelompok: string;
	capaianAwal: string | null;
	capaianAkhir: string | null;
	ketuntasan: string | null;
	deskripsiCapaian: string | null;
};
export function martikulasiArchiveCoverage(grades: Grade[], level: string | null) {
	const valid = new Map<string, boolean>();
	let relationIssue = false;
	for (const grade of grades) {
		const aspect = martikulasiAspek.find((a) => a.kode === grade.aspekKode);
		if (!aspect || aspect.kelompok !== grade.kelompok || valid.has(grade.aspekKode))
			relationIssue = true;
		valid.set(
			grade.aspekKode,
			aspect?.kelompok === 'akademik'
				? !!(
						grade.capaianAwal?.trim() &&
						grade.capaianAkhir?.trim() &&
						grade.ketuntasan &&
						isMartikulasiKetuntasan(grade.ketuntasan)
					)
				: !!grade.deskripsiCapaian?.trim()
		);
	}
	return {
		expected: martikulasiAspek.length + 1,
		filled:
			martikulasiAspek.filter((a) => valid.get(a.kode)).length +
			Number(!!level && isMartikulasiLevel(level)),
		observed: grades.length,
		relationIssue
	};
}
