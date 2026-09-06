import db from '$lib/server/db';
import { ensureMartikulasiSchema } from '$lib/server/db/ensure-martikulasi';
import {
	tableKelas,
	tableMartikulasiHasil,
	tableMartikulasiNilai,
	tableMurid,
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
import { getKelasContextForUser } from '$lib/server/route-utils';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

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

export async function load({ locals, url, depends, parent }) {
	depends('app:martikulasi');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');

	await ensureMartikulasiSchema();

	const { kelasAktif } = await parent();
	const selectedKelas = kelasAktif?.id
		? await db.query.tableKelas.findFirst({
				columns: { id: true, nama: true, fase: true, tahunAjaranId: true },
				where: and(eq(tableKelas.id, kelasAktif.id), eq(tableKelas.sekolahId, sekolahId))
			})
		: null;
	const selectedTahun = selectedKelas
		? await db.query.tableTahunAjaran.findFirst({
				columns: { id: true, nama: true },
				where: and(
					eq(tableTahunAjaran.id, selectedKelas.tahunAjaranId),
					eq(tableTahunAjaran.sekolahId, sekolahId)
				)
			})
		: null;
	const muridList = selectedKelas
		? await db.query.tableMurid.findMany({
				columns: { id: true, nis: true, nisn: true, nama: true },
				where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, selectedKelas.id)),
				orderBy: asc(tableMurid.nama)
			})
		: [];

	const hasilList = selectedKelas
		? await db.query.tableMartikulasiHasil.findMany({
				columns: { muridId: true, statusKelengkapan: true, levelPenempatan: true, updatedAt: true },
				where: and(
					eq(tableMartikulasiHasil.sekolahId, sekolahId),
					eq(tableMartikulasiHasil.tahunAjaranId, selectedTahun!.id),
					eq(tableMartikulasiHasil.kelasId, selectedKelas.id)
				)
			})
		: [];
	const hasilByMurid = new Map(hasilList.map((hasil) => [hasil.muridId, hasil]));
	const semuaMurid = muridList.map((murid) => ({
		...murid,
		statusKelengkapan: hasilByMurid.get(murid.id)?.statusKelengkapan ?? 'belum_lengkap',
		levelPenempatan: hasilByMurid.get(murid.id)?.levelPenempatan ?? null,
		updatedAt: hasilByMurid.get(murid.id)?.updatedAt ?? null
	}));
	const search = (url.searchParams.get('q') ?? '').trim();
	const filteredMurid = search
		? semuaMurid.filter((murid) =>
				`${murid.nama} ${murid.nis ?? ''} ${murid.nisn ?? ''}`
					.toLowerCase()
					.includes(search.toLowerCase())
			)
		: semuaMurid;
	const perPage = 20;
	const totalItems = filteredMurid.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
	const requestedPage = Math.max(1, positiveInteger(url.searchParams.get('page')) ?? 1);
	const currentPage = Math.min(requestedPage, totalPages);
	const daftarMurid = filteredMurid.slice((currentPage - 1) * perPage, currentPage * perPage);

	const requestedMuridId = positiveInteger(url.searchParams.get('murid_id'));
	const selectedMurid = semuaMurid.find((murid) => murid.id === requestedMuridId) ?? null;
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
		selectedTahunAjaranId: selectedTahun?.id ?? null,
		selectedTahunAjaranNama: selectedTahun?.nama ?? null,
		selectedJenjang: selectedKelas ? inferKelasJadwalJenjang(selectedKelas) : null,
		selectedKelas,
		daftarMurid,
		jumlahMurid: semuaMurid.length,
		jumlahLengkap: semuaMurid.filter((murid) => murid.statusKelengkapan === 'lengkap').length,
		page: { search, currentPage, totalPages, totalItems, perPage },
		canEdit: locals.user?.type !== 'wali_asuh' && locals.user?.type !== 'wali_asrama',
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
	simpan: async ({ locals, request, cookies }) => {
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
		if (Number(cookies.get('active-kelas-id')) !== kelasId) {
			return fail(403, { fail: 'Kelas tidak sesuai dengan kelas aktif pengguna.' });
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
		const access = await getKelasContextForUser(
			locals,
			{ searchParams: new URLSearchParams() },
			String(murid.id)
		);
		if (!access.hasAccess) {
			return fail(403, { fail: 'Akun tidak memiliki akses ke kelas murid ini.' });
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
	},
	isi_massal: async ({ locals, request, cookies }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sesi sekolah tidak ditemukan.' });
		if (locals.user?.type === 'wali_asuh' || locals.user?.type === 'wali_asrama') {
			return fail(403, { fail: 'Akun ini tidak memiliki izin mengubah nilai Martikulasi.' });
		}
		await ensureMartikulasiSchema();
		const form = await request.formData();
		const kelasId = positiveInteger(cleanText(form.get('kelasId')));
		const tahunAjaranId = positiveInteger(cleanText(form.get('tahunAjaranId')));
		const scope = cleanText(form.get('scope'), 20) === 'semua' ? 'semua' : 'terpilih';
		const aspekKode = cleanText(form.get('aspekKode'), 80);
		const field = cleanText(form.get('field'), 80);
		const rawValue = cleanText(form.get('value'), 2000);
		if (!kelasId || !tahunAjaranId || Number(cookies.get('active-kelas-id')) !== kelasId) {
			return fail(403, { fail: 'Kelas massal tidak sesuai dengan kelas aktif pengguna.' });
		}
		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true, nama: true, fase: true, tahunAjaranId: true },
			where: and(
				eq(tableKelas.id, kelasId),
				eq(tableKelas.sekolahId, sekolahId),
				eq(tableKelas.tahunAjaranId, tahunAjaranId)
			),
			with: { waliKelas: { columns: { nama: true, nip: true } } }
		});
		if (!kelas) return fail(400, { fail: 'Kelas aktif tidak ditemukan.' });
		let selectedIds: number[] = [];
		try {
			const parsed = JSON.parse(String(form.get('muridIds') ?? '[]'));
			if (Array.isArray(parsed))
				selectedIds = [
					...new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0))
				];
		} catch {}
		const muridRows = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true, nis: true, nisn: true },
			where: and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.kelasId, kelasId),
				scope === 'terpilih'
					? inArray(tableMurid.id, selectedIds.length ? selectedIds : [-1])
					: undefined
			)
		});
		if (!muridRows.length) return fail(400, { fail: 'Pilih minimal satu murid.' });
		const access = await getKelasContextForUser(
			locals,
			{ searchParams: new URLSearchParams() },
			String(muridRows[0].id)
		);
		if (!access.hasAccess) {
			return fail(403, { fail: 'Akun tidak memiliki akses mengisi kelas ini.' });
		}
		const aspek = martikulasiAspek.find((item) => item.kode === aspekKode);
		const nilaiFields = [
			'capaianAwal',
			'capaianAkhir',
			'ketuntasan',
			'catatan',
			'deskripsiCapaian'
		];
		const resultFields = ['levelPenempatan', 'rekomendasi', 'catatanUmum'];
		if ((!aspek || !nilaiFields.includes(field ?? '')) && !resultFields.includes(field ?? '')) {
			return fail(400, { fail: 'Bidang pengisian massal tidak valid.' });
		}
		let value: string | null = rawValue;
		if (field === 'ketuntasan' && value && !isMartikulasiKetuntasan(value))
			return fail(400, { fail: 'Ketuntasan tidak valid.' });
		if (field === 'levelPenempatan' && value && !isMartikulasiLevel(value))
			return fail(400, { fail: 'Level penempatan tidak valid.' });
		const now = new Date().toISOString();
		await db.transaction(async (tx) => {
			for (const murid of muridRows) {
				const existing = await tx.query.tableMartikulasiHasil.findFirst({
					where: and(
						eq(tableMartikulasiHasil.sekolahId, sekolahId),
						eq(tableMartikulasiHasil.tahunAjaranId, tahunAjaranId),
						eq(tableMartikulasiHasil.muridId, murid.id)
					),
					with: { nilai: true }
				});
				let level = existing?.levelPenempatan ?? null;
				const values = martikulasiAspek.map((item) => {
					const old = existing?.nilai.find((entry) => entry.aspekKode === item.kode);
					return {
						aspekKode: item.kode,
						kelompok: item.kelompok,
						capaianAwal: old?.capaianAwal ?? null,
						capaianAkhir: old?.capaianAkhir ?? null,
						ketuntasan: old?.ketuntasan ?? null,
						catatan: old?.catatan ?? null,
						deskripsiCapaian: old?.deskripsiCapaian ?? null
					};
				});
				if (field === 'levelPenempatan') level = value && isMartikulasiLevel(value) ? value : null;
				if (aspek && nilaiFields.includes(field ?? '')) {
					const target = values.find((item) => item.aspekKode === aspek.kode)!;
					(target as Record<string, unknown>)[field!] = value;
				}
				const statusKelengkapan = hitungStatusKelengkapanMartikulasi({
					akademik: values.filter((item) => item.kelompok === 'akademik'),
					karakter: values.filter((item) => item.kelompok === 'karakter'),
					levelPenempatan: level
				});
				const resultUpdate: Record<string, unknown> = {
					kelasId,
					statusKelengkapan,
					levelPenempatan: level,
					updatedAt: now
				};
				if (field === 'rekomendasi') resultUpdate.rekomendasi = value;
				if (field === 'catatanUmum') resultUpdate.catatanUmum = value;
				await tx
					.insert(tableMartikulasiHasil)
					.values({
						sekolahId,
						tahunAjaranId,
						kelasId,
						muridId: murid.id,
						statusKelengkapan,
						levelPenempatan: level,
						rekomendasi: field === 'rekomendasi' ? value : null,
						catatanUmum: field === 'catatanUmum' ? value : null,
						muridNamaSnapshot: murid.nama,
						nisSnapshot: murid.nis,
						nisnSnapshot: murid.nisn,
						kelasNamaSnapshot: kelas.nama,
						jenjangSnapshot: inferKelasJadwalJenjang(kelas).toUpperCase(),
						waliKelasNamaSnapshot: kelas.waliKelas?.nama ?? null,
						waliKelasNipSnapshot: kelas.waliKelas?.nip ?? null,
						updatedAt: now
					})
					.onConflictDoUpdate({
						target: [
							tableMartikulasiHasil.sekolahId,
							tableMartikulasiHasil.tahunAjaranId,
							tableMartikulasiHasil.muridId
						],
						set: resultUpdate
					});
				const saved = await tx.query.tableMartikulasiHasil.findFirst({
					columns: { id: true },
					where: and(
						eq(tableMartikulasiHasil.sekolahId, sekolahId),
						eq(tableMartikulasiHasil.tahunAjaranId, tahunAjaranId),
						eq(tableMartikulasiHasil.muridId, murid.id)
					)
				});
				if (saved && aspek && nilaiFields.includes(field ?? '')) {
					const target = values.find((item) => item.aspekKode === aspek.kode)!;
					await tx
						.insert(tableMartikulasiNilai)
						.values({ ...target, hasilId: saved.id, updatedAt: now })
						.onConflictDoUpdate({
							target: [tableMartikulasiNilai.hasilId, tableMartikulasiNilai.aspekKode],
							set: { ...target, updatedAt: now }
						});
				}
			}
		});
		return {
			message: `Pengisian massal berhasil diterapkan kepada ${muridRows.length} murid.`,
			updated: muridRows.length
		};
	}
};
