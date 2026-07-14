import {
	buildKelasAccessWhere,
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	resolveKelasId,
	todayLocalDate
} from '$lib/server/absensi-digital';
import {
	ABSENSI_KEGIATAN_STATUS_LABELS,
	ABSENSI_KEGIATAN_STATUSES,
	applyAutoAlfaKegiatan,
	canEditAbsensiKegiatan,
	canSyncAbsensiKegiatanToRapor,
	listLocalDatesInRange,
	loadKegiatanAbsensiOptions,
	parseAbsensiKegiatanStatus,
	requireAbsensiKegiatanAccess,
	syncKegiatanMasukRaporToKehadiran
} from '$lib/server/absensi-kegiatan';
import db from '$lib/server/db';
import {
	tableAbsensiKegiatan,
	tableKegiatanAbsensi,
	tableKelas,
	tableMurid
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, between, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';

type StatusKey = (typeof ABSENSI_KEGIATAN_STATUSES)[number];
type ExcelRowLike = {
	getCell(index: number): { value: unknown };
	eachCell(callback: (cell: { value: unknown }, colNumber: number) => void): void;
};
type ExcelWorksheetLike = {
	rowCount: number;
	getRow(index: number): ExcelRowLike;
	eachRow(callback: (row: ExcelRowLike, rowNumber: number) => void): void;
};
type ExcelWorkbookLike = {
	xlsx: { load(buffer: Buffer): Promise<unknown> };
	getWorksheet(name: string): ExcelWorksheetLike | undefined;
	worksheets: ExcelWorksheetLike[];
};

function emptySummary() {
	return Object.fromEntries(ABSENSI_KEGIATAN_STATUSES.map((status) => [status, 0])) as Record<
		StatusKey,
		number
	>;
}

function normalizeDateRange(valueAwal: string | null, valueAkhir: string | null) {
	const today = todayLocalDate();
	const tanggalAwal = normalizeDateInput(valueAwal, today);
	const tanggalAkhir = normalizeDateInput(valueAkhir, tanggalAwal);
	return tanggalAwal <= tanggalAkhir
		? { tanggalAwal, tanggalAkhir }
		: { tanggalAwal: tanggalAkhir, tanggalAkhir: tanggalAwal };
}

function normalizeImportText(value: unknown) {
	if (value == null) return '';
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === 'object' && 'text' in value) {
		return normalizeImportText((value as { text?: unknown }).text);
	}
	if (typeof value === 'object' && 'result' in value) {
		return normalizeImportText((value as { result?: unknown }).result);
	}
	return String(value).trim();
}

function normalizeImportDate(value: unknown) {
	const raw = normalizeImportText(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	if (slashMatch) {
		const [, day, month, year] = slashMatch;
		return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
	}
	return null;
}

function normalizeStatusText(value: unknown) {
	const raw = normalizeImportText(value).toLowerCase().replace(/\s+/g, '_');
	const byLabel = Object.entries(ABSENSI_KEGIATAN_STATUS_LABELS).find(
		([, label]) => label.toLowerCase() === raw.replace(/_/g, ' ')
	);
	return parseAbsensiKegiatanStatus(byLabel?.[0] ?? raw);
}

function parseIntegerCell(value: unknown) {
	const raw = normalizeImportText(value);
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIdentity(value: unknown) {
	return normalizeImportText(value).toLowerCase();
}

export async function load({ locals, url }) {
	requireAbsensiKegiatanAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const { tanggalAwal, tanggalAkhir } = normalizeDateRange(
		url.searchParams.get('tanggal_awal'),
		url.searchParams.get('tanggal_akhir')
	);
	const requestedKelasId = parsePositiveInteger(url.searchParams.get('kelas_id'));
	const requestedKegiatanId = parsePositiveInteger(url.searchParams.get('kegiatan_id'));
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasId = resolveKelasId(kelasList, requestedKelasId);
	const kegiatanList = await loadKegiatanAbsensiOptions(sekolahId);
	const kegiatanId =
		requestedKegiatanId && kegiatanList.some((kegiatan) => kegiatan.id === requestedKegiatanId)
			? requestedKegiatanId
			: null;

	if (!academic.activeSemesterId || !kelasId) {
		return {
			meta: { title: 'Rekap Kegiatan' } satisfies PageMeta,
			tanggalAwal,
			tanggalAkhir,
			activeSemesterId: academic.activeSemesterId,
			kelasId,
			kelasList,
			kegiatanId,
			kegiatanList,
			summary: emptySummary(),
			rows: [],
			detailRows: [],
			canSyncRapor: canSyncAbsensiKegiatanToRapor(locals.user),
			statusLabels: ABSENSI_KEGIATAN_STATUS_LABELS
		};
	}

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, academic.activeSemesterId),
			eq(tableMurid.kelasId, kelasId)
		),
		orderBy: asc(tableMurid.nama)
	});
	const muridIds = muridList.map((murid) => murid.id);
	let autoAlfaInserted = 0;
	if (muridIds.length) {
		const kegiatanIds = kegiatanId ? [kegiatanId] : kegiatanList.map((kegiatan) => kegiatan.id);
		for (const tanggal of listLocalDatesInRange(tanggalAwal, tanggalAkhir)) {
			const result = await applyAutoAlfaKegiatan({
				sekolahId,
				semesterId: academic.activeSemesterId,
				kelasId,
				tanggal,
				kegiatanIds
			});
			autoAlfaInserted += result.inserted;
		}
	}
	const absensiRows = muridIds.length
		? await db.query.tableAbsensiKegiatan.findMany({
				where: and(
					eq(tableAbsensiKegiatan.sekolahId, sekolahId),
					eq(tableAbsensiKegiatan.semesterId, academic.activeSemesterId),
					eq(tableAbsensiKegiatan.kelasId, kelasId),
					kegiatanId ? eq(tableAbsensiKegiatan.kegiatanId, kegiatanId) : undefined,
					between(tableAbsensiKegiatan.tanggal, tanggalAwal, tanggalAkhir),
					inArray(tableAbsensiKegiatan.muridId, muridIds)
				)
			})
		: [];

	const summary = emptySummary();
	const byMurid = new Map<number, Record<StatusKey, number>>();
	const kegiatanNameById = new Map(kegiatanList.map((kegiatan) => [kegiatan.id, kegiatan.nama]));
	const detailByDateKegiatan = new Map<
		string,
		{ tanggal: string; kegiatanId: number; kegiatanNama: string; counts: Record<StatusKey, number> }
	>();
	for (const murid of muridList) byMurid.set(murid.id, emptySummary());
	for (const row of absensiRows) {
		summary[row.status] += 1;
		const counts = byMurid.get(row.muridId);
		if (counts) counts[row.status] += 1;
		const key = `${row.tanggal}:${row.kegiatanId}`;
		const detail = detailByDateKegiatan.get(key) ?? {
			tanggal: row.tanggal,
			kegiatanId: row.kegiatanId,
			kegiatanNama: kegiatanNameById.get(row.kegiatanId) ?? 'Kegiatan',
			counts: emptySummary()
		};
		detail.counts[row.status] += 1;
		detailByDateKegiatan.set(key, detail);
	}

	const rows = muridList.map((murid, index) => ({
		no: index + 1,
		id: murid.id,
		nama: murid.nama,
		nis: murid.nis,
		nisn: murid.nisn,
		counts: byMurid.get(murid.id) ?? emptySummary()
	}));
	const detailRows = Array.from(detailByDateKegiatan.values()).sort((a, b) => {
		const byDate = a.tanggal.localeCompare(b.tanggal);
		if (byDate !== 0) return byDate;
		return a.kegiatanNama.localeCompare(b.kegiatanNama);
	});

	return {
		meta: { title: 'Rekap Kegiatan' } satisfies PageMeta,
		tanggalAwal,
		tanggalAkhir,
		activeSemesterId: academic.activeSemesterId,
		kelasId,
		kelasList,
		kegiatanId,
		kegiatanList,
		summary,
		rows,
		detailRows,
		autoAlfaInserted,
		canSyncRapor: canSyncAbsensiKegiatanToRapor(locals.user),
		statusLabels: ABSENSI_KEGIATAN_STATUS_LABELS
	};
}

export const actions = {
	importExcel: async ({ request, locals }) => {
		requireAbsensiKegiatanAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const file = formData.get('file');
		const fallbackKelasId = parsePositiveInteger(formData.get('kelasId'));
		const fallbackSemesterId = parsePositiveInteger(formData.get('semesterId'));
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { fail: 'File Excel absensi belum dipilih.' });
		}
		if (file.size > 4 * 1024 * 1024) {
			return fail(400, { fail: 'Ukuran file melebihi 4MB.' });
		}
		if (!file.name.toLowerCase().endsWith('.xlsx')) {
			return fail(400, { fail: 'Format file harus .xlsx.' });
		}
		if (!fallbackSemesterId) {
			return fail(400, { fail: 'Semester aktif tidak tersedia.' });
		}

		const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
		const semesterId = academic.activeSemesterId ?? fallbackSemesterId;
		if (semesterId !== fallbackSemesterId) {
			return fail(400, { fail: 'Semester file tidak sesuai dengan semester aktif.' });
		}

		const accessibleKelasIds = new Set(kelasList.map((kelas) => kelas.id));
		if (fallbackKelasId && !accessibleKelasIds.has(fallbackKelasId)) {
			return fail(403, { fail: 'Anda tidak memiliki akses ke kelas pada file ini.' });
		}

		let workbook: ExcelWorkbookLike;
		try {
			workbook = new ExcelJS.Workbook() as unknown as ExcelWorkbookLike;
			await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
		} catch (error) {
			console.error('Gagal membaca import absensi kegiatan', error);
			return fail(400, { fail: 'Gagal membaca file Excel. Gunakan template absensi terbaru.' });
		}

		const sheet = workbook.getWorksheet('Import Absensi') ?? workbook.worksheets[0];
		if (!sheet) return fail(400, { fail: 'Sheet Import Absensi tidak ditemukan.' });

		let headerRowNumber = 0;
		sheet.eachRow((row: ExcelRowLike, rowNumber: number) => {
			if (headerRowNumber) return;
			const firstCell = normalizeImportText(row.getCell(1).value).toLowerCase();
			if (firstCell === 'tanggal') headerRowNumber = rowNumber;
		});
		if (!headerRowNumber) {
			return fail(400, { fail: 'Header kolom tidak ditemukan. Gunakan template absensi terbaru.' });
		}

		const headerRow = sheet.getRow(headerRowNumber);
		const headerMap = new Map<string, number>();
		headerRow.eachCell((cell: { value: unknown }, colNumber: number) => {
			const header = normalizeImportText(cell.value).toLowerCase().replace(/\s+/g, '_');
			if (header) headerMap.set(header, colNumber);
		});
		const column = (name: string) => headerMap.get(name) ?? 0;
		const requiredColumns = ['tanggal', 'murid_id', 'status'];
		const missingColumn = requiredColumns.find((name) => !column(name));
		if (missingColumn) {
			return fail(400, { fail: `Kolom ${missingColumn.replace(/_/g, ' ')} belum ada di file.` });
		}

		const muridRows = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true, nis: true, nisn: true, kelasId: true, semesterId: true },
			where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, semesterId))
		});
		const muridById = new Map(muridRows.map((murid) => [murid.id, murid]));
		const muridByNis = new Map(
			muridRows.filter((murid) => murid.nis).map((murid) => [normalizeIdentity(murid.nis), murid])
		);
		const muridByNisn = new Map(
			muridRows.filter((murid) => murid.nisn).map((murid) => [normalizeIdentity(murid.nisn), murid])
		);
		const muridByName = new Map(muridRows.map((murid) => [normalizeIdentity(murid.nama), murid]));

		const kegiatanRows = await db.query.tableKegiatanAbsensi.findMany({
			where: and(
				eq(tableKegiatanAbsensi.sekolahId, sekolahId),
				eq(tableKegiatanAbsensi.aktif, true)
			)
		});
		const kegiatanById = new Map(kegiatanRows.map((kegiatan) => [kegiatan.id, kegiatan]));
		const kegiatanByName = new Map(
			kegiatanRows.map((kegiatan) => [normalizeIdentity(kegiatan.nama), kegiatan])
		);
		const kegiatanByKode = new Map(
			kegiatanRows.map((kegiatan) => [normalizeIdentity(kegiatan.kode), kegiatan])
		);

		let imported = 0;
		let updated = 0;
		let inserted = 0;
		let skipped = 0;
		const errors: string[] = [];
		const now = new Date().toISOString();

		for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
			const row = sheet.getRow(rowNumber);
			const tanggal = normalizeImportDate(row.getCell(column('tanggal')).value);
			const status = normalizeStatusText(row.getCell(column('status')).value);
			const statusRaw = normalizeImportText(row.getCell(column('status')).value);
			if (!tanggal && !statusRaw) continue;
			if (!tanggal || !status) {
				skipped += 1;
				if (errors.length < 5) errors.push(`Baris ${rowNumber}: tanggal atau status tidak valid.`);
				continue;
			}

			const rowKelasId = parseIntegerCell(row.getCell(column('kelas_id')).value) ?? fallbackKelasId;
			const rowKegiatanId = parseIntegerCell(row.getCell(column('kegiatan_id')).value);
			const kegiatanName = normalizeIdentity(row.getCell(column('kegiatan')).value);
			const kegiatanKode = normalizeIdentity(row.getCell(column('kode_kegiatan')).value);
			const kegiatan =
				(rowKegiatanId ? kegiatanById.get(rowKegiatanId) : undefined) ??
				(kegiatanKode ? kegiatanByKode.get(kegiatanKode) : undefined) ??
				(kegiatanName ? kegiatanByName.get(kegiatanName) : undefined);
			if (!rowKelasId || !accessibleKelasIds.has(rowKelasId) || !kegiatan) {
				skipped += 1;
				if (errors.length < 5) errors.push(`Baris ${rowNumber}: kelas atau kegiatan tidak valid.`);
				continue;
			}
			if (!canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit)) {
				skipped += 1;
				if (errors.length < 5) errors.push(`Baris ${rowNumber}: tidak punya akses edit kegiatan.`);
				continue;
			}

			const muridId = parseIntegerCell(row.getCell(column('murid_id')).value);
			const nis = normalizeIdentity(row.getCell(column('nis')).value);
			const nisn = normalizeIdentity(row.getCell(column('nisn')).value);
			const nama = normalizeIdentity(row.getCell(column('nama')).value);
			const murid =
				(muridId ? muridById.get(muridId) : undefined) ??
				(nis ? muridByNis.get(nis) : undefined) ??
				(nisn ? muridByNisn.get(nisn) : undefined) ??
				(nama ? muridByName.get(nama) : undefined);
			if (!murid || murid.kelasId !== rowKelasId || murid.semesterId !== semesterId) {
				skipped += 1;
				if (errors.length < 5) errors.push(`Baris ${rowNumber}: siswa tidak ditemukan di kelas.`);
				continue;
			}

			const catatan = normalizeImportText(row.getCell(column('catatan')).value) || null;
			const existing = await db.query.tableAbsensiKegiatan.findFirst({
				columns: { id: true },
				where: and(
					eq(tableAbsensiKegiatan.muridId, murid.id),
					eq(tableAbsensiKegiatan.kegiatanId, kegiatan.id),
					eq(tableAbsensiKegiatan.tanggal, tanggal)
				)
			});
			if (existing) {
				await db
					.update(tableAbsensiKegiatan)
					.set({
						sekolahId,
						semesterId,
						kelasId: rowKelasId,
						status,
						metode: 'manual',
						autoAlfa: false,
						petugasUserId: locals.user.id,
						catatan,
						updatedAt: now
					})
					.where(eq(tableAbsensiKegiatan.id, existing.id));
				updated += 1;
			} else {
				await db.insert(tableAbsensiKegiatan).values({
					sekolahId,
					semesterId,
					kelasId: rowKelasId,
					muridId: murid.id,
					kegiatanId: kegiatan.id,
					tanggal,
					status,
					metode: 'manual',
					autoAlfa: false,
					petugasUserId: locals.user.id,
					catatan,
					createdAt: now,
					updatedAt: now
				});
				inserted += 1;
			}
			imported += 1;
		}

		const warning = errors.length ? ` Catatan: ${errors.join(' ')}` : '';
		return {
			message: `Import absensi selesai. Tersimpan: ${imported}, baru: ${inserted}, diperbarui: ${updated}, dilewati: ${skipped}.${warning}`
		};
	},
	syncRapor: async ({ request, locals }) => {
		requireAbsensiKegiatanAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canSyncAbsensiKegiatanToRapor(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki akses sinkronisasi kehadiran rapor.' });
		}

		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const { tanggalAwal, tanggalAkhir } = normalizeDateRange(
			formData.get('tanggalAwal')?.toString() ?? null,
			formData.get('tanggalAkhir')?.toString() ?? null
		);
		if (!semesterId || !kelasId) {
			return fail(400, { fail: 'Semester dan kelas wajib tersedia.' });
		}

		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(
				buildKelasAccessWhere(sekolahId, kelasId, locals.user),
				eq(tableKelas.semesterId, semesterId)
			)
		});
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const kegiatanList = await loadKegiatanAbsensiOptions(sekolahId);
		const kegiatanIds = kegiatanList.map((kegiatan) => kegiatan.id);
		for (const tanggal of listLocalDatesInRange(tanggalAwal, tanggalAkhir)) {
			await applyAutoAlfaKegiatan({
				sekolahId,
				semesterId,
				kelasId,
				tanggal,
				kegiatanIds
			});
		}

		const result = await syncKegiatanMasukRaporToKehadiran({
			sekolahId,
			semesterId,
			kelasId,
			tanggalAwal,
			tanggalAkhir
		});

		return {
			message: `Kehadiran rapor berhasil disinkronkan dari kegiatan masuk rapor untuk ${result.synced} siswa.`
		};
	}
};
