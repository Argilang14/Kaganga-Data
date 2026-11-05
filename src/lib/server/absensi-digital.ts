import db from '$lib/server/db';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKelas } from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { canAttendance } from '$lib/attendance-access';
import { accessibleClassIds } from './attendance-student-access';

export const ABSENSI_PERMISSION = 'administrasi_absensi' as UserPermission;
export const ABSENSI_STATUSES = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa'] as const;
export type AbsensiStatus = (typeof ABSENSI_STATUSES)[number];

export function canAccessAbsensiDigital(
	user?: (Pick<AuthUser, 'type' | 'permissions'> & { jabatanAkses?: string | null }) | null
): boolean {
	return canAttendance(user, 'lihat');
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
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

export function normalizeDateInput(value: string | null | undefined, fallback = todayLocalDate()) {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
	return value;
}

export {
	hashQrToken,
	createQrToken,
	createPreviewableQrToken,
	resolvePrintableQrToken,
	type PrintableQrRecord
} from './student-qr-token';
export { loadActivePrintableQr } from './student-qr';

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
		sekolahId?: number | null;
	}
) {
	await ensureAbsensiDigitalSchema();
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const activeSemesterId = academic.activeSemesterId;
	const baseFilter = activeSemesterId
		? and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, activeSemesterId))
		: eq(tableKelas.sekolahId, sekolahId);
	const allowedIds = await accessibleClassIds(
		user as App.Locals['user'],
		sekolahId,
		activeSemesterId
	);
	return {
		academic,
		kelasList: allowedIds.length
			? await db.query.tableKelas.findMany({
					columns: { id: true, nama: true, fase: true, semesterId: true },
					where: and(baseFilter, inArray(tableKelas.id, allowedIds)),
					orderBy: asc(tableKelas.nama)
				})
			: []
	};
}

export function resolveKelasId(kelasList: Array<{ id: number }>, requested: number | null) {
	if (requested && kelasList.some((kelas) => kelas.id === requested)) return requested;
	return kelasList[0]?.id ?? null;
}

export async function buildKelasAccessWhere(
	sekolahId: number,
	kelasId: number,
	user: Pick<AuthUser, 'id' | 'type' | 'pegawaiId' | 'permissions'> & {
		jabatanAkses?: string | null;
		sekolahId?: number | null;
	}
) {
	const base = and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId));
	const ids = await accessibleClassIds(user as App.Locals['user'], sekolahId);
	return and(base, ids.includes(kelasId) ? undefined : eq(tableKelas.id, -1));
}
