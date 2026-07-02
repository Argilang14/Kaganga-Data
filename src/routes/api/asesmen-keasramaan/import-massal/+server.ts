import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import {
	tableAsesmenKeasramaan,
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableMurid
} from '$lib/server/db/schema';
import {
	isEkstrakurikulerNilaiKategori,
	type EkstrakurikulerNilaiKategori
} from '$lib/ekstrakurikuler';
import { asc, eq } from 'drizzle-orm';

type Target = {
	keasramaanId: number;
	tujuanId: number;
};

type SystemRef = {
	code: number;
	matev: string;
	indikator: string;
	tujuan: string;
	target: Target;
};

type ParsedRef = {
	code: number;
	matev: string;
	detail: string;
};

type ExcelCellLike = { value: unknown };
type ExcelRowLike = {
	getCell(index: number): ExcelCellLike;
	eachCell(callback: (cell: ExcelCellLike, colNumber: number) => void): void;
};
type ExcelWorksheetLike = {
	getRow(index: number): ExcelRowLike;
	eachRow(callback: (row: ExcelRowLike, rowNumber: number) => void): void;
};
type ExcelWorkbookLike = {
	xlsx: { load(data: Buffer): Promise<void> };
	getWorksheet?(name: string): ExcelWorksheetLike | undefined;
	worksheets?: ExcelWorksheetLike[];
};
type ExcelJSLike = {
	Workbook: new () => ExcelWorkbookLike;
};

const CATEGORY_TEXT: Record<string, EkstrakurikulerNilaiKategori> = {
	'sangat baik': 'sangat-baik',
	'sangat-baik': 'sangat-baik',
	a: 'sangat-baik',
	baik: 'baik',
	b: 'baik',
	cukup: 'cukup',
	c: 'cukup',
	'perlu bimbingan': 'perlu-bimbingan',
	'perlu-bimbingan': 'perlu-bimbingan',
	d: 'perlu-bimbingan'
};

const MATEV_ALIASES: Record<string, string[]> = {
	'perilaku hidup bersih dan sehat phbs': ['perilaku hidup sehat', 'kebersihan'],
	'perilaku hidup bersih dan sehat': ['perilaku hidup sehat', 'kebersihan'],
	phbs: ['perilaku hidup sehat', 'kebersihan'],
	'kepedulian dan empati': ['empati'],
	'ketrampilan sosial': ['keterampilan sosial']
};

function cellText(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') {
		const richText = (value as { richText?: Array<{ text?: string }> }).richText;
		if (Array.isArray(richText)) return richText.map((item) => item.text ?? '').join('');
		const text = (value as { text?: unknown }).text;
		if (text != null) return String(text);
		const result = (value as { result?: unknown }).result;
		if (result != null) return String(result);
	}
	return String(value);
}

function normalize(value: unknown) {
	return cellText(value)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\([^)]*\)/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function tokenScore(a: string, b: string) {
	const aTokens = new Set(a.split(' ').filter(Boolean));
	const bTokens = new Set(b.split(' ').filter(Boolean));
	if (!aTokens.size || !bTokens.size) return 0;
	let same = 0;
	for (const token of aTokens) {
		if (bTokens.has(token)) same++;
	}
	return same / Math.max(aTokens.size, bTokens.size);
}

function kategoriFromValue(value: unknown): EkstrakurikulerNilaiKategori | null {
	const text = normalize(value);
	if (text) {
		const category = CATEGORY_TEXT[text];
		if (category) return category;
	}

	const numberValue =
		typeof value === 'number'
			? value
			: Number(
					cellText(value)
						.replace(',', '.')
						.replace(/[^0-9.-]/g, '')
				);
	if (!Number.isFinite(numberValue)) return null;
	if (numberValue >= 90) return 'sangat-baik';
	if (numberValue >= 80) return 'baik';
	if (numberValue >= 70) return 'cukup';
	return 'perlu-bimbingan';
}

function candidateMatevNames(matev: string) {
	const key = normalize(matev);
	return [key, ...(MATEV_ALIASES[key] ?? []).map(normalize)].filter(Boolean);
}

function findTargets(ref: ParsedRef, systemRefs: SystemRef[]) {
	const refMatevCandidates = candidateMatevNames(ref.matev);
	const refDetail = normalize(ref.detail);
	if (!refDetail) return [];

	const sameMatev = systemRefs.filter((item) => refMatevCandidates.includes(normalize(item.matev)));
	const scoped = sameMatev.length ? sameMatev : systemRefs;

	const exactIndicator = scoped.filter((item) => normalize(item.indikator) === refDetail);
	if (exactIndicator.length) return uniqueTargets(exactIndicator.map((item) => item.target));

	const exactTujuan = scoped.filter((item) => normalize(item.tujuan) === refDetail);
	if (exactTujuan.length) return uniqueTargets(exactTujuan.map((item) => item.target));

	const contains = scoped.filter((item) => {
		const indicator = normalize(item.indikator);
		const tujuan = normalize(item.tujuan);
		return (
			indicator.includes(refDetail) ||
			refDetail.includes(indicator) ||
			tujuan.includes(refDetail) ||
			refDetail.includes(tujuan)
		);
	});
	if (contains.length) return uniqueTargets(contains.map((item) => item.target));

	const scored = scoped
		.map((item) => ({
			item,
			score: Math.max(
				tokenScore(refDetail, normalize(item.indikator)),
				tokenScore(refDetail, normalize(item.tujuan))
			)
		}))
		.filter((item) => item.score >= 0.65)
		.sort((a, b) => b.score - a.score);

	return uniqueTargets(scored.slice(0, 3).map((item) => item.item.target));
}

function uniqueTargets(targets: Target[]) {
	const seen = new Set<string>();
	const result: Target[] = [];
	for (const target of targets) {
		const key = `${target.keasramaanId}:${target.tujuanId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(target);
	}
	return result;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const formData = await request.formData();
		const kelasIdRaw = formData.get('kelasId')?.toString();
		const file = formData.get('file') as File | null;

		if (!kelasIdRaw || !locals.sekolah?.id || !file) {
			return json({ success: false, message: 'Data tidak lengkap' }, { status: 400 });
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			return json({ success: false, message: 'ID kelas tidak valid' }, { status: 400 });
		}

		const muridList = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true, nisn: true },
			where: eq(tableMurid.kelasId, kelasId)
		});
		const muridByNisn = new Map<string, number>();
		for (const murid of muridList) {
			const nisn = normalize(murid.nisn);
			if (nisn) muridByNisn.set(nisn, murid.id);
		}
		const muridByName = new Map<string, number>(
			muridList.map((murid) => [normalize(murid.nama), murid.id])
		);

		const keasramaanList = await db.query.tableKeasramaan.findMany({
			columns: { id: true, nama: true },
			where: eq(tableKeasramaan.kelasId, kelasId),
			orderBy: asc(tableKeasramaan.createdAt),
			with: {
				indikator: {
					columns: { id: true, deskripsi: true },
					orderBy: asc(tableKeasramaanIndikator.createdAt),
					with: {
						tujuan: {
							columns: { id: true, deskripsi: true }
						}
					}
				}
			}
		});

		const systemRefs: SystemRef[] = [];
		for (const matev of keasramaanList) {
			for (const indikator of matev.indikator) {
				for (const tujuan of indikator.tujuan) {
					systemRefs.push({
						code: systemRefs.length + 1,
						matev: matev.nama,
						indikator: indikator.deskripsi,
						tujuan: tujuan.deskripsi,
						target: { keasramaanId: matev.id, tujuanId: tujuan.id }
					});
				}
			}
		}

		if (!systemRefs.length) {
			return json(
				{ success: false, message: 'Belum ada data mata evaluasi/TP keasramaan untuk kelas ini' },
				{ status: 400 }
			);
		}

		const arrayBuffer = await file.arrayBuffer();
		const ExcelJSModule = (await import('exceljs')).default ?? (await import('exceljs'));
		const ExcelJSImport = ExcelJSModule as unknown as ExcelJSLike;
		const workbook = new ExcelJSImport.Workbook();
		await workbook.xlsx.load(Buffer.from(arrayBuffer));

		const penilaian = workbook.getWorksheet?.('Penilaian') ?? workbook.worksheets?.[0] ?? null;
		const referensi = workbook.getWorksheet?.('Referensi') ?? null;

		if (!penilaian) {
			return json({ success: false, message: 'Sheet Penilaian tidak ditemukan' }, { status: 400 });
		}

		const parsedRefsByCode = new Map<number, ParsedRef>();
		if (referensi) {
			let currentMatev = '';
			referensi.eachRow((row, rowNumber) => {
				if (rowNumber <= 1) return;
				const code = Number(cellText(row.getCell(1).value).trim());
				const matev = cellText(row.getCell(2).value).trim();
				const detail = cellText(row.getCell(3).value).trim();
				if (matev) currentMatev = matev;
				if (!Number.isInteger(code) || !detail) return;
				parsedRefsByCode.set(code, { code, matev: currentMatev, detail });
			});
		}

		const targetByCode = new Map<number, Target[]>();
		const unmatchedRefs: string[] = [];
		for (const systemRef of systemRefs) {
			targetByCode.set(systemRef.code, [systemRef.target]);
		}
		for (const ref of parsedRefsByCode.values()) {
			const targets = findTargets(ref, systemRefs);
			if (targets.length) {
				targetByCode.set(ref.code, targets);
			} else {
				unmatchedRefs.push(`${ref.code}. ${ref.matev} - ${ref.detail}`);
				targetByCode.delete(ref.code);
			}
		}

		const headerRow = penilaian.getRow(1);
		const nilaiColumns: Array<{ code: number; col: number }> = [];
		headerRow.eachCell((cell, colNumber) => {
			const header = normalize(cell.value).replace(/\s+/g, '_');
			const match = header.match(/^(\d+)_nilai$/);
			if (!match) return;
			const code = Number(match[1]);
			if (Number.isInteger(code) && targetByCode.has(code)) {
				nilaiColumns.push({ code, col: colNumber });
			}
		});

		if (!nilaiColumns.length) {
			return json(
				{
					success: false,
					message: 'Tidak ada kolom *_nilai yang cocok dengan referensi keasramaan sistem'
				},
				{ status: 400 }
			);
		}

		const operations: Array<{
			muridId: number;
			keasramaanId: number;
			tujuanId: number;
			kategori: EkstrakurikulerNilaiKategori;
		}> = [];
		const skippedStudents: string[] = [];
		let filledRows = 0;

		penilaian.eachRow((row, rowNumber) => {
			if (rowNumber <= 2) return;
			const nisn = normalize(row.getCell(1).value);
			const nama = cellText(row.getCell(3).value).trim();
			const muridId = (nisn ? muridByNisn.get(nisn) : null) ?? muridByName.get(normalize(nama));
			if (!muridId) {
				if (nama || nisn) skippedStudents.push(nama || nisn);
				return;
			}

			let rowHasValue = false;
			for (const column of nilaiColumns) {
				const kategori = kategoriFromValue(row.getCell(column.col).value);
				if (!kategori || !isEkstrakurikulerNilaiKategori(kategori)) continue;
				const targets = targetByCode.get(column.code) ?? [];
				for (const target of targets) {
					operations.push({
						muridId,
						keasramaanId: target.keasramaanId,
						tujuanId: target.tujuanId,
						kategori
					});
					rowHasValue = true;
				}
			}
			if (rowHasValue) filledRows++;
		});

		const now = new Date().toISOString();
		let importedCount = 0;
		for (const op of operations) {
			await db
				.insert(tableAsesmenKeasramaan)
				.values({
					muridId: op.muridId,
					keasramaanId: op.keasramaanId,
					tujuanId: op.tujuanId,
					kategori: op.kategori,
					dinilaiPada: now
				})
				.onConflictDoUpdate({
					target: [
						tableAsesmenKeasramaan.muridId,
						tableAsesmenKeasramaan.keasramaanId,
						tableAsesmenKeasramaan.tujuanId
					],
					set: {
						kategori: op.kategori,
						dinilaiPada: now,
						updatedAt: now
					}
				});
			importedCount++;
		}

		const extras: string[] = [];
		if (unmatchedRefs.length) {
			extras.push(`Referensi tidak cocok: ${unmatchedRefs.slice(0, 6).join('; ')}`);
		}
		if (skippedStudents.length) {
			extras.push(`Siswa dilewati: ${skippedStudents.slice(0, 6).join(', ')}`);
		}

		return json({
			success: true,
			message: [
				`Import massal selesai. Nilai tersimpan: ${importedCount}, baris siswa terisi: ${filledRows}.`,
				...extras
			].join(' ')
		});
	} catch (err) {
		console.error('Import keasramaan massal error:', err);
		return json(
			{ success: false, message: 'Terjadi kesalahan saat memproses file massal' },
			{ status: 500 }
		);
	}
};
