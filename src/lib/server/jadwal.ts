import db from '$lib/server/db';
import { ensureJadwalKurikulumSchema } from '$lib/server/db/ensure-jadwal-kurikulum';
import { withSchemaReady } from '$lib/server/db/schema-guard';
import { tableJadwalJam, tableJadwalKegiatan, tableJadwalTemplate } from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';

export const JADWAL_PERMISSION = 'administrasi_jadwal' as UserPermission;

export const JADWAL_HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'] as const;
export type JadwalHari = (typeof JADWAL_HARI)[number];

export const JADWAL_HARI_LABELS = {
	senin: 'Senin',
	selasa: 'Selasa',
	rabu: 'Rabu',
	kamis: 'Kamis',
	jumat: 'Jumat'
} satisfies Record<JadwalHari, string>;

export const JADWAL_JENJANG = ['srd', 'srmp', 'srma'] as const;
export type JadwalJenjang = (typeof JADWAL_JENJANG)[number];

export const JADWAL_JENJANG_LABELS = {
	srd: 'SRD',
	srmp: 'SRMP',
	srma: 'SRMA/SRT'
} satisfies Record<JadwalJenjang, string>;

const TEMPLATE_JENJANG_MAP = {
	srd: 'sd',
	srmp: 'smp',
	srma: 'sma'
} as const satisfies Record<JadwalJenjang, 'sd' | 'smp' | 'sma'>;

type DefaultJam = {
	jamKe: number;
	mulai: string;
	selesai: string;
	tipe: 'pelajaran' | 'kegiatan' | 'istirahat' | 'kosong';
	namaDefault: string | null;
};

const DEFAULT_JAM_BY_JENJANG: Record<JadwalJenjang, readonly DefaultJam[]> = {
	srd: [
		{ jamKe: 1, mulai: '07:15', selesai: '07:50', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 2, mulai: '07:50', selesai: '08:25', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 3, mulai: '08:25', selesai: '09:00', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 4, mulai: '09:00', selesai: '09:15', tipe: 'istirahat', namaDefault: 'Istirahat' },
		{ jamKe: 5, mulai: '09:15', selesai: '09:50', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 6, mulai: '09:50', selesai: '10:25', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 7, mulai: '10:25', selesai: '11:00', tipe: 'pelajaran', namaDefault: null }
	],
	srmp: [
		{ jamKe: 1, mulai: '07:15', selesai: '07:55', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 2, mulai: '07:55', selesai: '08:35', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 3, mulai: '08:35', selesai: '09:15', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 4, mulai: '09:15', selesai: '09:30', tipe: 'istirahat', namaDefault: 'Istirahat' },
		{ jamKe: 5, mulai: '09:30', selesai: '10:10', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 6, mulai: '10:10', selesai: '10:50', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 7, mulai: '10:50', selesai: '11:30', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 8, mulai: '11:30', selesai: '12:10', tipe: 'istirahat', namaDefault: 'Ishoma' }
	],
	srma: [
		{ jamKe: 1, mulai: '07:15', selesai: '08:00', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 2, mulai: '08:00', selesai: '08:45', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 3, mulai: '08:45', selesai: '09:30', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 4, mulai: '09:30', selesai: '09:45', tipe: 'istirahat', namaDefault: 'Istirahat' },
		{ jamKe: 5, mulai: '09:45', selesai: '10:30', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 6, mulai: '10:30', selesai: '11:15', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 7, mulai: '11:15', selesai: '12:00', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 8, mulai: '12:00', selesai: '12:45', tipe: 'istirahat', namaDefault: 'Ishoma' },
		{ jamKe: 9, mulai: '12:45', selesai: '13:30', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 10, mulai: '13:30', selesai: '14:15', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 11, mulai: '14:15', selesai: '15:00', tipe: 'pelajaran', namaDefault: null },
		{ jamKe: 12, mulai: '15:00', selesai: '15:45', tipe: 'pelajaran', namaDefault: null }
	]
};

const DEFAULT_KEGIATAN_JADWAL = [
	{ kode: 'upacara', nama: 'Upacara', kategori: 'umum', warna: '#8BC34A' },
	{ kode: 'sholat_dhuha', nama: 'Sholat Dhuha', kategori: 'keagamaan', warna: '#FFF200' },
	{ kode: 'senam_sehat', nama: 'Senam Sehat', kategori: 'umum', warna: '#9CCC65' },
	{ kode: 'kokurikuler', nama: 'Kokurikuler', kategori: 'kokurikuler', warna: '#7A9B3A' },
	{ kode: 'istirahat', nama: 'Istirahat', kategori: 'istirahat', warna: '#F9C08B' },
	{ kode: 'ishoma', nama: 'Ishoma', kategori: 'istirahat', warna: '#F9C08B' }
] as const;

export function normalizeJadwalJenjang(value: FormDataEntryValue | string | null | undefined) {
	const raw = value?.toString().toLowerCase();
	return JADWAL_JENJANG.includes(raw as JadwalJenjang) ? (raw as JadwalJenjang) : 'srma';
}

export function canAccessJadwal(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) return false;
	if (user.type === 'admin' || user.type === 'wali_kelas') return true;
	return Array.isArray(user.permissions) && user.permissions.includes(JADWAL_PERMISSION);
}

export function canManageJadwal(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) return false;
	if (user.type === 'admin') return true;
	return Array.isArray(user.permissions) && user.permissions.includes(JADWAL_PERMISSION);
}

export function requireJadwalAccess(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) throw redirect(303, '/login');
	if (!canAccessJadwal(user)) throw redirect(303, '/forbidden?required=administrasi_jadwal');
}

export function requireJadwalManageAccess(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) throw redirect(303, '/login');
	if (!canManageJadwal(user)) throw error(403, 'Anda tidak memiliki izin mengelola jadwal.');
}

function templateNameForJenjang(jenjang: JadwalJenjang) {
	return jenjang === 'srma'
		? 'Jadwal Reguler Senin-Jumat'
		: `Jadwal Reguler Senin-Jumat ${JADWAL_JENJANG_LABELS[jenjang]}`;
}

async function ensureTemplateForJenjang(
	sekolahId: number,
	jenjang: JadwalJenjang,
	params?: { tahunAjaranId?: number | null; semesterId?: number | null }
) {
	const now = new Date().toISOString();
	const nama = templateNameForJenjang(jenjang);
	let template = await db.query.tableJadwalTemplate.findFirst({
		where: and(eq(tableJadwalTemplate.sekolahId, sekolahId), eq(tableJadwalTemplate.nama, nama))
	});
	let created = false;

	if (!template) {
		const result = await db
			.insert(tableJadwalTemplate)
			.values({
				sekolahId,
				tahunAjaranId: params?.tahunAjaranId ?? null,
				semesterId: params?.semesterId ?? null,
				nama,
				jenjang: TEMPLATE_JENJANG_MAP[jenjang],
				aktif: true,
				createdAt: now,
				updatedAt: now
			})
			.returning();
		template = result[0];
		created = true;
	}

	return { template, created };
}

export async function ensureDefaultJadwalFoundation(
	sekolahId: number,
	params?: {
		tahunAjaranId?: number | null;
		semesterId?: number | null;
		jenjang?: JadwalJenjang | null;
		restoreMissingJam?: boolean;
	}
) {
	await ensureJadwalKurikulumSchema();
	return withSchemaReady('Jadwal', async () => {
		const now = new Date().toISOString();
		const selectedJenjang = normalizeJadwalJenjang(params?.jenjang);
		let selectedTemplate = null as
			| Awaited<ReturnType<typeof ensureTemplateForJenjang>>['template']
			| null;
		let jamInserted = 0;

		for (const jenjang of JADWAL_JENJANG) {
			const { template, created: templateCreated } = await ensureTemplateForJenjang(
				sekolahId,
				jenjang,
				params
			);
			if (jenjang === selectedJenjang) selectedTemplate = template;

			const existingJam = await db.query.tableJadwalJam.findMany({
				columns: { hari: true, jamKe: true },
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.templateId, template.id),
					eq(tableJadwalJam.jenjang, jenjang)
				)
			});
			const shouldRestoreMissingJam = templateCreated || params?.restoreMissingJam === true;
			const existingJamKeys = new Set(existingJam.map((row) => `${row.hari}:${row.jamKe}`));
			const jamValues = shouldRestoreMissingJam
				? JADWAL_HARI.flatMap((hari, hariIndex) =>
						DEFAULT_JAM_BY_JENJANG[jenjang]
							.filter((item) => !existingJamKeys.has(`${hari}:${item.jamKe}`))
							.map((item) => ({
								sekolahId,
								templateId: template.id,
								jenjang,
								hari,
								jamKe: item.jamKe,
								label: item.tipe === 'istirahat' ? item.namaDefault : `Jam ${item.jamKe}`,
								pukulMulai: item.mulai,
								pukulSelesai: item.selesai,
								tipe: item.tipe,
								namaDefault: item.namaDefault,
								urutan: hariIndex * 100 + item.jamKe,
								aktif: true,
								createdAt: now,
								updatedAt: now
							}))
					)
				: [];
			if (jamValues.length) {
				await db.insert(tableJadwalJam).values(jamValues);
				jamInserted += jamValues.length;
			}
		}

		const existingKegiatan = await db.query.tableJadwalKegiatan.findMany({
			columns: { kode: true },
			where: eq(tableJadwalKegiatan.sekolahId, sekolahId)
		});
		const existingKegiatanCodes = new Set(existingKegiatan.map((row) => row.kode));
		const kegiatanValues = DEFAULT_KEGIATAN_JADWAL.filter(
			(item) => !existingKegiatanCodes.has(item.kode)
		).map((item) => ({
			sekolahId,
			kode: item.kode,
			nama: item.nama,
			kategori: item.kategori,
			warna: item.warna,
			aktif: true,
			createdAt: now,
			updatedAt: now
		}));
		if (kegiatanValues.length) await db.insert(tableJadwalKegiatan).values(kegiatanValues);

		return {
			template:
				selectedTemplate ??
				(await ensureTemplateForJenjang(sekolahId, selectedJenjang, params)).template,
			jamInserted,
			kegiatanInserted: kegiatanValues.length
		};
	});
}
export async function loadJadwalJam(sekolahId: number, jenjang: JadwalJenjang | null = 'srma') {
	await ensureJadwalKurikulumSchema();
	return withSchemaReady('Jadwal', () =>
		db.query.tableJadwalJam.findMany({
			where:
				jenjang === null
					? eq(tableJadwalJam.sekolahId, sekolahId)
					: and(eq(tableJadwalJam.sekolahId, sekolahId), eq(tableJadwalJam.jenjang, jenjang)),
			orderBy: [asc(tableJadwalJam.urutan), asc(tableJadwalJam.jamKe)]
		})
	);
}

export async function loadJadwalKegiatan(sekolahId: number) {
	await ensureJadwalKurikulumSchema();
	return withSchemaReady('Jadwal', () =>
		db.query.tableJadwalKegiatan.findMany({
			where: eq(tableJadwalKegiatan.sekolahId, sekolahId),
			orderBy: [asc(tableJadwalKegiatan.kategori), asc(tableJadwalKegiatan.nama)]
		})
	);
}



