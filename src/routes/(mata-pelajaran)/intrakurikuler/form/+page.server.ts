import db from '$lib/server/db/index.js';
import { tableJadwalMapel, tableKelas, tableMataPelajaran } from '$lib/server/db/schema';
import { cookieNames, unflattenFormData } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { agamaMapelNames } from '$lib/statics';

const KATEGORI_TO_JENIS: Record<string, MataPelajaran['jenis']> = {
	akademik: 'wajib',
	kokurikuler: 'pilihan',
	keasramaan: 'pilihan',
	muatan_lokal: 'mulok'
};

function parsePositiveInteger(value: unknown) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function load({ parent, locals }) {
	const { kelasAktif } = await parent();
	const sekolahId = locals.sekolah?.id;
	const masterMapelOptions = sekolahId
		? await db.query.tableJadwalMapel.findMany({
				where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.aktif, true)),
				with: { guru: true },
				orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
			})
		: [];
	return { meta: { title: 'Form Mata Pelajaran' }, kelasAktif, masterMapelOptions };
}

export const actions = {
	async add({ request, cookies, locals }) {
		const formMapel = unflattenFormData<{
			nama?: string;
			jenis?: string;
			kkm?: string;
			kode?: string;
			jadwalMapelId?: string;
		}>(await request.formData());

		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID);
		if (!kelasIdCookie) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu di navbar.' });
		}

		const kelasId = Number(kelasIdCookie);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas aktif tidak valid.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });
		}

		const kelasAktif = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
		});
		if (!kelasAktif) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan.' });
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

		const nama = selectedMaster?.nama?.trim() || formMapel.nama?.trim();
		const jenis =
			(formMapel.jenis?.toLowerCase() as MataPelajaran['jenis'] | undefined) ??
			(selectedMaster ? KATEGORI_TO_JENIS[selectedMaster.kategori] : undefined);
		const kkmValue = formMapel.kkm ? Number(formMapel.kkm) : Number.NaN;
		let kode = selectedMaster?.kode?.toString().trim() || formMapel.kode?.toString().trim() || '';

		if (!nama || !jenis || Number.isNaN(kkmValue)) {
			return fail(400, { fail: 'Harap lengkapi data mata pelajaran.' });
		}

		if (!['wajib', 'pilihan', 'mulok', 'kejuruan'].includes(jenis)) {
			return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
		}

		const kkm = Math.max(0, Math.round(kkmValue));

		const AGAMA_SET = new Set<string>(agamaMapelNames);
		if (AGAMA_SET.has(nama)) {
			kode = 'PAPB';
		}

		const existing = await db.query.tableMataPelajaran.findFirst({
			where: and(eq(tableMataPelajaran.kelasId, kelasId), eq(tableMataPelajaran.nama, nama))
		});

		if (existing) {
			return fail(400, {
				fail: 'Mata pelajaran "' + nama + '" sudah ada di kelas ini. Tidak boleh duplikat.'
			});
		}

		await db.insert(tableMataPelajaran).values({
			nama,
			jenis,
			kkm,
			kelasId,
			jadwalMapelId: selectedMaster?.id ?? null,
			guruPegawaiId: selectedMaster?.guruPegawaiId ?? null,
			kode: kode || null
		});
		return { message: 'Data mata pelajaran berhasil ditambah' };
	}
};
