// @ts-nocheck
import {
	kategoriToRubrikValue,
	hitungNilaiIndikator
} from '$lib/components/asesmen-keasramaan/utils';
import db from '$lib/server/db';
import { tableAsesmenKeasramaan, tableKeasramaan, tableMurid } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

type DetailStatus = 'empty' | 'not-found' | 'ready';

type MatevDetail = {
	no: number;
	matevId: number;
	matev: string;
	nilai: number | null;
	sudahDinilai: boolean;
	tujuanDinilai: number;
	totalTujuan: number;
};

function formatScore(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return null;
	return Number.parseFloat(value.toFixed(2));
}

function buildHighlights(daftarNilai: MatevDetail[]) {
	const scored = daftarNilai.filter((item) => item.nilai != null);
	if (!scored.length) return { tertinggi: [] as MatevDetail[], terendah: [] as MatevDetail[] };

	const highest = Math.max(...scored.map((item) => item.nilai ?? 0));
	const lowest = Math.min(...scored.map((item) => item.nilai ?? 0));

	return {
		tertinggi: scored.filter((item) => item.nilai === highest),
		terendah: scored.filter((item) => item.nilai === lowest)
	};
}

export async function load({ parent, url, locals, depends }) {
	depends('app:rekap-nilai-asrama-detail');
	const meta: PageMeta = { title: 'Detail Rekap Nilai Asrama' };
	const { kelasAktif } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;

	if (!sekolahId) throw error(401, 'Sekolah aktif tidak ditemukan');
	if (!kelasAktif?.id) throw error(400, 'Pilih kelas aktif terlebih dahulu');

	const muridIdParam = url.searchParams.get('murid_id');
	const defaultRingkasan = {
		rataRata: null as number | null,
		matevDinilai: 0,
		totalMatev: 0
	};

	if (!muridIdParam) {
		return {
			meta,
			status: 'empty' satisfies DetailStatus,
			murid: null,
			daftarNilai: [] as MatevDetail[],
			ringkasan: defaultRingkasan,
			tertinggi: [] as MatevDetail[],
			terendah: [] as MatevDetail[]
		};
	}

	const muridId = Number(muridIdParam);
	if (!Number.isInteger(muridId) || muridId <= 0) {
		return {
			meta,
			status: 'not-found' satisfies DetailStatus,
			murid: null,
			daftarNilai: [] as MatevDetail[],
			ringkasan: defaultRingkasan,
			tertinggi: [] as MatevDetail[],
			terendah: [] as MatevDetail[]
		};
	}

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true },
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasAktif.id)
		)
	});

	if (!murid) {
		return {
			meta,
			status: 'not-found' satisfies DetailStatus,
			murid: null,
			daftarNilai: [] as MatevDetail[],
			ringkasan: defaultRingkasan,
			tertinggi: [] as MatevDetail[],
			terendah: [] as MatevDetail[]
		};
	}

	const matevRecords = await db.query.tableKeasramaan.findMany({
		columns: { id: true, nama: true },
		with: {
			indikator: {
				columns: { id: true },
				with: {
					tujuan: {
						columns: { id: true }
					}
				}
			}
		},
		where: eq(tableKeasramaan.kelasId, kelasAktif.id),
		orderBy: asc(tableKeasramaan.createdAt)
	});

	const matevIds = matevRecords.map((matev) => matev.id);
	const nilaiRecords = matevIds.length
		? await db.query.tableAsesmenKeasramaan.findMany({
				columns: { keasramaanId: true, tujuanId: true, kategori: true },
				where: and(
					eq(tableAsesmenKeasramaan.muridId, murid.id),
					inArray(tableAsesmenKeasramaan.keasramaanId, matevIds)
				)
			})
		: [];

	const nilaiByMatev = new Map<number, Map<number, number>>();
	for (const record of nilaiRecords) {
		let tujuanMap = nilaiByMatev.get(record.keasramaanId);
		if (!tujuanMap) {
			tujuanMap = new Map();
			nilaiByMatev.set(record.keasramaanId, tujuanMap);
		}
		tujuanMap.set(record.tujuanId, kategoriToRubrikValue(record.kategori));
	}

	const daftarNilai = matevRecords.map((matev, index) => {
		const tujuanIds = matev.indikator.flatMap((indikator) =>
			indikator.tujuan.map((tujuan) => tujuan.id)
		);
		const tujuanMap = nilaiByMatev.get(matev.id);
		const nilaiTujuan = tujuanIds.map((tujuanId) => tujuanMap?.get(tujuanId) ?? null);
		const nilai = formatScore(hitungNilaiIndikator(nilaiTujuan));
		const tujuanDinilai = nilaiTujuan.filter((value) => value != null).length;

		return {
			no: index + 1,
			matevId: matev.id,
			matev: matev.nama,
			nilai,
			sudahDinilai: nilai != null,
			tujuanDinilai,
			totalTujuan: tujuanIds.length
		} satisfies MatevDetail;
	});

	const filledScores = daftarNilai
		.map((item) => item.nilai)
		.filter((nilai): nilai is number => nilai != null);
	const ringkasan = {
		rataRata: filledScores.length
			? formatScore(filledScores.reduce((sum, nilai) => sum + nilai, 0) / filledScores.length)
			: null,
		matevDinilai: filledScores.length,
		totalMatev: daftarNilai.length
	};
	const { tertinggi, terendah } = buildHighlights(daftarNilai);

	return {
		meta,
		status: 'ready' satisfies DetailStatus,
		murid,
		daftarNilai,
		ringkasan,
		tertinggi,
		terendah
	};
}

