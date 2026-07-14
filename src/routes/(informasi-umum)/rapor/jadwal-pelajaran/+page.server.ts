import {
	ensureDefaultJadwalFoundation,
	ensureJadwalPelajaranTemplate,
	inferKelasJadwalJenjang,
	JADWAL_JENIS,
	JADWAL_JENIS_LABELS,
	JADWAL_JENJANG,
	mapelSesuaiJenjang,
	selectJadwalContext
} from '$lib/server/jadwal';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureJadwalBellSchema } from '$lib/server/db/ensure-jadwal-bell';
import { ensureJadwalKurikulumSchema } from '$lib/server/db/ensure-jadwal-kurikulum';
import {
	tableBellSettings,
	tableJadwalJam,
	tableJadwalKegiatan,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableJadwalTemplate,
	tableKegiatanCustom,
	tableKelas
} from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
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

export const load: PageServerLoad = async ({ locals, depends, url }) => {
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
	const context = selectJadwalContext(academicContext, {
		tahunAjaranId: url.searchParams.get('tahunAjaranId'),
		jenis: url.searchParams.get('jenis')
	});
	if (!context.tahunAjaranId) {
		return {
			meta,
			jadwalPelajaran: [],
			jadwalJam: [],
			daftarKelas: [],
			daftarMapelItems: [],
			daftarKegiatanItems: [],
			tahunAjaranList: [],
			jenisOptions: JADWAL_JENIS.map((value) => ({ value, label: JADWAL_JENIS_LABELS[value] })),
			selectedContext: context
		};
	}
	const selectedYear = academicContext.tahunAjaranList.find(
		(item) => item.id === context.tahunAjaranId
	);
	const classSemesterId =
		context.semesterId ?? selectedYear?.semester.find((item) => item.tipe === 'ganjil')?.id ?? null;
	const scheduleTemplate = await ensureJadwalPelajaranTemplate(sekolahId, context);
	await Promise.all(
		JADWAL_JENJANG.map((jenjang) =>
			ensureDefaultJadwalFoundation(sekolahId, { ...context, jenjang })
		)
	);
	const settingTemplates = await db.query.tableJadwalTemplate.findMany({
		columns: { id: true },
		where: and(
			eq(tableJadwalTemplate.sekolahId, sekolahId),
			eq(tableJadwalTemplate.tahunAjaranId, context.tahunAjaranId),
			eq(tableJadwalTemplate.jenis, context.jenis)
		)
	});
	if (
		context.tahunAjaranId === academicContext.activeTahunAjaranId &&
		context.jenis === (academicContext.activeSemesterTipe ?? 'ganjil')
	) {
		await db
			.update(tableJadwalPelajaran)
			.set({ templateId: scheduleTemplate.id, semesterId: context.semesterId })
			.where(
				and(eq(tableJadwalPelajaran.sekolahId, sekolahId), isNull(tableJadwalPelajaran.templateId))
			);
	}

	const daftarKelas = await db.query.tableKelas.findMany({
		where: classSemesterId
			? and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, classSemesterId))
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
				where: and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.templateId, scheduleTemplate.id)
				),
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

	const templateIds = settingTemplates.map((template) => template.id);
	const jadwalJam = templateIds.length
		? await db.query.tableJadwalJam.findMany({
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					inArray(tableJadwalJam.templateId, templateIds)
				),
				orderBy: [asc(tableJadwalJam.urutan), asc(tableJadwalJam.jamKe)]
			})
		: [];
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
		tahunAjaranList: academicContext.tahunAjaranList.map((item) => ({
			id: item.id,
			nama: item.nama
		})),
		jenisOptions: JADWAL_JENIS.map((value) => ({ value, label: JADWAL_JENIS_LABELS[value] })),
		selectedContext: context,
		bellSettings,
		kegiatanCustom,
		jadwalPelajaran,
		jadwalJam,
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
		const academic = await resolveSekolahAcademicContext(sekolahId);
		const context = selectJadwalContext(academic, {
			tahunAjaranId: formData.get('tahunAjaranId')?.toString(),
			jenis: formData.get('jenis')?.toString()
		});
		if (!context.tahunAjaranId) return fail(400, { fail: 'Tahun ajaran belum tersedia.' });
		const scheduleTemplate = await ensureJadwalPelajaranTemplate(sekolahId, context);
		await ensureDefaultJadwalFoundation(sekolahId, { ...context, jenjang: 'srd' });
		const settingTemplates = await db.query.tableJadwalTemplate.findMany({
			columns: { id: true },
			where: and(
				eq(tableJadwalTemplate.sekolahId, sekolahId),
				eq(tableJadwalTemplate.tahunAjaranId, context.tahunAjaranId),
				eq(tableJadwalTemplate.jenis, context.jenis)
			)
		});
		const settingTemplateIds = settingTemplates.map((template) => template.id);
		const raw = formData.get('data')?.toString() ?? '';
		let entries: Array<{ hari: string; jamKe: number; kelasId: number; kodeKegiatan: string }>;
		try {
			entries = JSON.parse(raw);
		} catch {
			return fail(400, { fail: 'Format jadwal tidak valid' });
		}

		const [kelasRows, mapelRows, jamRows] = await Promise.all([
			db.query.tableKelas.findMany({
				where: eq(tableKelas.sekolahId, sekolahId),
				columns: { id: true, nama: true, fase: true }
			}),
			db.query.tableJadwalMapel.findMany({
				where: eq(tableJadwalMapel.sekolahId, sekolahId),
				columns: {
					id: true,
					kode: true,
					nama: true,
					jenjang: true,
					aktif: true,
					guruPegawaiId: true
				},
				with: { guru: { columns: { nama: true } } }
			}),
			settingTemplateIds.length
				? db.query.tableJadwalJam.findMany({
						where: and(
							eq(tableJadwalJam.sekolahId, sekolahId),
							inArray(tableJadwalJam.templateId, settingTemplateIds)
						)
					})
				: []
		]);
		const kelasIds = new Set(kelasRows.map((row) => row.id));
		const kelasNama = new Map(kelasRows.map((row) => [row.id, row.nama]));
		const mapelByCode = new Map<string, typeof mapelRows>();
		for (const mapel of mapelRows) {
			if (!mapel.aktif || !mapel.kode) continue;
			const kode = AGAMA_MAPEL_NAMES.has(mapel.nama) ? 'PAPB' : normalizeKode(mapel.kode);
			const group = mapelByCode.get(kode) ?? [];
			group.push(mapel);
			mapelByCode.set(kode, group);
		}
		const kelasById = new Map(
			kelasRows.map((kelas) => [kelas.id, { ...kelas, jenjang: inferKelasJadwalJenjang(kelas) }])
		);
		const activeSlotKeys = new Set(
			jamRows
				.filter((slot) => slot.aktif)
				.map((slot) => `${slot.jenjang}|${slot.hari}|${slot.jamKe}`)
		);

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

		for (const entry of cleaned) {
			const kelas = kelasById.get(entry.kelasId);
			if (!kelas) continue;
			const candidates = mapelByCode.get(entry.kodeKegiatan) ?? [];
			if (
				candidates.length &&
				!candidates.some((mapel) => mapelSesuaiJenjang(mapel.jenjang, kelas.jenjang))
			) {
				return fail(400, {
					fail: `Mata pelajaran ${entry.kodeKegiatan} tidak tersedia untuk kelas ${kelas.nama} (${kelas.jenjang.toUpperCase()}).`
				});
			}
			if (!activeSlotKeys.has(`${kelas.jenjang}|${entry.hari}|${entry.jamKe}`)) {
				return fail(400, {
					fail: `Jam ke-${entry.jamKe} pada ${entry.hari} tidak aktif untuk kelas ${kelas.nama} (${kelas.jenjang.toUpperCase()}).`
				});
			}
		}

		const resolved = cleaned.map((entry) => {
			const kelas = kelasById.get(entry.kelasId)!;
			const candidates = (mapelByCode.get(entry.kodeKegiatan) ?? []).filter((mapel) =>
				mapelSesuaiJenjang(mapel.jenjang, kelas.jenjang)
			);
			const guruIds = [...new Set(candidates.map((mapel) => mapel.guruPegawaiId).filter(Boolean))];
			const match = candidates.length === 1 ? candidates[0] : null;
			const guruId = guruIds.length === 1 ? Number(guruIds[0]) : null;
			return {
				...entry,
				jadwalMapelId: match?.id ?? null,
				guruPegawaiId: guruId,
				guruNama: guruId
					? (candidates.find((mapel) => mapel.guruPegawaiId === guruId)?.guru?.nama ?? 'Guru')
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
				fail:
					'Bentrok guru ' +
					first.guruNama +
					': ' +
					first.hari +
					' jam ke-' +
					first.jamKe +
					' di ' +
					classes +
					'.'
			});
		}

		await ensureJadwalBellSchema();
		await ensureJadwalKurikulumSchema();
		await db.transaction(async (tx) => {
			await tx
				.delete(tableJadwalPelajaran)
				.where(
					and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.templateId, scheduleTemplate.id)
					)
				);
			if (cleaned.length) {
				await tx.insert(tableJadwalPelajaran).values(
					resolved.map((entry) => ({
						sekolahId,
						templateId: scheduleTemplate.id,
						semesterId: context.semesterId,
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
