import {
	loadAbsensiKelasOptions,
	parsePositiveInteger,
	resolveKelasId
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableJadwalJam,
	tableJadwalPelajaran,
	tableKelas,
	tableKokurikuler,
	tableJadwalMapel,
	tablePegawai
} from '$lib/server/db/schema';
import {
	canManageJadwal,
	ensureDefaultJadwalFoundation,
	JADWAL_HARI_LABELS,
	loadJadwalJam,
	loadJadwalKegiatan,
	requireJadwalAccess
} from '$lib/server/jadwal';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

const SLOT_TYPES = ['pelajaran', 'kegiatan', 'istirahat', 'kosong'] as const;
type SlotType = (typeof SLOT_TYPES)[number];
const JENJANG_OPTIONS = ['semua', 'srd', 'srmp', 'srma'] as const;
type JenjangFilter = (typeof JENJANG_OPTIONS)[number];
type ViewMode = 'master' | 'guru';

function parseSlotType(value: FormDataEntryValue | null): SlotType | null {
	const raw = value?.toString();
	return SLOT_TYPES.includes(raw as SlotType) ? (raw as SlotType) : null;
}

function nullablePositiveInteger(value: FormDataEntryValue | null) {
	return parsePositiveInteger(value) ?? null;
}

function parseViewMode(value: string | null): ViewMode {
	return value === 'guru' ? 'guru' : 'master';
}

function parseJenjangFilter(value: string | null): JenjangFilter {
	return JENJANG_OPTIONS.includes(value as JenjangFilter) ? (value as JenjangFilter) : 'semua';
}

function inferJenjangKelas(nama: string, fase?: string | null): Exclude<JenjangFilter, 'semua'> {
	const normalizedFase = (fase ?? '')
		.trim()
		.toLowerCase()
		.replace(/^fase\s+/, '');
	if (normalizedFase === 'a' || normalizedFase === 'b' || normalizedFase === 'c') return 'srd';
	if (normalizedFase === 'd') return 'srmp';
	if (normalizedFase === 'e' || normalizedFase === 'f') return 'srma';

	const match = nama.match(/\d+/);
	const tingkat = match ? Number.parseInt(match[0], 10) : null;
	if (tingkat && tingkat >= 1 && tingkat <= 6) return 'srd';
	if (tingkat && tingkat >= 7 && tingkat <= 9) return 'srmp';
	return 'srma';
}

async function ensureKelasAccess(params: {
	sekolahId: number;
	semesterId: number;
	kelasId: number;
	user: Pick<AuthUser, 'id' | 'type' | 'pegawaiId' | 'permissions'>;
}) {
	const where =
		params.user.type === 'wali_kelas'
			? and(
					eq(tableKelas.id, params.kelasId),
					eq(tableKelas.sekolahId, params.sekolahId),
					eq(tableKelas.semesterId, params.semesterId),
					params.user.pegawaiId
						? eq(tableKelas.waliKelasId, params.user.pegawaiId)
						: eq(tableKelas.id, -1)
				)
			: and(
					eq(tableKelas.id, params.kelasId),
					eq(tableKelas.sekolahId, params.sekolahId),
					eq(tableKelas.semesterId, params.semesterId)
				);

	return db.query.tableKelas.findFirst({ columns: { id: true, nama: true, fase: true }, where });
}

export async function load({ locals, url }) {
	requireJadwalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const academic = await resolveSekolahAcademicContext(sekolahId);
	await ensureDefaultJadwalFoundation(sekolahId, {
		tahunAjaranId: academic.activeTahunAjaranId,
		semesterId: academic.activeSemesterId
	});

	const { kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasListWithJenjang = kelasList.map((kelas) => ({
		...kelas,
		jenjang: inferJenjangKelas(kelas.nama, kelas.fase)
	}));
	const viewMode = parseViewMode(url.searchParams.get('mode'));
	const selectedJenjang = parseJenjangFilter(url.searchParams.get('jenjang'));
	const masterKelasList =
		selectedJenjang === 'semua'
			? kelasListWithJenjang
			: kelasListWithJenjang.filter((kelas) => kelas.jenjang === selectedJenjang);
	const kelasId = resolveKelasId(
		masterKelasList,
		parsePositiveInteger(url.searchParams.get('kelas_id'))
	);
	const canEdit = canManageJadwal(locals.user);

	if (!academic.activeSemesterId || !kelasId) {
		return {
			meta: { title: 'Jadwal Pelajaran' } satisfies PageMeta,
			sekolahNama: locals.sekolah?.nama ?? 'Sekolah',
			activeSemesterId: academic.activeSemesterId,
			kelasId,
			viewMode,
			selectedJenjang,
			kelasList: kelasListWithJenjang,
			masterKelasList,
			canEdit,
			hariLabels: JADWAL_HARI_LABELS,
			jamList: [],
			jadwalList: [],
			mapelList: [],
			kokurikulerList: [],
			kegiatanList: [],
			guruList: []
		};
	}

	const masterKelasIds = masterKelasList.map((kelas) => kelas.id);
	const visibleJenjangList = Array.from(new Set(masterKelasList.map((kelas) => kelas.jenjang)));
	const jamJenjangFilter = selectedJenjang === 'semua' ? null : selectedJenjang;
	const [jamList, jadwalList, mapelList, kokurikulerList, kegiatanList, guruList] =
		await Promise.all([
			loadJadwalJam(sekolahId, jamJenjangFilter),
			db.query.tableJadwalPelajaran.findMany({
				where: and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.semesterId, academic.activeSemesterId),
					masterKelasIds.length
						? inArray(tableJadwalPelajaran.kelasId, masterKelasIds)
						: eq(tableJadwalPelajaran.kelasId, -1)
				)
			}),
			db.query.tableJadwalMapel.findMany({
				columns: {
					id: true,
					kode: true,
					nama: true,
					jenjang: true,
					guruPegawaiId: true,
					warna: true,
					aktif: true
				},
				where: and(
					eq(tableJadwalMapel.sekolahId, sekolahId),
					eq(tableJadwalMapel.aktif, true),
					selectedJenjang === 'semua'
						? inArray(tableJadwalMapel.jenjang, ['semua', 'srd', 'srmp', 'srma'])
						: inArray(tableJadwalMapel.jenjang, ['semua', selectedJenjang])
				),
				orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
			}),
			db.query.tableKokurikuler.findMany({
				columns: { id: true, kelasId: true, kode: true, tujuan: true },
				where: masterKelasIds.length
					? inArray(tableKokurikuler.kelasId, masterKelasIds)
					: eq(tableKokurikuler.kelasId, -1),
				orderBy: asc(tableKokurikuler.kode)
			}),
			loadJadwalKegiatan(sekolahId),
			db.query.tablePegawai.findMany({
				columns: { id: true, nama: true, nip: true },
				where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
				orderBy: asc(tablePegawai.nama)
			})
		]);

	return {
		meta: { title: 'Jadwal Pelajaran' } satisfies PageMeta,
		sekolahNama: locals.sekolah?.nama ?? 'Sekolah',
		activeSemesterId: academic.activeSemesterId,
		kelasId,
		viewMode,
		selectedJenjang,
		kelasList: kelasListWithJenjang,
		masterKelasList,
		canEdit,
		hariLabels: JADWAL_HARI_LABELS,
		jamList: jamList.filter(
			(jam) =>
				jam.aktif && (selectedJenjang !== 'semua' || visibleJenjangList.includes(jam.jenjang))
		),
		jadwalList,
		mapelList,
		kokurikulerList,
		kegiatanList: kegiatanList.filter((kegiatan) => kegiatan.aktif),
		guruList
	};
}

export const actions = {
	saveSlot: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin mengubah jadwal pelajaran.' });
		}

		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const jamId = parsePositiveInteger(formData.get('jamId'));
		const tipe = parseSlotType(formData.get('tipe'));
		const jadwalMapelId = nullablePositiveInteger(formData.get('jadwalMapelId'));
		const mataPelajaranId = nullablePositiveInteger(formData.get('mataPelajaranId'));
		const kokurikulerId = nullablePositiveInteger(formData.get('kokurikulerId'));
		const kegiatanId = nullablePositiveInteger(formData.get('kegiatanId'));
		const guruPegawaiId = nullablePositiveInteger(formData.get('guruPegawaiId'));
		const catatan = formData.get('catatan')?.toString().trim() || null;

		if (!semesterId || !kelasId || !jamId || !tipe) {
			return fail(400, { fail: 'Data slot jadwal belum lengkap.' });
		}

		const kelas = await ensureKelasAccess({ sekolahId, semesterId, kelasId, user: locals.user });
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const jam = await db.query.tableJadwalJam.findFirst({
			where: and(eq(tableJadwalJam.id, jamId), eq(tableJadwalJam.sekolahId, sekolahId))
		});
		if (!jam) return fail(404, { fail: 'Jam jadwal tidak ditemukan.' });
		const kelasJenjang = inferJenjangKelas(kelas.nama, kelas.fase);
		if (jam.jenjang !== kelasJenjang) {
			return fail(400, { fail: 'Jam jadwal ini tidak sesuai dengan jenjang kelas.' });
		}

		if (tipe === 'pelajaran' && !jadwalMapelId && !mataPelajaranId) {
			return fail(400, { fail: 'Pilih mata pelajaran untuk slot pelajaran.' });
		}
		if (tipe === 'kegiatan' && !kegiatanId && !kokurikulerId) {
			return fail(400, { fail: 'Pilih kegiatan atau kokurikuler untuk slot kegiatan.' });
		}

		let resolvedGuruPegawaiId = guruPegawaiId;
		if (tipe === 'pelajaran' && jadwalMapelId) {
			const selectedJadwalMapel = await db.query.tableJadwalMapel.findFirst({
				columns: { id: true, guruPegawaiId: true },
				where: and(
					eq(tableJadwalMapel.id, jadwalMapelId),
					eq(tableJadwalMapel.sekolahId, sekolahId),
					eq(tableJadwalMapel.aktif, true)
				)
			});
			if (!selectedJadwalMapel) {
				return fail(404, { fail: 'Data Mata Pelajaran tidak ditemukan atau tidak aktif.' });
			}
			resolvedGuruPegawaiId = resolvedGuruPegawaiId ?? selectedJadwalMapel.guruPegawaiId;
		}

		const existing = await db.query.tableJadwalPelajaran.findFirst({
			columns: { id: true },
			where: and(eq(tableJadwalPelajaran.kelasId, kelasId), eq(tableJadwalPelajaran.jamId, jamId))
		});

		if (tipe === 'pelajaran' && resolvedGuruPegawaiId) {
			const conflictWhere = existing
				? and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.semesterId, semesterId),
						eq(tableJadwalPelajaran.jamId, jamId),
						eq(tableJadwalPelajaran.guruPegawaiId, resolvedGuruPegawaiId),
						ne(tableJadwalPelajaran.id, existing.id)
					)
				: and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.semesterId, semesterId),
						eq(tableJadwalPelajaran.jamId, jamId),
						eq(tableJadwalPelajaran.guruPegawaiId, resolvedGuruPegawaiId)
					);
			const conflict = await db.query.tableJadwalPelajaran.findFirst({
				columns: { id: true, kelasId: true },
				with: { kelas: { columns: { nama: true } }, jam: { columns: { hari: true, jamKe: true } } },
				where: conflictWhere
			});
			if (conflict) {
				return fail(409, {
					fail: `Guru sudah terjadwal di ${conflict.kelas?.nama ?? 'kelas lain'} pada jam yang sama.`
				});
			}
		}
		if (tipe === 'pelajaran' && jadwalMapelId) {
			const mapelConflictWhere = existing
				? and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.semesterId, semesterId),
						eq(tableJadwalPelajaran.jamId, jamId),
						eq(tableJadwalPelajaran.jadwalMapelId, jadwalMapelId),
						ne(tableJadwalPelajaran.id, existing.id)
					)
				: and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.semesterId, semesterId),
						eq(tableJadwalPelajaran.jamId, jamId),
						eq(tableJadwalPelajaran.jadwalMapelId, jadwalMapelId)
					);
			const mapelConflict = await db.query.tableJadwalPelajaran.findFirst({
				columns: { id: true, kelasId: true },
				with: {
					kelas: { columns: { nama: true } },
					jadwalMapel: { columns: { kode: true, nama: true } }
				},
				where: mapelConflictWhere
			});
			if (mapelConflict) {
				return fail(409, {
					fail:
						'Mapel ' +
						(mapelConflict.jadwalMapel?.kode ?? mapelConflict.jadwalMapel?.nama ?? 'ini') +
						' sudah terjadwal di ' +
						(mapelConflict.kelas?.nama ?? 'kelas lain') +
						' pada jam yang sama.'
				});
			}
		}
		const now = new Date().toISOString();
		const payload = {
			sekolahId,
			semesterId,
			kelasId,
			jamId,
			hari: jam.hari,
			tipe,
			jadwalMapelId: tipe === 'pelajaran' ? jadwalMapelId : null,
			mataPelajaranId: tipe === 'pelajaran' && !jadwalMapelId ? mataPelajaranId : null,
			kokurikulerId: tipe === 'kegiatan' ? kokurikulerId : null,
			kegiatanId: tipe === 'kegiatan' || tipe === 'istirahat' ? kegiatanId : null,
			guruPegawaiId: tipe === 'pelajaran' ? resolvedGuruPegawaiId : null,
			catatan,
			updatedAt: now
		};

		if (existing) {
			await db
				.update(tableJadwalPelajaran)
				.set(payload)
				.where(eq(tableJadwalPelajaran.id, existing.id));
		} else {
			await db.insert(tableJadwalPelajaran).values({ ...payload, createdAt: now });
		}

		return { message: 'Slot jadwal berhasil disimpan.' };
	},
	clearScheduleFiltered: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus jadwal pelajaran.' });
		}

		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const kelasIds = formData
			.getAll('kelasIds')
			.map((value) => Number.parseInt(value.toString(), 10))
			.filter((value) => Number.isInteger(value) && value > 0);
		if (!semesterId || kelasIds.length === 0) {
			return fail(400, { fail: 'Semester atau kelas filter belum lengkap.' });
		}

		await db
			.delete(tableJadwalPelajaran)
			.where(
				and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.semesterId, semesterId),
					inArray(tableJadwalPelajaran.kelasId, kelasIds)
				)
			);

		return {
			message: `Jadwal pada filter ini berhasil dibersihkan untuk ${kelasIds.length} kelas.`
		};
	},
	clearMapelAll: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus jadwal pelajaran.' });
		}

		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const jadwalMapelId = parsePositiveInteger(formData.get('jadwalMapelId'));
		const kelasIds = formData
			.getAll('kelasIds')
			.map((value) => Number.parseInt(value.toString(), 10))
			.filter((value) => Number.isInteger(value) && value > 0);
		if (!semesterId || !jadwalMapelId || kelasIds.length === 0) {
			return fail(400, { fail: 'Data mapel atau kelas belum lengkap.' });
		}

		await db
			.delete(tableJadwalPelajaran)
			.where(
				and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.semesterId, semesterId),
					eq(tableJadwalPelajaran.tipe, 'pelajaran'),
					eq(tableJadwalPelajaran.jadwalMapelId, jadwalMapelId),
					inArray(tableJadwalPelajaran.kelasId, kelasIds)
				)
			);

		return { message: 'Semua slot mapel pada filter ini berhasil dihapus.' };
	},

	clearSlot: async ({ request, locals }) => {
		requireJadwalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		if (!canManageJadwal(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus jadwal pelajaran.' });
		}

		const formData = await request.formData();
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const jamId = parsePositiveInteger(formData.get('jamId'));
		if (!kelasId || !jamId) return fail(400, { fail: 'Data slot jadwal belum lengkap.' });

		await db
			.delete(tableJadwalPelajaran)
			.where(
				and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.kelasId, kelasId),
					eq(tableJadwalPelajaran.jamId, jamId)
				)
			);

		return { message: 'Slot jadwal berhasil dikosongkan.' };
	}
};
