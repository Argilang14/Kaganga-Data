import db from '$lib/server/db';
import { canAttendance, canAttendActivity } from '$lib/attendance-access';
import { studentAccessCondition } from './student-access';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import { withSchemaReady } from '$lib/server/db/schema-guard';
import {
	tableAbsensiKegiatan,
	tableKegiatanAbsensi,
	tableKehadiranMurid,
	tableMurid
} from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

export const ABSENSI_KEGIATAN_STATUSES = [
	'hadir',
	'terlambat',
	'sakit',
	'izin',
	'alfa',
	'pulang'
] as const;

export const ABSENSI_KEGIATAN_KATEGORI = ['sekolah', 'asrama', 'makan', 'sholat'] as const;

export const ABSENSI_KEGIATAN_EDIT_ACCESS = ['sekolah', 'asrama', 'semua'] as const;

export type AbsensiKegiatanStatus = (typeof ABSENSI_KEGIATAN_STATUSES)[number];
export type AbsensiKegiatanKategori = (typeof ABSENSI_KEGIATAN_KATEGORI)[number];
export type AbsensiKegiatanEditAccess = (typeof ABSENSI_KEGIATAN_EDIT_ACCESS)[number];

export const ABSENSI_KEGIATAN_PERMISSION = 'administrasi_absensi' as UserPermission;

export const ABSENSI_KEGIATAN_STATUS_LABELS = {
	hadir: 'Hadir',
	terlambat: 'Terlambat',
	sakit: 'Sakit',
	izin: 'Izin',
	alfa: 'Alfa',
	pulang: 'Pulang'
} satisfies Record<AbsensiKegiatanStatus, string>;

export const ABSENSI_KEGIATAN_KATEGORI_LABELS = {
	sekolah: 'Sekolah',
	asrama: 'Asrama',
	makan: 'Makan',
	sholat: 'Sholat'
} satisfies Record<AbsensiKegiatanKategori, string>;

export const DEFAULT_ABSENSI_KEGIATAN = [
	{
		kode: 'apel_berangkat',
		nama: 'Apel Berangkat',
		kategori: 'sekolah',
		urutan: 10,
		aksesEdit: 'sekolah',
		masukRapor: true
	},
	{
		kode: 'apel_pulang',
		nama: 'Apel Pulang',
		kategori: 'sekolah',
		urutan: 20,
		aksesEdit: 'sekolah',
		masukRapor: false
	},
	{
		kode: 'apel_malam',
		nama: 'Apel Malam',
		kategori: 'asrama',
		urutan: 30,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'makan_pagi',
		nama: 'Makan Pagi',
		kategori: 'makan',
		urutan: 40,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'makan_siang',
		nama: 'Makan Siang',
		kategori: 'makan',
		urutan: 50,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'makan_malam',
		nama: 'Makan Malam',
		kategori: 'makan',
		urutan: 60,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'sholat_subuh',
		nama: 'Sholat Subuh',
		kategori: 'sholat',
		urutan: 70,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'sholat_zuhur',
		nama: 'Sholat Zuhur',
		kategori: 'sholat',
		urutan: 80,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'sholat_asar',
		nama: 'Sholat Asar',
		kategori: 'sholat',
		urutan: 90,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'sholat_magrib',
		nama: 'Sholat Magrib',
		kategori: 'sholat',
		urutan: 100,
		aksesEdit: 'asrama',
		masukRapor: false
	},
	{
		kode: 'sholat_isya',
		nama: 'Sholat Isya',
		kategori: 'sholat',
		urutan: 110,
		aksesEdit: 'asrama',
		masukRapor: false
	}
] satisfies Array<{
	kode: string;
	nama: string;
	kategori: AbsensiKegiatanKategori;
	urutan: number;
	aksesEdit: AbsensiKegiatanEditAccess;
	masukRapor: boolean;
}>;

export function canAccessAbsensiKegiatan(
	user?: Pick<AuthUser, 'type' | 'permissions'> | null
): boolean {
	return canAttendance(user, 'lihat');
}

export function requireAbsensiKegiatanAccess(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) throw redirect(303, '/login');
	if (!canAccessAbsensiKegiatan(user))
		throw redirect(303, '/forbidden?required=administrasi_absensi');
}

export function assertAbsensiKegiatanAccess(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) throw error(401, 'Anda harus login terlebih dahulu.');
	if (!canAccessAbsensiKegiatan(user))
		throw error(403, 'Anda tidak memiliki izin absensi kegiatan.');
}

export function canManageAbsensiKegiatanSettings(
	user?: Pick<AuthUser, 'type' | 'permissions'> | null
) {
	return canAttendance(user, 'pengaturan');
}

export function requireAbsensiKegiatanSettingsAccess(
	user?: Pick<AuthUser, 'type' | 'permissions'> | null
) {
	if (!user) throw redirect(303, '/login');
	if (!canManageAbsensiKegiatanSettings(user))
		throw redirect(303, '/forbidden?required=administrasi_absensi');
}

export function canSyncAbsensiKegiatanToRapor(
	user?: Pick<AuthUser, 'type' | 'permissions'> | null
) {
	return canAttendance(user, 'sinkron_rapor');
}

export function canEditAbsensiKegiatan(
	user: Pick<AuthUser, 'type' | 'permissions'> | null | undefined,
	aksesEdit: AbsensiKegiatanEditAccess
) {
	return canAttendActivity(user, aksesEdit);
}

export function parseAbsensiKegiatanStatus(
	value: FormDataEntryValue | string | null | undefined
): AbsensiKegiatanStatus | null {
	const raw = value?.toString();
	return ABSENSI_KEGIATAN_STATUSES.includes(raw as AbsensiKegiatanStatus)
		? (raw as AbsensiKegiatanStatus)
		: null;
}

export function getLateAwareKegiatanStatus(
	kegiatan: Pick<typeof tableKegiatanAbsensi.$inferSelect, 'batasTerlambat'>,
	date = new Date()
): 'hadir' | 'terlambat' {
	if (!kegiatan.batasTerlambat || !/^\d{2}:\d{2}$/.test(kegiatan.batasTerlambat)) {
		return 'hadir';
	}
	const [hour, minute] = kegiatan.batasTerlambat.split(':').map(Number);
	const cutoffMinutes = hour * 60 + minute;
	const currentMinutes = date.getHours() * 60 + date.getMinutes();
	return currentMinutes > cutoffMinutes ? 'terlambat' : 'hadir';
}

function isValidTime(value: string | null) {
	return !!value && /^\d{2}:\d{2}$/.test(value);
}

function timeToMinutes(value: string) {
	const [hour, minute] = value.split(':').map(Number);
	return hour * 60 + minute;
}

function compareLocalDate(a: string, b: string) {
	return a.localeCompare(b);
}

function localDateKey(date = new Date()) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function shouldRunAutoAlfaKegiatan(
	kegiatan: Pick<typeof tableKegiatanAbsensi.$inferSelect, 'autoAlfa' | 'jamSelesai'>,
	tanggal: string,
	now = new Date()
) {
	if (!kegiatan.autoAlfa || !isValidTime(kegiatan.jamSelesai)) return false;
	const today = localDateKey(now);
	const dateComparison = compareLocalDate(tanggal, today);
	if (dateComparison < 0) return true;
	if (dateComparison > 0) return false;
	return now.getHours() * 60 + now.getMinutes() > timeToMinutes(kegiatan.jamSelesai!);
}

export async function applyAutoAlfaKegiatan(params: {
	sekolahId: number;
	semesterId: number;
	kelasId: number;
	tanggal: string;
	kegiatanIds?: number[];
	now?: Date;
}) {
	const kegiatanRows = await db.query.tableKegiatanAbsensi.findMany({
		where: and(
			eq(tableKegiatanAbsensi.sekolahId, params.sekolahId),
			eq(tableKegiatanAbsensi.aktif, true),
			eq(tableKegiatanAbsensi.autoAlfa, true),
			params.kegiatanIds?.length ? inArray(tableKegiatanAbsensi.id, params.kegiatanIds) : undefined
		)
	});
	const endedKegiatanRows = kegiatanRows.filter((kegiatan) =>
		shouldRunAutoAlfaKegiatan(kegiatan, params.tanggal, params.now)
	);
	if (!endedKegiatanRows.length) return { inserted: 0 };

	const muridRows = await db.query.tableMurid.findMany({
		columns: { id: true },
		where: and(
			eq(tableMurid.sekolahId, params.sekolahId),
			eq(tableMurid.semesterId, params.semesterId),
			eq(tableMurid.kelasId, params.kelasId)
		)
	});
	if (!muridRows.length) return { inserted: 0 };

	const muridIds = muridRows.map((murid) => murid.id);
	const kegiatanIds = endedKegiatanRows.map((kegiatan) => kegiatan.id);
	const existingRows = await db.query.tableAbsensiKegiatan.findMany({
		columns: { muridId: true, kegiatanId: true },
		where: and(
			eq(tableAbsensiKegiatan.sekolahId, params.sekolahId),
			eq(tableAbsensiKegiatan.semesterId, params.semesterId),
			eq(tableAbsensiKegiatan.kelasId, params.kelasId),
			eq(tableAbsensiKegiatan.tanggal, params.tanggal),
			inArray(tableAbsensiKegiatan.muridId, muridIds),
			inArray(tableAbsensiKegiatan.kegiatanId, kegiatanIds)
		)
	});
	const existingKeys = new Set(existingRows.map((row) => `${row.muridId}:${row.kegiatanId}`));
	const now = (params.now ?? new Date()).toISOString();
	const values = endedKegiatanRows.flatMap((kegiatan) =>
		muridRows
			.filter((murid) => !existingKeys.has(`${murid.id}:${kegiatan.id}`))
			.map((murid) => ({
				sekolahId: params.sekolahId,
				semesterId: params.semesterId,
				kelasId: params.kelasId,
				muridId: murid.id,
				kegiatanId: kegiatan.id,
				tanggal: params.tanggal,
				status: 'alfa' as const,
				metode: 'auto' as const,
				autoAlfa: true,
				catatan: 'Auto alfa karena belum ada absensi setelah jam kegiatan selesai.',
				createdAt: now,
				updatedAt: now
			}))
	);

	if (values.length) await db.insert(tableAbsensiKegiatan).values(values);
	return { inserted: values.length };
}

export async function syncKegiatanMasukRaporToKehadiran(params: {
	user?: App.Locals['user'];
	sekolahId: number;
	semesterId: number;
	kelasId: number;
	tanggalAwal?: string;
	tanggalAkhir?: string;
}) {
	const muridRows = await db.query.tableMurid.findMany({
		columns: { id: true },
		where: and(
			eq(tableMurid.sekolahId, params.sekolahId),
			eq(tableMurid.semesterId, params.semesterId),
			eq(tableMurid.kelasId, params.kelasId),
			params.user ? await studentAccessCondition(params.user, params.sekolahId) : undefined
		)
	});
	const muridIds = muridRows.map((murid) => murid.id);
	if (!muridIds.length) return { synced: 0, sourceRows: 0 };

	const kegiatanRows = await db.query.tableKegiatanAbsensi.findMany({
		columns: { id: true },
		where: and(
			eq(tableKegiatanAbsensi.sekolahId, params.sekolahId),
			eq(tableKegiatanAbsensi.aktif, true),
			eq(tableKegiatanAbsensi.masukRapor, true)
		)
	});
	const kegiatanIds = kegiatanRows.map((kegiatan) => kegiatan.id);
	if (!kegiatanIds.length) return { synced: 0, sourceRows: 0 };

	const absensiRows = await db.query.tableAbsensiKegiatan.findMany({
		columns: { muridId: true, status: true },
		where: and(
			eq(tableAbsensiKegiatan.sekolahId, params.sekolahId),
			eq(tableAbsensiKegiatan.semesterId, params.semesterId),
			eq(tableAbsensiKegiatan.kelasId, params.kelasId),
			inArray(tableAbsensiKegiatan.muridId, muridIds),
			inArray(tableAbsensiKegiatan.kegiatanId, kegiatanIds),
			params.tanggalAwal ? gte(tableAbsensiKegiatan.tanggal, params.tanggalAwal) : undefined,
			params.tanggalAkhir ? lte(tableAbsensiKegiatan.tanggal, params.tanggalAkhir) : undefined
		)
	});

	const countsByMurid = new Map<number, { sakit: number; izin: number; alfa: number }>();
	for (const muridId of muridIds) countsByMurid.set(muridId, { sakit: 0, izin: 0, alfa: 0 });
	for (const row of absensiRows) {
		const counts = countsByMurid.get(row.muridId);
		if (!counts) continue;
		if (row.status === 'sakit') counts.sakit += 1;
		if (row.status === 'izin') counts.izin += 1;
		if (row.status === 'alfa') counts.alfa += 1;
	}

	const now = new Date().toISOString();
	let synced = 0;
	for (const [muridId, counts] of countsByMurid) {
		const existing = await db.query.tableKehadiranMurid.findFirst({
			columns: { id: true },
			where: eq(tableKehadiranMurid.muridId, muridId)
		});
		if (existing) {
			await db
				.update(tableKehadiranMurid)
				.set({ sakit: counts.sakit, izin: counts.izin, alfa: counts.alfa, updatedAt: now })
				.where(eq(tableKehadiranMurid.id, existing.id));
		} else {
			await db.insert(tableKehadiranMurid).values({
				muridId,
				sakit: counts.sakit,
				izin: counts.izin,
				alfa: counts.alfa,
				createdAt: now,
				updatedAt: now
			});
		}
		synced += 1;
	}

	return { synced, sourceRows: absensiRows.length };
}

export function listLocalDatesInRange(tanggalAwal: string, tanggalAkhir: string) {
	const [startYear, startMonth, startDay] = tanggalAwal.split('-').map(Number);
	const [endYear, endMonth, endDay] = tanggalAkhir.split('-').map(Number);
	const cursor = new Date(startYear, startMonth - 1, startDay);
	const end = new Date(endYear, endMonth - 1, endDay);
	const dates: string[] = [];
	while (cursor <= end) {
		dates.push(localDateKey(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}
	return dates;
}

export async function ensureDefaultAbsensiKegiatan(sekolahId: number) {
	await ensureAbsensiDigitalSchema();
	return withSchemaReady('Absensi Kegiatan', async () => {
		const existingRows = await db.query.tableKegiatanAbsensi.findMany({
			columns: { kode: true },
			where: eq(tableKegiatanAbsensi.sekolahId, sekolahId)
		});
		const existingCodes = new Set(existingRows.map((row) => row.kode));
		const now = new Date().toISOString();
		const values = DEFAULT_ABSENSI_KEGIATAN.filter((item) => !existingCodes.has(item.kode)).map(
			(item) => ({
				sekolahId,
				kode: item.kode,
				nama: item.nama,
				kategori: item.kategori,
				urutan: item.urutan,
				aksesEdit: item.aksesEdit,
				masukRapor: item.masukRapor,
				createdAt: now,
				updatedAt: now
			})
		);

		if (values.length) await db.insert(tableKegiatanAbsensi).values(values);
	});
}

export async function loadKegiatanAbsensiOptions(sekolahId: number, onlyActive = true) {
	return withSchemaReady('Absensi Kegiatan', async () => {
		await ensureDefaultAbsensiKegiatan(sekolahId);
		return db.query.tableKegiatanAbsensi.findMany({
			where: and(
				eq(tableKegiatanAbsensi.sekolahId, sekolahId),
				onlyActive ? eq(tableKegiatanAbsensi.aktif, true) : undefined
			),
			orderBy: [asc(tableKegiatanAbsensi.urutan), asc(tableKegiatanAbsensi.nama)]
		});
	});
}
