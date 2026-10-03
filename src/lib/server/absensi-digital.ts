import db from '$lib/server/db';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableAuthUserKelas, tableKelas, tableQrMurid } from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';

export const ABSENSI_PERMISSION = 'administrasi_absensi' as UserPermission;
export const ABSENSI_STATUSES = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa'] as const;
export type AbsensiStatus = (typeof ABSENSI_STATUSES)[number];

export function canAccessAbsensiDigital(
	user?: (Pick<AuthUser, 'type' | 'permissions'> & { jabatanAkses?: string | null }) | null
): boolean {
	if (!user) return false;
	if (user.type === 'admin' || user.type === 'wali_kelas') return true;
	return Array.isArray(user.permissions) && user.permissions.includes(ABSENSI_PERMISSION);
}

export function requireAbsensiDigitalAccess(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) throw redirect(303, '/login');
	if (!canAccessAbsensiDigital(user))
		throw redirect(303, '/forbidden?required=administrasi_absensi');
}

export function assertAbsensiDigitalAccess(user?: Pick<AuthUser, 'type' | 'permissions'> | null) {
	if (!user) throw error(401, 'Anda harus login terlebih dahulu.');
	if (!canAccessAbsensiDigital(user)) throw error(403, 'Anda tidak memiliki izin absensi digital.');
}

export function todayLocalDate(date = new Date()) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function normalizeDateInput(value: string | null | undefined, fallback = todayLocalDate()) {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
	return value;
}

export function hashQrToken(token: string) {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createQrToken() {
	return `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
}

function qrTokenSecret() {
	return (
		process.env.RAPKUMER_QR_SECRET ||
		process.env.INTERNAL_RELOAD_SECRET ||
		'rapkumer-absensi-digital-v1'
	);
}

export function createPreviewableQrToken(params: {
	muridId: number;
	tokenVersion: number;
	issuedAt: string;
}) {
	const payload = `${params.muridId}.${params.tokenVersion}.${params.issuedAt}`;
	const signature = createHmac('sha256', qrTokenSecret())
		.update(payload, 'utf8')
		.digest('base64url');
	return `rapkumer-absensi:v2:${payload}.${signature}`;
}

export type PrintableQrRecord = {
	muridId: number;
	tokenHash: string;
	tokenVersion: number;
	issuedAt: string;
};

export function resolvePrintableQrToken(qr: PrintableQrRecord): string | null {
	const token = createPreviewableQrToken(qr);
	return hashQrToken(token) === qr.tokenHash ? token : null;
}

export async function loadActivePrintableQr(muridId: number) {
	await ensureAbsensiDigitalSchema();
	const qr = await db.query.tableQrMurid.findFirst({
		columns: {
			muridId: true,
			tokenHash: true,
			tokenVersion: true,
			issuedAt: true
		},
		where: and(eq(tableQrMurid.muridId, muridId), isNull(tableQrMurid.revokedAt)),
		orderBy: (table, { desc }) => [desc(table.tokenVersion), desc(table.id)]
	});
	if (!qr) return { status: 'missing' as const };

	const token = resolvePrintableQrToken(qr);
	if (!token) return { status: 'not_printable' as const, qr };
	return { status: 'ready' as const, qr, token };
}

export function parsePositiveInteger(value: FormDataEntryValue | string | null | undefined) {
	if (value == null) return null;
	const parsed = Number(value.toString());
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseAbsensiStatus(
	value: FormDataEntryValue | string | null
): AbsensiStatus | null {
	const raw = value?.toString();
	return ABSENSI_STATUSES.includes(raw as AbsensiStatus) ? (raw as AbsensiStatus) : null;
}

export function getLateAwareStatus(date = new Date()): 'hadir' | 'terlambat' {
	const cutoffHour = 7;
	const cutoffMinute = 15;
	const minutes = date.getHours() * 60 + date.getMinutes();
	return minutes > cutoffHour * 60 + cutoffMinute ? 'terlambat' : 'hadir';
}

export async function loadAbsensiKelasOptions(
	sekolahId: number,
	user: Pick<AuthUser, 'id' | 'type' | 'pegawaiId' | 'permissions'> & {
		jabatanAkses?: string | null;
	}
) {
	await ensureAbsensiDigitalSchema();
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const activeSemesterId = academic.activeSemesterId;
	const baseFilter = activeSemesterId
		? and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, activeSemesterId))
		: eq(tableKelas.sekolahId, sekolahId);

	if (!hasSchoolWideOperationalAccess(user)) {
		const assigned = await db.query.tableAuthUserKelas.findMany({
			columns: { kelasId: true },
			where: eq(tableAuthUserKelas.authUserId, user.id)
		});
		const assignedIds = assigned.map((item) => item.kelasId);
		const roleColumn =
			user.type === 'wali_kelas'
				? tableKelas.waliKelasId
				: user.type === 'wali_asrama'
					? tableKelas.waliAsramaId
					: user.type === 'wali_asuh'
						? tableKelas.waliAsuhId
						: null;
		const roleFilter = roleColumn && user.pegawaiId ? eq(roleColumn, user.pegawaiId) : undefined;
		const assignmentFilter = assignedIds.length ? inArray(tableKelas.id, assignedIds) : undefined;
		const accessFilter =
			roleFilter && assignmentFilter
				? or(roleFilter, assignmentFilter)
				: (roleFilter ?? assignmentFilter ?? eq(tableKelas.id, -1));
		return {
			academic,
			kelasList: await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true, semesterId: true },
				where: and(baseFilter, accessFilter),
				orderBy: asc(tableKelas.nama)
			})
		};
	}

	return {
		academic,
		kelasList: await db.query.tableKelas.findMany({
			columns: { id: true, nama: true, fase: true, semesterId: true },
			where: baseFilter,
			orderBy: asc(tableKelas.nama)
		})
	};
}

export function resolveKelasId(kelasList: Array<{ id: number }>, requested: number | null) {
	if (requested && kelasList.some((kelas) => kelas.id === requested)) return requested;
	return kelasList[0]?.id ?? null;
}

export function buildKelasAccessWhere(
	sekolahId: number,
	kelasId: number,
	user: Pick<AuthUser, 'id' | 'type' | 'pegawaiId' | 'permissions'> & {
		jabatanAkses?: string | null;
	}
) {
	const base = and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId));
	if (hasSchoolWideOperationalAccess(user)) return base;
	if (user.type !== 'wali_kelas') return base;
	if (!user.pegawaiId) return and(base, eq(tableKelas.id, -1));
	return and(base, eq(tableKelas.waliKelasId, user.pegawaiId));
}
