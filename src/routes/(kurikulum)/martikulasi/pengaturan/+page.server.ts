import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import db from '$lib/server/db';
import { ensureMartikulasiSchema } from '$lib/server/db/ensure-martikulasi';
import {
	tableMartikulasiHasil,
	tableMartikulasiSettings,
	tableMartikulasiTim,
	tableMurid,
	tablePegawai,
	tableSekolah,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { formatNomorSttm, isFormatNomorSttmValid } from '$lib/martikulasi';
import { inferKelasJadwalJenjang } from '$lib/server/jadwal';
import { composeAlamat, fallbackTempat } from '$lib/server/pdf/preview-utils';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';

const positiveInteger = (value: FormDataEntryValue | null) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const clean = (value: FormDataEntryValue | null, max = 1000) => {
	if (typeof value !== 'string') return null;
	const result = value.trim();
	return result ? result.slice(0, max) : null;
};

function requireManager(locals: App.Locals) {
	if (!hasSchoolWideOperationalAccess(locals.user)) {
		return fail(403, { fail: 'Anda tidak memiliki akses operasional sekolah.' });
	}
	return null;
}

async function ownedYear(sekolahId: number, id: number) {
	return db.query.tableTahunAjaran.findFirst({
		columns: { id: true, nama: true },
		where: and(eq(tableTahunAjaran.id, id), eq(tableTahunAjaran.sekolahId, sekolahId))
	});
}

export async function load({ locals, url, depends }) {
	depends('app:martikulasi-settings');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureMartikulasiSchema();

	const tahunAjaranList = await db.query.tableTahunAjaran.findMany({
		columns: { id: true, nama: true, isAktif: true },
		where: eq(tableTahunAjaran.sekolahId, sekolahId),
		orderBy: desc(tableTahunAjaran.id)
	});
	const requestedId = Number(url.searchParams.get('tahun_ajaran_id'));
	const selectedTahun =
		tahunAjaranList.find((item) => item.id === requestedId) ??
		tahunAjaranList.find((item) => item.isAktif) ??
		tahunAjaranList[0] ??
		null;
	const settings = selectedTahun
		? await db.query.tableMartikulasiSettings.findFirst({
				where: and(
					eq(tableMartikulasiSettings.sekolahId, sekolahId),
					eq(tableMartikulasiSettings.tahunAjaranId, selectedTahun.id)
				),
				with: { tim: { orderBy: [asc(tableMartikulasiTim.urutan), asc(tableMartikulasiTim.id)] } }
			})
		: null;
	const pegawaiList = await db.query.tablePegawai.findMany({
		columns: { id: true, nama: true, nip: true, jenis: true, jabatan: true },
		where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
		orderBy: asc(tablePegawai.nama)
	});
	const hasilLengkapBelumBernomor = selectedTahun
		? await db.query.tableMartikulasiHasil.findMany({
				columns: { id: true },
				where: and(
					eq(tableMartikulasiHasil.sekolahId, sekolahId),
					eq(tableMartikulasiHasil.tahunAjaranId, selectedTahun.id),
					eq(tableMartikulasiHasil.statusKelengkapan, 'lengkap'),
					isNull(tableMartikulasiHasil.nomorSttm)
				)
			})
		: [];

	return {
		meta: { title: 'Pengaturan Martikulasi' } satisfies PageMeta,
		tahunAjaranList,
		selectedTahun,
		settings,
		pegawaiList,
		hasilLengkapBelumBernomor: hasilLengkapBelumBernomor.length,
		canManage: hasSchoolWideOperationalAccess(locals.user)
	};
}

export const actions = {
	simpan: async ({ locals, request }) => {
		const denied = requireManager(locals);
		if (denied) return denied;
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sesi sekolah tidak ditemukan.' });
		await ensureMartikulasiSchema();
		const form = await request.formData();
		const tahunAjaranId = positiveInteger(form.get('tahunAjaranId'));
		if (!tahunAjaranId || !(await ownedYear(sekolahId, tahunAjaranId))) {
			return fail(400, { fail: 'Tahun ajaran tidak valid.' });
		}
		const sekolah = await db.query.tableSekolah.findFirst({
			columns: { nama: true, npsn: true, naungan: true, email: true, statusKepalaSekolah: true },
			where: eq(tableSekolah.id, sekolahId),
			with: { kepalaSekolah: { columns: { nama: true, nip: true } } }
		});
		if (!sekolah) return fail(404, { fail: 'Data sekolah tidak ditemukan.' });
		const formatNomorSttm = clean(form.get('formatNomorSttm'), 160) ?? '';
		if (!isFormatNomorSttmValid(formatNomorSttm)) {
			return fail(400, { fail: 'Format nomor STTM wajib memuat token {urut}.' });
		}
		const next = positiveInteger(form.get('nomorUrutSttmBerikutnya')) ?? 1;
		const values = {
			periodeMulai: clean(form.get('periodeMulai'), 10),
			periodeSelesai: clean(form.get('periodeSelesai'), 10),
			nomorSk: clean(form.get('nomorSk'), 200),
			tanggalSk: clean(form.get('tanggalSk'), 10),
			lokasiPenetapan: clean(form.get('lokasiPenetapan'), 200),
			formatNomorSttm,
			nomorUrutSttmBerikutnya: next,
			sekolahNamaSnapshot: sekolah.nama,
			npsnSnapshot: sekolah.npsn,
			naunganSnapshot: sekolah.naungan,
			alamatSnapshot: locals.sekolah ? composeAlamat(locals.sekolah) : null,
			emailSnapshot: sekolah.email,
			kepalaSekolahNamaSnapshot: sekolah.kepalaSekolah?.nama ?? null,
			kepalaSekolahNipSnapshot: sekolah.kepalaSekolah?.nip ?? null,
			kepalaSekolahStatusSnapshot: sekolah.statusKepalaSekolah,
			updatedAt: new Date().toISOString()
		};
		await db
			.insert(tableMartikulasiSettings)
			.values({ sekolahId, tahunAjaranId, ...values })
			.onConflictDoUpdate({
				target: [tableMartikulasiSettings.sekolahId, tableMartikulasiSettings.tahunAjaranId],
				set: values
			});
		return { message: 'Pengaturan Martikulasi berhasil disimpan.' };
	},
	tambahTim: async ({ locals, request }) => {
		const denied = requireManager(locals);
		if (denied) return denied;
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sesi sekolah tidak ditemukan.' });
		const form = await request.formData();
		const settingsId = positiveInteger(form.get('settingsId'));
		const pegawaiId = positiveInteger(form.get('pegawaiId'));
		const [settings, pegawai] = await Promise.all([
			settingsId
				? db.query.tableMartikulasiSettings.findFirst({
						columns: { id: true },
						where: and(
							eq(tableMartikulasiSettings.id, settingsId),
							eq(tableMartikulasiSettings.sekolahId, sekolahId)
						)
					})
				: null,
			pegawaiId
				? db.query.tablePegawai.findFirst({
						columns: { id: true, nama: true, nip: true },
						where: and(
							eq(tablePegawai.id, pegawaiId),
							eq(tablePegawai.sekolahId, sekolahId),
							eq(tablePegawai.status, 'aktif')
						)
					})
				: null
		]);
		if (!settings || !pegawai) return fail(400, { fail: 'Pengaturan atau pegawai tidak valid.' });
		const jabatanTim = clean(form.get('jabatanTim'), 150);
		if (!jabatanTim) return fail(400, { fail: 'Jabatan dalam tim wajib diisi.' });
		await db.insert(tableMartikulasiTim).values({
			settingsId: settings.id,
			pegawaiId: pegawai.id,
			namaSnapshot: pegawai.nama,
			nipSnapshot: pegawai.nip,
			jabatanTim,
			tugas: clean(form.get('tugas'), 2000),
			urutan: Number(form.get('urutan')) || 0,
			updatedAt: new Date().toISOString()
		});
		return { message: 'Anggota tim Martikulasi berhasil ditambahkan.' };
	},
	hapusTim: async ({ locals, request }) => {
		const denied = requireManager(locals);
		if (denied) return denied;
		const sekolahId = locals.sekolah?.id;
		const id = positiveInteger((await request.formData()).get('id'));
		if (!sekolahId || !id) return fail(400, { fail: 'Anggota tim tidak valid.' });
		const anggota = await db.query.tableMartikulasiTim.findFirst({
			columns: { id: true },
			where: eq(tableMartikulasiTim.id, id),
			with: { settings: { columns: { sekolahId: true } } }
		});
		if (!anggota || anggota.settings.sekolahId !== sekolahId) {
			return fail(404, { fail: 'Anggota tim tidak ditemukan.' });
		}
		await db.delete(tableMartikulasiTim).where(eq(tableMartikulasiTim.id, id));
		return { message: 'Anggota tim dihapus.' };
	},
	terbitkanSttm: async ({ locals, request }) => {
		const denied = requireManager(locals);
		if (denied) return denied;
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sesi sekolah tidak ditemukan.' });
		const form = await request.formData();
		const tahunAjaranId = positiveInteger(form.get('tahunAjaranId'));
		const tanggalSttm = clean(form.get('tanggalSttm'), 10);
		if (!tahunAjaranId || !tanggalSttm) {
			return fail(400, { fail: 'Tahun ajaran dan tanggal STTM wajib diisi.' });
		}
		const tahun = await ownedYear(sekolahId, tahunAjaranId);
		const settings = await db.query.tableMartikulasiSettings.findFirst({
			where: and(
				eq(tableMartikulasiSettings.sekolahId, sekolahId),
				eq(tableMartikulasiSettings.tahunAjaranId, tahunAjaranId)
			)
		});
		if (!tahun || !settings)
			return fail(400, { fail: 'Simpan pengaturan Martikulasi terlebih dahulu.' });

		const [sekolah, candidates] = await Promise.all([
			db.query.tableSekolah.findFirst({
				columns: { nama: true, npsn: true, naungan: true, email: true, statusKepalaSekolah: true },
				where: eq(tableSekolah.id, sekolahId),
				with: { kepalaSekolah: { columns: { nama: true, nip: true } } }
			}),
			db.query.tableMartikulasiHasil.findMany({
				columns: { id: true, levelPenempatan: true },
				where: and(
					eq(tableMartikulasiHasil.sekolahId, sekolahId),
					eq(tableMartikulasiHasil.tahunAjaranId, tahunAjaranId),
					eq(tableMartikulasiHasil.statusKelengkapan, 'lengkap'),
					isNull(tableMartikulasiHasil.nomorSttm)
				),
				with: {
					murid: { columns: { nama: true, nis: true, nisn: true } },
					kelas: {
						columns: { nama: true, fase: true },
						with: { waliKelas: { columns: { nama: true, nip: true } } }
					}
				},
				orderBy: [asc(tableMartikulasiHasil.id)]
			})
		]);
		if (!sekolah) return fail(404, { fail: 'Data sekolah tidak ditemukan.' });
		candidates.sort((a, b) => (a.murid?.nama ?? '').localeCompare(b.murid?.nama ?? '', 'id-ID'));
		if (!candidates.length)
			return { message: 'Tidak ada hasil lengkap yang memerlukan nomor STTM.' };

		await db.transaction(async (tx) => {
			let urut = settings.nomorUrutSttmBerikutnya;
			for (const candidate of candidates) {
				if (!candidate.murid || !candidate.kelas) continue;
				await tx
					.update(tableMartikulasiHasil)
					.set({
						nomorSttm: formatNomorSttm(settings.formatNomorSttm, {
							urut,
							tanggal: tanggalSttm,
							tahunAjaran: tahun.nama,
							nis: candidate.murid.nis
						}),
						tanggalSttm,
						muridNamaSnapshot: candidate.murid.nama,
						nisSnapshot: candidate.murid.nis,
						nisnSnapshot: candidate.murid.nisn,
						kelasNamaSnapshot: candidate.kelas.nama,
						jenjangSnapshot: inferKelasJadwalJenjang(candidate.kelas).toUpperCase(),
						waliKelasNamaSnapshot: candidate.kelas.waliKelas?.nama ?? null,
						waliKelasNipSnapshot: candidate.kelas.waliKelas?.nip ?? null,
						sekolahNamaSnapshot: sekolah.nama,
						npsnSnapshot: sekolah.npsn,
						naunganSnapshot: sekolah.naungan,
						alamatSnapshot: locals.sekolah ? composeAlamat(locals.sekolah) : null,
						emailSnapshot: sekolah.email,
						kepalaSekolahNamaSnapshot: sekolah.kepalaSekolah?.nama ?? null,
						kepalaSekolahNipSnapshot: sekolah.kepalaSekolah?.nip ?? null,
						kepalaSekolahStatusSnapshot: sekolah.statusKepalaSekolah,
						lokasiPenetapanSnapshot:
							settings.lokasiPenetapan || (locals.sekolah ? fallbackTempat(locals.sekolah) : null),
						levelPenempatanSnapshot: candidate.levelPenempatan,
						updatedAt: new Date().toISOString()
					})
					.where(
						and(
							eq(tableMartikulasiHasil.id, candidate.id),
							eq(tableMartikulasiHasil.sekolahId, sekolahId),
							eq(tableMartikulasiHasil.tahunAjaranId, tahunAjaranId),
							eq(tableMartikulasiHasil.statusKelengkapan, 'lengkap'),
							isNull(tableMartikulasiHasil.nomorSttm)
						)
					);
				urut += 1;
			}
			await tx
				.update(tableMartikulasiSettings)
				.set({ nomorUrutSttmBerikutnya: urut, updatedAt: new Date().toISOString() })
				.where(eq(tableMartikulasiSettings.id, settings.id));
		});
		return { message: `${candidates.length} nomor STTM berhasil diterbitkan.` };
	}
};
