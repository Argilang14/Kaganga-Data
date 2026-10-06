import { buildJpNumberBySlot, jadwalSlotKey } from '$lib/jadwal-slots';
import db from '$lib/server/db';
import type { AcademicContext } from '$lib/server/db/academic';
import {
	tableJadwalJam,
	tableJadwalPelajaran,
	tableJadwalTemplate,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { JADWAL_JENIS_LABELS, normalizeJadwalJenis, type JadwalJenis } from '$lib/server/jadwal';
import { resolveJurnalContext, splitJurnalBlocks } from '$lib/jurnal-mengajar-context';
import { and, asc, eq, inArray } from 'drizzle-orm';

const DAY_NAMES = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

export type JurnalAcademicContext = {
	tahunAjaranId: number;
	tahunAjaranNama: string;
	semesterId: number | null;
	semesterNama: string | null;
	jenis: JadwalJenis;
	jenisLabel: string;
	templateIds: number[];
};

export function resolveJurnalAcademicContext(
	academic: AcademicContext,
	tanggal: string,
	requestedJenis?: string | null
): JurnalAcademicContext | null {
	const resolved = resolveJurnalContext({
		tahunAjaranList: academic.tahunAjaranList,
		activeTahunAjaranId: academic.activeTahunAjaranId,
		activeSemesterTipe: academic.activeSemesterTipe,
		tanggal,
		requestedJenis: requestedJenis ? normalizeJadwalJenis(requestedJenis) : null
	});
	if (!resolved) return null;
	const { year, semester, jenis } = resolved;

	return {
		tahunAjaranId: year.id,
		tahunAjaranNama: year.nama,
		semesterId: semester?.id ?? null,
		semesterNama: semester?.nama ?? null,
		jenis,
		jenisLabel: JADWAL_JENIS_LABELS[jenis],
		templateIds: []
	};
}

export async function loadJurnalScheduleContext(
	sekolahId: number,
	academic: AcademicContext,
	tanggal: string,
	requestedJenis?: string | null
) {
	const context = resolveJurnalAcademicContext(academic, tanggal, requestedJenis);
	if (!context) return null;
	const templates = await db.query.tableJadwalTemplate.findMany({
		columns: { id: true },
		where: and(
			eq(tableJadwalTemplate.sekolahId, sekolahId),
			eq(tableJadwalTemplate.tahunAjaranId, context.tahunAjaranId),
			eq(tableJadwalTemplate.jenis, context.jenis)
		)
	});
	context.templateIds = templates.map((item) => item.id);
	return context;
}

export async function findJurnalScheduleEntries(params: {
	sekolahId: number;
	kelasId: number;
	tanggal: string;
	templateIds: number[];
	jadwalMapelId?: number;
	mataPelajaranId?: number;
	kode?: string | null;
}) {
	if (!params.templateIds.length) return [];
	const hari = DAY_NAMES[new Date(`${params.tanggal}T00:00:00`).getDay()];
	const base = [
		eq(tableJadwalPelajaran.sekolahId, params.sekolahId),
		eq(tableJadwalPelajaran.kelasId, params.kelasId),
		eq(tableJadwalPelajaran.hari, hari),
		eq(tableJadwalPelajaran.tipe, 'pelajaran'),
		inArray(tableJadwalPelajaran.templateId, params.templateIds)
	];
	let rows = params.jadwalMapelId
		? await db.query.tableJadwalPelajaran.findMany({
				where: and(...base, eq(tableJadwalPelajaran.jadwalMapelId, params.jadwalMapelId)),
				orderBy: [asc(tableJadwalPelajaran.jamKe)]
			})
		: params.mataPelajaranId
			? await db.query.tableJadwalPelajaran.findMany({
					where: and(...base, eq(tableJadwalPelajaran.mataPelajaranId, params.mataPelajaranId)),
					orderBy: [asc(tableJadwalPelajaran.jamKe)]
				})
			: await db.query.tableJadwalPelajaran.findMany({
					where: and(...base),
					orderBy: [asc(tableJadwalPelajaran.jamKe)]
				});
	if (!rows.length && params.kode) {
		rows = await db.query.tableJadwalPelajaran.findMany({
			where: and(...base, eq(tableJadwalPelajaran.kodeKegiatan, params.kode)),
			orderBy: [asc(tableJadwalPelajaran.jamKe)]
		});
	}
	return rows;
}

export async function describeJurnalSchedule(
	entries: Array<{ id: number; jamId: number | null; jamKe: number }>
) {
	const jamIds = [
		...new Set(entries.map((entry) => entry.jamId).filter((id): id is number => !!id))
	];
	const selectedRows = jamIds.length
		? await db.query.tableJadwalJam.findMany({ where: inArray(tableJadwalJam.id, jamIds) })
		: [];
	const templateIds = [
		...new Set(selectedRows.map((row) => row.templateId).filter((id): id is number => id !== null))
	];
	const allRows = templateIds.length
		? await db.query.tableJadwalJam.findMany({
				where: inArray(tableJadwalJam.templateId, templateIds)
			})
		: selectedRows;
	const jpNumbers = buildJpNumberBySlot(allRows);
	const selectedById = new Map(selectedRows.map((row) => [row.id, row]));
	const numbers = entries.map((entry) => {
		const slot = entry.jamId ? selectedById.get(entry.jamId) : null;
		return slot ? (jpNumbers.get(jadwalSlotKey(slot)) ?? entry.jamKe) : entry.jamKe;
	});
	const starts = selectedRows.map((row) => row.pukulMulai).sort();
	const ends = selectedRows.map((row) => row.pukulSelesai).sort();
	return {
		jamPelajaran:
			numbers.length === 1 ? String(numbers[0]) : `${Math.min(...numbers)}-${Math.max(...numbers)}`,
		pukul: starts.length && ends.length ? `${starts[0]}-${ends.at(-1)}` : null,
		jadwalPelajaranIds: JSON.stringify(entries.map((entry) => entry.id))
	};
}

export function splitJurnalScheduleBlocks<
	T extends { id: number; jamId: number | null; jamKe: number }
>(entries: T[]) {
	return splitJurnalBlocks(entries);
}

export async function resolveStoredAcademicLabels(row: {
	tahunAjaranId: number | null;
	semesterId: number | null;
	jenisJadwal: string | null;
}) {
	const [year, semester] = await Promise.all([
		row.tahunAjaranId
			? db.query.tableTahunAjaran.findFirst({ where: eq(tableTahunAjaran.id, row.tahunAjaranId) })
			: null,
		row.semesterId
			? db.query.tableSemester.findFirst({ where: eq(tableSemester.id, row.semesterId) })
			: null
	]);
	const jenis = row.jenisJadwal ? normalizeJadwalJenis(row.jenisJadwal) : null;
	return {
		tahunAjaranNama: year?.nama ?? null,
		semesterNama: semester?.nama ?? null,
		jenisLabel: jenis ? JADWAL_JENIS_LABELS[jenis] : null
	};
}
