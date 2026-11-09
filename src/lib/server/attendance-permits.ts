import { and, eq, inArray, lte, gte, isNull, ne, or } from 'drizzle-orm';
import db from './db';
import {
	tableIzinPulangMurid as p,
	tableAbsensiKegiatan,
	tableMurid,
	tablePerjalananMurid
} from './db/schema';
import { ensureAbsenceMonitoringSchema } from './db/ensure-absence-monitoring';
import { permitCoversMonitoring } from '$lib/attendance-monitoring';
import { projectIllnessAttendance } from './attendance-illness';
import { muridIdentityIds } from './murid-identity-service';
import { ensureDataGovernanceSchema } from './db/ensure-data-governance';
import { studentAccessCondition } from './attendance-student-access';
import { resolveSekolahAcademicContext } from './db/academic';
import { hasSchoolWideAttendanceStudentAccess } from '$lib/attendance-access';

export async function canManageStudentPermit(
	user: App.Locals['user'],
	school: number,
	studentId: number,
	reader: typeof db | DBTransaction = db
) {
	if (hasSchoolWideAttendanceStudentAccess(user, school)) return true;
	const academic = await resolveSekolahAcademicContext(school, reader);
	if (!academic.activeSemesterId) return false;
	const ids = await muridIdentityIds(reader, school, studentId);
	return Boolean(
		await reader.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(
				inArray(tableMurid.id, ids),
				await studentAccessCondition(user, school, academic.activeSemesterId)
			)
		})
	);
}

export async function loadAttendancePermits(
	schoolId: number,
	studentIds: number[],
	start: string,
	end = start,
	reader: typeof db | DBTransaction = db
): Promise<
	(typeof p.$inferSelect & { perjalanan: typeof tablePerjalananMurid.$inferSelect | null })[]
> {
	if (!studentIds.length) return [];
	if (reader === db) {
		await ensureAbsenceMonitoringSchema();
		await ensureDataGovernanceSchema();
	}
	const targets = new Map<number, Set<number>>();
	for (const id of [...new Set(studentIds)]) {
		for (const member of await muridIdentityIds(reader, schoolId, id)) {
			if (!targets.has(member)) targets.set(member, new Set());
			targets.get(member)!.add(id);
		}
	}
	const permits = await reader.query.tableIzinPulangMurid.findMany({
		with: { perjalanan: true },
		where: and(
			eq(p.sekolahId, schoolId),
			inArray(p.muridId, [...targets.keys()]),
			ne(p.status, 'dibatalkan'),
			lte(p.tanggalKeluar, end),
			or(isNull(p.tanggalKembali), gte(p.tanggalKembali, start))
		)
	});
	// Project onto the requested period without rewriting the original permit or journey.
	return permits.flatMap((permit) =>
		[...(targets.get(permit.muridId ?? 0) ?? [])].map((muridId) => ({ ...permit, muridId }))
	);
}

// Derived rows are never persisted. An actual manual/QR record always wins over a permit.
export async function projectPermitAttendance(options: {
	schoolId: number;
	semesterId: number;
	studentIds: number[];
	dates: string[];
	activities: Array<{ id: number; jamMulai: string | null }>;
	rows: Array<typeof tableAbsensiKegiatan.$inferSelect>;
}) {
	const { dates, rows, activities } = options;
	if (!dates.length) return rows;
	const permits = await loadAttendancePermits(
		options.schoolId,
		options.studentIds,
		dates[0],
		dates.at(-1)
	);
	const projected = new Map(
		rows.map((row) => [`${row.muridId}:${row.kegiatanId}:${row.tanggal}`, row])
	);
	for (const permit of permits) {
		if (!permit.muridId) continue;
		for (const tanggal of dates)
			for (const activity of activities) {
				const key = `${permit.muridId}:${activity.id}:${tanggal}`;
				const existing = projected.get(key);
				if (
					(!existing || existing.autoAlfa) &&
					permitCoversMonitoring(tanggal, activity.jamMulai, permit)
				) {
					projected.set(key, {
						id: -permit.id,
						sekolahId: options.schoolId,
						semesterId: options.semesterId,
						kelasId: permit.kelasId ?? 0,
						muridId: permit.muridId,
						kegiatanId: activity.id,
						tanggal,
						status: 'pulang',
						metode: 'manual',
						autoAlfa: false,
						waktuScan: null,
						catatan: 'Izin pulang terhubung dari catatan izin.',
						petugasUserId: null,
						createdAt: permit.createdAt,
						updatedAt: permit.updatedAt
					});
				}
			}
	}
	return projectIllnessAttendance({ ...options, rows: [...projected.values()] });
}
