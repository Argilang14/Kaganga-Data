import db from '$lib/server/db';
import { tableKelas, tableSekolah, tableSemester, tableTahunAjaran } from '$lib/server/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authority } from '../../../pengguna/utils.server';

const meta: PageMeta = {
	title: 'Tahun Ajaran',
	description: 'Pengelolaan tahun ajaran per sekolah'
};

type TahunAjaranWithMeta = typeof tableTahunAjaran.$inferSelect & {
	semester: (typeof tableSemester.$inferSelect)[];
	rombel: number;
};

async function getTahunAjaran(sekolahId: number): Promise<TahunAjaranWithMeta[]> {
	const tahunAjaranRows = await db.query.tableTahunAjaran.findMany({
		where: eq(tableTahunAjaran.sekolahId, sekolahId),
		orderBy: [desc(tableTahunAjaran.id)],
		with: { semester: true }
	});

	const kelasCounts = await db
		.select({
			tahunAjaranId: tableKelas.tahunAjaranId,
			jumlah: sql<number>`count(*)`
		})
		.from(tableKelas)
		.where(eq(tableKelas.sekolahId, sekolahId))
		.groupBy(tableKelas.tahunAjaranId);

	const kelasCountMap = new Map<number, number>();
	for (const row of kelasCounts) {
		if (row.tahunAjaranId) kelasCountMap.set(row.tahunAjaranId, row.jumlah);
	}

	return tahunAjaranRows.map((ta) => ({
		...ta,
		semester: [...ta.semester].sort((a, b) => a.tipe.localeCompare(b.tipe)),
		rombel: kelasCountMap.get(ta.id) ?? 0
	}));
}

function isUniqueConstraintError(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === 'object' && error !== null && 'message' in error
				? String((error as { message?: unknown }).message)
				: String(error);

	return message.toLowerCase().includes('unique constraint failed');
}

export const load: PageServerLoad = async ({ locals, url }) => {
	authority('sekolah_manage');

	const sekolahList = await db.query.tableSekolah.findMany({
		columns: { id: true, nama: true },
		orderBy: [desc(tableSekolah.id)]
	});

	if (sekolahList.length === 0) {
		throw redirect(303, '/sekolah/form?init');
	}

	const requestedId = Number(url.searchParams.get('sekolahId'));
	const validRequested =
		Number.isFinite(requestedId) && sekolahList.some((item) => item.id === requestedId);

	const fallbackId =
		locals.sekolah?.id && sekolahList.some((item) => item.id === locals.sekolah?.id)
			? locals.sekolah?.id
			: sekolahList[0]?.id;

	const selectedSekolahId = validRequested ? requestedId : (fallbackId ?? null);

	const selectedSekolah = selectedSekolahId
		? await db.query.tableSekolah.findFirst({
				columns: {
					id: true,
					nama: true,
					npsn: true,
					jenjangPendidikan: true
				},
				where: eq(tableSekolah.id, selectedSekolahId)
			})
		: null;

	const tahunAjaran = selectedSekolahId ? await getTahunAjaran(selectedSekolahId) : [];

	return {
		meta,
		sekolahList,
		selectedSekolahId,
		selectedSekolah,
		tahunAjaran
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		authority('sekolah_manage');

		const formData = await request.formData();
		const nama = (formData.get('nama') as string | null)?.trim();
		const sekolahId = Number(formData.get('sekolahId'));

		if (!sekolahId || Number.isNaN(sekolahId)) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu.' });
		}

		if (!nama) {
			return fail(400, { fail: 'Nama tahun ajaran wajib diisi.' });
		}

		const sekolah = await db.query.tableSekolah.findFirst({
			columns: { id: true },
			where: eq(tableSekolah.id, sekolahId)
		});

		if (!sekolah) {
			return fail(404, { fail: 'Data sekolah tidak ditemukan.' });
		}

		const existing = await db.query.tableTahunAjaran.findFirst({
			columns: { id: true },
			where: and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableTahunAjaran.nama, nama))
		});

		if (existing) {
			return fail(400, { fail: `Tahun ajaran "${nama}" sudah ada pada sekolah ini.` });
		}

		try {
			await db.transaction(async (tx) => {
				const [tahunAjaran] = await tx
					.insert(tableTahunAjaran)
					.values({ sekolahId, nama })
					.returning({ id: tableTahunAjaran.id });

				if (!tahunAjaran?.id) {
					throw new Error('Tahun ajaran tidak mengembalikan ID setelah disimpan.');
				}

				await tx.insert(tableSemester).values([
					{
						tahunAjaranId: tahunAjaran.id,
						tipe: 'ganjil',
						nama: 'Semester Ganjil'
					},
					{
						tahunAjaranId: tahunAjaran.id,
						tipe: 'genap',
						nama: 'Semester Genap'
					}
				]);
			});
		} catch (error) {
			console.error('[tahun-ajaran.create] gagal menyimpan tahun ajaran', {
				sekolahId,
				nama,
				error
			});

			if (isUniqueConstraintError(error)) {
				return fail(400, { fail: `Tahun ajaran "${nama}" sudah ada pada sekolah ini.` });
			}

			return fail(500, {
				fail: 'Gagal menyimpan tahun ajaran. Coba ulangi atau periksa data sekolah aktif.'
			});
		}

		return {
			message: 'Tahun ajaran baru ditambahkan.',
			tahunAjaran: await getTahunAjaran(sekolahId)
		};
	},
	update: async ({ request }) => {
		authority('sekolah_manage');

		const formData = await request.formData();
		const tahunAjaranId = Number(formData.get('id'));
		const sekolahId = Number(formData.get('sekolahId'));
		const nama = (formData.get('nama') as string | null)?.trim();

		if (!sekolahId || Number.isNaN(sekolahId)) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu.' });
		}

		if (!tahunAjaranId || Number.isNaN(tahunAjaranId)) {
			return fail(400, { fail: 'Identitas tahun ajaran tidak valid.' });
		}

		if (!nama) {
			return fail(400, { fail: 'Nama tahun ajaran wajib diisi.' });
		}

		const tahunAjaran = await db.query.tableTahunAjaran.findFirst({
			where: and(eq(tableTahunAjaran.id, tahunAjaranId), eq(tableTahunAjaran.sekolahId, sekolahId))
		});

		if (!tahunAjaran) {
			return fail(404, { fail: 'Data tahun ajaran tidak ditemukan.' });
		}

		const duplicate = await db.query.tableTahunAjaran.findFirst({
			columns: { id: true },
			where: and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableTahunAjaran.nama, nama))
		});

		if (duplicate && duplicate.id !== tahunAjaranId) {
			return fail(400, { fail: `Tahun ajaran "${nama}" sudah ada pada sekolah ini.` });
		}

		try {
			await db.update(tableTahunAjaran).set({ nama }).where(eq(tableTahunAjaran.id, tahunAjaranId));
		} catch (error) {
			console.error('[tahun-ajaran.update] gagal memperbarui tahun ajaran', {
				sekolahId,
				tahunAjaranId,
				nama,
				error
			});

			if (isUniqueConstraintError(error)) {
				return fail(400, { fail: `Tahun ajaran "${nama}" sudah ada pada sekolah ini.` });
			}

			return fail(500, { fail: 'Gagal memperbarui tahun ajaran.' });
		}

		return {
			message: 'Tahun ajaran diperbarui.',
			tahunAjaran: await getTahunAjaran(sekolahId)
		};
	},
	delete: async ({ request }) => {
		authority('sekolah_manage');

		const formData = await request.formData();
		const sekolahId = Number(formData.get('sekolahId'));
		const idsRaw = formData.getAll('ids');
		const ids = idsRaw.map((val) => Number(val)).filter((val) => Number.isFinite(val));

		if (!sekolahId || Number.isNaN(sekolahId)) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu.' });
		}

		if (!ids.length) {
			return fail(400, { fail: 'Tidak ada tahun ajaran terpilih.' });
		}

		await db
			.delete(tableTahunAjaran)
			.where(and(eq(tableTahunAjaran.sekolahId, sekolahId), inArray(tableTahunAjaran.id, ids)));

		return {
			message: 'Tahun ajaran terhapus.',
			tahunAjaran: await getTahunAjaran(sekolahId)
		};
	}
};
