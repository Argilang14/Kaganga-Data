import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import {
	tableAuthUser,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableKelas,
	tablePegawai,
	tablePegawaiDokumen,
	tablePegawaiPendidikan,
	tablePegawaiPenugasan,
	tablePegawaiRiwayat,
	tablePegawaiSertifikasi,
	tableSekolah
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, like, ne, or, sql } from 'drizzle-orm';
import { authority } from '../../pengguna/utils.server';
import type { Actions, PageServerLoad } from './$types';
import {
	parsePegawaiWorkbook,
	PEGAWAI_JENIS,
	PEGAWAI_STATUS,
	buildPegawaiImportUpdatePayload,
	resolvePegawaiImportRows,
	type PegawaiJenis,
	type PegawaiStatus
} from '$lib/server/pegawai-excel';
import { recordPegawaiHistory } from '$lib/server/pegawai-history';

const JENIS_PEGAWAI = PEGAWAI_JENIS;
const STATUS_PEGAWAI = PEGAWAI_STATUS;
const PEGAWAI_PER_PAGE = 20;

type JenisPegawai = PegawaiJenis;
type StatusPegawai = PegawaiStatus;

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

function normalizeDate(value: FormDataEntryValue | null) {
	const date = normalizeText(value);
	return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isValidEmail(value: string | null) {
	return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function hasDuplicateIdentity(
	sekolahId: number,
	column: typeof tablePegawai.nip | typeof tablePegawai.nik,
	value: string | null,
	excludeId: number | null
) {
	if (!value || value === '-') return false;
	const filters = [eq(tablePegawai.sekolahId, sekolahId), eq(column, value)];
	if (excludeId) filters.push(ne(tablePegawai.id, excludeId));
	const row = await db
		.select({ id: tablePegawai.id })
		.from(tablePegawai)
		.where(and(...filters))
		.limit(1);
	return row.length > 0;
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
	const [
		sekolahRefs,
		waliKelasRefs,
		userRefs,
		jadwalMapelRefs,
		jadwalPelajaranRefs,
		penugasanRefs,
		pendidikanRefs,
		sertifikasiRefs,
		dokumenRefs,
		riwayatRefs
	] = await Promise.all([
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
				.where(and(eq(tableAuthUser.pegawaiId, pegawaiId), eq(tableAuthUser.sekolahId, sekolahId)))
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
		),
		safeCountReferences(
			'riwayat penugasan',
			db
				.select({ total: sql<number>`count(*)` })
				.from(tablePegawaiPenugasan)
				.where(
					and(
						eq(tablePegawaiPenugasan.pegawaiId, pegawaiId),
						eq(tablePegawaiPenugasan.sekolahId, sekolahId)
					)
				)
		),
		safeCountReferences(
			'riwayat pendidikan',
			db
				.select({ total: sql<number>`count(*)` })
				.from(tablePegawaiPendidikan)
				.where(
					and(
						eq(tablePegawaiPendidikan.pegawaiId, pegawaiId),
						eq(tablePegawaiPendidikan.sekolahId, sekolahId)
					)
				)
		),
		safeCountReferences(
			'sertifikasi',
			db
				.select({ total: sql<number>`count(*)` })
				.from(tablePegawaiSertifikasi)
				.where(
					and(
						eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId),
						eq(tablePegawaiSertifikasi.sekolahId, sekolahId)
					)
				)
		),
		safeCountReferences(
			'dokumen',
			db
				.select({ total: sql<number>`count(*)` })
				.from(tablePegawaiDokumen)
				.where(
					and(
						eq(tablePegawaiDokumen.pegawaiId, pegawaiId),
						eq(tablePegawaiDokumen.sekolahId, sekolahId)
					)
				)
		),
		safeCountReferences(
			'riwayat perubahan',
			db
				.select({ total: sql<number>`count(*)` })
				.from(tablePegawaiRiwayat)
				.where(
					and(
						eq(tablePegawaiRiwayat.pegawaiId, pegawaiId),
						eq(tablePegawaiRiwayat.sekolahId, sekolahId)
					)
				)
		)
	]);

	return {
		sekolah: sekolahRefs[0]?.total ?? 0,
		kelas: waliKelasRefs[0]?.total ?? 0,
		pengguna: userRefs[0]?.total ?? 0,
		jadwal: (jadwalMapelRefs[0]?.total ?? 0) + (jadwalPelajaranRefs[0]?.total ?? 0),
		riwayat:
			(penugasanRefs[0]?.total ?? 0) +
			(pendidikanRefs[0]?.total ?? 0) +
			(sertifikasiRefs[0]?.total ?? 0) +
			(dokumenRefs[0]?.total ?? 0),
		audit: riwayatRefs[0]?.total ?? 0
	};
}
function referenceTotal(refs: Awaited<ReturnType<typeof countReferences>>) {
	return refs.sekolah + refs.kelas + refs.pengguna + refs.jadwal + refs.riwayat;
}

async function preparePegawaiImport(file: File, sekolahId: number) {
	const parsed = await parsePegawaiWorkbook(file);
	const existingRows = await db.query.tablePegawai.findMany({
		columns: { id: true, kodePegawai: true, nip: true, nik: true },
		where: eq(tablePegawai.sekolahId, sekolahId)
	});
	return { parsed, resolutions: resolvePegawaiImportRows(parsed, existingRows) };
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
		const searchFilter = or(
			like(tablePegawai.nama, `%${q}%`),
			like(tablePegawai.nip, `%${q}%`),
			like(tablePegawai.nik, `%${q}%`)
		);
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
		const nik = normalizeText(formData.get('nik'));
		const nuptk = normalizeText(formData.get('nuptk'));
		const jenis = parseJenis(formData.get('jenis'));
		const status = parseStatus(formData.get('status'));
		const jenisKelaminRaw = normalizeText(formData.get('jenisKelamin'));
		const jenisKelamin: 'laki-laki' | 'perempuan' | null =
			jenisKelaminRaw === 'laki-laki' || jenisKelaminRaw === 'perempuan' ? jenisKelaminRaw : null;
		const tempatLahir = normalizeText(formData.get('tempatLahir'));
		const tanggalLahirRaw = normalizeText(formData.get('tanggalLahir'));
		const tanggalLahir = normalizeDate(formData.get('tanggalLahir'));
		const agama = normalizeText(formData.get('agama'));
		const statusPerkawinan = normalizeText(formData.get('statusPerkawinan'));
		const jabatan = normalizeText(formData.get('jabatan'));
		const telepon = normalizeText(formData.get('telepon'));
		const email = normalizeText(formData.get('email'));
		const alamat = normalizeText(formData.get('alamat'));
		const desa = normalizeText(formData.get('desa'));
		const kecamatan = normalizeText(formData.get('kecamatan'));
		const kabupaten = normalizeText(formData.get('kabupaten'));
		const provinsi = normalizeText(formData.get('provinsi'));
		const kodePos = normalizeText(formData.get('kodePos'));
		const kontakDaruratNama = normalizeText(formData.get('kontakDaruratNama'));
		const kontakDaruratHubungan = normalizeText(formData.get('kontakDaruratHubungan'));
		const kontakDaruratTelepon = normalizeText(formData.get('kontakDaruratTelepon'));
		const statusKepegawaian = normalizeText(formData.get('statusKepegawaian'));
		const tanggalMulaiKerjaRaw = normalizeText(formData.get('tanggalMulaiKerja'));
		const tanggalMulaiKerja = normalizeDate(formData.get('tanggalMulaiKerja'));
		const unitPenempatan = normalizeText(formData.get('unitPenempatan'));
		const pangkatGolongan = normalizeText(formData.get('pangkatGolongan'));
		const nomorSk = normalizeText(formData.get('nomorSk'));
		const tanggalSkRaw = normalizeText(formData.get('tanggalSk'));
		const tanggalSk = normalizeDate(formData.get('tanggalSk'));
		const catatan = normalizeText(formData.get('catatan'));
		if (!nama || !nip) {
			return fail(400, { fail: 'Nama dan NIP wajib diisi.' });
		}
		if (!jenis || !status) {
			return fail(400, { fail: 'Jenis atau status pegawai tidak valid.' });
		}
		if (
			(tanggalLahirRaw && !tanggalLahir) ||
			(tanggalMulaiKerjaRaw && !tanggalMulaiKerja) ||
			(tanggalSkRaw && !tanggalSk)
		) {
			return fail(400, { fail: 'Format tanggal pegawai tidak valid.' });
		}
		if (!isValidEmail(email)) return fail(400, { fail: 'Format email pegawai tidak valid.' });
		if (telepon && !/^[0-9+() .-]{6,24}$/.test(telepon)) {
			return fail(400, { fail: 'Format nomor telepon pegawai tidak valid.' });
		}
		if (await hasDuplicateIdentity(sekolahId, tablePegawai.nip, nip, id)) {
			return fail(400, { fail: `NIP ${nip} sudah digunakan pegawai lain.` });
		}
		if (await hasDuplicateIdentity(sekolahId, tablePegawai.nik, nik, id)) {
			return fail(400, { fail: `NIK ${nik} sudah digunakan pegawai lain.` });
		}

		const payload = {
			sekolahId,
			nama,
			nip,
			nik,
			nuptk,
			jenis,
			jabatan,
			status,
			jenisKelamin,
			tempatLahir,
			tanggalLahir,
			agama,
			statusPerkawinan,
			telepon,
			email,
			alamat,
			desa,
			kecamatan,
			kabupaten,
			provinsi,
			kodePos,
			kontakDaruratNama,
			kontakDaruratHubungan,
			kontakDaruratTelepon,
			statusKepegawaian,
			tanggalMulaiKerja,
			unitPenempatan,
			pangkatGolongan,
			nomorSk,
			tanggalSk,
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
			await recordPegawaiHistory({
				sekolahId,
				pegawaiId: id,
				userId: Number(locals.user.id) || null,
				aksi: 'perbarui',
				bagian: 'biodata',
				ringkasan: `Biodata ${nama} diperbarui.`
			});
			return { message: 'Data pegawai berhasil diperbarui.' };
		}

		const inserted = await db
			.insert(tablePegawai)
			.values({ ...payload, createdAt: new Date().toISOString() })
			.returning({ id: tablePegawai.id });
		const insertedId = inserted[0]?.id;
		if (insertedId) {
			await db
				.update(tablePegawai)
				.set({ kodePegawai: `PGW-${String(insertedId).padStart(8, '0')}` })
				.where(and(eq(tablePegawai.id, insertedId), eq(tablePegawai.sekolahId, sekolahId)));
		}
		if (insertedId) {
			await recordPegawaiHistory({
				sekolahId,
				pegawaiId: insertedId,
				userId: Number(locals.user.id) || null,
				aksi: 'tambah',
				bagian: 'biodata',
				ringkasan: `Data pegawai ${nama} ditambahkan.`
			});
		}
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
		await recordPegawaiHistory({
			sekolahId,
			pegawaiId: id,
			userId: Number(locals.user.id) || null,
			aksi: 'status',
			bagian: 'kepegawaian',
			ringkasan: status === 'aktif' ? 'Pegawai diaktifkan.' : 'Pegawai dinonaktifkan.'
		});
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
				refs.jadwal ? `${refs.jadwal} jadwal pelajaran` : null,
				refs.riwayat ? `${refs.riwayat} data riwayat pegawai` : null
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

	previewImport: async ({ request, locals }) => {
		authority('sekolah_manage');
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		await ensurePegawaiSchema();
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || !file.size) {
			return fail(400, { fail: 'Pilih file Excel pegawai terlebih dahulu.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });

		let prepared;
		try {
			prepared = await preparePegawaiImport(file, sekolahId);
		} catch (error) {
			return fail(400, {
				fail: error instanceof Error ? error.message : 'File Excel pegawai tidak valid.'
			});
		}
		const { parsed, resolutions } = prepared;
		return {
			preview: {
				fileName: file.name,
				legacyFormat: parsed.legacyFormat,
				total: resolutions.length,
				baru: resolutions.filter((item) => item.action === 'baru').length,
				perbarui: resolutions.filter((item) => item.action === 'perbarui').length,
				bermasalah: resolutions.filter((item) => item.action === 'bermasalah').length,
				rows: resolutions.slice(0, 100).map(({ row, action }) => ({
					rowNumber: row.rowNumber,
					nama: row.values.nama,
					nip: row.values.nip,
					action,
					errors: row.errors
				}))
			}
		};
	},

	importExcel: async ({ request, locals }) => {
		authority('sekolah_manage');
		if (!locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		await ensurePegawaiSchema();
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || !file.size) {
			return fail(400, { fail: 'Pilih file Excel pegawai terlebih dahulu.' });
		}

		let prepared;
		try {
			prepared = await preparePegawaiImport(file, sekolahId);
		} catch (error) {
			return fail(400, {
				fail: error instanceof Error ? error.message : 'File Excel pegawai tidak valid.'
			});
		}
		const invalid = prepared.resolutions.filter((item) => item.action === 'bermasalah');
		if (invalid.length) {
			const examples = invalid
				.slice(0, 5)
				.map((item) => `baris ${item.row.rowNumber}: ${item.row.errors.join(' ')}`)
				.join('; ');
			return fail(400, {
				fail: `Import dibatalkan karena ${invalid.length} baris bermasalah. ${examples}`
			});
		}

		let inserted = 0;
		let updated = 0;
		try {
			await db.transaction(async (tx) => {
				for (const resolution of prepared.resolutions) {
					const now = new Date().toISOString();
					if (resolution.existingId) {
						await tx
							.update(tablePegawai)
							.set(
								buildPegawaiImportUpdatePayload(
									resolution.row.values,
									prepared.parsed.providedColumns
								)
							)
							.where(
								and(
									eq(tablePegawai.id, resolution.existingId),
									eq(tablePegawai.sekolahId, sekolahId)
								)
							);
						updated += 1;
						continue;
					}
					const {
						kodePegawai: _legacyCode,
						nomorIndukPppk: _legacyPppk,
						...importValues
					} = resolution.row.values;
					const created = await tx
						.insert(tablePegawai)
						.values({
							sekolahId,
							...importValues,
							createdAt: now,
							updatedAt: now
						})
						.returning({ id: tablePegawai.id });
					const createdId = created[0]?.id;
					if (createdId) {
						await tx
							.update(tablePegawai)
							.set({ kodePegawai: `PGW-${String(createdId).padStart(8, '0')}` })
							.where(and(eq(tablePegawai.id, createdId), eq(tablePegawai.sekolahId, sekolahId)));
					}
					inserted += 1;
				}
			});
		} catch (error) {
			console.error('[pegawai-import] Transaksi import gagal:', error);
			return fail(400, {
				fail: 'Import dibatalkan seluruhnya karena terjadi konflik data. Periksa kembali NIP dan NIK.'
			});
		}

		return {
			message: `Import pegawai selesai. Baru: ${inserted}, diperbarui: ${updated}, gagal: 0.`
		};
	}
};
