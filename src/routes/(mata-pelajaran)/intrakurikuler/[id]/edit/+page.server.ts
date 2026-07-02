import db from '$lib/server/db/index.js';
import { tableJadwalMapel, tableMataPelajaran } from '$lib/server/db/schema.js';
import { agamaMapelNames, pksMapelNames } from '$lib/statics';
import { unflattenFormData } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

const AGAMA_MAPEL_NAME_SET = new Set<string>(agamaMapelNames);
const PKS_MAPEL_NAME_SET = new Set<string>(pksMapelNames);
const JENIS_VALUES = ['wajib', 'pilihan', 'mulok', 'kejuruan'] as const;
const KATEGORI_TO_JENIS: Record<string, MataPelajaran['jenis']> = {
	akademik: 'wajib',
	kokurikuler: 'pilihan',
	keasramaan: 'pilihan',
	muatan_lokal: 'mulok'
};

function isValidJenis(value: string): value is (typeof JENIS_VALUES)[number] {
	return (JENIS_VALUES as readonly string[]).includes(value);
}

function parsePositiveInteger(value: unknown) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function load({ parent, locals }) {
	const { mapel } = await parent();
	const sekolahId = locals.sekolah?.id;
	const masterMapelOptions = sekolahId
		? await db.query.tableJadwalMapel.findMany({
				where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.aktif, true)),
				with: { guru: true },
				orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
			})
		: [];
	return {
		meta: { title: 'Edit Mata Pelajaran - ' + mapel.nama },
		kelasAktif: mapel.kelas,
		masterMapelOptions
	};
}

export const actions = {
	async update({ params, request, locals }) {
		const id = Number(params.id);
		if (!Number.isInteger(id)) {
			return fail(400, { fail: 'Data mata pelajaran tidak valid.' });
		}

		const formMapel = unflattenFormData<{
			nama?: string;
			jenis?: string;
			kkm?: string;
			kode?: string;
			jadwalMapelId?: string;
		}>(await request.formData());

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });
		}

		const existing = await db.query.tableMataPelajaran.findFirst({
			where: eq(tableMataPelajaran.id, id),
			with: { kelas: true }
		});

		if (!existing || existing.kelas.sekolahId !== sekolahId) {
			return fail(404, { fail: 'Data mata pelajaran tidak ditemukan.' });
		}

		const kkmValue = formMapel.kkm ? Number(formMapel.kkm) : Number.NaN;
		if (Number.isNaN(kkmValue)) {
			return fail(400, { fail: 'KKM tidak valid.' });
		}

		const isAgamaGroup = AGAMA_MAPEL_NAME_SET.has(existing.nama);
		const isPksGroup = PKS_MAPEL_NAME_SET.has(existing.nama);
		const now = new Date().toISOString();
		const kkm = Math.max(0, Math.round(kkmValue));

		if (isAgamaGroup) {
			await db
				.update(tableMataPelajaran)
				.set({ kkm, kode: 'PAPB', updatedAt: now })
				.where(
					and(
						eq(tableMataPelajaran.kelasId, existing.kelasId),
						inArray(tableMataPelajaran.nama, agamaMapelNames)
					)
				);

			return { message: 'KKM Pendidikan Agama dan Budi Pekerti diperbarui' };
		}

		if (isPksGroup) {
			const jenisRaw = formMapel.jenis?.toString().toLowerCase() ?? existing.jenis;
			if (!isValidJenis(jenisRaw)) {
				return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
			}

			await db
				.update(tableMataPelajaran)
				.set({ kkm, jenis: jenisRaw, kode: 'PKS', updatedAt: now })
				.where(
					and(
						eq(tableMataPelajaran.kelasId, existing.kelasId),
						inArray(tableMataPelajaran.nama, pksMapelNames)
					)
				);

			return { message: 'KKM dan jenis Pendalaman Kitab Suci diperbarui' };
		}

		const jadwalMapelId = parsePositiveInteger(formMapel.jadwalMapelId);
		const selectedMaster = jadwalMapelId
			? await db.query.tableJadwalMapel.findFirst({
					where: and(
						eq(tableJadwalMapel.id, jadwalMapelId),
						eq(tableJadwalMapel.sekolahId, sekolahId),
						eq(tableJadwalMapel.aktif, true)
					)
				})
			: null;

		if (jadwalMapelId && !selectedMaster) {
			return fail(400, { fail: 'Data mata pelajaran master tidak ditemukan.' });
		}

		const nama = selectedMaster?.nama?.trim() || formMapel.nama?.toString().trim();
		if (!nama) {
			return fail(400, { fail: 'Nama mata pelajaran wajib diisi.' });
		}

		const jenisRaw =
			formMapel.jenis?.toString().toLowerCase() ||
			(selectedMaster ? KATEGORI_TO_JENIS[selectedMaster.kategori] : '');
		if (!isValidJenis(jenisRaw)) {
			return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
		}

		const kode = selectedMaster?.kode?.toString().trim() || formMapel.kode?.toString().trim() || '';
		const updates: Record<string, unknown> = {
			nama,
			jenis: jenisRaw,
			kkm,
			jadwalMapelId: selectedMaster?.id ?? null,
			guruPegawaiId: selectedMaster?.guruPegawaiId ?? null,
			updatedAt: now
		};
		if (kode) updates.kode = kode;

		await db.update(tableMataPelajaran).set(updates).where(eq(tableMataPelajaran.id, id));

		return { message: 'Data mata pelajaran berhasil diperbarui' };
	}
};
