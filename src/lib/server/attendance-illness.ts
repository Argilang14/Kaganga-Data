import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import db from './db';
import {
	tableAbsensiMasaSakit as illness,
	tableAbsensiKegiatan,
	tableAbsensiHarian,
	tableMurid
} from './db/schema';
import { ensureAttendanceIllnessSchema } from './db/ensure-attendance-illness';
import {
	illnessCovers,
	illnessLabel,
	illnessNeedsReview,
	latestIllness
} from '$lib/attendance-illness';

export async function loadAttendanceIllness(
	schoolId: number,
	semesterId: number,
	studentIds: number[],
	end: string
) {
	if (!studentIds.length) return [];
	await ensureAttendanceIllnessSchema();
	return db
		.select()
		.from(illness)
		.where(
			and(
				eq(illness.sekolahId, schoolId),
				eq(illness.semesterId, semesterId),
				inArray(illness.muridId, studentIds),
				lte(illness.tanggalMulai, end),
				isNull(illness.dibatalkanPada)
			)
		);
}

export async function projectIllnessAttendance(options: {
	schoolId: number;
	semesterId: number;
	studentIds: number[];
	dates: string[];
	activities: Array<{ id: number; jamMulai: string | null }>;
	rows: Array<typeof tableAbsensiKegiatan.$inferSelect>;
}) {
	const periods = await loadAttendanceIllness(
		options.schoolId,
		options.semesterId,
		options.studentIds,
		options.dates.at(-1) ?? ''
	);
	if (!periods.length) return options.rows;
	const students = await db
		.select({ id: tableMurid.id, kelasId: tableMurid.kelasId })
		.from(tableMurid)
		.where(
			and(
				eq(tableMurid.sekolahId, options.schoolId),
				eq(tableMurid.semesterId, options.semesterId),
				inArray(tableMurid.id, options.studentIds)
			)
		);
	const projected = new Map(
		options.rows
			.filter(
				(row) =>
					!row.autoAlfa ||
					!illnessNeedsReview(latestIllness(periods, row.muridId, row.tanggal), row.tanggal)
			)
			.map((row) => [`${row.muridId}:${row.kegiatanId}:${row.tanggal}`, row])
	);
	for (const student of students)
		for (const tanggal of options.dates) {
			const period = latestIllness(periods, student.id, tanggal);
			if (!period) continue;
			for (const activity of options.activities) {
				if (!illnessCovers(period, tanggal, activity.jamMulai)) continue;
				const key = `${student.id}:${activity.id}:${tanggal}`;
				const existing = projected.get(key);
				if (existing && !existing.autoAlfa) continue;
				projected.set(key, {
					id: -period.id,
					sekolahId: options.schoolId,
					semesterId: options.semesterId,
					kelasId: student.kelasId,
					muridId: student.id,
					kegiatanId: activity.id,
					tanggal,
					status: 'sakit',
					metode: 'manual',
					autoAlfa: false,
					waktuScan: null,
					catatan: illnessLabel(period, tanggal),
					petugasUserId: period.petugasUserId,
					createdAt: period.createdAt,
					updatedAt: period.updatedAt
				});
			}
		}
	return [...projected.values()];
}

export async function projectDailyIllness(options: {
	schoolId: number;
	semesterId: number;
	studentIds: number[];
	dates: string[];
	rows: Array<typeof tableAbsensiHarian.$inferSelect>;
}) {
	const projected = await projectIllnessAttendance({
		...options,
		activities: [{ id: 0, jamMulai: null }],
		rows: options.rows.map((row) => ({ ...row, kegiatanId: 0, autoAlfa: false }))
	});
	return projected.map(({ kegiatanId: _activity, autoAlfa: _auto, ...row }) => {
		void _activity;
		void _auto;
		return row;
	}) as Array<
		typeof tableAbsensiHarian.$inferSelect
	>;
}
