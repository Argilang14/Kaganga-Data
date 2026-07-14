import { computeNilaiAkhirRekap } from '$lib/server/nilai-akhir';
import { buildKelasContext, fetchMuridList } from '$lib/server/route-utils';

export async function load({ locals, url, depends, parent }) {
	depends('app:cetak-sr');

	const parentData = await parent();
	const { sekolahId, kelasId, kelasIds, academicContext } = await buildKelasContext(
		locals,
		parentData,
		url
	);
	const tahunAjaranList = (academicContext?.tahunAjaranList ?? []).map((tahun) => ({
		id: tahun.id,
		nama: tahun.nama,
		semester: tahun.semester.map((semester) => ({
			id: semester.id,
			nama: semester.nama,
			tipe: semester.tipe
		}))
	}));
	const printContext = {
		tahunAjaranList,
		activeTahunAjaranId: academicContext?.activeTahunAjaranId ?? null,
		activeSemesterId: academicContext?.activeSemesterId ?? null,
		activeSemesterTipe: academicContext?.activeSemesterTipe ?? null
	};

	if (!sekolahId || !kelasIds.length) {
		return {
			academicContext,
			kelasId,
			daftarMurid: [],
			muridCount: 0,
			piagamRankingOptions: [],
			...printContext
		};
	}

	const daftarMurid = await fetchMuridList(sekolahId, kelasId, kelasIds);
	let piagamRankingOptions: Array<{
		muridId: number;
		peringkat: number;
		nama: string;
		nilaiRataRata: number | null;
	}> = [];

	if (kelasId) {
		const rekap = await computeNilaiAkhirRekap({ sekolahId, kelasId: Number(kelasId) });
		piagamRankingOptions = rekap.rows
			.filter((row) => Number.isFinite(row.peringkat) && row.peringkat >= 1)
			.sort((a, b) => a.peringkat - b.peringkat)
			.slice(0, 4)
			.map((row) => ({
				muridId: row.id,
				peringkat: row.peringkat,
				nama: row.nama,
				nilaiRataRata: row.nilaiRataRata
			}));
	}

	return {
		academicContext,
		kelasId,
		daftarMurid,
		muridCount: daftarMurid.length,
		piagamRankingOptions,
		...printContext
	};
}