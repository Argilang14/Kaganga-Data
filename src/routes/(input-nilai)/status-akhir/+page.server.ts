import db from '$lib/server/db';
import { ensureCatatanWaliSchema } from '$lib/server/db/ensure-catatan-wali';
import { tableMurid, tableStatusAkhirRapor } from '$lib/server/db/schema';
import { buildKelasContext } from '$lib/server/route-utils';
import { cookieNames } from '$lib/utils';
import { readBufferToAoA } from '$lib/utils/excel.js';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { writeAuditLog } from '$lib/server/audit-log';

const PER_PAGE = 20;
const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

function canManageStatusAkhir(user: App.Locals['user']) {
	if (!user) return false;
	return (
		user.type === 'admin' ||
		user.type === 'wali_kelas' ||
		user.permissions?.includes('rapor_manage') === true
	);
}

const STATUS_OPTIONS = [
	'Naik Kelas',
	'Tinggal Kelas',
	'Lulus',
	'Tidak Lulus',
	'Belum Ditetapkan'
] as const;

function normalizeText(value: unknown) {
	if (value == null) return '';
	if (typeof value === 'number') return String(value).trim();
	return String(value).trim();
}

function normalizeHeader(value: unknown) {
	return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDateInput(value: unknown) {
	const trimmed = normalizeText(value);
	if (!trimmed) return '';
	if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
	const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	if (slashMatch) {
		const [, day, month, year] = slashMatch;
		return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
	}
	return '';
}

function normalizeStatus(value: unknown) {
	const raw = normalizeText(value);
	if (!raw) return '';
	const found = STATUS_OPTIONS.find((option) => option.toLowerCase() === raw.toLowerCase());
	return found ?? null;
}

function getHeaderIndex(headers: string[], candidates: string[]) {
	return headers.findIndex((header) => candidates.some((candidate) => header === candidate));
}

export async function load({ locals, url, depends, parent }) {
	depends('app:status-akhir');
	await ensureCatatanWaliSchema();

	const parentData = await parent();
	const { sekolahId, kelasId, kelasIds, academicContext } = await buildKelasContext(
		locals,
		parentData,
		url
	);
	const searchRaw = url.searchParams.get('q')?.trim() ?? '';
	const search = searchRaw || null;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	if (!sekolahId || !kelasIds.length) {
		return {
			meta: { title: 'Status Akhir' },
			academicContext,
			statusOptions: STATUS_OPTIONS,
			daftarStatus: [],
			page: {
				kelasId,
				search,
				currentPage: 1,
				totalPages: 1,
				totalItems: 0,
				perPage: PER_PAGE
			}
		};
	}

	const filter = and(
		activeMuridFilter(),
		eq(tableMurid.sekolahId, sekolahId),
		kelasId ? eq(tableMurid.kelasId, Number(kelasId)) : inArray(tableMurid.kelasId, kelasIds),
		search ? sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE` : undefined
	);

	const [{ totalItems }] = await db
		.select({ totalItems: sql<number>`count(*)` })
		.from(tableMurid)
		.where(filter);

	const total = totalItems ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * PER_PAGE;

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	const rows = await db
		.select({
			id: tableMurid.id,
			nama: tableMurid.nama,
			status: tableStatusAkhirRapor.status,
			tanggalPenetapan: tableStatusAkhirRapor.tanggalPenetapan,
			catatan: tableStatusAkhirRapor.catatan,
			updatedAt: tableStatusAkhirRapor.updatedAt
		})
		.from(tableMurid)
		.leftJoin(tableStatusAkhirRapor, eq(tableMurid.id, tableStatusAkhirRapor.muridId))
		.where(filter)
		.orderBy(asc(tableMurid.nama))
		.limit(PER_PAGE)
		.offset(offset);

	const daftarStatus = rows.map((row, index) => ({
		id: row.id,
		nama: row.nama,
		status: row.status ?? '',
		tanggalPenetapan: row.tanggalPenetapan ?? '',
		catatan: row.catatan ?? '',
		updatedAt: row.updatedAt,
		no: offset + index + 1
	}));

	return {
		meta: { title: 'Status Akhir' },
		academicContext,
		statusOptions: STATUS_OPTIONS,
		daftarStatus,
		page: {
			kelasId,
			search,
			currentPage,
			totalPages,
			totalItems: total,
			perPage: PER_PAGE
		}
	};
}

export const actions = {
	save: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}
		if (!canManageStatusAkhir(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin mengubah status akhir rapor' });
		}

		await ensureCatatanWaliSchema();

		const formData = await request.formData();
		const muridId = Number(formData.get('muridId'));
		if (!Number.isInteger(muridId) || muridId <= 0) {
			return fail(400, { fail: 'Data murid tidak valid' });
		}

		const murid = await db.query.tableMurid.findFirst({
			columns: { id: true, nama: true },
			where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
		});

		if (!murid) {
			return fail(404, { fail: 'Murid tidak ditemukan' });
		}

		const statusRaw = formData.get('status');
		const status = typeof statusRaw === 'string' ? statusRaw.trim() : '';
		const tanggalPenetapan = normalizeDateInput(formData.get('tanggalPenetapan'));
		const catatanRaw = formData.get('catatan');
		const catatan = typeof catatanRaw === 'string' ? catatanRaw : '';
		const now = new Date().toISOString();
		const before = await db.query.tableStatusAkhirRapor.findFirst({
			where: eq(tableStatusAkhirRapor.muridId, muridId)
		});

		if (status && !STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])) {
			return fail(400, { fail: 'Status kenaikan / kelulusan tidak valid' });
		}

		if (!status && !tanggalPenetapan && !catatan.trim()) {
			await db.delete(tableStatusAkhirRapor).where(eq(tableStatusAkhirRapor.muridId, muridId));
			await writeAuditLog({
				locals,
				request,
				action: 'delete',
				entityType: 'status_akhir_rapor',
				entityId: muridId,
				summary: `Status akhir ${murid.nama} dihapus.`,
				before
			});
			return { message: 'Status akhir rapor dihapus' };
		}

		await db
			.insert(tableStatusAkhirRapor)
			.values({
				muridId,
				status,
				tanggalPenetapan,
				catatan,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: tableStatusAkhirRapor.muridId,
				set: {
					status,
					tanggalPenetapan,
					catatan,
					updatedAt: now
				}
			});

		await writeAuditLog({
			locals,
			request,
			action: before ? 'update' : 'create',
			entityType: 'status_akhir_rapor',
			entityId: muridId,
			summary: `Status akhir ${murid.nama} disimpan: ${status || 'belum ditetapkan'}.`,
			before,
			after: { status, tanggalPenetapan, catatan }
		});

		return { message: 'Status akhir rapor tersimpan' };
	},

	importExcel: async ({ request, locals, cookies }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}
		if (!canManageStatusAkhir(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin mengubah status akhir rapor' });
		}

		const kelasId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID));
		if (!Number.isInteger(kelasId) || kelasId <= 0) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu' });
		}

		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { fail: 'File Excel belum dipilih' });
		}
		if (file.size > MAX_IMPORT_FILE_SIZE) {
			return fail(400, { fail: 'Ukuran file melebihi 2MB' });
		}
		if (!file.name.toLowerCase().endsWith('.xlsx')) {
			return fail(400, { fail: 'Format file harus .xlsx sesuai template status akhir' });
		}

		await ensureCatatanWaliSchema();

		let rawRows: Array<Array<string | number>>;
		try {
			rawRows = await readBufferToAoA(Buffer.from(await file.arrayBuffer()));
		} catch (error) {
			console.error('[status-akhir] gagal membaca file import', error);
			return fail(400, { fail: 'Gagal membaca file Excel. Gunakan template dari sistem.' });
		}

		const headerRowIndex = rawRows.findIndex((row) => {
			const headers = row.map(normalizeHeader);
			return headers.includes('murid id') && headers.includes('status kenaikan / kelulusan');
		});
		if (headerRowIndex < 0) {
			return fail(400, {
				fail: 'Template tidak valid. Kolom Murid ID dan Status Kenaikan / Kelulusan wajib ada.'
			});
		}

		const headers = rawRows[headerRowIndex].map(normalizeHeader);
		const idxMuridId = getHeaderIndex(headers, ['murid id', 'id murid']);
		const idxStatus = getHeaderIndex(headers, ['status kenaikan / kelulusan', 'status']);
		const idxTanggal = getHeaderIndex(headers, ['tanggal penetapan rapor', 'tanggal penetapan']);
		const idxCatatan = getHeaderIndex(headers, ['catatan wali kelas', 'catatan']);

		if (idxMuridId < 0 || idxStatus < 0 || idxTanggal < 0 || idxCatatan < 0) {
			return fail(400, {
				fail: 'Template tidak lengkap. Pastikan kolom Murid ID, Status Kenaikan / Kelulusan, Tanggal Penetapan Rapor, dan Catatan Wali Kelas tersedia.'
			});
		}

		let processed = 0;
		let saved = 0;
		let deleted = 0;
		const now = new Date().toISOString();

		try {
			await db.transaction(async (tx) => {
				for (let i = headerRowIndex + 1; i < rawRows.length; i += 1) {
					const row = rawRows[i] ?? [];
					const muridId = Number(normalizeText(row[idxMuridId]));
					const status = normalizeStatus(row[idxStatus]);
					const tanggalPenetapan = normalizeDateInput(row[idxTanggal]);
					const catatan = normalizeText(row[idxCatatan]);

					if (!muridId && !normalizeText(row[idxStatus]) && !tanggalPenetapan && !catatan) continue;
					processed += 1;

					if (!Number.isInteger(muridId) || muridId <= 0) {
						throw new Error(`Baris ${i + 1}: Murid ID tidak valid.`);
					}
					if (status === null) {
						throw new Error(
							`Baris ${i + 1}: Status tidak valid. Gunakan salah satu: ${STATUS_OPTIONS.join(', ')}.`
						);
					}
					if (normalizeText(row[idxTanggal]) && !tanggalPenetapan) {
						throw new Error(`Baris ${i + 1}: Tanggal harus berformat yyyy-mm-dd atau dd/mm/yyyy.`);
					}

					const murid = await tx.query.tableMurid.findFirst({
						columns: { id: true },
						where: and(
							eq(tableMurid.id, muridId),
							eq(tableMurid.sekolahId, sekolahId),
							eq(tableMurid.kelasId, kelasId)
						)
					});
					if (!murid) {
						throw new Error(`Baris ${i + 1}: Murid tidak ditemukan pada kelas aktif.`);
					}

					if (!status && !tanggalPenetapan && !catatan) {
						await tx
							.delete(tableStatusAkhirRapor)
							.where(eq(tableStatusAkhirRapor.muridId, muridId));
						deleted += 1;
						continue;
					}

					await tx
						.insert(tableStatusAkhirRapor)
						.values({
							muridId,
							status,
							tanggalPenetapan,
							catatan,
							updatedAt: now
						})
						.onConflictDoUpdate({
							target: tableStatusAkhirRapor.muridId,
							set: { status, tanggalPenetapan, catatan, updatedAt: now }
						});
					saved += 1;
				}
			});
		} catch (error) {
			return fail(400, {
				fail: error instanceof Error ? error.message : 'Gagal import status akhir.'
			});
		}

		return {
			message: `Import selesai: ${processed} baris diproses, ${saved} data tersimpan, ${deleted} data dikosongkan.`
		};
	}
};
import { activeMuridFilter } from '$lib/server/murid-query';
