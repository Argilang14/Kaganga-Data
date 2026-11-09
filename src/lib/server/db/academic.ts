import db from '$lib/server/db';
import { tableSemester, tableTahunAjaran } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { academicPeriodForDate } from '$lib/academic-period';

export async function resolveSekolahPeriodForDate(sekolahId: number, date: string) {
	const context = await resolveSekolahAcademicContext(sekolahId);
	return academicPeriodForDate(context.tahunAjaranList, date);
}

export async function documentSemester(
	sekolahId: number,
	kelasId: number | null,
	activeSemesterId: number | null
) {
	const semesterId = kelasId
		? (
				await db.query.tableKelas.findFirst({
					where: (kelas, { and, eq }) => and(eq(kelas.id, kelasId), eq(kelas.sekolahId, sekolahId)),
					columns: { semesterId: true }
				})
			)?.semesterId
		: activeSemesterId;
	if (!semesterId) return null;
	const semester = await db.query.tableSemester.findFirst({
		where: eq(tableSemester.id, semesterId),
		with: { tahunAjaran: true }
	});
	return semester?.tahunAjaran.sekolahId === sekolahId ? semester : null;
}

export type AcademicContext = {
	tahunAjaranList: (typeof tableTahunAjaran.$inferSelect & {
		semester: (typeof tableSemester.$inferSelect)[];
	})[];
	activeTahunAjaranId: number | null;
	activeSemesterId: number | null;
	activeSemesterTipe: 'ganjil' | 'genap' | null;
	tanggalBagiRaport: {
		ganjilId?: number;
		ganjil?: string | null;
		genapId?: number;
		genap?: string | null;
	};
	tanggalMasuk: {
		ganjilId?: number;
		ganjil?: string | null;
		genapId?: number;
		genap?: string | null;
	};
};

export async function resolveSekolahAcademicContext(
	sekolahId: number,
	source: typeof db | DBTransaction = db
): Promise<AcademicContext> {
	const tahunAjaranList = await source.query.tableTahunAjaran.findMany({
		where: eq(tableTahunAjaran.sekolahId, sekolahId),
		orderBy: [desc(tableTahunAjaran.id)],
		with: {
			semester: true
		}
	});

	let activeTahunAjaranId: number | null = null;
	let activeSemesterId: number | null = null;
	let activeSemesterTipe: AcademicContext['activeSemesterTipe'] = null;
	let tanggalBagiRaport: AcademicContext['tanggalBagiRaport'] = {};
	let tanggalMasuk: AcademicContext['tanggalMasuk'] = {};

	const activeTahunAjaran =
		tahunAjaranList.find((item) => item.isAktif) ?? tahunAjaranList.at(0) ?? null;

	if (activeTahunAjaran) {
		activeTahunAjaranId = activeTahunAjaran.id;
		const activeSemester =
			activeTahunAjaran.semester.find((item) => item.isAktif) ??
			activeTahunAjaran.semester.at(0) ??
			null;
		activeSemesterId = activeSemester?.id ?? null;
		activeSemesterTipe = activeSemester?.tipe ?? null;

		const ganjil = activeTahunAjaran.semester.find((item) => item.tipe === 'ganjil');
		const genap = activeTahunAjaran.semester.find((item) => item.tipe === 'genap');
		tanggalBagiRaport = {
			ganjilId: ganjil?.id,
			ganjil: ganjil?.tanggalBagiRaport ?? null,
			genapId: genap?.id,
			genap: genap?.tanggalBagiRaport ?? null
		};
		tanggalMasuk = {
			ganjilId: ganjil?.id,
			ganjil: ganjil?.tanggalMasuk ?? null,
			genapId: genap?.id,
			genap: genap?.tanggalMasuk ?? null
		};
	}

	return {
		tahunAjaranList,
		activeTahunAjaranId,
		activeSemesterId,
		activeSemesterTipe,
		tanggalBagiRaport,
		tanggalMasuk
	};
}
