import db from '$lib/server/db';
import { canManageKelas } from '$lib/server/kelas-manage';
import { parseKokurikulerRows } from '$lib/kokurikuler-import';
import { tableKokurikuler } from '$lib/server/db/schema';
import { profilPelajarPancasilaDimensions, type DimensiProfilLulusanKey } from '$lib/statics';
import { cookieNames } from '$lib/utils';
import { readBufferToAoA } from '$lib/utils/excel.js';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

const DIMENSION_KEY_SET = new Set<DimensiProfilLulusanKey>(
	profilPelajarPancasilaDimensions.map((dimension) => dimension.key)
);

const TABLE_MISSING_MESSAGE =
	'Tabel kokurikuler belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function sanitizeDimensions(values: string[]): DimensiProfilLulusanKey[] {
	const unique = new Set<DimensiProfilLulusanKey>();
	for (const value of values) {
		if (DIMENSION_KEY_SET.has(value as DimensiProfilLulusanKey)) {
			unique.add(value as DimensiProfilLulusanKey);
		}
	}
	return Array.from(unique);
}

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		error.message.includes('kokurikuler')
	);
}

async function readImport(request: Request) {
	const file = (await request.formData()).get('file');
	if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size === 0 || file.size > 2 * 1024 * 1024)
		throw new Error('Pilih file .xlsx dengan ukuran maksimal 2 MB.');
	const rows = await readBufferToAoA(Buffer.from(await file.arrayBuffer()));
	if (rows.length < 2 || rows.length > 501) throw new Error('File harus memuat 1 sampai 500 baris data.');
	const existing = await db.query.tableKokurikuler.findMany({ columns: { kode: true } });
	return parseKokurikulerRows(rows, profilPelajarPancasilaDimensions, existing.map((row) => row.kode));
}

async function importKelasId(cookies: { get(name: string): string | undefined }, locals: App.Locals) {
	const kelasId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID));
	if (!locals.sekolah?.id || !Number.isInteger(kelasId) || !await canManageKelas(locals.user, locals.sekolah.id, kelasId))
		return null;
	return kelasId;
}

export async function load({ depends, parent }) {
	depends('app:kokurikuler');
	const { kelasAktif } = await parent();
	const kelasId = kelasAktif?.id ?? null;

	let kokurikulerRaw: Awaited<ReturnType<typeof db.query.tableKokurikuler.findMany>> = [];
	let tableReady = true;

	if (kelasId) {
		try {
			kokurikulerRaw = await db.query.tableKokurikuler.findMany({
				where: eq(tableKokurikuler.kelasId, kelasId),
				orderBy: asc(tableKokurikuler.createdAt)
			});
		} catch (error) {
			if (isTableMissingError(error)) {
				tableReady = false;
				kokurikulerRaw = [];
			} else {
				throw error;
			}
		}
	}

	return {
		kelasId,
		tableReady,
		kokurikuler: kokurikulerRaw.map((item) => ({
			...item,
			dimensi: Array.isArray(item.dimensi)
				? (item.dimensi as DimensiProfilLulusanKey[])
				: sanitizeDimensions(
						typeof item.dimensi === 'string'
							? (() => {
									try {
										return JSON.parse(item.dimensi) as string[];
									} catch (error) {
										console.error('Gagal mengurai dimensi kokurikuler', error);
										return [];
									}
								})()
							: []
					)
		})),
		dimensiPilihan: profilPelajarPancasilaDimensions
	};
}

export const actions = {
	preview_import: async ({ request, cookies, locals }) => {
		const kelasId = await importKelasId(cookies, locals);
		if (!kelasId) return fail(403, { fail: 'Kelas aktif tidak diizinkan.' });
		try {
			const rows = await readImport(request);
			return { preview: rows, message: `${rows.filter((row) => !row.masalah).length} baris siap diimpor.` };
		} catch (error) {
			return fail(400, { fail: error instanceof Error ? error.message : 'Gagal membaca Excel.' });
		}
	},
	import_kokurikuler: async ({ request, cookies, locals }) => {
		const kelasId = await importKelasId(cookies, locals);
		if (!kelasId) return fail(403, { fail: 'Kelas aktif tidak diizinkan.' });
		try {
			const rows = await readImport(request);
			const valid = rows.filter((row) => !row.masalah);
			if (!valid.length) return fail(400, { fail: 'Tidak ada baris valid untuk disimpan.' });
			await db.transaction(async (tx) => {
				const existing = await tx.select({ kode: tableKokurikuler.kode }).from(tableKokurikuler);
				const codes = new Set(existing.map((row) => row.kode.toLowerCase()));
				if (valid.some((row) => codes.has(row.kode.toLowerCase())))
					throw new Error('Kode berubah atau telah digunakan. Pratinjau ulang sebelum menyimpan.');
				await tx.insert(tableKokurikuler).values(valid.map((row) => ({
					kelasId, kode: row.kode, dimensi: sanitizeDimensions(row.dimensi), tujuan: row.kegiatan
				})));
			});
			return { message: `${valid.length} kegiatan diimpor, ${rows.length - valid.length} dilewati.` };
		} catch (error) {
			return fail(400, { fail: error instanceof Error ? error.message : 'Impor gagal.' });
		}
	},
	add: async ({ request, locals }) => {
		const formData = await request.formData();
		const kelasIdRaw = formData.get('kelasId');
		const kode = formData.get('kode')?.toString().trim().toUpperCase() ?? '';
		const tujuan = formData.get('kokurikuler')?.toString().trim() ?? '';
		const dimensi = sanitizeDimensions(
			formData.getAll('dimensi').map((value) => value?.toString() ?? '')
		);

		if (!kelasIdRaw) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan' });
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}
		if (!locals.sekolah?.id || !(await canManageKelas(locals.user, locals.sekolah.id, kelasId)))
			return fail(403, { fail: 'Anda tidak memiliki izin untuk kelas ini.' });

		if (!dimensi.length) {
			return fail(400, { fail: 'Pilih minimal satu dimensi profil lulusan' });
		}

		if (!kode) {
			return fail(400, { fail: 'Kode kokurikuler wajib diisi' });
		}

		if (!tujuan) {
			return fail(400, { fail: 'Kegiatan kokurikuler wajib diisi' });
		}

		try {
			const existing = await db.query.tableKokurikuler.findFirst({
				columns: { id: true },
				where: eq(tableKokurikuler.kode, kode)
			});
			if (existing) {
				return fail(400, { fail: 'Kode sudah digunakan' });
			}

			await db.insert(tableKokurikuler).values({
				kelasId,
				kode,
				dimensi,
				tujuan
			});

			return { message: 'Kokurikuler berhasil ditambahkan', kode };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	},

	delete: async ({ request, locals, cookies }) => {
		const formData = await request.formData();
		const ids = Array.from(
			new Set(
				formData
					.getAll('ids')
					.map((id) => Number(id))
					.filter((id): id is number => Number.isInteger(id) && id > 0)
			)
		);

		if (ids.length === 0) {
			return fail(400, { fail: 'Pilih data kokurikuler yang akan dihapus' });
		}
		const kelasId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID));
		if (!locals.sekolah?.id || !Number.isInteger(kelasId) ||
			!(await canManageKelas(locals.user, locals.sekolah.id, kelasId)))
			return fail(403, { fail: 'Anda tidak memiliki izin untuk kelas ini.' });

		try {
			const rows = await db.query.tableKokurikuler.findMany({
				columns: { id: true, kelasId: true },
				where: inArray(tableKokurikuler.id, ids)
			});
			if (rows.length !== ids.length || rows.some((row) => row.kelasId !== kelasId))
				return fail(403, { fail: 'Pilihan berisi data di luar kelas aktif.' });
			await db.delete(tableKokurikuler).where(and(inArray(tableKokurikuler.id, ids), eq(tableKokurikuler.kelasId, kelasId)));
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		return { message: `${ids.length} kokurikuler berhasil dihapus` };
	},
	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const idRaw = formData.get('id');
		const kelasIdRaw = formData.get('kelasId');
		const kode = formData.get('kode')?.toString().trim().toUpperCase() ?? '';
		const tujuan = formData.get('kokurikuler')?.toString().trim() ?? '';
		const dimensi = sanitizeDimensions(
			formData.getAll('dimensi').map((value) => value?.toString() ?? '')
		);

		if (!idRaw) {
			return fail(400, { fail: 'ID kokurikuler tidak ditemukan' });
		}

		const id = Number(idRaw);
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { fail: 'ID kokurikuler tidak valid' });
		}

		if (!kelasIdRaw) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan' });
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}

		if (!locals.sekolah?.id || !(await canManageKelas(locals.user, locals.sekolah.id, kelasId)))
			return fail(403, { fail: 'Anda tidak memiliki izin untuk kelas ini.' });

		if (!dimensi.length) {
			return fail(400, { fail: 'Pilih minimal satu dimensi profil lulusan' });
		}

		if (!kode) {
			return fail(400, { fail: 'Kode kokurikuler wajib diisi' });
		}

		if (!tujuan) {
			return fail(400, { fail: 'Kegiatan kokurikuler wajib diisi' });
		}

		try {
			const existing = await db.query.tableKokurikuler.findFirst({
				columns: { id: true },
				where: eq(tableKokurikuler.kode, kode)
			});
			if (existing && existing.id !== id) {
				return fail(400, { fail: 'Kode sudah digunakan' });
			}

			const updated = await db
				.update(tableKokurikuler)
				.set({ kode, dimensi, tujuan, updatedAt: new Date().toISOString() })
				.where(and(eq(tableKokurikuler.id, id), eq(tableKokurikuler.kelasId, kelasId)))
				.returning({ id: tableKokurikuler.id });

			if (!updated.length) {
				return fail(404, { fail: 'Kokurikuler tidak ditemukan atau sudah dihapus' });
			}

			return { message: 'Kokurikuler berhasil diperbarui', id };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	}
};
