import {
	kategoriToRubrikValue,
	hitungNilaiIndikator
} from '$lib/components/asesmen-keasramaan/utils';
import db from '$lib/server/db';
import { tableAsesmenKeasramaan, tableKeasramaan, tableMurid } from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { guardianStudentCondition } from '$lib/server/assignment-summary';

const PER_PAGE = 20;

type MatevScore = {
	id: number;
	nama: string;
	score: number | null;
};

type Row = {
	id: number;
	nama: string;
	peringkat: number;
	nilaiRataRata: number | null;
	jumlahMatevDinilai: number;
	totalMatev: number;
	matevScores: MatevScore[];
	detailHref: string;
};

function formatScore(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return null;
	return Number.parseFloat(value.toFixed(2));
}

function rankRows(rows: Omit<Row, 'peringkat'>[]) {
	const sorted = [...rows].sort((a, b) => {
		if (a.nilaiRataRata == null && b.nilaiRataRata == null) {
			return a.nama.localeCompare(b.nama, 'id');
		}
		if (a.nilaiRataRata == null) return 1;
		if (b.nilaiRataRata == null) return -1;
		const diff = b.nilaiRataRata - a.nilaiRataRata;
		if (Math.abs(diff) > 0.0001) return diff;
		return a.nama.localeCompare(b.nama, 'id');
	});

	let lastScore: number | null = null;
	let lastRank = 0;
	return sorted.map((row, index) => {
		const score = row.nilaiRataRata;
		let peringkat = index + 1;
		if (score != null) {
			if (lastScore != null && Math.abs(lastScore - score) <= 0.0001) {
				peringkat = lastRank;
			} else {
				lastScore = score;
				lastRank = peringkat;
			}
		} else {
			lastScore = null;
			lastRank = peringkat;
		}
		return { ...row, peringkat };
	});
}

export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	depends('app:rekap-nilai-asrama');

	const meta: PageMeta = { title: 'Rekap Nilai Asrama' };
	const { kelasAktif } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;
	const sekolahNama = locals.sekolah?.nama ?? 'Sekolah';

	const searchParam = url.searchParams.get('q');
	const search = searchParam?.trim() ? searchParam.trim() : null;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	if (!sekolahId || !kelasAktif?.id) {
		return {
			meta,
			kelasLabel: null,
			sekolahNama,
			matevList: [],
			daftarNilai: [],
			legerRows: [],
			summary: { totalMurid: 0, totalMuridDinilai: 0, totalMatev: 0 },
			page: { search, currentPage: 1, totalPages: 1, totalItems: 0, perPage: PER_PAGE }
		};
	}

	const kelasLabel = kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	const muridRecords = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true },
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktif.id), await guardianStudentCondition(locals.user, sekolahId)),
		orderBy: asc(tableMurid.nama)
	});
	const muridIds = muridRecords.map((murid) => murid.id);

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

	const matevList = matevRecords.map((matev) => ({ id: matev.id, nama: matev.nama }));
	const matevIds = matevRecords.map((matev) => matev.id);
	const nilaiRecords =
		muridIds.length && matevIds.length
			? await db.query.tableAsesmenKeasramaan.findMany({
					columns: { muridId: true, keasramaanId: true, tujuanId: true, kategori: true },
					where: and(
						inArray(tableAsesmenKeasramaan.muridId, muridIds),
						inArray(tableAsesmenKeasramaan.keasramaanId, matevIds)
					)
				})
			: [];

	const nilaiByMuridMatev = new Map<number, Map<number, Map<number, number>>>();
	for (const record of nilaiRecords) {
		let muridMap = nilaiByMuridMatev.get(record.muridId);
		if (!muridMap) {
			muridMap = new Map();
			nilaiByMuridMatev.set(record.muridId, muridMap);
		}
		let matevMap = muridMap.get(record.keasramaanId);
		if (!matevMap) {
			matevMap = new Map();
			muridMap.set(record.keasramaanId, matevMap);
		}
		matevMap.set(record.tujuanId, kategoriToRubrikValue(record.kategori));
	}

	const rowsWithoutRank = muridRecords.map((murid) => {
		const matevScores = matevRecords.map((matev) => {
			const muridMap = nilaiByMuridMatev.get(murid.id);
			const matevMap = muridMap?.get(matev.id);
			const tujuanIds = matev.indikator.flatMap((indikator) =>
				indikator.tujuan.map((tujuan) => tujuan.id)
			);
			const nilaiTujuan = tujuanIds.map((tujuanId) => matevMap?.get(tujuanId) ?? null);
			const score = hitungNilaiIndikator(nilaiTujuan);
			return {
				id: matev.id,
				nama: matev.nama,
				score: formatScore(score)
			};
		});
		const filledScores = matevScores
			.map((score) => score.score)
			.filter((score): score is number => score != null);
		const nilaiRataRata = filledScores.length
			? formatScore(filledScores.reduce((sum, score) => sum + score, 0) / filledScores.length)
			: null;

		return {
			id: murid.id,
			nama: murid.nama,
			nilaiRataRata,
			jumlahMatevDinilai: filledScores.length,
			totalMatev: matevRecords.length,
			matevScores,
			detailHref: `/rekap-nilai-asrama/detail?murid_id=${murid.id}`
		};
	});

	const rankedRows = rankRows(rowsWithoutRank);
	const lowerSearch = search ? search.toLowerCase() : null;
	const filteredRows = lowerSearch
		? rankedRows.filter((row) => row.nama.toLowerCase().includes(lowerSearch))
		: rankedRows;
	const totalItems = filteredRows.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) params.delete('page');
		else params.set('page', String(currentPage));
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	const offset = (currentPage - 1) * PER_PAGE;
	const daftarNilai = filteredRows.slice(offset, offset + PER_PAGE);

	return {
		meta,
		kelasLabel,
		sekolahNama,
		matevList,
		daftarNilai,
		legerRows: rankedRows,
		summary: {
			totalMurid: rankedRows.length,
			totalMuridDinilai: rankedRows.filter((row) => row.jumlahMatevDinilai > 0).length,
			totalMatev: matevRecords.length
		},
		page: {
			search,
			currentPage,
			totalPages,
			totalItems,
			perPage: PER_PAGE
		}
	};
};
