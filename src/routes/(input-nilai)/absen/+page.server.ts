import db from '$lib/server/db';
import { ensureKehadiranHadirSchema } from '$lib/server/db/ensure-kehadiran-hadir';
import { tableKehadiranMurid, tableMurid } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';

const PER_PAGE = 20;
const TABLE_MISSING_MESSAGE =
	'Tabel kehadiran murid belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		error.message.includes('kehadiran_murid')
	);
}

function parseCount(value: FormDataEntryValue | null): number | null {
	if (value == null) return 0;
	const raw = value.toString().trim();
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) return null;
	return parsed;
}

function parseOptionalPositiveInteger(value: FormDataEntryValue | string | null): number | null {
	if (value == null) return null;
	const parsed = Number(value.toString());
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveKelasId(formData: FormData, url: URL) {
	return (
		parseOptionalPositiveInteger(formData.get('kelasId')) ??
		parseOptionalPositiveInteger(url.searchParams.get('kelas_id'))
	);
}

function absensiActionFailure(error: unknown) {
	console.error('[absen action] failed', error);
	if (isTableMissingError(error)) {
		return fail(500, { fail: TABLE_MISSING_MESSAGE });
	}
	const message =
		error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan absensi.';
	return fail(500, { fail: `Gagal menyimpan absensi: ${message}` });
}

export async function load({ parent, locals, url, depends }) {
	depends('app:absen');

	if (!locals.user) throw redirect(303, '/login');

	const { kelasAktif } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;

	const searchParam = url.searchParams.get('q');
	const search = searchParam?.trim() ? searchParam.trim() : null;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	const defaultPage = {
		search,
		currentPage: 1,
		totalPages: 1,
		totalItems: 0,
		perPage: PER_PAGE
	};

	if (!sekolahId || !kelasAktif?.id) {
		return {
			tableReady: true,
			daftarMurid: [],
			page: defaultPage,
			totalMurid: 0,
			muridCount: 0
		};
	}

	const baseFilter = and(
		eq(tableMurid.sekolahId, sekolahId),
		eq(tableMurid.kelasId, kelasAktif.id)
	);
	const searchFilter = search
		? and(baseFilter, sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`)
		: baseFilter;

	const [{ muridCount }] = await db
		.select({ muridCount: sql<number>`count(*)` })
		.from(tableMurid)
		.where(baseFilter);

	const [{ totalItems }] = await db
		.select({ totalItems: sql<number>`count(*)` })
		.from(tableMurid)
		.where(searchFilter);

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

	let tableReady = true;
	let queryRecords: Array<
		Pick<typeof tableMurid.$inferSelect, 'id' | 'nama'> & {
			kehadiran: typeof tableKehadiranMurid.$inferSelect | null;
		}
	> = [];

	try {
		queryRecords = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			with: {
				kehadiran: {
					columns: {
						id: true,
						muridId: true,
						hadir: true,
						sakit: true,
						izin: true,
						alfa: true,
						createdAt: true,
						updatedAt: true
					}
				}
			},
			where: searchFilter,
			orderBy: asc(tableMurid.nama),
			limit: PER_PAGE,
			offset
		});
	} catch (error) {
		if (!isTableMissingError(error)) throw error;
		tableReady = false;
		const fallbackRecords = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			where: searchFilter,
			orderBy: asc(tableMurid.nama),
			limit: PER_PAGE,
			offset
		});
		queryRecords = fallbackRecords.map((record) => ({ ...record, kehadiran: null }));
	}

	return {
		meta: { title: 'Rekap Kehadiran Murid' } satisfies PageMeta,
		tableReady,
		page: {
			search,
			currentPage,
			totalPages,
			totalItems: total,
			perPage: PER_PAGE
		},
		daftarMurid: queryRecords.map((murid, index) => ({
			id: murid.id,
			no: offset + index + 1,
			nama: murid.nama,
			hadir: murid.kehadiran?.hadir ?? 0,
			sakit: murid.kehadiran?.sakit ?? 0,
			izin: murid.kehadiran?.izin ?? 0,
			alfa: murid.kehadiran?.alfa ?? 0,
			updatedAt: murid.kehadiran?.updatedAt ?? murid.kehadiran?.createdAt ?? null
		})),
		totalMurid: total,
		muridCount: muridCount ?? 0
	};
}

export const actions = {
	update: async ({ request, locals, url }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		await ensureKehadiranHadirSchema();

		const formData = await request.formData();
		const kelasId = resolveKelasId(formData, url);
		const muridId = Number(formData.get('muridId'));

		if (!Number.isInteger(muridId) || muridId <= 0) {
			return fail(400, { fail: 'ID murid tidak valid' });
		}

		const [hadir, sakit, izin, alfa] = ['hadir', 'sakit', 'izin', 'alfa'].map((key) =>
			parseCount(formData.get(key))
		);

		if (hadir == null || sakit == null || izin == null || alfa == null) {
			return fail(400, { fail: 'Nilai kehadiran harus berupa angka bulat dan tidak negatif' });
		}

		const muridRecord = await db.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(
				eq(tableMurid.id, muridId),
				eq(tableMurid.sekolahId, sekolahId),
				kelasId ? eq(tableMurid.kelasId, kelasId) : undefined
			)
		});

		if (!muridRecord) {
			return fail(404, { fail: 'Murid tidak ditemukan atau bukan bagian dari kelas aktif ini' });
		}

		try {
			const now = new Date().toISOString();
			const existing = await db.query.tableKehadiranMurid.findFirst({
				columns: { id: true },
				where: eq(tableKehadiranMurid.muridId, muridId)
			});

			if (existing) {
				await db
					.update(tableKehadiranMurid)
					.set({ hadir, sakit, izin, alfa, updatedAt: now })
					.where(eq(tableKehadiranMurid.id, existing.id));
			} else {
				await db
					.insert(tableKehadiranMurid)
					.values({ muridId, hadir, sakit, izin, alfa, createdAt: now, updatedAt: now });
			}
		} catch (error) {
			return absensiActionFailure(error);
		}

		return { message: 'Rekap kehadiran murid berhasil diperbarui' };
	}
};
