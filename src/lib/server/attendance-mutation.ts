import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { canAttendance, canAttendActivity, attendanceDateAllowed } from '$lib/attendance-access';
import {
	tableAbsensiHarian,
	tableAbsensiKegiatan,
	tableKegiatanAbsensi,
	tableMurid
} from './db/schema';
import db from './db';
import { studentAccessCondition } from './student-access';
import { activeMuridFilter } from './murid-query';
import { resolveSekolahAcademicContext } from './db/academic';
import { todayLocalDate, type AbsensiStatus } from './absensi-digital';
import type { AbsensiKegiatanStatus } from './absensi-kegiatan';
import { writeAuditLog } from './audit-log';
import { ensureDataGovernanceSchema } from './db/ensure-data-governance';

export async function saveAttendance(options: {
	locals: App.Locals;
	request: Request;
	semesterId: number;
	kelasId: number;
	muridIds: number[];
	tanggal: string;
	kegiatanId?: number;
	status: AbsensiKegiatanStatus | null;
	catatan?: string | null;
	onlyEmpty?: boolean;
	metode?: 'manual' | 'qr';
	waktuScan?: string;
}) {
	const { locals, request, semesterId, kelasId, tanggal, kegiatanId } = options;
	const sekolahId = locals.sekolah?.id;
	const user = locals.user;
	const scan = options.metode === 'qr';
	if (!sekolahId || !user) throw error(401, 'Sesi sekolah tidak valid.');
	if (!canAttendance(user, scan ? 'scan' : options.status ? 'input' : 'koreksi'))
		throw error(403, 'Izin tindakan absensi belum diberikan.');
	if (!attendanceDateAllowed(user, tanggal, todayLocalDate()))
		throw error(403, 'Tanggal absensi memerlukan izin koreksi tanggal lama.');
	const academic = await resolveSekolahAcademicContext(sekolahId);
	if (academic.activeSemesterId !== semesterId)
		throw error(403, 'Input hanya untuk semester aktif.');
	const kegiatan = kegiatanId
		? await db.query.tableKegiatanAbsensi.findFirst({
				where: and(
					eq(tableKegiatanAbsensi.id, kegiatanId),
					eq(tableKegiatanAbsensi.sekolahId, sekolahId),
					eq(tableKegiatanAbsensi.aktif, true)
				)
			})
		: null;
	if ((kegiatanId && !kegiatan) || !canAttendActivity(user, kegiatan?.aksesEdit ?? 'sekolah'))
		throw error(403, 'Kegiatan di luar tanggung jawab akun.');
	if (!kegiatanId && options.status === 'pulang') throw error(400, 'Status harian tidak valid.');
	const ids = [...new Set(options.muridIds)];
	if (!ids.length) return { affected: 0, skipped: 0, records: [] };
	const students = await db.query.tableMurid.findMany({
		columns: { id: true },
		where: and(
			await studentAccessCondition(user, sekolahId, semesterId),
			activeMuridFilter(),
			eq(tableMurid.kelasId, kelasId),
			inArray(tableMurid.id, ids)
		)
	});
	if (students.length !== ids.length)
		throw error(403, 'Sebagian murid di luar penugasan akun atau tidak aktif.');
	const reason = options.catatan?.trim() || null;
	if (reason && reason.length > 500) throw error(400, 'Catatan maksimal 500 karakter.');
	await ensureDataGovernanceSchema();
	return db.transaction(async (tx) => {
		const table = kegiatanId ? tableAbsensiKegiatan : tableAbsensiHarian;
		const condition = and(
			eq(table.sekolahId, sekolahId),
			eq(table.semesterId, semesterId),
			eq(table.kelasId, kelasId),
			eq(table.tanggal, tanggal),
			inArray(table.muridId, ids),
			kegiatanId ? eq(tableAbsensiKegiatan.kegiatanId, kegiatanId) : undefined
		);
		const existing = kegiatanId
			? await tx.query.tableAbsensiKegiatan.findMany({ where: condition })
			: await tx.query.tableAbsensiHarian.findMany({ where: condition });
		const byStudent = new Map(existing.map((row) => [row.muridId, row]));
		if (
			!scan &&
			!options.onlyEmpty &&
			existing.some((row) => row.status !== options.status || row.catatan !== reason)
		) {
			if (!canAttendance(user, 'koreksi'))
				throw error(403, 'Izin koreksi absensi belum diberikan.');
			if (!reason)
				throw error(
					400,
					'Isi catatan alasan sebelum mengubah atau menghapus absensi yang sudah tercatat.'
				);
		}
		let affected = 0;
		let skipped = 0;
		const records: Array<{ status: string; waktuScan: string | null }> = [];
		for (const muridId of ids) {
			const before = byStudent.get(muridId);
			if (
				before &&
				(scan ||
					options.onlyEmpty ||
					(before.status === options.status && before.catatan === reason))
			) {
				skipped++;
				records.push({ status: before.status, waktuScan: before.waktuScan });
				continue;
			}
			const now = new Date().toISOString();
			const common = {
				sekolahId,
				semesterId,
				kelasId,
				muridId,
				tanggal,
				metode: options.metode ?? ('manual' as const),
				catatan: reason,
				petugasUserId: user.id,
				updatedAt: now
			};
			if (!options.status) {
				if (!before) continue;
				await tx.delete(table).where(eq(table.id, before.id));
			} else if (before) {
				if (kegiatanId)
					await tx
						.update(tableAbsensiKegiatan)
						.set({ ...common, status: options.status, autoAlfa: false })
						.where(eq(tableAbsensiKegiatan.id, before.id));
				else
					await tx
						.update(tableAbsensiHarian)
						.set({ ...common, status: options.status as AbsensiStatus })
						.where(eq(tableAbsensiHarian.id, before.id));
			} else {
				if (kegiatanId)
					await tx.insert(tableAbsensiKegiatan).values({
						...common,
						kegiatanId,
						status: options.status,
						waktuScan: options.waktuScan ?? null,
						createdAt: now
					});
				else
					await tx.insert(tableAbsensiHarian).values({
						...common,
						status: options.status as AbsensiStatus,
						waktuScan: options.waktuScan ?? null,
						createdAt: now
					});
			}
			await writeAuditLog(
				{
					locals,
					request,
					action: !options.status ? 'delete' : before ? 'update' : 'create',
					entityType: kegiatanId ? 'absensi_kegiatan' : 'absensi_harian',
					entityId: `${muridId}:${tanggal}:${kegiatanId ?? 'sekolah'}`,
					summary: `Absensi ${options.metode ?? 'manual'} ${tanggal}${reason ? `: ${reason}` : ''}`,
					before: before ?? null,
					after: options.status
						? {
								...common,
								kegiatanId,
								status: options.status,
								waktuScan: options.waktuScan ?? before?.waktuScan ?? null
							}
						: null
				},
				tx
			);
			affected++;
			if (options.status)
				records.push({
					status: options.status,
					waktuScan: options.waktuScan ?? before?.waktuScan ?? null
				});
		}
		return { affected, skipped, records };
	});
}
