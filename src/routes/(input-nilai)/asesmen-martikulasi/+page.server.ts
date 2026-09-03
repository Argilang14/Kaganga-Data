import db from '$lib/server/db';
import { ensureMartikulasiSchema } from '$lib/server/db/ensure-martikulasi';
import {
	tableKelas,
	tableMartikulasiHasil,
	tableMartikulasiNilai,
	tableMurid,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import {
	isMartikulasiKetuntasan,
	isMartikulasiLevel,
	hitungStatusKelengkapanMartikulasi,
	martikulasiAspek,
	martikulasiAspekAkademik,
	martikulasiAspekKarakter,
	martikulasiKetuntasanOptions,
	martikulasiLevelOptions
} from '$lib/martikulasi';
import { inferKelasJadwalJenjang } from '$lib/server/jadwal';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';

const cleanText = (value: FormDataEntryValue | null, maxLength = 1000) => {
	if (typeof value !== 'string') return null;
	const cleaned = value.trim();
	return cleaned ? cleaned.slice(0, maxLength) : null;
};

const positiveInteger = (value: string | null) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

function nilaiField(aspekKode: string, field: string) {
	return `nilai_${aspekKode}_${field}`;
}

export async function load({ locals, url, depends }) {
	depends('app:martikulasi');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');

	await ensureMartikulasiSchema();

	const tahunAjaranList = await db.query.tableTahunAjaran.findMany({
		columns: { id: true, nama: true, isAktif: true },
		where: eq(tableTahunAjaran.sekolahId, sekolahId),
		orderBy: desc(tableTahunAjaran.id)
	});
	const requestedTahunId = positiveInteger(url.searchParams.get('tahun_ajaran_id'));
	const selectedTahun =
		tahunAjaranList.find((item) => item.id === requestedTahunId) ??
		tahunAjaranList.find((item) => item.isAktif) ??
		tahunAjaranList[0] ??
		null;

	const semesters = selectedTahun
		? await db.query.tableSemester.findMany({
				columns: { id: true, tipe: true, isAktif: true },
				where: eq(tableSemester.tahunAjaranId, selectedTahun.id),
				orderBy: asc(tableSemester.id)
			})
		: [];
	const selectedSemester =
		semesters.find((item) => item.tipe === 'ganjil') ??
		semesters.find((item) => item.isAktif) ??
		semesters[0] ??
		null;

	const semuaKelas = selectedSemester
		? await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				where: and(
					eq(tableKelas.sekolahId, sekolahId),
					eq(tableKelas.tahunAjaranId, selectedTahun!.id),
					eq(tableKelas.semesterId, selectedSemester.id)
				),
				orderBy: asc(tableKelas.nama)
			})
		: [];
	const requestedJenjang = url.searchParams.get('jenjang');
	const selectedJenjang = ['semua', 'srd', 'srmp', 'srma'].includes(requestedJenjang ?? '')
		? requestedJenjang!
		: 'semua';
	const kelasList = semuaKelas
		.map((kelas) => ({ ...kelas, jenjang: inferKelasJadwalJenjang(kelas) }))
		.filter((kelas) => selectedJenjang === 'semua' || kelas.jenjang === selectedJenjang);

	const requestedKelasId = positiveInteger(url.searchParams.get('kelas_id'));
	const selectedKelas =
		kelasList.find((kelas) => kelas.id === requestedKelasId) ?? kelasList[0] ?? null;
	const muridList = selectedKelas
		? await db.query.tableMurid.findMany({
				columns: { id: true, nis: true, nisn: true, nama: true },
				where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, selectedKelas.id)),
				orderBy: asc(tableMurid.nama)
			})
		: [];

	const hasilList = selectedKelas
		? await db.query.tableMartikulasiHasil.findMany({
				columns: { muridId: true, statusKelengkapan: true, updatedAt: true },
				where: and(
					eq(tableMartikulasiHasil.sekolahId, sekolahId),
					eq(tableMartikulasiHasil.tahunAjaranId, selectedTahun!.id),
					eq(tableMartikulasiHasil.kelasId, selectedKelas.id)
				)
			})
		: [];
	const hasilByMurid = new Map(hasilList.map((hasil) => [hasil.muridId, hasil]));
	const daftarMurid = muridList.map((murid) => ({
		...murid,
		statusKelengkapan: hasilByMurid.get(murid.id)?.statusKelengkapan ?? 'belum_lengkap',
		updatedAt: hasilByMurid.get(murid.id)?.updatedAt ?? null
	}));

	const requestedMuridId = positiveInteger(url.searchParams.get('murid_id'));
	const selectedMurid =
		daftarMurid.find((murid) => murid.id === requestedMuridId) ?? daftarMurid[0] ?? null;
	const hasil =
		selectedMurid && selectedTahun
			? await db.query.tableMartikulasiHasil.findFirst({
					where: and(
						eq(tableMartikulasiHasil.sekolahId, sekolahId),
						eq(tableMartikulasiHasil.tahunAjaranId, selectedTahun.id),
						eq(tableMartikulasiHasil.muridId, selectedMurid.id)
					),
					with: { nilai: true }
				})
			: null;
	const nilaiByAspek = Object.fromEntries(
		(hasil?.nilai ?? []).map((nilai) => [
			nilai.aspekKode,
			{
				capaianAwal: nilai.capaianAwal ?? '',
				capaianAkhir: nilai.capaianAkhir ?? '',
				ketuntasan: nilai.ketuntasan ?? '',
				catatan: nilai.catatan ?? '',
				deskripsiCapaian: nilai.deskripsiCapaian ?? ''
			}
		])
	);

	return {
		meta: { title: 'Penilaian Martikulasi' } satisfies PageMeta,
		tahunAjaranList,
		selectedTahunAjaranId: selectedTahun?.id ?? null,
		selectedJenjang,
		kelasList,
		selectedKelas,
		daftarMurid,
		selectedMurid,
		hasil: hasil
			? {
					statusKelengkapan: hasil.statusKelengkapan,
					levelPenempatan: hasil.levelPenempatan ?? '',
					rekomendasi: hasil.rekomendasi ?? '',
					catatanUmum: hasil.catatanUmum ?? ''
				}
			: null,
		nilaiByAspek,
		aspekAkademik: martikulasiAspekAkademik,
		aspekKarakter: martikulasiAspekKarakter,
		ketuntasanOptions: martikulasiKetuntasanOptions,
		levelOptions: martikulasiLevelOptions
	};
}

export const actions = {
	simpan: async ({ locals, request }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sesi sekolah tidak ditemukan.' });
		if (locals.user?.type === 'wali_asuh' || locals.user?.type === 'wali_asrama') {
			return fail(403, { fail: 'Akun ini tidak memiliki izin mengubah nilai Martikulasi.' });
		}

		await ensureMartikulasiSchema();
		const formData = await request.formData();
		const tahunAjaranId = positiveInteger(cleanText(formData.get('tahunAjaranId')));
		const kelasId = positiveInteger(cleanText(formData.get('kelasId')));
		const muridId = positiveInteger(cleanText(formData.get('muridId')));
		if (!tahunAjaranId || !kelasId || !muridId) {
			return fail(400, { fail: 'Tahun ajaran, kelas, dan murid wajib dipilih.' });
		}

		const [tahun, kelas, murid] = await Promise.all([
			db.query.tableTahunAjaran.findFirst({
				columns: { id: true },
				where: and(
					eq(tableTahunAjaran.id, tahunAjaranId),
					eq(tableTahunAjaran.sekolahId, sekolahId)
				)
			}),
			db.query.tableKelas.findFirst({
				columns: { id: true, nama: true, fase: true },
				where: and(
					eq(tableKelas.id, kelasId),
					eq(tableKelas.sekolahId, sekolahId),
					eq(tableKelas.tahunAjaranId, tahunAjaranId)
				),
				with: { waliKelas: { columns: { nama: true, nip: true } } }
			}),
			db.query.tableMurid.findFirst({
				columns: { id: true, nama: true, nis: true, nisn: true },
				where: and(
					eq(tableMurid.id, muridId),
					eq(tableMurid.sekolahId, sekolahId),
					eq(tableMurid.kelasId, kelasId)
				)
			})
		]);
		if (!tahun || !kelas || !murid) {
			return fail(400, { fail: 'Konteks Martikulasi tidak cocok dengan sekolah aktif.' });
		}

		const levelRaw = cleanText(formData.get('levelPenempatan'), 50);
		const levelPenempatan = levelRaw && isMartikulasiLevel(levelRaw) ? levelRaw : null;
		const rekomendasi = cleanText(formData.get('rekomendasi'), 3000);
		const catatanUmum = cleanText(formData.get('catatanUmum'), 3000);
		const nilai = martikulasiAspek.map((aspek) => {
			const ketuntasanRaw = cleanText(formData.get(nilaiField(aspek.kode, 'ketuntasan')), 50);
			return {
				aspekKode: aspek.kode,
				kelompok: aspek.kelompok,
				capaianAwal: cleanText(formData.get(nilaiField(aspek.kode, 'capaianAwal')), 200),
				capaianAkhir: cleanText(formData.get(nilaiField(aspek.kode, 'capaianAkhir')), 200),
				ketuntasan: ketuntasanRaw && isMartikulasiKetuntasan(ketuntasanRaw) ? ketuntasanRaw : null,
				catatan: cleanText(formData.get(nilaiField(aspek.kode, 'catatan')), 1000),
				deskripsiCapaian: cleanText(formData.get(nilaiField(aspek.kode, 'deskripsiCapaian')), 2000)
			};
		});
		const statusKelengkapan = hitungStatusKelengkapanMartikulasi({
			akademik: nilai.filter((item) => item.kelompok === 'akademik'),
			karakter: nilai.filter((item) => item.kelompok === 'karakter'),
			levelPenempatan
		});
		const now = new Date().toISOString();
		const existingHasil = await db.query.tableMartikulasiHasil.findFirst({
			columns: { nomorSttm: true },
			where: and(
				eq(tableMartikulasiHasil.sekolahId, sekolahId),
				eq(tableMartikulasiHasil.tahunAjaranId, tahunAjaranId),
				eq(tableMartikulasiHasil.muridId, muridId)
			)
		});
		const identitySnapshot = {
			muridNamaSnapshot: murid.nama,
			nisSnapshot: murid.nis,
			nisnSnapshot: murid.nisn,
			kelasNamaSnapshot: kelas.nama,
			jenjangSnapshot: inferKelasJadwalJenjang(kelas).toUpperCase(),
			waliKelasNamaSnapshot: kelas.waliKelas?.nama ?? null,
			waliKelasNipSnapshot: kelas.waliKelas?.nip ?? null
		};

		await db.transaction(async (tx) => {
			await tx
				.insert(tableMartikulasiHasil)
				.values({
					sekolahId,
					tahunAjaranId,
					kelasId,
					muridId,
					statusKelengkapan,
					levelPenempatan,
					rekomendasi,
					catatanUmum,
					...identitySnapshot,
					updatedAt: now
				})
				.onConflictDoUpdate({
					target: [
						tableMartikulasiHasil.sekolahId,
						tableMartikulasiHasil.tahunAjaranId,
						tableMartikulasiHasil.muridId
					],
					set: {
						kelasId,
						statusKelengkapan,
						levelPenempatan,
						rekomendasi,
						catatanUmum,
						...(existingHasil?.nomorSttm ? {} : identitySnapshot),
						updatedAt: now
					}
				});

			const hasil = await tx.query.tableMartikulasiHasil.findFirst({
				columns: { id: true },
				where: and(
					eq(tableMartikulasiHasil.sekolahId, sekolahId),
					eq(tableMartikulasiHasil.tahunAjaranId, tahunAjaranId),
					eq(tableMartikulasiHasil.muridId, muridId)
				)
			});
			if (!hasil) throw new Error('Hasil Martikulasi gagal dibuat.');

			await tx.delete(tableMartikulasiNilai).where(eq(tableMartikulasiNilai.hasilId, hasil.id));
			const terisi = nilai.filter(
				(item) =>
					item.capaianAwal ||
					item.capaianAkhir ||
					item.ketuntasan ||
					item.catatan ||
					item.deskripsiCapaian
			);
			if (terisi.length) {
				await tx
					.insert(tableMartikulasiNilai)
					.values(terisi.map((item) => ({ ...item, hasilId: hasil.id, updatedAt: now })));
			}
		});

		return {
			message:
				statusKelengkapan === 'lengkap'
					? 'Nilai Martikulasi tersimpan dan dinyatakan lengkap.'
					: 'Nilai Martikulasi tersimpan sebagai belum lengkap.'
		};
	}
};
