export type JurnalJenis = 'persiapan' | 'ganjil' | 'genap';

export function resolveJurnalContext<
	TYear extends {
		id: number;
		nama: string;
		tanggalMulai: string | null;
		tanggalSelesai: string | null;
		semester: Array<{
			id: number;
			tipe: 'ganjil' | 'genap';
			nama: string;
			tanggalMulai: string | null;
			tanggalSelesai: string | null;
		}>;
	}
>(params: {
	tahunAjaranList: TYear[];
	activeTahunAjaranId: number | null;
	activeSemesterTipe: 'ganjil' | 'genap' | null;
	tanggal: string;
	requestedJenis?: JurnalJenis | null;
}) {
	const yearByDate = params.tahunAjaranList.find(
		(year) =>
			(!year.tanggalMulai || params.tanggal >= year.tanggalMulai) &&
			(!year.tanggalSelesai || params.tanggal <= year.tanggalSelesai)
	);
	const year =
		yearByDate ??
		params.tahunAjaranList.find((item) => item.id === params.activeTahunAjaranId) ??
		params.tahunAjaranList[0];
	if (!year) return null;
	const semesterByDate = year.semester.find(
		(semester) =>
			(semester.tanggalMulai || semester.tanggalSelesai) &&
			(!semester.tanggalMulai || params.tanggal >= semester.tanggalMulai) &&
			(!semester.tanggalSelesai || params.tanggal <= semester.tanggalSelesai)
	);
	const jenis =
		params.requestedJenis ??
		semesterByDate?.tipe ??
		(year.id === params.activeTahunAjaranId ? params.activeSemesterTipe : null) ??
		'ganjil';
	const semester = jenis === 'persiapan' ? null : year.semester.find((item) => item.tipe === jenis);
	return { year, semester, jenis };
}

export function splitJurnalBlocks<T extends { id: number; jamKe: number }>(entries: T[]) {
	const blocks: T[][] = [];
	for (const entry of [...entries].sort((a, b) => a.jamKe - b.jamKe)) {
		const current = blocks.at(-1);
		if (!current || entry.jamKe > current.at(-1)!.jamKe + 1) blocks.push([entry]);
		else current.push(entry);
	}
	return blocks;
}
