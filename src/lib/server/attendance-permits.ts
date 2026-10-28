import { and, eq, inArray, lte, gte, isNull, ne, or } from 'drizzle-orm';
import db from './db';
import { tableIzinPulangMurid as p, tableAbsensiKegiatan } from './db/schema';
import { ensureAbsenceMonitoringSchema } from './db/ensure-absence-monitoring';
import { permitCoversMonitoring } from '$lib/attendance-monitoring';
import { projectIllnessAttendance } from './attendance-illness';

export async function loadAttendancePermits(
	schoolId: number,
	studentIds: number[],
	start: string,
	end = start
) {
	if (!studentIds.length) return [];
	await ensureAbsenceMonitoringSchema();
	return db.query.tableIzinPulangMurid.findMany({
		with: { perjalanan: true },
		where: and(
			eq(p.sekolahId, schoolId),
			inArray(p.muridId, studentIds),
			ne(p.status, 'dibatalkan'),
			lte(p.tanggalKeluar, end),
			or(isNull(p.tanggalKembali), gte(p.tanggalKembali, start))
		)
	});
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
