/* eslint-disable @typescript-eslint/no-explicit-any -- ExcelJS belum menyediakan tipe lengkap untuk API runtime. */
import db from '$lib/server/db';
import { normalizeJadwalKegiatanKode } from '$lib/jadwal-slots';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureJadwalKurikulumSchema } from '$lib/server/db/ensure-jadwal-kurikulum';
import { ensureJadwalKegiatanTerintegrasi } from '$lib/server/db/reconcile-jadwal-kegiatan';
import {
	tableJadwalJam,
	tableJadwalKegiatan,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableJadwalTemplate,
	tableKelas
} from '$lib/server/db/schema';
import {
	ensureJadwalPelajaranTemplate,
	inferKelasJadwalJenjang,
	JADWAL_JENIS_LABELS,
	mapelSesuaiJenjang,
	selectJadwalContext,
	type JadwalJenis,
	type JadwalJenjang
} from '$lib/server/jadwal';
import { and, asc, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'] as const;
const HARI_LABEL = Object.fromEntries(
	HARI.map((hari) => [hari, hari[0].toUpperCase() + hari.slice(1)])
);
const AGAMA_MAPEL_NAMES = new Set([
	'Pendidikan Agama dan Budi Pekerti',
	'Pendidikan Agama Islam dan Budi Pekerti',
	'Pendidikan Agama Kristen dan Budi Pekerti',
	'Pendidikan Agama Katolik dan Budi Pekerti',
	'Pendidikan Agama Buddha dan Budi Pekerti',
	'Pendidikan Agama Hindu dan Budi Pekerti',
	'Pendidikan Agama Konghuchu dan Budi Pekerti'
]);

export type JadwalExcelRow = {
	hari: string;
	jamKe: number;
	kelasId: number;
	kelas: string;
	kode: string;
};

function textValue(value: unknown) {
	if (value == null) return '';
	if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
	if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
	return String(value).trim();
}

function normalize(value: unknown) {
	return textValue(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeKode(value: unknown) {
	return textValue(value).toUpperCase().trim();
}

export function inferJadwalJenjang(kelas: { nama: string; fase?: string | null }): JadwalJenjang {
	return inferKelasJadwalJenjang(kelas);
}

export async function loadJadwalExcelContext(
	sekolahId: number,
	params: { tahunAjaranId?: string | null; jenis?: string | null }
) {
	await ensureJadwalKurikulumSchema();
	await ensureJadwalKegiatanTerintegrasi();
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const context = selectJadwalContext(academic, params);
	if (!context.tahunAjaranId) throw new Error('Tahun ajaran belum tersedia.');
	const selectedYear = academic.tahunAjaranList.find((item) => item.id === context.tahunAjaranId)!;
	const classSemesterId =
		context.semesterId ??
		selectedYear.semester.find((semester) => semester.tipe === 'ganjil')?.id ??
		null;
	const scheduleTemplate = await ensureJadwalPelajaranTemplate(sekolahId, {
		tahunAjaranId: context.tahunAjaranId,
		jenis: context.jenis,
		semesterId: context.semesterId
	});
	const templates = await db.query.tableJadwalTemplate.findMany({
		columns: { id: true },
		where: and(
			eq(tableJadwalTemplate.sekolahId, sekolahId),
			eq(tableJadwalTemplate.tahunAjaranId, context.tahunAjaranId),
			eq(tableJadwalTemplate.jenis, context.jenis)
		)
	});
	const templateIds = templates.map((template) => template.id);
	const [kelas, mapel, kegiatan, jadwal, jam] = await Promise.all([
		db.query.tableKelas.findMany({
			where: classSemesterId
				? and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, classSemesterId))
				: eq(tableKelas.sekolahId, sekolahId),
			columns: { id: true, nama: true, fase: true },
			orderBy: [asc(tableKelas.nama)]
		}),
		db.query.tableJadwalMapel.findMany({
			where: eq(tableJadwalMapel.sekolahId, sekolahId),
			with: { guru: { columns: { nama: true } } },
			orderBy: [asc(tableJadwalMapel.kode)]
		}),
		db.query.tableJadwalKegiatan.findMany({
			where: eq(tableJadwalKegiatan.sekolahId, sekolahId),
			orderBy: [asc(tableJadwalKegiatan.kode)]
		}),
		db.query.tableJadwalPelajaran.findMany({
			where: and(
				eq(tableJadwalPelajaran.sekolahId, sekolahId),
				eq(tableJadwalPelajaran.templateId, scheduleTemplate.id)
			),
			orderBy: [asc(tableJadwalPelajaran.hari), asc(tableJadwalPelajaran.jamKe)]
		}),
		templateIds.length
			? db.query.tableJadwalJam.findMany({
					where: and(
						eq(tableJadwalJam.sekolahId, sekolahId),
						inArray(tableJadwalJam.templateId, templateIds)
					),
					orderBy: [asc(tableJadwalJam.urutan), asc(tableJadwalJam.jamKe)]
				})
			: []
	]);
	const codes = [
		...mapel
			.filter((item) => item.aktif && item.kode)
			.map((item) => ({
				kode: AGAMA_MAPEL_NAMES.has(item.nama) ? 'PAPB' : normalizeKode(item.kode),
				nama: item.nama,
				tipe: 'Mata Pelajaran',
				detail: item.guru?.nama ?? '',
				jenjang: item.jenjang
			})),
		...kegiatan
			.filter((item) => item.aktif && item.kode)
			.map((item) => ({
				kode: normalizeKode(item.kode),
				nama: item.nama,
				tipe: 'Kegiatan Non-Mapel',
				detail: item.kategori,
				jenjang: 'semua' as const
			}))
	];
	return {
		context,
		tahunAjaranNama: selectedYear.nama,
		jenisLabel: JADWAL_JENIS_LABELS[context.jenis as JadwalJenis],
		kelas: kelas.map((item) => ({ ...item, jenjang: inferJadwalJenjang(item) })),
		codes,
		jadwal,
		jam
	};
}

function styleHeader(row: any) {
	row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
	row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
	row.alignment = { vertical: 'middle', horizontal: 'center' };
	row.height = 24;
}

export async function buildJadwalWorkbook(
	data: Awaited<ReturnType<typeof loadJadwalExcelContext>>,
	mode: 'template' | 'export'
) {
	const workbook = new ExcelJS.Workbook() as any;
	workbook.creator = 'Rapkumer';
	const sheet = workbook.addWorksheet('Jadwal Pelajaran', {
		views: [{ state: 'frozen', ySplit: 4, showGridLines: false }]
	});
	sheet.getColumn(1).width = 14;
	sheet.getColumn(2).width = 10;
	sheet.getColumn(3).width = 24;
	sheet.getColumn(4).width = 18;
	sheet.mergeCells('A1:D1');
	sheet.getCell('A1').value =
		mode === 'template' ? 'TEMPLATE JADWAL PELAJARAN' : 'EXPORT JADWAL PELAJARAN';
	sheet.getCell('A1').font = { bold: true, size: 16 };
	sheet.getCell('A1').alignment = { horizontal: 'center' };
	sheet.mergeCells('A2:D2');
	sheet.getCell('A2').value = `${data.tahunAjaranNama} | ${data.jenisLabel}`;
	sheet.getCell('A2').alignment = { horizontal: 'center' };
	sheet.addRow([]);
	styleHeader(sheet.addRow(['Hari', 'Jam Ke', 'Kelas', 'Kode']));
	const kelasById = new Map(data.kelas.map((item) => [item.id, item]));
	let rows: JadwalExcelRow[];
	if (mode === 'export') {
		rows = data.jadwal.map((item) => ({
			hari: item.hari,
			jamKe: item.jamKe,
			kelasId: item.kelasId,
			kelas: kelasById.get(item.kelasId)?.nama ?? `Kelas ${item.kelasId}`,
			kode: item.kodeKegiatan
		}));
	} else {
		rows = [];
		for (const kelas of data.kelas) {
			for (const hari of HARI) {
				const slots = data.jam.filter(
					(slot) => slot.aktif && slot.jenjang === kelas.jenjang && slot.hari === hari
				);
				const jamKeList = slots.length
					? [...new Set(slots.map((slot) => slot.jamKe))]
					: hari === 'sabtu'
						? []
						: Array.from({ length: 8 }, (_, index) => index + 1);
				for (const jamKe of jamKeList)
					rows.push({ hari, jamKe, kelasId: kelas.id, kelas: kelas.nama, kode: '' });
			}
		}
	}
	const order = new Map<string, number>(HARI.map((hari, index) => [hari, index]));
	rows.sort(
		(a, b) =>
			(order.get(a.hari) ?? 99) - (order.get(b.hari) ?? 99) ||
			a.jamKe - b.jamKe ||
			a.kelas.localeCompare(b.kelas)
	);
	for (const item of rows)
		sheet.addRow([HARI_LABEL[item.hari] ?? item.hari, item.jamKe, item.kelas, item.kode]);
	sheet.autoFilter = { from: 'A4', to: 'D4' };
	const reference = workbook.addWorksheet('Referensi', {
		views: [{ state: 'frozen', ySplit: 1, showGridLines: false }]
	});
	reference.getColumn(1).width = 20;
	reference.getColumn(2).width = 42;
	reference.getColumn(3).width = 24;
	reference.getColumn(4).width = 30;
	styleHeader(reference.addRow(['Kode', 'Nama', 'Jenis', 'Guru/Kategori']));
	for (const item of data.codes) reference.addRow([item.kode, item.nama, item.tipe, item.detail]);
	reference.addRow([]);
	styleHeader(reference.addRow(['Kelas', 'ID', 'Jenjang', 'Keterangan']));
	for (const kelas of data.kelas)
		reference.addRow([
			kelas.nama,
			kelas.id,
			kelas.jenjang.toUpperCase(),
			'Gunakan nama kelas persis seperti ini'
		]);
	return workbook;
}

export async function parseJadwalWorkbook(
	file: File,
	data: Awaited<ReturnType<typeof loadJadwalExcelContext>>
) {
	const workbook = new ExcelJS.Workbook() as any;
	await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
	const sheet = workbook.getWorksheet('Jadwal Pelajaran') ?? workbook.worksheets[0];
	if (!sheet) throw new Error('File Excel tidak memiliki worksheet.');
	let headerRow = 0;
	let columns = { hari: 0, jam: 0, kelas: 0, kode: 0 };
	for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 12); rowNumber += 1) {
		const row = sheet.getRow(rowNumber);
		const found = { hari: 0, jam: 0, kelas: 0, kode: 0 };
		for (let column = 1; column <= row.cellCount; column += 1) {
			const header = normalize(row.getCell(column).value);
			if (header === 'hari') found.hari = column;
			if (header === 'jam ke' || header === 'jam') found.jam = column;
			if (header === 'kelas') found.kelas = column;
			if (header === 'kode' || header === 'kode kegiatan') found.kode = column;
		}
		if (found.hari && found.jam && found.kelas && found.kode) {
			headerRow = rowNumber;
			columns = found;
			break;
		}
	}
	if (!headerRow) throw new Error('Header Hari, Jam Ke, Kelas, dan Kode tidak ditemukan.');
	const kelasByName = new Map(data.kelas.map((item) => [normalize(item.nama), item]));
	const kelasById = new Map(data.kelas.map((item) => [String(item.id), item]));
	const codesByValue = new Map<string, typeof data.codes>();
	for (const item of data.codes) {
		const group = codesByValue.get(item.kode) ?? [];
		group.push(item);
		codesByValue.set(item.kode, group);
	}
	const seen = new Set<string>();
	const validRows: JadwalExcelRow[] = [];
	const invalidRows: Array<{
		rowNumber: number;
		hari: string;
		jamKe: string;
		kelas: string;
		kode: string;
		reason: string;
	}> = [];
	for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
		const row = sheet.getRow(rowNumber);
		const hariRaw = normalize(row.getCell(columns.hari).value);
		const jamRaw = textValue(row.getCell(columns.jam).value);
		const kelasRaw = textValue(row.getCell(columns.kelas).value);
		const rawKode = normalizeKode(row.getCell(columns.kode).value);
		const kegiatanKode = normalizeJadwalKegiatanKode(row.getCell(columns.kode).value);
		const kode = codesByValue.has(kegiatanKode) ? kegiatanKode : rawKode;
		if (!hariRaw && !jamRaw && !kelasRaw && !kode) continue;
		if (!kode) continue;
		const hari = HARI.find((item) => item === hariRaw) ?? '';
		const jamKe = Number.parseInt(jamRaw, 10);
		const kelas = kelasByName.get(normalize(kelasRaw)) ?? kelasById.get(kelasRaw);
		let reason = '';
		if (!hari) reason = 'Hari tidak dikenali';
		else if (!Number.isInteger(jamKe) || jamKe < 1 || jamKe > 30) reason = 'Jam ke tidak valid';
		else if (!kelas) reason = 'Kelas tidak ditemukan pada tahun/semester ini';
		else if (!codesByValue.has(kode))
			reason = 'Kode tidak ditemukan pada Data Mata Pelajaran atau Kegiatan Non-Mapel';
		else if (
			kelas &&
			!codesByValue.get(kode)!.some((item) => mapelSesuaiJenjang(item.jenjang, kelas.jenjang))
		)
			reason = `Mata pelajaran ${kode} tidak tersedia untuk jenjang ${kelas.jenjang.toUpperCase()}`;
		else if (
			kelas &&
			!data.jam.some(
				(slot) =>
					slot.aktif && slot.jenjang === kelas.jenjang && slot.hari === hari && slot.jamKe === jamKe
			)
		)
			reason = `Jam ke-${jamKe} tidak aktif untuk jenjang ${kelas.jenjang.toUpperCase()}`;
		const key = kelas ? `${hari}|${jamKe}|${kelas.id}` : '';
		if (!reason && seen.has(key)) reason = 'Slot kelas duplikat dalam file';
		if (reason || !kelas) {
			invalidRows.push({ rowNumber, hari: hariRaw, jamKe: jamRaw, kelas: kelasRaw, kode, reason });
			continue;
		}
		seen.add(key);
		validRows.push({ hari, jamKe, kelasId: kelas.id, kelas: kelas.nama, kode });
	}
	return { validRows, invalidRows, total: validRows.length + invalidRows.length };
}
