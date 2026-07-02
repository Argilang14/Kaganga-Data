import { loadAbsensiKelasOptions, parsePositiveInteger } from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableJadwalBebanMapelKelas,
	tableJadwalDraftPelajaran,
	tableJadwalJam,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableKelas
} from '$lib/server/db/schema';
import {
	ensureDefaultJadwalFoundation,
	JADWAL_HARI_LABELS,
	requireJadwalManageAccess
} from '$lib/server/jadwal';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

const JENJANG_OPTIONS = ['semua', 'srd', 'srmp', 'srma'] as const;
type JenjangFilter = (typeof JENJANG_OPTIONS)[number];
type KelasRow = {
	id: number;
	nama: string;
	semesterId: number;
	fase: string | null;
	jenjang: Exclude<JenjangFilter, 'semua'>;
};
type JamRow = typeof tableJadwalJam.$inferSelect;
type MapelRow = typeof tableJadwalMapel.$inferSelect;

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
	const tingkat = Number.parseInt(nama.match(/\d+/)?.[0] ?? '', 10);
	if (tingkat >= 1 && tingkat <= 6) return 'srd';
	if (tingkat >= 7 && tingkat <= 9) return 'srmp';
	return 'srma';
}

function compatible(mapel: Pick<MapelRow, 'jenjang'>, kelas: Pick<KelasRow, 'jenjang'>) {
	return mapel.jenjang === 'semua' || mapel.jenjang === kelas.jenjang;
}

function slotKey(kelasId: number, jamId: number) {
	return `${kelasId}:${jamId}`;
}

function guruSlotKey(guruId: number, jamId: number) {
	return `${guruId}:${jamId}`;
}

function visibleJenjangValues(kelasList: KelasRow[]) {
	return Array.from(new Set(kelasList.map((kelas) => kelas.jenjang)));
}

async function context(
	sekolahId: number,
	user: Pick<AuthUser, 'id' | 'type' | 'pegawaiId' | 'permissions' | 'kelasId' | 'mataPelajaranId'>,
	jenjang: JenjangFilter
) {
	const academic = await resolveSekolahAcademicContext(sekolahId);
	await ensureDefaultJadwalFoundation(sekolahId, {
		tahunAjaranId: academic.activeTahunAjaranId,
		semesterId: academic.activeSemesterId
	});
	const { kelasList } = await loadAbsensiKelasOptions(sekolahId, user);
	const withJenjang = kelasList.map((kelas) => ({
		...kelas,
		jenjang: inferJenjangKelas(kelas.nama, kelas.fase)
	})) satisfies KelasRow[];
	const filtered =
		jenjang === 'semua' ? withJenjang : withJenjang.filter((kelas) => kelas.jenjang === jenjang);
	return { academic, kelasList: withJenjang, filteredKelasList: filtered };
}

async function loadDraft(sekolahId: number, semesterId: number, kelasIds: number[]) {
	if (!kelasIds.length) return [];
	return db.query.tableJadwalDraftPelajaran.findMany({
		where: and(
			eq(tableJadwalDraftPelajaran.sekolahId, sekolahId),
			eq(tableJadwalDraftPelajaran.semesterId, semesterId),
			inArray(tableJadwalDraftPelajaran.kelasId, kelasIds)
		),
		with: {
			kelas: { columns: { id: true, nama: true, fase: true } },
			jam: true,
			jadwalMapel: { columns: { id: true, kode: true, nama: true, warna: true } },
			guru: { columns: { id: true, nama: true, nip: true } }
		},
		orderBy: [
			asc(tableJadwalDraftPelajaran.kelasId),
			asc(tableJadwalDraftPelajaran.jamId),
			asc(tableJadwalDraftPelajaran.id)
		]
	});
}

function draftConflicts(draftList: Awaited<ReturnType<typeof loadDraft>>) {
	const conflicts: { key: string; type: string; message: string; draftIds: number[] }[] = [];
	const guruMap = new Map<string, typeof draftList>();
	const mapelMap = new Map<string, typeof draftList>();
	for (const draft of draftList) {
		if (draft.status !== 'ok') {
			conflicts.push({
				key: `status:${draft.id}`,
				type: draft.status,
				message: draft.alasanKonflik || 'Draft membutuhkan penyesuaian manual.',
				draftIds: [draft.id]
			});
		}
		if (!draft.jamId || draft.status !== 'ok') continue;
		if (draft.guruPegawaiId) {
			const key = guruSlotKey(draft.guruPegawaiId, draft.jamId);
			guruMap.set(key, [...(guruMap.get(key) ?? []), draft]);
		}
		if (draft.jadwalMapelId) {
			const key = mapelSlotKey(draft.jadwalMapelId, draft.jamId);
			mapelMap.set(key, [...(mapelMap.get(key) ?? []), draft]);
		}
	}
	for (const [key, items] of guruMap) {
		if (items.length <= 1) continue;
		const first = items[0];
		conflicts.push({
			key,
			type: 'guru',
			message: `${first.guru?.nama ?? 'Guru'} bentrok di ${JADWAL_HARI_LABELS[first.jam?.hari ?? 'senin']}, jam ${first.jam?.jamKe ?? '-'}.`,
			draftIds: items.map((item) => item.id)
		});
	}
	for (const [key, items] of mapelMap) {
		if (items.length <= 1) continue;
		const first = items[0];
		conflicts.push({
			key,
			type: 'mapel',
			message: `${first.jadwalMapel?.kode ?? first.jadwalMapel?.nama ?? 'Mapel'} bentrok di ${JADWAL_HARI_LABELS[first.jam?.hari ?? 'senin']}, jam ${first.jam?.jamKe ?? '-'}.`,
			draftIds: items.map((item) => item.id)
		});
	}
	return conflicts;
}

function mapelSlotKey(mapelId: number, jamId: number) {
	return `${mapelId}:${jamId}`;
}

function pickSlot(
	jamList: JamRow[],
	classUsed: Set<string>,
	teacherUsed: Set<string>,
	mapelUsed: Set<string>,
	kelasId: number,
	guruId: number | null,
	mapelId: number
) {
	return jamList.find((jam) => {
		if (classUsed.has(slotKey(kelasId, jam.id))) return false;
		if (guruId && teacherUsed.has(guruSlotKey(guruId, jam.id))) return false;
		if (mapelUsed.has(mapelSlotKey(mapelId, jam.id))) return false;
		return true;
	});
}

export async function load({ locals, url }) {
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const selectedJenjang = parseJenjangFilter(url.searchParams.get('jenjang'));
	const { academic, kelasList, filteredKelasList } = await context(
		sekolahId,
		locals.user,
		selectedJenjang
	);
	const visibleKelasList = filteredKelasList;
	const kelasIds = visibleKelasList.map((kelas) => kelas.id);
	const visibleJenjang = visibleJenjangValues(visibleKelasList);

	const [mapelList, bebanList, jamList, draftList] = await Promise.all([
		db.query.tableJadwalMapel.findMany({
			where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.aktif, true)),
			with: { guru: { columns: { id: true, nama: true, nip: true } } },
			orderBy: [asc(tableJadwalMapel.jenjang), asc(tableJadwalMapel.nama)]
		}),
		academic.activeSemesterId && kelasIds.length
			? db.query.tableJadwalBebanMapelKelas.findMany({
					where: and(
						eq(tableJadwalBebanMapelKelas.sekolahId, sekolahId),
						eq(tableJadwalBebanMapelKelas.semesterId, academic.activeSemesterId),
						inArray(tableJadwalBebanMapelKelas.kelasId, kelasIds)
					)
				})
			: [],
		db.query.tableJadwalJam.findMany({
			where: and(
				eq(tableJadwalJam.sekolahId, sekolahId),
				eq(tableJadwalJam.aktif, true),
				visibleJenjang.length
					? inArray(tableJadwalJam.jenjang, visibleJenjang)
					: eq(tableJadwalJam.id, -1)
			),
			orderBy: [asc(tableJadwalJam.jenjang), asc(tableJadwalJam.urutan), asc(tableJadwalJam.jamKe)]
		}),
		academic.activeSemesterId ? loadDraft(sekolahId, academic.activeSemesterId, kelasIds) : []
	]);
	const classJenjangById = new Map(visibleKelasList.map((kelas) => [kelas.id, kelas.jenjang]));
	const bebanGroup = new Map<string, number[]>();
	for (const row of bebanList) {
		const jenjang = classJenjangById.get(row.kelasId);
		if (!jenjang) continue;
		const key = `${jenjang}:${row.jadwalMapelId}`;
		bebanGroup.set(key, [...(bebanGroup.get(key) ?? []), row.targetJamPerMinggu]);
	}
	const bebanMap = new Map<string, number>();
	for (const [key, values] of bebanGroup) {
		bebanMap.set(key, Math.max(0, ...values));
	}
	const visibleMapelList = mapelList.filter((mapel) =>
		visibleKelasList.some((kelas) => compatible(mapel, kelas))
	);
	const conflicts = draftConflicts(draftList);

	return {
		meta: { title: 'Aturan Generate Jadwal' } satisfies PageMeta,
		sekolahNama: locals.sekolah?.nama ?? 'Sekolah',
		activeSemesterId: academic.activeSemesterId,
		filter: { jenjang: selectedJenjang },
		options: { jenjang: JENJANG_OPTIONS },
		hariLabels: JADWAL_HARI_LABELS,
		kelasList,
		visibleKelasList,
		mapelList: visibleMapelList,
		bebanMap: Object.fromEntries(bebanMap),
		jamPelajaranCount: jamList.filter((jam) => jam.tipe === 'pelajaran').length,
		jamOptions: jamList.map((jam) => ({
			id: jam.id,
			hari: jam.hari,
			jamKe: jam.jamKe,
			pukulMulai: jam.pukulMulai,
			pukulSelesai: jam.pukulSelesai,
			tipe: jam.tipe,
			namaDefault: jam.namaDefault
		})),
		draftList,
		conflicts,
		canApplyDraft: draftList.length > 0 && conflicts.length === 0
	};
}

export const actions = {
	saveBeban: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		if (!semesterId) return fail(400, { fail: 'Semester aktif belum tersedia.' });
		const now = new Date().toISOString();
		const selectedJenjang = parseJenjangFilter(formData.get('jenjang')?.toString() ?? null);
		const { filteredKelasList } = await context(sekolahId, locals.user, selectedJenjang);
		const rows: (typeof tableJadwalBebanMapelKelas.$inferInsert)[] = [];
		for (const [key, value] of formData.entries()) {
			if (!key.startsWith('beban:')) continue;
			const [, jenjangText, mapelText] = key.split(':');
			const jadwalMapelId = Number.parseInt(mapelText, 10);
			const targetJamPerMinggu = Math.max(0, Number.parseInt(value.toString() || '0', 10) || 0);
			if (
				!jadwalMapelId ||
				!JENJANG_OPTIONS.includes(jenjangText as JenjangFilter) ||
				jenjangText === 'semua'
			)
				continue;
			for (const kelas of filteredKelasList.filter((item) => item.jenjang === jenjangText)) {
				rows.push({
					sekolahId,
					semesterId,
					kelasId: kelas.id,
					jadwalMapelId,
					targetJamPerMinggu,
					createdAt: now,
					updatedAt: now
				});
			}
		}
		for (const row of rows) {
			await db
				.insert(tableJadwalBebanMapelKelas)
				.values(row)
				.onConflictDoUpdate({
					target: [
						tableJadwalBebanMapelKelas.sekolahId,
						tableJadwalBebanMapelKelas.semesterId,
						tableJadwalBebanMapelKelas.kelasId,
						tableJadwalBebanMapelKelas.jadwalMapelId
					],
					set: { targetJamPerMinggu: row.targetJamPerMinggu, updatedAt: now }
				});
		}
		return {
			message: `Beban jam berhasil disimpan untuk ${rows.length} kombinasi kelas-mapel dari aturan jenjang.`
		};
	},

	generateDraft: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const selectedJenjang = parseJenjangFilter(formData.get('jenjang')?.toString() ?? null);
		if (!semesterId) return fail(400, { fail: 'Semester aktif belum tersedia.' });

		const { filteredKelasList } = await context(sekolahId, locals.user, selectedJenjang);
		const kelasList = filteredKelasList;
		const kelasIds = kelasList.map((kelas) => kelas.id);
		if (!kelasIds.length) return fail(400, { fail: 'Tidak ada kelas untuk dibuatkan draft.' });
		const visibleJenjang = visibleJenjangValues(kelasList);

		const [bebanList, mapelList, jamList] = await Promise.all([
			db.query.tableJadwalBebanMapelKelas.findMany({
				where: and(
					eq(tableJadwalBebanMapelKelas.sekolahId, sekolahId),
					eq(tableJadwalBebanMapelKelas.semesterId, semesterId),
					inArray(tableJadwalBebanMapelKelas.kelasId, kelasIds)
				)
			}),
			db.query.tableJadwalMapel.findMany({
				where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.aktif, true))
			}),
			db.query.tableJadwalJam.findMany({
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.aktif, true),
					eq(tableJadwalJam.tipe, 'pelajaran'),
					visibleJenjang.length
						? inArray(tableJadwalJam.jenjang, visibleJenjang)
						: eq(tableJadwalJam.id, -1)
				),
				orderBy: [
					asc(tableJadwalJam.jenjang),
					asc(tableJadwalJam.urutan),
					asc(tableJadwalJam.jamKe)
				]
			})
		]);
		if (!jamList.length) return fail(400, { fail: 'Belum ada jam pelajaran aktif.' });
		const jamByJenjang = new Map<Exclude<JenjangFilter, 'semua'>, JamRow[]>();
		for (const jam of jamList) {
			jamByJenjang.set(jam.jenjang, [...(jamByJenjang.get(jam.jenjang) ?? []), jam]);
		}
		const mapelById = new Map(mapelList.map((mapel) => [mapel.id, mapel]));
		const kelasById = new Map(kelasList.map((kelas) => [kelas.id, kelas]));
		const workloads: { beban: (typeof bebanList)[number]; mapel: MapelRow; kelas: KelasRow }[] = [];
		for (const beban of bebanList) {
			if (beban.targetJamPerMinggu <= 0) continue;
			const mapel = mapelById.get(beban.jadwalMapelId);
			const kelas = kelasById.get(beban.kelasId);
			if (!mapel || !kelas || !compatible(mapel, kelas)) continue;
			workloads.push({ beban, mapel, kelas });
		}
		workloads.sort((a, b) => (a.mapel.guruPegawaiId ?? 0) - (b.mapel.guruPegawaiId ?? 0));

		const now = new Date().toISOString();
		const classUsed = new Set<string>();
		const teacherUsed = new Set<string>();
		const mapelUsed = new Set<string>();
		const rows: (typeof tableJadwalDraftPelajaran.$inferInsert)[] = [];
		for (const item of workloads) {
			for (let i = 0; i < item.beban.targetJamPerMinggu; i += 1) {
				const slot = pickSlot(
					jamByJenjang.get(item.kelas.jenjang) ?? [],
					classUsed,
					teacherUsed,
					mapelUsed,
					item.beban.kelasId,
					item.mapel.guruPegawaiId,
					item.beban.jadwalMapelId
				);
				if (!slot) {
					rows.push({
						sekolahId,
						semesterId,
						kelasId: item.beban.kelasId,
						jadwalMapelId: item.beban.jadwalMapelId,
						guruPegawaiId: item.mapel.guruPegawaiId,
						status: 'belum_terpasang',
						alasanKonflik: `Tidak ada slot kosong untuk ${item.mapel.nama} di ${item.kelas.nama}.`,
						batchId: `draft-${Date.now()}`,
						createdAt: now,
						updatedAt: now
					});
					continue;
				}
				classUsed.add(slotKey(item.beban.kelasId, slot.id));
				if (item.mapel.guruPegawaiId)
					teacherUsed.add(guruSlotKey(item.mapel.guruPegawaiId, slot.id));
				mapelUsed.add(mapelSlotKey(item.beban.jadwalMapelId, slot.id));
				rows.push({
					sekolahId,
					semesterId,
					kelasId: item.beban.kelasId,
					jamId: slot.id,
					hari: slot.hari,
					jadwalMapelId: item.beban.jadwalMapelId,
					guruPegawaiId: item.mapel.guruPegawaiId,
					status: 'ok',
					batchId: `draft-${Date.now()}`,
					createdAt: now,
					updatedAt: now
				});
			}
		}
		await db.transaction(async (tx) => {
			await tx
				.delete(tableJadwalDraftPelajaran)
				.where(
					and(
						eq(tableJadwalDraftPelajaran.sekolahId, sekolahId),
						eq(tableJadwalDraftPelajaran.semesterId, semesterId),
						inArray(tableJadwalDraftPelajaran.kelasId, kelasIds)
					)
				);
			if (rows.length) await tx.insert(tableJadwalDraftPelajaran).values(rows);
		});
		const konflik = rows.filter((row) => row.status !== 'ok').length;
		return {
			message: `Draft jadwal dibuat: ${rows.length - konflik} slot terpasang, ${konflik} perlu penyesuaian.`
		};
	},

	updateDraftSlot: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const draftId = parsePositiveInteger(formData.get('draftId'));
		const jamId = parsePositiveInteger(formData.get('jamId'));
		if (!draftId || !jamId) return fail(400, { fail: 'Pilih draft dan jam tujuan.' });

		const draft = await db.query.tableJadwalDraftPelajaran.findFirst({
			where: and(
				eq(tableJadwalDraftPelajaran.id, draftId),
				eq(tableJadwalDraftPelajaran.sekolahId, sekolahId)
			)
		});
		if (!draft) return fail(404, { fail: 'Draft jadwal tidak ditemukan.' });
		const jam = await db.query.tableJadwalJam.findFirst({
			where: and(
				eq(tableJadwalJam.id, jamId),
				eq(tableJadwalJam.sekolahId, sekolahId),
				eq(tableJadwalJam.aktif, true),
				eq(tableJadwalJam.tipe, 'pelajaran')
			)
		});
		if (!jam) return fail(404, { fail: 'Jam pelajaran aktif tidak ditemukan.' });
		const draftKelas = await db.query.tableKelas.findFirst({
			columns: { id: true, nama: true, fase: true },
			where: and(eq(tableKelas.id, draft.kelasId), eq(tableKelas.sekolahId, sekolahId))
		});
		if (!draftKelas) return fail(404, { fail: 'Kelas draft tidak ditemukan.' });
		if (jam.jenjang !== inferJenjangKelas(draftKelas.nama, draftKelas.fase)) {
			return fail(400, { fail: 'Jam tujuan tidak sesuai dengan jenjang kelas draft.' });
		}

		const classConflict = await db.query.tableJadwalDraftPelajaran.findFirst({
			columns: { id: true },
			where: and(
				eq(tableJadwalDraftPelajaran.sekolahId, sekolahId),
				eq(tableJadwalDraftPelajaran.semesterId, draft.semesterId),
				eq(tableJadwalDraftPelajaran.kelasId, draft.kelasId),
				eq(tableJadwalDraftPelajaran.jamId, jamId),
				ne(tableJadwalDraftPelajaran.id, draft.id)
			)
		});
		if (classConflict)
			return fail(409, { fail: 'Kelas ini sudah memiliki draft pada jam tersebut.' });

		if (draft.guruPegawaiId) {
			const guruConflict = await db.query.tableJadwalDraftPelajaran.findFirst({
				columns: { id: true },
				where: and(
					eq(tableJadwalDraftPelajaran.sekolahId, sekolahId),
					eq(tableJadwalDraftPelajaran.semesterId, draft.semesterId),
					eq(tableJadwalDraftPelajaran.jamId, jamId),
					eq(tableJadwalDraftPelajaran.guruPegawaiId, draft.guruPegawaiId),
					ne(tableJadwalDraftPelajaran.id, draft.id)
				)
			});
			if (guruConflict) return fail(409, { fail: 'Guru masih bentrok pada jam tujuan.' });
		}
		if (draft.jadwalMapelId) {
			const mapelConflict = await db.query.tableJadwalDraftPelajaran.findFirst({
				columns: { id: true },
				where: and(
					eq(tableJadwalDraftPelajaran.sekolahId, sekolahId),
					eq(tableJadwalDraftPelajaran.semesterId, draft.semesterId),
					eq(tableJadwalDraftPelajaran.jamId, jamId),
					eq(tableJadwalDraftPelajaran.jadwalMapelId, draft.jadwalMapelId),
					ne(tableJadwalDraftPelajaran.id, draft.id)
				)
			});
			if (mapelConflict) return fail(409, { fail: 'Mapel masih bentrok pada jam tujuan.' });
		}

		await db
			.update(tableJadwalDraftPelajaran)
			.set({
				jamId,
				hari: jam.hari,
				status: 'ok',
				alasanKonflik: null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(tableJadwalDraftPelajaran.id, draft.id));

		return { message: 'Draft berhasil dipindahkan ke jam tujuan.' };
	},
	applyDraft: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const selectedJenjang = parseJenjangFilter(formData.get('jenjang')?.toString() ?? null);
		if (!semesterId) return fail(400, { fail: 'Semester aktif belum tersedia.' });
		const { filteredKelasList } = await context(sekolahId, locals.user, selectedJenjang);
		const kelasList = filteredKelasList;
		const kelasIds = kelasList.map((kelas) => kelas.id);
		if (!kelasIds.length) return fail(400, { fail: 'Tidak ada kelas untuk diterapkan.' });
		const draftList = await loadDraft(sekolahId, semesterId, kelasIds);
		if (!draftList.length) return fail(400, { fail: 'Belum ada draft jadwal.' });
		const conflicts = draftConflicts(draftList);
		if (conflicts.length)
			return fail(409, { fail: 'Draft masih memiliki konflik. Generate ulang dulu.' });
		const okDraftList = draftList.filter(
			(draft) => draft.status === 'ok' && draft.jamId && draft.hari
		);
		if (!okDraftList.length) return fail(400, { fail: 'Tidak ada draft valid untuk diterapkan.' });
		const now = new Date().toISOString();
		await db.transaction(async (tx) => {
			await tx
				.delete(tableJadwalPelajaran)
				.where(
					and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.tipe, 'pelajaran'),
						inArray(tableJadwalPelajaran.kelasId, kelasIds)
					)
				);
			await tx.insert(tableJadwalPelajaran).values(
				okDraftList.map((draft) => ({
					sekolahId,
					semesterId,
					kelasId: draft.kelasId,
					jamId: draft.jamId!,
					hari: draft.hari!,
					tipe: 'pelajaran' as const,
					jadwalMapelId: draft.jadwalMapelId,
					guruPegawaiId: draft.guruPegawaiId,
					createdAt: now,
					updatedAt: now
				}))
			);
		});
		return {
			message: `Draft berhasil diterapkan ke jadwal aktif untuk ${kelasList.length} kelas.`
		};
	}
};
