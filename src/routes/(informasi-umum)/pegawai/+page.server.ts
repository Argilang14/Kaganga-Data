import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import {
	tableAuthUser,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableKelas,
	tablePegawai,
	tableSekolah
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { authority } from '../../pengguna/utils.server';
import type { Actions, PageServerLoad } from './$types';

const JENIS_PEGAWAI = [
	'guru',
	'kepala_sekolah',
	'operator',
	'tu',
	'kebersihan',
	'keamanan',
	'wali_asuh',
	'wali_asrama',
	'lainnya'
] as const;

const STATUS_PEGAWAI = ['aktif', 'nonaktif'] as const;
const PEGAWAI_PER_PAGE = 20;

type JenisPegawai = (typeof JENIS_PEGAWAI)[number];
type StatusPegawai = (typeof STATUS_PEGAWAI)[number];

function normalizeText(value: FormDataEntryValue | null) {
	const text = value?.toString().trim() ?? '';
	return text.length ? text : null;
}

function parseId(value: FormDataEntryValue | string | null) {
	const id = Number(value?.toString() ?? '');
	return Number.isInteger(id) && id > 0 ? id : null;
}

function parseJenis(value: FormDataEntryValue | string | null): JenisPegawai | null {
	const raw = value?.toString() ?? '';
	return JENIS_PEGAWAI.includes(raw as JenisPegawai) ? (raw as JenisPegawai) : null;
}

function parseStatus(value: FormDataEntryValue | string | null): StatusPegawai | null {
	const raw = value?.toString() ?? '';
	return STATUS_PEGAWAI.includes(raw as StatusPegawai) ? (raw as StatusPegawai) : null;
}

async function safeCountReferences(
	label: string,
	query: Promise<{ total: number }[]>
): Promise<{ total: number }[]> {
	try {
		return await query;
	} catch (error) {
		const message = String(error);
		if (message.includes('no such table')) {
			console.warn(
				`[pegawai] Lewati cek referensi ${label}: tabel belum tersedia di database aktif.`
			);
			return [{ total: 0 }];
		}
		throw error;
	}
}

async function countReferences(pegawaiId: number, sekolahId: number) {
	const [sekolahRefs, waliKelasRefs, userRefs, jadwalMapelRefs, jadwalPelajaranRefs] =
		await Promise.all([
			safeCountReferences(
				'sekolah',
				db
					.select({ total: sql<number>`count(*)` })
					.from(tableSekolah)
					.where(and(eq(tableSekolah.kepalaSekolahId, pegawaiId), eq(tableSekolah.id, sekolahId)))
			),
			safeCountReferences(
				'kelas wali kelas',
				db
					.select({ total: sql<number>`count(*)` })
					.from(tableKelas)
					.where(
						and(
							eq(tableKelas.sekolahId, sekolahId),
							or(
								eq(tableKelas.waliKelasId, pegawaiId),
								eq(tableKelas.waliAsramaId, pegawaiId),
								eq(tableKelas.waliAsuhId, pegawaiId)
							)
						)
					)
			),
			safeCountReferences(
				'pengguna',
				db
					.select({ total: sql<number>`count(*)` })
					.from(tableAuthUser)
					.where(
						and(eq(tableAuthUser.pegawaiId, pegawaiId), eq(tableAuthUser.sekolahId, sekolahId))
					)
			),
			safeCountReferences(
				'pengaturan mata pelajaran',
				db
					.select({ total: sql<number>`count(*)` })
					.from(tableJadwalMapel)
					.where(
						and(
							eq(tableJadwalMapel.guruPegawaiId, pegawaiId),
							eq(tableJadwalMapel.sekolahId, sekolahId)
						)
					)
			),
			safeCountReferences(
				'jadwal pelajaran',
				db
					.select({ total: sql<number>`count(*)` })
					.from(tableJadwalPelajaran)
					.where(
						and(
							eq(tableJadwalPelajaran.guruPegawaiId, pegawaiId),
							eq(tableJadwalPelajaran.sekolahId, sekolahId)
						)
					)
			)
		]);

	return {
		sekolah: sekolahRefs[0]?.total ?? 0,
		kelas: waliKelasRefs[0]?.total ?? 0,
		pengguna: userRefs[0]?.total ?? 0,
		jadwal: (jadwalMapelRefs[0]?.total ?? 0) + (jadwalPelajaranRefs[0]?.total ?? 0)
	};
}
function referenceTotal(refs: Awaited<ReturnType<typeof countReferences>>) {
	return refs.sekolah + refs.kelas + refs.pengguna + refs.jadwal;
}

async function parsePegawaiWorkbook(file: File) {
	if (!file.size) return [];
	const ExcelJSModule = await import('exceljs');
	const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
	const workbook = new ExcelJS.Workbook() as any;
	await workbook.xlsx.load(await file.arrayBuffer());
	const sheet = workbook.worksheets[0] as any;
	if (!sheet) return [];

	const rows: Array<{
		nama: string;
		nip: string;
		jenis: JenisPegawai;
		jabatan: string | null;
		status: StatusPegawai;
		telepon: string | null;
		email: string | null;
		catatan: string | null;
	}> = [];

	sheet.eachRow((row: any, rowNumber: number) => {
		if (rowNumber === 1) return;
		const get = (index: number) => row.getCell(index).text?.trim() ?? '';
		const nama = get(1);
		const nip = get(2);
		if (!nama || !nip) return;
		const jenisRaw = get(3) || 'guru';
		const statusRaw = get(5) || 'aktif';
		const jenis = parseJenis(jenisRaw);
		const status = parseStatus(statusRaw);
		if (!jenis || !status) {
			throw new Error(
				`Baris ${rowNumber}: jenis "${jenisRaw}" atau status "${statusRaw}" tidak valid.`
			);
		}
		rows.push({
			nama,
			nip,
			jenis,
			jabatan: get(4) || null,
			status,
			telepon: get(6) || null,
			email: get(7) || null,
			catatan: get(8) || null
		});
	});

	return rows;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	authority('sekolah_manage');
	if (!locals.user) throw redirect(303, '/login');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensurePegawaiSchema();

	const q = url.searchParams.get('q')?.trim() ?? '';
	const jenis = url.searchParams.get('jenis')?.trim() ?? '';
	const status = url.searchParams.get('status')?.trim() ?? '';
	const editId = parseId(url.searchParams.get('edit'));
	const requestedPage = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));

	const filters = [eq(tablePegawai.sekolahId, sekolahId)];
	if (q) {
		const searchFilter = or(like(tablePegawai.nama, `%${q}%`), like(tablePegawai.nip, `%${q}%`));
		if (searchFilter) filters.push(searchFilter);
	}
	if (JENIS_PEGAWAI.includes(jenis as JenisPegawai)) {
		filters.push(eq(tablePegawai.jenis, jenis as JenisPegawai));
	}
	if (STATUS_PEGAWAI.includes(status as StatusPegawai)) {
		filters.push(eq(tablePegawai.status, status as StatusPegawai));
	}

	const listFilter = and(...filters);
	const [[countRow], [totalsRow]] = await Promise.all([
		db
			.select({ total: sql<number>`count(*)` })
			.from(tablePegawai)
			.where(listFilter),
		db
			.select({
				total: sql<number>`count(*)`,
				aktif: sql<number>`sum(case when ${tablePegawai.status} = 'aktif' then 1 else 0 end)`,
				guru: sql<number>`sum(case when ${tablePegawai.jenis} in ('guru', 'kepala_sekolah') then 1 else 0 end)`,
				asrama: sql<number>`sum(case when ${tablePegawai.jenis} in ('wali_asuh', 'wali_asrama') then 1 else 0 end)`
			})
			.from(tablePegawai)
			.where(eq(tablePegawai.sekolahId, sekolahId))
	]);

	const totalItems = countRow?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalItems / PEGAWAI_PER_PAGE));
	const currentPage = Math.min(requestedPage, totalPages);

	if (requestedPage !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage === 1) params.delete('page');
		else params.set('page', String(currentPage));
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	const [daftarPegawai, editPegawai] = await Promise.all([
		db.query.tablePegawai.findMany({
			where: listFilter,
			orderBy: [asc(tablePegawai.nama)],
			limit: PEGAWAI_PER_PAGE,
			offset: (currentPage - 1) * PEGAWAI_PER_PAGE
		}),
		editId
			? db.query.tablePegawai.findFirst({
					where: and(eq(tablePegawai.id, editId), eq(tablePegawai.sekolahId, sekolahId))
				})
			: Promise.resolve(null)
	]);

	const totals = {
		total: totalsRow?.total ?? 0,
		aktif: totalsRow?.aktif ?? 0,
		guru: totalsRow?.guru ?? 0,
		asrama: totalsRow?.asrama ?? 0
	};

	return {
		meta: { title: 'Data Pegawai' } satisfies PageMeta,
		pegawai: daftarPegawai,
		editPegawai,
		filter: { q, jenis, status },
		page: {
			currentPage,
			totalPages,
			totalItems,
			perPage: PEGAWAI_PER_PAGE
		},
		options: { jenis: JENIS_PEGAWAI, status: STATUS_PEGAWAI },
		sekolah: locals.sekolah ? { id: locals.sekolah.id, nama: locals.sekolah.nama } : null,
		totals
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		authority('sekolah_manage');
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		await ensurePegawaiSchema();
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });

		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		const nama = normalizeText(formData.get('nama'));
		const nip = normalizeText(formData.get('nip'));
		const jenis = parseJenis(formData.get('jenis'));
		const status = parseStatus(formData.get('status'));
		const jabatan = normalizeText(formData.get('jabatan'));
		const telepon = normalizeText(formData.get('telepon'));
		const email = normalizeText(formData.get('email'));
		const catatan = normalizeText(formData.get('catatan'));

		if (!nama || !nip) {
			return fail(400, { fail: 'Nama dan NIP wajib diisi.' });
		}
		if (!jenis || !status) {
			return fail(400, { fail: 'Jenis atau status pegawai tidak valid.' });
		}

		const payload = {
			sekolahId,
			nama,
			nip,
			jenis,
			jabatan,
			status,
			telepon,
			email,
			catatan,
			updatedAt: new Date().toISOString()
		};

		if (id) {
			const existing = await db.query.tablePegawai.findFirst({
				columns: { id: true },
				where: and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId))
			});
			if (!existing) return fail(404, { fail: 'Pegawai tidak ditemukan.' });
			await db
				.update(tablePegawai)
				.set(payload)
				.where(and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId)));
			return { message: 'Data pegawai berhasil diperbarui.' };
		}

		await db.insert(tablePegawai).values({ ...payload, createdAt: new Date().toISOString() });
		return { message: 'Data pegawai berhasil ditambahkan.' };
	},

	setStatus: async ({ request, locals }) => {
		authority('sekolah_manage');
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		await ensurePegawaiSchema();
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		const status = parseStatus(formData.get('status'));
		if (!id) return fail(400, { fail: 'Pegawai tidak valid.' });
		if (!status) return fail(400, { fail: 'Status pegawai tidak valid.' });

		await db
			.update(tablePegawai)
			.set({ status, updatedAt: new Date().toISOString() })
			.where(and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId)));
		return { message: status === 'aktif' ? 'Pegawai diaktifkan.' : 'Pegawai dinonaktifkan.' };
	},

	delete: async ({ request, locals }) => {
		authority('sekolah_manage');
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		await ensurePegawaiSchema();
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		if (!id) return fail(400, { fail: 'Pegawai tidak valid.' });

		const existing = await db.query.tablePegawai.findFirst({
			columns: { id: true, nama: true },
			where: and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId))
		});
		if (!existing) return fail(404, { fail: 'Pegawai tidak ditemukan.' });

		const refs = await countReferences(id, sekolahId);
		if (referenceTotal(refs) > 0) {
			const detail = [
				refs.sekolah ? `${refs.sekolah} data sekolah` : null,
				refs.kelas ? `${refs.kelas} penugasan wali kelas/asrama/asuh` : null,
				refs.pengguna ? `${refs.pengguna} akun pengguna` : null,
				refs.jadwal ? `${refs.jadwal} jadwal pelajaran` : null
			]
				.filter(Boolean)
				.join(', ');
			return fail(400, {
				fail: `Pegawai masih dipakai oleh ${detail}. Nonaktifkan saja jika tidak lagi bertugas.`
			});
		}

		await db
			.delete(tablePegawai)
			.where(and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId)));
		return { message: `Data pegawai ${existing.nama} berhasil dihapus.` };
	},

	deleteBulk: async ({ request, locals }) => {
		authority('sekolah_manage');
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		await ensurePegawaiSchema();
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const ids = formData
			.getAll('ids')
			.map((value) => parseId(value))
			.filter((id): id is number => Boolean(id));
		if (!ids.length) return fail(400, { fail: 'Pilih minimal satu pegawai untuk dihapus.' });

		const existingRows = await db.query.tablePegawai.findMany({
			columns: { id: true, nama: true },
			where: and(inArray(tablePegawai.id, ids), eq(tablePegawai.sekolahId, sekolahId))
		});
		if (!existingRows.length) return fail(404, { fail: 'Data pegawai tidak ditemukan.' });

		let deleted = 0;
		const skipped: string[] = [];
		for (const row of existingRows) {
			const refs = await countReferences(row.id, sekolahId);
			if (referenceTotal(refs) > 0) {
				skipped.push(row.nama);
				continue;
			}
			await db
				.delete(tablePegawai)
				.where(and(eq(tablePegawai.id, row.id), eq(tablePegawai.sekolahId, sekolahId)));
			deleted += 1;
		}

		if (!deleted && skipped.length) {
			return fail(400, {
				fail: `Tidak ada pegawai yang dihapus. ${skipped.length} pegawai masih dipakai data sekolah/kelas/pengguna/jadwal.`
			});
		}

		return {
			message: `Hapus massal selesai. Terhapus: ${deleted}${skipped.length ? `, dilewati: ${skipped.length}` : ''}.`
		};
	},

	importExcel: async ({ request, locals }) => {
		authority('sekolah_manage');
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || !file.size) {
			return fail(400, { fail: 'Pilih file Excel pegawai terlebih dahulu.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });

		let rows;
		try {
			rows = await parsePegawaiWorkbook(file);
		} catch (error) {
			return fail(400, {
				fail: error instanceof Error ? error.message : 'File Excel pegawai tidak valid.'
			});
		}
		if (!rows.length) return fail(400, { fail: 'Tidak ada data pegawai valid di file Excel.' });

		let inserted = 0;
		let updated = 0;
		const now = new Date().toISOString();
		for (const row of rows) {
			const existing =
				row.nip !== '-'
					? await db.query.tablePegawai.findFirst({
							columns: { id: true },
							where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.nip, row.nip))
						})
					: null;
			const payload = { sekolahId, ...row, updatedAt: now };
			if (existing) {
				await db.update(tablePegawai).set(payload).where(eq(tablePegawai.id, existing.id));
				updated += 1;
			} else {
				await db.insert(tablePegawai).values({ ...payload, createdAt: now });
				inserted += 1;
			}
		}

		return { message: `Import pegawai selesai. Baru: ${inserted}, diperbarui: ${updated}.` };
	}
};
