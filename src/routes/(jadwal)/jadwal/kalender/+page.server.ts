import {
	loadAbsensiKelasOptions,
	parsePositiveInteger,
	resolveKelasId
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKalenderPendidikan, tableSemester, tableTahunAjaran } from '$lib/server/db/schema';
import { canManageJadwal, requireJadwalAccess } from '$lib/server/jadwal';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const KALENDER_JENIS = [
	'hari_efektif',
	'libur_nasional',
	'libur_sekolah',
	'ujian',
	'asesmen',
	'pembagian_rapor',
	'kegiatan_sekolah',
	'kegiatan_asrama',
	'lainnya'
] as const;
type KalenderJenis = (typeof KALENDER_JENIS)[number];

const JENJANG = ['semua', 'srd', 'srmp', 'srma'] as const;
type Jenjang = (typeof JENJANG)[number];
const LEGACY_JENJANG: Record<Exclude<Jenjang, 'semua'>, 'sd' | 'smp' | 'sma'> = {
	srd: 'sd',
	srmp: 'smp',
	srma: 'sma'
};

function parseKalenderJenis(value: FormDataEntryValue | string | null): KalenderJenis | null {
	const raw = value?.toString();
	return KALENDER_JENIS.includes(raw as KalenderJenis) ? (raw as KalenderJenis) : null;
}

function parseJenjang(value: FormDataEntryValue | string | null): Jenjang | null {
	const raw = value?.toString();
	if (JENJANG.includes(raw as Jenjang)) return raw as Jenjang;
	if (raw === 'sd') return 'srd';
	if (raw === 'smp') return 'srmp';
	if (raw === 'sma') return 'srma';
	return null;
}

function parseDateInput(value: FormDataEntryValue | null) {
	const raw = value?.toString().trim() ?? '';
	return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function nullablePositiveInteger(value: FormDataEntryValue | string | null) {
	return parsePositiveInteger(value) ?? null;
}

function canUseKelas(kelasList: { id: number }[], kelasId: number | null) {
	return !kelasId || kelasList.some((kelas) => kelas.id === kelasId);
}
function normalizeImportText(value: unknown) {
	if (value == null) return '';
	if (value instanceof Date) return formatDateInput(value);
	if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
	if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
	return String(value).trim();
}

function normalizeKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function parseKalenderJenisImport(value: unknown): KalenderJenis | null {
	const key = normalizeKey(normalizeImportText(value));
	const aliases: Record<string, KalenderJenis> = {
		hari_efektif: 'hari_efektif',
		libur_nasional: 'libur_nasional',
		libur_sekolah: 'libur_sekolah',
		ujian: 'ujian',
		asesmen: 'asesmen',
		pembagian_rapor: 'pembagian_rapor',
		kegiatan_sekolah: 'kegiatan_sekolah',
		kegiatan_asrama: 'kegiatan_asrama',
		lainnya: 'lainnya'
	};
	return aliases[key] ?? null;
}

function parseJenjangImport(value: unknown): Jenjang {
	const key = normalizeKey(normalizeImportText(value));
	if (key === 'srd' || key === 'sd') return 'srd';
	if (key === 'srmp' || key === 'smp') return 'srmp';
	if (key === 'srma' || key === 'sma') return 'srma';
	return 'semua';
}

function formatDateInput(date: Date) {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function parseExcelDate(value: unknown) {
	if (value instanceof Date) return formatDateInput(value);
	if (typeof value === 'number' && Number.isFinite(value)) {
		const utc = Math.round((value - 25569) * 86400 * 1000);
		return new Date(utc).toISOString().slice(0, 10);
	}
	const raw = normalizeImportText(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	if (!match) return null;
	const day = match[1].padStart(2, '0');
	const month = match[2].padStart(2, '0');
	return `${match[3]}-${month}-${day}`;
}

function parseWarna(value: unknown) {
	const raw = normalizeImportText(value);
	return /^#[0-9a-f]{6}$/i.test(raw) ? raw : null;
}
function academicYears(tahunAjaranNama?: string | null) {
	const match = tahunAjaranNama?.match(/(\d{4})\s*[/-]\s*(\d{4})/);
	if (match) return { start: Number(match[1]), end: Number(match[2]) };
	const current = new Date().getFullYear();
	return { start: current, end: current + 1 };
}

function calendarYearRange(tahunAjaranNama?: string | null) {
	const years = academicYears(tahunAjaranNama);
	return {
		start: `${years.start}-07-01`,
		end: `${years.end}-06-30`,
		year: years.start,
		label: `${years.start}/${years.end}`
	};
}

export async function load({ locals, url }) {
	requireJadwalAccess(locals.user);
	const sekolah = locals.sekolah;
	const sekolahId = sekolah?.id;
	if (!sekolahId || !sekolah || !locals.user) throw redirect(303, '/login');

	const academic = await resolveSekolahAcademicContext(sekolahId);
	const { kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const requestedTahunAjaranId = nullablePositiveInteger(url.searchParams.get('tahun_ajaran_id'));
	const requestedSemesterId = nullablePositiveInteger(url.searchParams.get('semester_id'));
	const selectedTahunAjaranId = requestedTahunAjaranId ?? academic.activeTahunAjaranId;
	const selectedSemesterId = requestedSemesterId;
	const selectedKelasId = resolveKelasId(
		kelasList,
		nullablePositiveInteger(url.searchParams.get('kelas_id'))
	);
	const selectedJenis = parseKalenderJenis(url.searchParams.get('jenis'));
	const selectedJenjang = parseJenjang(url.searchParams.get('jenjang'));
	const canEdit = canManageJadwal(locals.user);

	const selectedTahunAjaran = selectedTahunAjaranId
		? await db.query.tableTahunAjaran.findFirst({
				columns: { id: true, nama: true },
				where: and(
					eq(tableTahunAjaran.id, selectedTahunAjaranId),
					eq(tableTahunAjaran.sekolahId, sekolahId)
				)
			})
		: null;
	const calendarRange = calendarYearRange(selectedTahunAjaran?.nama);

	const whereParts = [eq(tableKalenderPendidikan.sekolahId, sekolahId)];
	whereParts.push(
		or(
			selectedTahunAjaranId
				? eq(tableKalenderPendidikan.tahunAjaranId, selectedTahunAjaranId)
				: isNull(tableKalenderPendidikan.tahunAjaranId),
			and(
				lte(tableKalenderPendidikan.tanggalMulai, calendarRange.end),
				gte(tableKalenderPendidikan.tanggalSelesai, calendarRange.start)
			)
		)!
	);
	if (selectedSemesterId)
		whereParts.push(
			or(
				eq(tableKalenderPendidikan.semesterId, selectedSemesterId),
				isNull(tableKalenderPendidikan.semesterId)
			)!
		);
	if (selectedKelasId) {
		whereParts.push(
			or(
				eq(tableKalenderPendidikan.kelasId, selectedKelasId),
				isNull(tableKalenderPendidikan.kelasId)
			)!
		);
	} else if (locals.user.type === 'wali_kelas') {
		const kelasIds = kelasList.map((kelas) => kelas.id);
		whereParts.push(
			or(
				isNull(tableKalenderPendidikan.kelasId),
				kelasIds.length
					? inArray(tableKalenderPendidikan.kelasId, kelasIds)
					: eq(tableKalenderPendidikan.kelasId, -1)
			)!
		);
	}
	if (selectedJenis) whereParts.push(eq(tableKalenderPendidikan.jenis, selectedJenis));
	if (selectedJenjang) {
		if (selectedJenjang === 'semua') {
			whereParts.push(eq(tableKalenderPendidikan.jenjang, 'semua'));
		} else {
			whereParts.push(
				inArray(tableKalenderPendidikan.jenjang, [
					'semua',
					selectedJenjang,
					LEGACY_JENJANG[selectedJenjang]
				])
			);
		}
	}

	const [kalenderList, tahunAjaranList, semesterList] = await Promise.all([
		db.query.tableKalenderPendidikan.findMany({
			where: and(...whereParts),
			with: {
				tahunAjaran: { columns: { id: true, nama: true } },
				semester: { columns: { id: true, nama: true, tipe: true } },
				kelas: { columns: { id: true, nama: true, fase: true } }
			},
			orderBy: [
				asc(tableKalenderPendidikan.tanggalMulai),
				asc(tableKalenderPendidikan.tanggalSelesai)
			]
		}),
		db.query.tableTahunAjaran.findMany({
			columns: { id: true, nama: true, isAktif: true },
			where: eq(tableTahunAjaran.sekolahId, sekolahId),
			orderBy: [asc(tableTahunAjaran.nama)]
		}),
		selectedTahunAjaranId
			? db.query.tableSemester.findMany({
					columns: { id: true, nama: true, tipe: true, isAktif: true },
					where: eq(tableSemester.tahunAjaranId, selectedTahunAjaranId),
					orderBy: [asc(tableSemester.id)]
				})
			: Promise.resolve([])
	]);

	return {
		meta: { title: 'Kalender Pendidikan' } satisfies PageMeta,
		sekolahNama: sekolah.nama,
		canEdit,
		activeTahunAjaranId: academic.activeTahunAjaranId,
		activeSemesterId: academic.activeSemesterId,
		selectedTahunAjaranId,
		selectedSemesterId,
		calendarYear: calendarRange.year,
		calendarRange,
		selectedKelasId,
		selectedJenis,
		selectedJenjang,
		jenisOptions: KALENDER_JENIS,
		jenjangOptions: JENJANG,
		kalenderList,
		tahunAjaranList,
		semesterList,
		kelasList
	};
}

export const actions = {
	saveAgenda: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin mengubah kalender pendidikan.' });
		}

		const formData = await request.formData();
		const id = nullablePositiveInteger(formData.get('id'));
		const tahunAjaranId = nullablePositiveInteger(formData.get('tahunAjaranId'));
		const semesterId = nullablePositiveInteger(formData.get('semesterId'));
		const kelasId = nullablePositiveInteger(formData.get('kelasId'));
		const tanggalMulai = parseDateInput(formData.get('tanggalMulai'));
		const tanggalSelesai = parseDateInput(formData.get('tanggalSelesai'));
		const judul = formData.get('judul')?.toString().trim() ?? '';
		const jenis = parseKalenderJenis(formData.get('jenis'));
		const jenjang = parseJenjang(formData.get('jenjang')) ?? 'semua';
		const warna = formData.get('warna')?.toString().trim() || null;
		const keterangan = formData.get('keterangan')?.toString().trim() || null;

		if (!tanggalMulai || !tanggalSelesai || !judul || !jenis) {
			return fail(400, { fail: 'Tanggal, judul, dan jenis agenda wajib diisi.' });
		}
		if (tanggalSelesai < tanggalMulai) {
			return fail(400, { fail: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' });
		}

		const { kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
		if (!canUseKelas(kelasList, kelasId)) {
			return fail(403, { fail: 'Anda tidak memiliki akses ke kelas yang dipilih.' });
		}

		if (tahunAjaranId) {
			const tahunAjaran = await db.query.tableTahunAjaran.findFirst({
				columns: { id: true },
				where: and(
					eq(tableTahunAjaran.id, tahunAjaranId),
					eq(tableTahunAjaran.sekolahId, sekolahId)
				)
			});
			if (!tahunAjaran) return fail(404, { fail: 'Tahun ajaran tidak ditemukan.' });
		}

		if (semesterId && tahunAjaranId) {
			const semester = await db.query.tableSemester.findFirst({
				columns: { id: true },
				where: and(eq(tableSemester.id, semesterId), eq(tableSemester.tahunAjaranId, tahunAjaranId))
			});
			if (!semester)
				return fail(404, { fail: 'Semester tidak ditemukan pada tahun ajaran tersebut.' });
		}

		const now = new Date().toISOString();
		const payload = {
			sekolahId,
			tahunAjaranId,
			semesterId,
			kelasId,
			tanggalMulai,
			tanggalSelesai,
			judul,
			jenis,
			jenjang,
			warna,
			keterangan,
			updatedAt: now
		};

		if (id) {
			const existing = await db.query.tableKalenderPendidikan.findFirst({
				columns: { id: true },
				where: and(
					eq(tableKalenderPendidikan.id, id),
					eq(tableKalenderPendidikan.sekolahId, sekolahId)
				)
			});
			if (!existing) return fail(404, { fail: 'Agenda kalender tidak ditemukan.' });
			await db
				.update(tableKalenderPendidikan)
				.set(payload)
				.where(eq(tableKalenderPendidikan.id, id));
		} else {
			await db.insert(tableKalenderPendidikan).values({ ...payload, createdAt: now });
		}

		return { message: 'Agenda kalender berhasil disimpan.' };
	},
	importKalender: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin import kalender pendidikan.' });
		}

		const formData = await request.formData();
		const tahunAjaranId = nullablePositiveInteger(formData.get('tahunAjaranId'));
		const semesterId = nullablePositiveInteger(formData.get('semesterId'));
		const file = formData.get('file');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { fail: 'File Excel kalender wajib dipilih.' });
		}
		if (!tahunAjaranId) {
			return fail(400, { fail: 'Pilih tahun ajaran sebelum import kalender.' });
		}

		const tahunAjaran = await db.query.tableTahunAjaran.findFirst({
			columns: { id: true },
			where: and(eq(tableTahunAjaran.id, tahunAjaranId), eq(tableTahunAjaran.sekolahId, sekolahId))
		});
		if (!tahunAjaran) return fail(404, { fail: 'Tahun ajaran tidak ditemukan.' });

		if (semesterId) {
			const semester = await db.query.tableSemester.findFirst({
				columns: { id: true, tahunAjaranId: true },
				where: eq(tableSemester.id, semesterId)
			});
			if (!semester || semester.tahunAjaranId !== tahunAjaranId) {
				return fail(404, { fail: 'Semester tidak ditemukan pada tahun ajaran tersebut.' });
			}
		}

		const { kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
		const accessibleKelasIds = new Set(kelasList.map((kelas) => kelas.id));
		const kelasByName = new Map(
			kelasList.map((kelas) => [normalizeKey(kelas.nama), kelas.id] as const)
		);
		const kelasById = new Set(kelasList.map((kelas) => kelas.id));

		const arrayBuffer = await file.arrayBuffer();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ExcelJSImport = ExcelJS as unknown as { Workbook: { new (): any } };
		const workbook = new ExcelJSImport.Workbook();
		await workbook.xlsx.load(Buffer.from(arrayBuffer));
		const worksheet = workbook.getWorksheet('Kalender Pendidikan') ?? workbook.worksheets[0];
		if (!worksheet) return fail(400, { fail: 'File Excel tidak memiliki worksheet.' });

		let importedCount = 0;
		let updatedCount = 0;
		let skippedCount = 0;
		const skippedRows: number[] = [];
		const now = new Date().toISOString();

		for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
			const row = worksheet.getRow(rowNumber);
			const tanggalMulai = parseExcelDate(row.getCell(1).value);
			const tanggalSelesai = parseExcelDate(row.getCell(2).value) ?? tanggalMulai;
			const judul = normalizeImportText(row.getCell(3).value);
			const jenis = parseKalenderJenisImport(row.getCell(4).value);
			const jenjang = parseJenjangImport(row.getCell(5).value);
			const kelasRaw = normalizeImportText(row.getCell(6).value);
			const warna = parseWarna(row.getCell(7).value);
			const keterangan = normalizeImportText(row.getCell(8).value) || null;

			if (!tanggalMulai && !judul && !jenis) continue;
			if (!tanggalMulai || !tanggalSelesai || tanggalSelesai < tanggalMulai || !judul || !jenis) {
				skippedCount++;
				skippedRows.push(rowNumber);
				continue;
			}

			let kelasId: number | null = null;
			const kelasKey = normalizeKey(kelasRaw);
			if (kelasKey && kelasKey !== 'umum' && kelasKey !== 'semua') {
				const numericKelasId = nullablePositiveInteger(kelasRaw);
				kelasId =
					numericKelasId && kelasById.has(numericKelasId)
						? numericKelasId
						: (kelasByName.get(kelasKey) ?? null);
				if (!kelasId || !accessibleKelasIds.has(kelasId)) {
					skippedCount++;
					skippedRows.push(rowNumber);
					continue;
				}
			}

			const payload = {
				sekolahId,
				tahunAjaranId,
				semesterId,
				kelasId,
				tanggalMulai,
				tanggalSelesai,
				judul,
				jenis,
				jenjang,
				warna,
				keterangan,
				updatedAt: now
			};

			const existing = await db.query.tableKalenderPendidikan.findFirst({
				columns: { id: true },
				where: and(
					eq(tableKalenderPendidikan.sekolahId, sekolahId),
					eq(tableKalenderPendidikan.tahunAjaranId, tahunAjaranId),
					semesterId
						? eq(tableKalenderPendidikan.semesterId, semesterId)
						: isNull(tableKalenderPendidikan.semesterId),
					eq(tableKalenderPendidikan.tanggalMulai, tanggalMulai),
					eq(tableKalenderPendidikan.tanggalSelesai, tanggalSelesai),
					eq(tableKalenderPendidikan.judul, judul)
				)
			});

			if (existing) {
				await db
					.update(tableKalenderPendidikan)
					.set(payload)
					.where(eq(tableKalenderPendidikan.id, existing.id));
				updatedCount++;
			} else {
				await db.insert(tableKalenderPendidikan).values({ ...payload, createdAt: now });
				importedCount++;
			}
		}

		const skippedInfo = skippedRows.length ? ` Baris dilewati: ${skippedRows.join(', ')}.` : '';
		return {
			message: `Import kalender selesai. Baru: ${importedCount}, diperbarui: ${updatedCount}, dilewati: ${skippedCount}.${skippedInfo}`
		};
	},
	deleteAgenda: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus kalender pendidikan.' });
		}

		const formData = await request.formData();
		const id = nullablePositiveInteger(formData.get('id'));
		if (!id) return fail(400, { fail: 'Agenda kalender belum dipilih.' });

		await db
			.delete(tableKalenderPendidikan)
			.where(
				and(eq(tableKalenderPendidikan.id, id), eq(tableKalenderPendidikan.sekolahId, sekolahId))
			);

		return { message: 'Agenda kalender berhasil dihapus.' };
	},
	deleteSelectedAgenda: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus kalender pendidikan.' });
		}

		const formData = await request.formData();
		const ids = formData
			.getAll('ids')
			.map((value) => nullablePositiveInteger(value))
			.filter((value): value is number => Boolean(value));
		if (!ids.length) return fail(400, { fail: 'Pilih minimal satu agenda kalender.' });

		await db
			.delete(tableKalenderPendidikan)
			.where(
				and(
					eq(tableKalenderPendidikan.sekolahId, sekolahId),
					inArray(tableKalenderPendidikan.id, ids)
				)
			);

		return { message: `${ids.length} agenda kalender berhasil dihapus.` };
	}
};
