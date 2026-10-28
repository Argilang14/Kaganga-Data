import { error } from '@sveltejs/kit';
import { and, eq, inArray, ne, lte, gte, or, isNull } from 'drizzle-orm';
import { permitCoversMonitoring } from '$lib/attendance-monitoring';
import { travelLocalTime } from '$lib/attendance-travel';
import { ensureAbsenceMonitoringSchema } from './db/ensure-absence-monitoring';
import { canAttendance, canAttendActivity, attendanceDateAllowed } from '$lib/attendance-access';
import {
	tableAbsensiHarian,
	tableAbsensiKegiatan,
	tableKegiatanAbsensi,
	tableMurid,
	tableIzinPulangMurid
} from './db/schema';
import db from './db';
import { studentAccessCondition } from './attendance-student-access';
import { activeMuridFilter } from './murid-query';
import { resolveSekolahAcademicContext } from './db/academic';
import { todayLocalDate, type AbsensiStatus } from './absensi-digital';
import type { AbsensiKegiatanStatus } from './absensi-kegiatan';
import { writeAuditLog } from './audit-log';
import { ensureDataGovernanceSchema } from './db/ensure-data-governance';
import { ensureAttendanceIllnessSchema } from './db/ensure-attendance-illness';
import { tableAbsensiMasaSakit as illness } from './db/schema';
import { illnessCovers, illnessEndDate, latestIllness, canReturnFromIllness } from '$lib/attendance-illness';

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
	perpanjangSakit?: boolean;
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
	if (
		(kegiatanId && !kegiatan) ||
		!canAttendActivity(user, kegiatan?.aksesEdit ?? 'sekolah', kegiatan?.kategori, {
			kode: kegiatan?.kode,
			tanggal
		})
	)
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
	const illnessSource = !kegiatan || ['sekolah', 'asrama'].includes(kegiatan.kategori);
	const schoolEntry = !kegiatan || kegiatan.kode === 'apel_berangkat';
	if (options.perpanjangSakit && (scan || options.status !== 'sakit' || !illnessSource || !reason))
		throw error(400, 'Perpanjangan sakit memerlukan status Sakit dan catatan alasan pada kegiatan sekolah atau asrama.');
	if (options.perpanjangSakit && !canAttendance(user, 'koreksi'))
		throw error(403, 'Izin koreksi diperlukan untuk memperpanjang masa sakit.');
	await ensureDataGovernanceSchema();
	await ensureAbsenceMonitoringSchema();
	await ensureAttendanceIllnessSchema();
	return db.transaction(async (tx) => {
		const periods = await tx.select().from(illness).where(and(
			eq(illness.sekolahId, sekolahId), eq(illness.semesterId, semesterId), inArray(illness.muridId, ids),
			lte(illness.tanggalMulai, tanggal), isNull(illness.dibatalkanPada)
		));
		const permits =
			options.status && ['hadir', 'terlambat'].includes(options.status)
				? await tx.query.tableIzinPulangMurid.findMany({
						with: { perjalanan: true },
						where: and(
							eq(tableIzinPulangMurid.sekolahId, sekolahId),
							inArray(tableIzinPulangMurid.muridId, ids),
							ne(tableIzinPulangMurid.status, 'dibatalkan'),
							lte(tableIzinPulangMurid.tanggalKeluar, tanggal),
							or(
								isNull(tableIzinPulangMurid.tanggalKembali),
								gte(tableIzinPulangMurid.tanggalKembali, tanggal)
							)
						)
					})
				: [];
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
		const records: Array<{
			status: string;
			waktuScan: string | null;
			petugasUserId: number | null;
			metode: string;
		}> = [];
		for (const muridId of ids) {
			const before = byStudent.get(muridId);
			const period = latestIllness(periods, muridId, tanggal);
			const renewIllness = !!options.perpanjangSakit && (!period ||
				!illnessCovers(period, tanggal) || illnessEndDate(tanggal) > period.tanggalSelesai);
			if (!scan && illnessSource && options.status === 'sakit' && period &&
				(!illnessCovers(period, tanggal) || options.perpanjangSakit) && !reason)
				throw error(400, 'Isi catatan alasan untuk melanjutkan atau memperbarui masa sakit.');
			const capturedAt = options.waktuScan ?? new Date().toISOString();
			const returning = scan && schoolEntry && !!options.status && ['hadir', 'terlambat'].includes(options.status) &&
				!!period && canReturnFromIllness(period, capturedAt);
			const recoverSick = returning && !!before && (before.status === 'sakit' || before.metode === 'auto') &&
				Date.parse(capturedAt) >= Date.parse(before.updatedAt ?? before.createdAt);
			const point = scan
				? travelLocalTime(new Date(options.waktuScan ?? Date.now())).time
				: (kegiatan?.jamMulai ?? null);
			if (
				(!before || before.metode === 'auto' || recoverSick) &&
				permits.some(
					(permit) => permit.muridId === muridId && permitCoversMonitoring(tanggal, point, permit)
				)
			) {
				skipped++;
				records.push({
					status: 'pulang',
					waktuScan: null,
					petugasUserId: null,
					metode: 'izin_pulang'
				});
				continue;
			}
			if ((scan || options.onlyEmpty) && period && !returning && illnessCovers(period, tanggal, point) &&
				(!before || before.status === 'sakit' || before.metode === 'auto')) {
				skipped++;
				records.push({ status: 'sakit', waktuScan: null, petugasUserId: period.petugasUserId, metode: 'masa_sakit' });
				continue;
			}
			if (
				before &&
				((scan && !recoverSick) ||
					options.onlyEmpty ||
					(!renewIllness && before.status === options.status && before.catatan === reason))
			) {
				skipped++;
				records.push({
					status: before.status,
					waktuScan: before.waktuScan,
					petugasUserId: before.petugasUserId,
					metode: before.metode
				});
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
						.set({ ...common, status: options.status, autoAlfa: false, waktuScan: options.waktuScan ?? before.waktuScan })
						.where(eq(tableAbsensiKegiatan.id, before.id));
				else
					await tx
						.update(tableAbsensiHarian)
						.set({ ...common, status: options.status as AbsensiStatus, waktuScan: options.waktuScan ?? before.waktuScan })
						.where(eq(tableAbsensiHarian.id, before.id));
			} else {
				if (scan || options.onlyEmpty) {
					// Only the winner of the unique student/date/activity insert creates an audit entry.
					const inserted = kegiatanId
						? await tx
								.insert(tableAbsensiKegiatan)
								.values({
									...common,
									kegiatanId,
									status: options.status,
									waktuScan: options.waktuScan ?? null,
									createdAt: now
								})
								.onConflictDoNothing({
									target: [
										tableAbsensiKegiatan.muridId,
										tableAbsensiKegiatan.kegiatanId,
										tableAbsensiKegiatan.tanggal
									]
								})
								.returning({ id: tableAbsensiKegiatan.id })
						: await tx
								.insert(tableAbsensiHarian)
								.values({
									...common,
									status: options.status as AbsensiStatus,
									waktuScan: options.waktuScan ?? null,
									createdAt: now
								})
								.onConflictDoNothing({
									target: [tableAbsensiHarian.muridId, tableAbsensiHarian.tanggal]
								})
								.returning({ id: tableAbsensiHarian.id });
					if (!inserted.length) {
						const current = kegiatanId
							? await tx.query.tableAbsensiKegiatan.findFirst({
									where: and(condition, eq(tableAbsensiKegiatan.muridId, muridId))
								})
							: await tx.query.tableAbsensiHarian.findFirst({
									where: and(condition, eq(tableAbsensiHarian.muridId, muridId))
								});
						if (!current)
							throw error(
								409,
								'Absensi sudah tercatat pada konteks kelas lain. Perbarui halaman sebelum melanjutkan.'
							);
						skipped++;
						records.push({
							status: current.status,
							waktuScan: current.waktuScan,
							petugasUserId: current.petugasUserId,
							metode: current.metode
						});
						continue;
					}
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
			}
			const source = `${tanggal}:${kegiatanId ?? 'harian'}`;
			if (returning) {
				const changed = await tx.update(illness).set({ kembaliPada: capturedAt, kembaliOleh: user.id, updatedAt: now })
					.where(and(eq(illness.id, period.id), isNull(illness.kembaliPada))).returning();
				if (changed.length) await writeAuditLog({ locals, request, action: 'update', entityType: 'absensi_masa_sakit',
					entityId: String(period.id), summary: 'Kembali hadir melalui scan masuk sekolah.', before: period, after: changed[0] }, tx);
			}
			if (!scan && options.status === 'sakit' && illnessSource &&
				(!period || !illnessCovers(period, tanggal) || renewIllness)) {
				const created = await tx.insert(illness).values({ sekolahId, semesterId, muridId,
					tanggalMulai: tanggal, tanggalSelesai: illnessEndDate(tanggal), sumber: source,
					catatan: reason, petugasUserId: user.id, createdAt: now, updatedAt: now }).returning();
				await writeAuditLog({ locals, request, action: 'create', entityType: 'absensi_masa_sakit',
					entityId: String(created[0].id), summary: options.perpanjangSakit ? 'Perpanjangan masa sakit tiga hari kalender.' : 'Masa sakit tiga hari kalender.',
					before: null, after: created[0] }, tx);
			}
			if (!scan && options.status !== 'sakit' && before?.status === 'sakit') {
				const cancelled = await tx.update(illness).set({ dibatalkanPada: now, updatedAt: now }).where(and(
					eq(illness.sekolahId, sekolahId), eq(illness.semesterId, semesterId), eq(illness.muridId, muridId),
					eq(illness.sumber, source), isNull(illness.kembaliPada), isNull(illness.dibatalkanPada)
				)).returning();
				for (const item of cancelled) await writeAuditLog({ locals, request, action: 'update', entityType: 'absensi_masa_sakit',
					entityId: String(item.id), summary: `Koreksi sumber masa sakit: ${reason}`, before: periods.find((p) => p.id === item.id), after: item }, tx);
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
					waktuScan: options.waktuScan ?? before?.waktuScan ?? null,
					petugasUserId: user.id,
					metode: common.metode
				});
		}
		return { affected, skipped, records };
	});
}
