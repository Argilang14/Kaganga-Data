import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import {
	tableAuthUser,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableKelas,
	tableMataPelajaran,
	tablePegawai,
	tablePegawaiDokumen,
	tablePegawaiPendidikan,
	tablePegawaiPenugasan,
	tablePegawaiRiwayat,
	tablePegawaiSertifikasi,
	tableSekolah,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';
import type { Actions, PageServerLoad } from './$types';
import { removePegawaiDocument, storePegawaiDocument } from '$lib/server/pegawai-documents';
import { recordPegawaiHistory as logHistory } from '$lib/server/pegawai-history';

const JENIS_PENUGASAN = [
	'kepala_sekolah',
	'wakil_kepala',
	'wali_kelas',
	'guru_mapel',
	'staf',
	'wali_asuh',
	'wali_asrama',
	'lainnya'
] as const;

function parseId(value: FormDataEntryValue | string | null | undefined) {
	const id = Number(value?.toString() ?? '');
	return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeText(value: FormDataEntryValue | null) {
	const text = value?.toString().trim() ?? '';
	return text || null;
}

function normalizeDate(value: FormDataEntryValue | null) {
	const date = normalizeText(value);
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const [year, month, day] = date.split('-').map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	return parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
		? date
		: null;
}

async function requireContext(paramsId: string | undefined, locals: App.Locals) {
	authority('sekolah_manage');
	if (!locals.user) throw redirect(303, '/login');
	const sekolahId = locals.sekolah?.id;
	const pegawaiId = parseId(paramsId);
	if (!sekolahId || !pegawaiId) throw error(404, 'Data pegawai tidak ditemukan.');
	await ensurePegawaiSchema();
	const pegawai = await db.query.tablePegawai.findFirst({
		where: and(eq(tablePegawai.id, pegawaiId), eq(tablePegawai.sekolahId, sekolahId))
	});
	if (!pegawai) throw error(404, 'Data pegawai tidak ditemukan.');
	return { sekolahId, pegawaiId, pegawai };
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const { sekolahId, pegawaiId, pegawai } = await requireContext(params.id, locals);

	const [
		sekolahRows,
		kelasRows,
		mapelRows,
		akunRows,
		jadwalRows,
		penugasanRows,
		pendidikanRows,
		sertifikasiRows,
		dokumenRows,
		riwayatRows,
		tahunAjaranOptions,
		kelasOptions,
		mapelOptions
	] = await Promise.all([
		db
			.select({ nama: tableSekolah.nama })
			.from(tableSekolah)
			.where(and(eq(tableSekolah.id, sekolahId), eq(tableSekolah.kepalaSekolahId, pegawaiId))),
		db
			.select({
				id: tableKelas.id,
				nama: tableKelas.nama,
				waliKelasId: tableKelas.waliKelasId,
				waliAsramaId: tableKelas.waliAsramaId,
				waliAsuhId: tableKelas.waliAsuhId
			})
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
			.orderBy(asc(tableKelas.nama)),
		db
			.select({
				id: tableJadwalMapel.id,
				kode: tableJadwalMapel.kode,
				nama: tableJadwalMapel.nama,
				jenjang: tableJadwalMapel.jenjang,
				kategori: tableJadwalMapel.kategori,
				aktif: tableJadwalMapel.aktif
			})
			.from(tableJadwalMapel)
			.where(
				and(
					eq(tableJadwalMapel.sekolahId, sekolahId),
					eq(tableJadwalMapel.guruPegawaiId, pegawaiId)
				)
			)
			.orderBy(asc(tableJadwalMapel.nama)),
		db
			.select({
				id: tableAuthUser.id,
				username: tableAuthUser.username,
				type: tableAuthUser.type,
				createdAt: tableAuthUser.createdAt,
				passwordUpdatedAt: tableAuthUser.passwordUpdatedAt
			})
			.from(tableAuthUser)
			.where(and(eq(tableAuthUser.sekolahId, sekolahId), eq(tableAuthUser.pegawaiId, pegawaiId)))
			.orderBy(asc(tableAuthUser.username)),
		db
			.select({ total: sql<number>`count(*)` })
			.from(tableJadwalPelajaran)
			.where(
				and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.guruPegawaiId, pegawaiId)
				)
			),
		db
			.select({
				id: tablePegawaiPenugasan.id,
				tahunAjaranId: tablePegawaiPenugasan.tahunAjaranId,
				tahunAjaran: tableTahunAjaran.nama,
				jenis: tablePegawaiPenugasan.jenis,
				namaJabatan: tablePegawaiPenugasan.namaJabatan,
				jenjang: tablePegawaiPenugasan.jenjang,
				unit: tablePegawaiPenugasan.unit,
				kelasId: tablePegawaiPenugasan.kelasId,
				kelas: tableKelas.nama,
				mataPelajaranId: tablePegawaiPenugasan.mataPelajaranId,
				mataPelajaran: tableMataPelajaran.nama,
				tanggalMulai: tablePegawaiPenugasan.tanggalMulai,
				tanggalSelesai: tablePegawaiPenugasan.tanggalSelesai,
				status: tablePegawaiPenugasan.status,
				catatan: tablePegawaiPenugasan.catatan
			})
			.from(tablePegawaiPenugasan)
			.leftJoin(tableTahunAjaran, eq(tablePegawaiPenugasan.tahunAjaranId, tableTahunAjaran.id))
			.leftJoin(tableKelas, eq(tablePegawaiPenugasan.kelasId, tableKelas.id))
			.leftJoin(
				tableMataPelajaran,
				eq(tablePegawaiPenugasan.mataPelajaranId, tableMataPelajaran.id)
			)
			.where(
				and(
					eq(tablePegawaiPenugasan.sekolahId, sekolahId),
					eq(tablePegawaiPenugasan.pegawaiId, pegawaiId)
				)
			)
			.orderBy(desc(tablePegawaiPenugasan.status), desc(tablePegawaiPenugasan.createdAt)),
		db.query.tablePegawaiPendidikan.findMany({
			where: and(
				eq(tablePegawaiPendidikan.sekolahId, sekolahId),
				eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
			),
			orderBy: [desc(tablePegawaiPendidikan.isTerakhir), desc(tablePegawaiPendidikan.tahunLulus)]
		}),
		db.query.tablePegawaiSertifikasi.findMany({
			where: and(
				eq(tablePegawaiSertifikasi.sekolahId, sekolahId),
				eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId)
			),
			orderBy: [desc(tablePegawaiSertifikasi.tanggalSelesai)]
		}),
		db.query.tablePegawaiDokumen.findMany({
			where: and(
				eq(tablePegawaiDokumen.sekolahId, sekolahId),
				eq(tablePegawaiDokumen.pegawaiId, pegawaiId)
			),
			orderBy: [asc(tablePegawaiDokumen.jenis), asc(tablePegawaiDokumen.nama)]
		}),
		db.query.tablePegawaiRiwayat.findMany({
			where: and(
				eq(tablePegawaiRiwayat.sekolahId, sekolahId),
				eq(tablePegawaiRiwayat.pegawaiId, pegawaiId)
			),
			orderBy: [desc(tablePegawaiRiwayat.createdAt)],
			limit: 50
		}),
		db.query.tableTahunAjaran.findMany({
			columns: { id: true, nama: true, isAktif: true },
			where: eq(tableTahunAjaran.sekolahId, sekolahId),
			orderBy: [desc(tableTahunAjaran.nama)]
		}),
		db.query.tableKelas.findMany({
			columns: { id: true, nama: true, tahunAjaranId: true },
			where: eq(tableKelas.sekolahId, sekolahId),
			orderBy: [asc(tableKelas.nama)]
		}),
		db
			.select({
				id: tableMataPelajaran.id,
				kode: tableMataPelajaran.kode,
				nama: tableMataPelajaran.nama,
				kelas: tableKelas.nama
			})
			.from(tableMataPelajaran)
			.innerJoin(tableKelas, eq(tableMataPelajaran.kelasId, tableKelas.id))
			.where(eq(tableKelas.sekolahId, sekolahId))
			.orderBy(asc(tableMataPelajaran.nama), asc(tableKelas.nama))
	]);

	const kelas = kelasRows.map((item) => ({
		id: item.id,
		nama: item.nama,
		peran: [
			item.waliKelasId === pegawaiId ? 'Wali Kelas' : null,
			item.waliAsramaId === pegawaiId ? 'Wali Asrama' : null,
			item.waliAsuhId === pegawaiId ? 'Wali Asuh' : null
		].filter((value): value is string => Boolean(value))
	}));

	return {
		meta: { title: `Informasi ${pegawai.nama}` } satisfies PageMeta,
		pegawai,
		penugasan: {
			kepalaSekolah: sekolahRows.map((item) => item.nama),
			kelas,
			mapel: mapelRows,
			jumlahJadwal: jadwalRows[0]?.total ?? 0,
			riwayat: penugasanRows
		},
		pendidikan: pendidikanRows,
		sertifikasi: sertifikasiRows,
		dokumen: dokumenRows,
		riwayat: riwayatRows,
		akun: akunRows,
		options: {
			jenisPenugasan: JENIS_PENUGASAN,
			tahunAjaran: tahunAjaranOptions,
			kelas: kelasOptions,
			mataPelajaran: mapelOptions
		}
	};
};

export const actions: Actions = {
	savePenugasan: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		const tahunAjaranId = parseId(formData.get('tahunAjaranId'));
		const kelasId = parseId(formData.get('kelasId'));
		const mataPelajaranId = parseId(formData.get('mataPelajaranId'));
		const jenisRaw = normalizeText(formData.get('jenis'));
		const jenis = JENIS_PENUGASAN.includes(jenisRaw as (typeof JENIS_PENUGASAN)[number])
			? jenisRaw
			: null;
		const namaJabatan = normalizeText(formData.get('namaJabatan'));
		const jenjang = normalizeText(formData.get('jenjang'));
		const unit = normalizeText(formData.get('unit'));
		const tanggalMulaiRaw = normalizeText(formData.get('tanggalMulai'));
		const tanggalSelesaiRaw = normalizeText(formData.get('tanggalSelesai'));
		const tanggalMulai = normalizeDate(formData.get('tanggalMulai'));
		const tanggalSelesai = normalizeDate(formData.get('tanggalSelesai'));
		const statusRaw = normalizeText(formData.get('status'));
		const status: 'aktif' | 'selesai' = statusRaw === 'selesai' ? 'selesai' : 'aktif';
		const catatan = normalizeText(formData.get('catatan'));

		if (!jenis) return fail(400, { fail: 'Jenis penugasan tidak valid.' });
		if ((tanggalMulaiRaw && !tanggalMulai) || (tanggalSelesaiRaw && !tanggalSelesai)) {
			return fail(400, { fail: 'Format tanggal penugasan tidak valid.' });
		}
		if (tanggalMulai && tanggalSelesai && tanggalSelesai < tanggalMulai) {
			return fail(400, { fail: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' });
		}

		if (tahunAjaranId) {
			const valid = await db.query.tableTahunAjaran.findFirst({
				columns: { id: true },
				where: and(
					eq(tableTahunAjaran.id, tahunAjaranId),
					eq(tableTahunAjaran.sekolahId, sekolahId)
				)
			});
			if (!valid) return fail(400, { fail: 'Tahun ajaran tidak berasal dari sekolah aktif.' });
		}
		if (kelasId) {
			const valid = await db.query.tableKelas.findFirst({
				columns: { id: true },
				where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
			});
			if (!valid) return fail(400, { fail: 'Kelas tidak berasal dari sekolah aktif.' });
		}
		if (mataPelajaranId) {
			const valid = await db
				.select({ id: tableMataPelajaran.id })
				.from(tableMataPelajaran)
				.innerJoin(tableKelas, eq(tableMataPelajaran.kelasId, tableKelas.id))
				.where(and(eq(tableMataPelajaran.id, mataPelajaranId), eq(tableKelas.sekolahId, sekolahId)))
				.limit(1);
			if (!valid.length)
				return fail(400, { fail: 'Mata pelajaran tidak berasal dari sekolah aktif.' });
		}

		const payload = {
			sekolahId,
			pegawaiId,
			tahunAjaranId,
			jenis,
			namaJabatan,
			jenjang,
			unit,
			kelasId,
			mataPelajaranId,
			tanggalMulai,
			tanggalSelesai,
			status,
			catatan,
			updatedAt: new Date().toISOString()
		};

		if (id) {
			const existing = await db.query.tablePegawaiPenugasan.findFirst({
				columns: { id: true },
				where: and(
					eq(tablePegawaiPenugasan.id, id),
					eq(tablePegawaiPenugasan.sekolahId, sekolahId),
					eq(tablePegawaiPenugasan.pegawaiId, pegawaiId)
				)
			});
			if (!existing) return fail(404, { fail: 'Penugasan tidak ditemukan.' });
			await db.update(tablePegawaiPenugasan).set(payload).where(eq(tablePegawaiPenugasan.id, id));
			await logHistory({
				sekolahId,
				pegawaiId,
				userId: Number(locals.user?.id) || null,
				aksi: 'perbarui',
				bagian: 'penugasan',
				ringkasan: `Penugasan ${namaJabatan || jenis} diperbarui.`
			});
			return { message: 'Penugasan berhasil diperbarui.', savedId: id };
		}

		const inserted = await db
			.insert(tablePegawaiPenugasan)
			.values({ ...payload, createdAt: new Date().toISOString() })
			.returning({ id: tablePegawaiPenugasan.id });
		await logHistory({
			sekolahId,
			pegawaiId,
			userId: Number(locals.user?.id) || null,
			aksi: 'tambah',
			bagian: 'penugasan',
			ringkasan: `Penugasan ${namaJabatan || jenis} ditambahkan.`
		});
		return { message: 'Penugasan berhasil ditambahkan.', savedId: inserted[0]?.id ?? null };
	},

	deletePenugasan: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		if (!id) return fail(400, { fail: 'Penugasan tidak valid.' });
		const existing = await db.query.tablePegawaiPenugasan.findFirst({
			columns: { id: true },
			where: and(
				eq(tablePegawaiPenugasan.id, id),
				eq(tablePegawaiPenugasan.sekolahId, sekolahId),
				eq(tablePegawaiPenugasan.pegawaiId, pegawaiId)
			)
		});
		if (!existing) return fail(404, { fail: 'Penugasan tidak ditemukan.' });
		await db.delete(tablePegawaiPenugasan).where(eq(tablePegawaiPenugasan.id, id));
		await logHistory({
			sekolahId,
			pegawaiId,
			userId: Number(locals.user?.id) || null,
			aksi: 'hapus',
			bagian: 'penugasan',
			ringkasan: 'Riwayat penugasan dihapus.'
		});
		return { message: 'Penugasan berhasil dihapus.', deletedId: id };
	},

	savePendidikan: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		const jenjang = normalizeText(formData.get('jenjang'));
		const institusi = normalizeText(formData.get('institusi'));
		const programStudi = normalizeText(formData.get('programStudi'));
		const nomorIjazah = normalizeText(formData.get('nomorIjazah'));
		const tahunRaw = normalizeText(formData.get('tahunLulus'));
		const tahunLulus = tahunRaw ? Number(tahunRaw) : null;
		const isTerakhir = formData.get('isTerakhir') === 'on';
		if (!jenjang || !institusi) return fail(400, { fail: 'Jenjang dan institusi wajib diisi.' });
		if (
			tahunLulus !== null &&
			(!Number.isInteger(tahunLulus) ||
				tahunLulus < 1900 ||
				tahunLulus > new Date().getFullYear() + 10)
		) {
			return fail(400, { fail: 'Tahun lulus tidak valid.' });
		}
		if (id) {
			const owned = await db.query.tablePegawaiPendidikan.findFirst({
				columns: { id: true },
				where: and(
					eq(tablePegawaiPendidikan.id, id),
					eq(tablePegawaiPendidikan.sekolahId, sekolahId),
					eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
				)
			});
			if (!owned) return fail(404, { fail: 'Riwayat pendidikan tidak ditemukan.' });
		}
		const saved = await db.transaction(async (tx) => {
			if (isTerakhir) {
				await tx
					.update(tablePegawaiPendidikan)
					.set({ isTerakhir: false, updatedAt: new Date().toISOString() })
					.where(
						and(
							eq(tablePegawaiPendidikan.sekolahId, sekolahId),
							eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
						)
					);
			}
			const payload = {
				sekolahId,
				pegawaiId,
				jenjang,
				institusi,
				programStudi,
				tahunLulus,
				nomorIjazah,
				isTerakhir,
				updatedAt: new Date().toISOString()
			};
			return id
				? (
						await tx
							.update(tablePegawaiPendidikan)
							.set(payload)
							.where(eq(tablePegawaiPendidikan.id, id))
							.returning()
					)[0]
				: (await tx.insert(tablePegawaiPendidikan).values(payload).returning())[0];
		});
		await logHistory({
			sekolahId,
			pegawaiId,
			userId: Number(locals.user?.id) || null,
			aksi: id ? 'perbarui' : 'tambah',
			bagian: 'pendidikan',
			ringkasan: `Pendidikan ${jenjang} di ${institusi} ${id ? 'diperbarui' : 'ditambahkan'}.`
		});
		return { message: 'Riwayat pendidikan berhasil disimpan.', saved };
	},

	deletePendidikan: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const id = parseId((await request.formData()).get('id'));
		if (!id) return fail(400, { fail: 'Riwayat pendidikan tidak valid.' });
		const existing = await db.query.tablePegawaiPendidikan.findFirst({
			where: and(
				eq(tablePegawaiPendidikan.id, id),
				eq(tablePegawaiPendidikan.sekolahId, sekolahId),
				eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
			)
		});
		if (!existing) return fail(404, { fail: 'Riwayat pendidikan tidak ditemukan.' });
		await db.delete(tablePegawaiPendidikan).where(eq(tablePegawaiPendidikan.id, id));
		await logHistory({
			sekolahId,
			pegawaiId,
			userId: Number(locals.user?.id) || null,
			aksi: 'hapus',
			bagian: 'pendidikan',
			ringkasan: `Pendidikan ${existing.jenjang} di ${existing.institusi} dihapus.`
		});
		return { message: 'Riwayat pendidikan berhasil dihapus.', deletedId: id };
	},

	saveSertifikasi: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		const jenis = normalizeText(formData.get('jenis'));
		const nama = normalizeText(formData.get('nama'));
		const penyelenggara = normalizeText(formData.get('penyelenggara'));
		const nomor = normalizeText(formData.get('nomor'));
		const catatan = normalizeText(formData.get('catatan'));
		const dateFields = ['tanggalMulai', 'tanggalSelesai', 'berlakuSampai'] as const;
		const dates = Object.fromEntries(
			dateFields.map((key) => [key, normalizeDate(formData.get(key))])
		) as Record<(typeof dateFields)[number], string | null>;
		if (!jenis || !nama) return fail(400, { fail: 'Jenis dan nama sertifikasi wajib diisi.' });
		for (const key of dateFields) {
			if (normalizeText(formData.get(key)) && !dates[key]) {
				return fail(400, { fail: 'Format tanggal sertifikasi tidak valid.' });
			}
		}
		if (dates.tanggalMulai && dates.tanggalSelesai && dates.tanggalSelesai < dates.tanggalMulai) {
			return fail(400, { fail: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' });
		}
		if (id) {
			const owned = await db.query.tablePegawaiSertifikasi.findFirst({
				columns: { id: true },
				where: and(
					eq(tablePegawaiSertifikasi.id, id),
					eq(tablePegawaiSertifikasi.sekolahId, sekolahId),
					eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId)
				)
			});
			if (!owned) return fail(404, { fail: 'Sertifikasi tidak ditemukan.' });
		}
		const payload = {
			sekolahId,
			pegawaiId,
			jenis,
			nama,
			penyelenggara,
			nomor,
			...dates,
			catatan,
			updatedAt: new Date().toISOString()
		};
		const saved = id
			? (
					await db
						.update(tablePegawaiSertifikasi)
						.set(payload)
						.where(eq(tablePegawaiSertifikasi.id, id))
						.returning()
				)[0]
			: (await db.insert(tablePegawaiSertifikasi).values(payload).returning())[0];
		await logHistory({
			sekolahId,
			pegawaiId,
			userId: Number(locals.user?.id) || null,
			aksi: id ? 'perbarui' : 'tambah',
			bagian: 'sertifikasi',
			ringkasan: `${jenis} ${nama} ${id ? 'diperbarui' : 'ditambahkan'}.`
		});
		return { message: 'Sertifikasi berhasil disimpan.', saved };
	},

	deleteSertifikasi: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const id = parseId((await request.formData()).get('id'));
		if (!id) return fail(400, { fail: 'Sertifikasi tidak valid.' });
		const existing = await db.query.tablePegawaiSertifikasi.findFirst({
			where: and(
				eq(tablePegawaiSertifikasi.id, id),
				eq(tablePegawaiSertifikasi.sekolahId, sekolahId),
				eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId)
			)
		});
		if (!existing) return fail(404, { fail: 'Sertifikasi tidak ditemukan.' });
		await db.delete(tablePegawaiSertifikasi).where(eq(tablePegawaiSertifikasi.id, id));
		await logHistory({
			sekolahId,
			pegawaiId,
			userId: Number(locals.user?.id) || null,
			aksi: 'hapus',
			bagian: 'sertifikasi',
			ringkasan: `${existing.jenis} ${existing.nama} dihapus.`
		});
		return { message: 'Sertifikasi berhasil dihapus.', deletedId: id };
	},

	saveDokumen: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const formData = await request.formData();
		const id = parseId(formData.get('id'));
		const jenis = normalizeText(formData.get('jenis'));
		const nama = normalizeText(formData.get('nama'));
		const nomor = normalizeText(formData.get('nomor'));
		const tanggalRaw = normalizeText(formData.get('tanggal'));
		const tanggal = normalizeDate(formData.get('tanggal'));
		const file = formData.get('file');
		if (!jenis || !nama) return fail(400, { fail: 'Jenis dan nama dokumen wajib diisi.' });
		if (tanggalRaw && !tanggal) return fail(400, { fail: 'Tanggal dokumen tidak valid.' });
		const existing = id
			? await db.query.tablePegawaiDokumen.findFirst({
					where: and(
						eq(tablePegawaiDokumen.id, id),
						eq(tablePegawaiDokumen.sekolahId, sekolahId),
						eq(tablePegawaiDokumen.pegawaiId, pegawaiId)
					)
				})
			: null;
		if (id && !existing) return fail(404, { fail: 'Dokumen tidak ditemukan.' });
		if (!existing && (!(file instanceof File) || !file.size)) {
			return fail(400, { fail: 'Pilih berkas dokumen terlebih dahulu.' });
		}

		let stored: Awaited<ReturnType<typeof storePegawaiDocument>> | null = null;
		try {
			if (file instanceof File && file.size) stored = await storePegawaiDocument(pegawaiId, file);
			const payload = {
				sekolahId,
				pegawaiId,
				jenis,
				nama,
				nomor,
				tanggal,
				filePath: stored?.filename ?? existing!.filePath,
				mimeType: stored?.mimeType ?? existing?.mimeType ?? null,
				ukuran: stored?.size ?? existing?.ukuran ?? null,
				updatedAt: new Date().toISOString()
			};
			const saved = id
				? (
						await db
							.update(tablePegawaiDokumen)
							.set(payload)
							.where(eq(tablePegawaiDokumen.id, id))
							.returning()
					)[0]
				: (await db.insert(tablePegawaiDokumen).values(payload).returning())[0];
			if (stored && existing?.filePath) await removePegawaiDocument(existing.filePath);
			await logHistory({
				sekolahId,
				pegawaiId,
				userId: Number(locals.user?.id) || null,
				aksi: id ? 'perbarui' : 'tambah',
				bagian: 'dokumen',
				ringkasan: `Dokumen ${nama} ${id ? 'diperbarui' : 'ditambahkan'}.`
			});
			return { message: 'Dokumen berhasil disimpan.', saved };
		} catch (documentError) {
			if (stored) await removePegawaiDocument(stored.filename);
			return fail(400, {
				fail: documentError instanceof Error ? documentError.message : 'Dokumen gagal disimpan.'
			});
		}
	},

	deleteDokumen: async ({ params, locals, request }) => {
		const { sekolahId, pegawaiId } = await requireContext(params.id, locals);
		const id = parseId((await request.formData()).get('id'));
		if (!id) return fail(400, { fail: 'Dokumen tidak valid.' });
		const existing = await db.query.tablePegawaiDokumen.findFirst({
			where: and(
				eq(tablePegawaiDokumen.id, id),
				eq(tablePegawaiDokumen.sekolahId, sekolahId),
				eq(tablePegawaiDokumen.pegawaiId, pegawaiId)
			)
		});
		if (!existing) return fail(404, { fail: 'Dokumen tidak ditemukan.' });
		await db.delete(tablePegawaiDokumen).where(eq(tablePegawaiDokumen.id, id));
		await removePegawaiDocument(existing.filePath);
		await logHistory({
			sekolahId,
			pegawaiId,
			userId: Number(locals.user?.id) || null,
			aksi: 'hapus',
			bagian: 'dokumen',
			ringkasan: `Dokumen ${existing.nama} dihapus.`
		});
		return { message: 'Dokumen berhasil dihapus.', deletedId: id };
	}
};
