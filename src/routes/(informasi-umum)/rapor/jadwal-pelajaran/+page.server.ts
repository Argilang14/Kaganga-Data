import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureJadwalBellSchema } from '$lib/server/db/ensure-jadwal-bell';
import { ensureJadwalKurikulumSchema } from '$lib/server/db/ensure-jadwal-kurikulum';
import {
	tableBellSettings,
	tableJadwalKegiatan,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableKegiatanCustom,
	tableKelas
} from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const HARI_LIST = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
const AGAMA_MAPEL_NAMES = new Set([
	'Pendidikan Agama dan Budi Pekerti',
	'Pendidikan Agama Islam dan Budi Pekerti',
	'Pendidikan Agama Kristen dan Budi Pekerti',
	'Pendidikan Agama Katolik dan Budi Pekerti',
	'Pendidikan Agama Buddha dan Budi Pekerti',
	'Pendidikan Agama Hindu dan Budi Pekerti',
	'Pendidikan Agama Konghuchu dan Budi Pekerti'
]);

function normalizeKode(value: FormDataEntryValue | string | null | undefined) {
	return value?.toString().trim().toUpperCase() ?? '';
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:jadwal-pelajaran');
	const sekolahId = locals.sekolah?.id ?? null;
	const meta = { title: 'Jadwal Pelajaran' };
	if (!sekolahId) {
		return {
			meta,
			bellSettings: null,
			kegiatanCustom: [],
			jadwalPelajaran: [],
			daftarKelas: [],
			daftarKodeMapel: [],
			daftarKodeKokurikuler: []
		};
	}

	await ensureJadwalBellSchema();
	await ensureJadwalKurikulumSchema();
	const academicContext = await resolveSekolahAcademicContext(sekolahId);
	const activeSemesterId = academicContext?.activeSemesterId ?? null;

	const daftarKelas = await db.query.tableKelas.findMany({
		where: activeSemesterId
			? and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, activeSemesterId))
			: eq(tableKelas.sekolahId, sekolahId),
		columns: { id: true, nama: true, fase: true },
		orderBy: [asc(tableKelas.nama)]
	});

	const [bellSettings, kegiatanCustom, jadwalPelajaran, mapelRows, kegiatanRows] =
		await Promise.all([
			db.query.tableBellSettings.findFirst({
				where: eq(tableBellSettings.sekolahId, sekolahId)
			}),
			db.query.tableKegiatanCustom.findMany({
				where: eq(tableKegiatanCustom.sekolahId, sekolahId),
				orderBy: [asc(tableKegiatanCustom.kode)]
			}),
			db.query.tableJadwalPelajaran.findMany({
				where: eq(tableJadwalPelajaran.sekolahId, sekolahId),
				orderBy: [asc(tableJadwalPelajaran.hari), asc(tableJadwalPelajaran.jamKe)]
			}),
			db.query.tableJadwalMapel.findMany({
				where: eq(tableJadwalMapel.sekolahId, sekolahId),
				with: { guru: { columns: { id: true, nama: true } } },
				orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
			}),
			db.query.tableJadwalKegiatan.findMany({
				where: eq(tableJadwalKegiatan.sekolahId, sekolahId),
				orderBy: [asc(tableJadwalKegiatan.kategori), asc(tableJadwalKegiatan.nama)]
			})
		]);

	const kodeSet = new Set<string>();
	const mapelItems = mapelRows
		.filter((mapel) => mapel.aktif && mapel.kode)
		.map((mapel) => {
			const kode = AGAMA_MAPEL_NAMES.has(mapel.nama) ? 'PAPB' : mapel.kode;
			kodeSet.add(kode);
			return {
				id: mapel.id,
				kode,
				nama: mapel.nama,
				jenjang: mapel.jenjang,
				kategori: mapel.kategori,
				warna: mapel.warna,
				jpPerMinggu: mapel.jpPerMinggu ?? 0,
				guruId: mapel.guru?.id ?? null,
				guru: mapel.guru?.nama ?? null
			};
		});

	const kegiatanItems = kegiatanRows
		.filter((kegiatan) => kegiatan.aktif && kegiatan.kode)
		.map((kegiatan) => ({
			id: kegiatan.id,
			kode: kegiatan.kode.toUpperCase(),
			nama: kegiatan.nama,
			kategori: kegiatan.kategori,
			warna: kegiatan.warna
		}));

	return {
		meta,
		bellSettings,
		kegiatanCustom,
		jadwalPelajaran,
		daftarKelas,
		daftarKodeMapel: [...kodeSet].sort(),
		daftarKodeKokurikuler: [],
		daftarMapelItems: mapelItems,
		daftarKegiatanItems: kegiatanItems
	};
};

export const actions: Actions = {
	saveSettings: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const jamPelajaranMenit = Number(formData.get('jamPelajaranMenit'));
		const durasiIstirahat = Number(formData.get('durasiIstirahat'));
		const durasiUpacara = Number(formData.get('durasiUpacara'));
		const jamMulai = formData.get('jamMulai')?.toString().trim() ?? '';
		const isActive = formData.get('isActive') === '1';

		if (!Number.isInteger(jamPelajaranMenit) || jamPelajaranMenit < 1) {
			return fail(400, { fail: 'Durasi jam pelajaran tidak valid' });
		}
		if (!Number.isInteger(durasiIstirahat) || durasiIstirahat < 1) {
			return fail(400, { fail: 'Durasi istirahat tidak valid' });
		}
		if (!Number.isInteger(durasiUpacara) || durasiUpacara < 1) {
			return fail(400, { fail: 'Durasi upacara tidak valid' });
		}
		if (!/^\d{2}:\d{2}$/.test(jamMulai)) {
			return fail(400, { fail: 'Jam mulai tidak valid' });
		}

		await ensureJadwalBellSchema();
		await ensureJadwalKurikulumSchema();
		await db
			.insert(tableBellSettings)
			.values({
				sekolahId,
				jamPelajaranMenit,
				durasiIstirahat,
				durasiUpacara,
				jamMulai,
				isActive,
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: [tableBellSettings.sekolahId],
				set: { jamPelajaranMenit, durasiIstirahat, durasiUpacara, jamMulai, isActive }
			});

		return { message: 'Pengaturan jadwal tersimpan' };
	},

	addKegiatan: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const nama = formData.get('nama')?.toString().trim() ?? '';
		const kode = normalizeKode(formData.get('kode'));
		const durasiRaw = formData.get('durasi')?.toString().trim() ?? '';
		const durasi = durasiRaw ? Number(durasiRaw) : null;

		if (!nama || !kode) return fail(400, { fail: 'Nama dan kode wajib diisi' });
		if (kode.length > 12) return fail(400, { fail: 'Kode maksimal 12 karakter' });
		if (durasi !== null && (!Number.isInteger(durasi) || durasi < 1)) {
			return fail(400, { fail: 'Durasi harus berupa angka positif' });
		}

		await ensureJadwalBellSchema();
		await ensureJadwalKurikulumSchema();
		const existing = await db.query.tableKegiatanCustom.findFirst({
			where: and(eq(tableKegiatanCustom.sekolahId, sekolahId), eq(tableKegiatanCustom.kode, kode))
		});
		if (existing) return fail(400, { fail: 'Kode kegiatan sudah digunakan' });

		await db.insert(tableKegiatanCustom).values({ sekolahId, nama, kode, durasi });
		return { message: 'Kegiatan ditambahkan' };
	},

	deleteKegiatan: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const kode = normalizeKode(formData.get('kode'));
		if (!kode) return fail(400, { fail: 'Kode kegiatan tidak valid' });

		await ensureJadwalBellSchema();
		await ensureJadwalKurikulumSchema();
		await db
			.delete(tableKegiatanCustom)
			.where(and(eq(tableKegiatanCustom.sekolahId, sekolahId), eq(tableKegiatanCustom.kode, kode)));
		return { message: 'Kegiatan dihapus' };
	},

	saveJadwal: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const raw = formData.get('data')?.toString() ?? '';
		let entries: Array<{ hari: string; jamKe: number; kelasId: number; kodeKegiatan: string }>;
		try {
			entries = JSON.parse(raw);
		} catch {
			return fail(400, { fail: 'Format jadwal tidak valid' });
		}

		const [kelasRows, mapelRows] = await Promise.all([
			db.query.tableKelas.findMany({
				where: eq(tableKelas.sekolahId, sekolahId),
				columns: { id: true, nama: true }
			}),
			db.query.tableJadwalMapel.findMany({
				where: eq(tableJadwalMapel.sekolahId, sekolahId),
				columns: { id: true, kode: true, nama: true, guruPegawaiId: true },
				with: { guru: { columns: { nama: true } } }
			})
		]);
		const kelasIds = new Set(kelasRows.map((row) => row.id));
		const kelasNama = new Map(kelasRows.map((row) => [row.id, row.nama]));
		const mapelByCode = new Map<string, typeof mapelRows>();
		for (const mapel of mapelRows) {
			const kode = AGAMA_MAPEL_NAMES.has(mapel.nama) ? 'PAPB' : normalizeKode(mapel.kode);
			const group = mapelByCode.get(kode) ?? [];
			group.push(mapel);
			mapelByCode.set(kode, group);
		}
		const cleaned = entries
			.map((entry) => ({
				hari: entry.hari,
				jamKe: Number(entry.jamKe),
				kelasId: Number(entry.kelasId),
				kodeKegiatan: normalizeKode(entry.kodeKegiatan)
			}))
			.filter(
				(entry) =>
					HARI_LIST.includes(entry.hari) &&
					Number.isInteger(entry.jamKe) &&
					entry.jamKe > 0 &&
					entry.jamKe <= 30 &&
					kelasIds.has(entry.kelasId) &&
					entry.kodeKegiatan
			);

		const resolved = cleaned.map((entry) => {
			const candidates = mapelByCode.get(entry.kodeKegiatan) ?? [];
			const guruIds = [...new Set(candidates.map((mapel) => mapel.guruPegawaiId).filter(Boolean))];
			const match = candidates.length === 1 ? candidates[0] : null;
			const guruId = guruIds.length === 1 ? Number(guruIds[0]) : null;
			return {
				...entry,
				jadwalMapelId: match?.id ?? null,
				guruPegawaiId: guruId,
				guruNama: guruId
					? candidates.find((mapel) => mapel.guruPegawaiId === guruId)?.guru?.nama ?? 'Guru'
					: null
			};
		});
		const teacherSlots = new Map<string, typeof resolved>();
		for (const entry of resolved) {
			if (!entry.guruPegawaiId) continue;
			const key = entry.hari + '|' + entry.jamKe + '|' + entry.guruPegawaiId;
			const group = teacherSlots.get(key) ?? [];
			group.push(entry);
			teacherSlots.set(key, group);
		}
		for (const group of teacherSlots.values()) {
			const classIds = [...new Set(group.map((entry) => entry.kelasId))];
			if (classIds.length < 2) continue;
			const first = group[0];
			const classes = classIds.map((id) => kelasNama.get(id) ?? 'Kelas ' + id).join(', ');
			return fail(400, {
				fail: 'Bentrok guru ' + first.guruNama + ': ' + first.hari + ' jam ke-' + first.jamKe + ' di ' + classes + '.'
			});
		}

		await ensureJadwalBellSchema();
		await ensureJadwalKurikulumSchema();
		await db.transaction(async (tx) => {
			await tx.delete(tableJadwalPelajaran).where(eq(tableJadwalPelajaran.sekolahId, sekolahId));
			if (cleaned.length) {
				await tx.insert(tableJadwalPelajaran).values(
					resolved.map((entry) => ({
						sekolahId,
						hari: entry.hari,
						jamKe: entry.jamKe,
						kelasId: entry.kelasId,
						kodeKegiatan: entry.kodeKegiatan,
						jadwalMapelId: entry.jadwalMapelId,
						guruPegawaiId: entry.guruPegawaiId,
						updatedAt: new Date().toISOString()
					}))
				);
			}
		});

		return { message: 'Jadwal pelajaran tersimpan' };
	}
};
