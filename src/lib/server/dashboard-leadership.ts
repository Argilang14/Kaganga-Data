import { error } from '@sveltejs/kit';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { canViewLeadershipDashboard } from '$lib/dashboard-leadership';
import { canAccessMenu } from '$lib/role-menu-access';
import db from './db';
import type { AcademicContext } from './db/academic';
import { accessibleClassIds, studentAccessCondition } from './student-access';
import { activeMuridFilter } from './murid-query';
import {
	tableMurid as m,
	tableAsesmenSumatif as academicScores,
	tableMataPelajaran as subjects,
	tableAsesmenKeasramaan as dormScores,
	tableKeasramaan as dormSubjects,
	tableDocumentApproval as approvals
} from './db/schema';

export function hasEnteredAcademicScore() {
	return or(
		...[
			academicScores.naLingkup,
			academicScores.stsTes,
			academicScores.stsNonTes,
			academicScores.sts,
			academicScores.sasTes,
			academicScores.sasNonTes,
			academicScores.sas,
			academicScores.nilaiAkhir,
			academicScores.nilaiAkhirRts
		].map((column) => isNotNull(column))
	);
}

export async function loadLeadershipOverview(
	locals: App.Locals,
	academic: AcademicContext,
	classIds: number[]
) {
	const { user, sekolah } = locals;
	if (!canViewLeadershipDashboard(user)) return null;
	if (!user || !sekolah || (user.type !== 'admin' && user.sekolahId !== sekolah.id))
		throw error(403, 'Sekolah di luar penugasan akun.');
	const allowed = new Set(await accessibleClassIds(user, sekolah.id, academic.activeSemesterId));
	if (classIds.some((id) => !allowed.has(id))) throw error(403, 'Kelas di luar penugasan akun.');
	const students =
		academic.activeSemesterId && classIds.length
			? await db.query.tableMurid.findMany({
					columns: { id: true },
					where: and(
						await studentAccessCondition(user, sekolah.id, academic.activeSemesterId),
						activeMuridFilter(),
						inArray(m.kelasId, classIds)
					)
				})
			: [];
	const ids = students.map((item) => item.id);
	const canDocuments = canAccessMenu(user, '/persetujuan');
	const [academicRows, dormitoryRows, pending] = await Promise.all([
		ids.length
			? db
					.selectDistinct({ muridId: academicScores.muridId })
					.from(academicScores)
					.innerJoin(subjects, eq(academicScores.mataPelajaranId, subjects.id))
					.where(
						and(
							inArray(academicScores.muridId, ids),
							inArray(subjects.kelasId, classIds),
							hasEnteredAcademicScore()
						)
					)
			: [],
		ids.length
			? db
					.selectDistinct({ muridId: dormScores.muridId })
					.from(dormScores)
					.innerJoin(dormSubjects, eq(dormScores.keasramaanId, dormSubjects.id))
					.where(and(inArray(dormScores.muridId, ids), inArray(dormSubjects.kelasId, classIds)))
			: [],
		canDocuments
			? db
					.select({ count: sql<number>`count(*)` })
					.from(approvals)
					.where(
						and(
							eq(approvals.sekolahId, sekolah.id),
							inArray(approvals.status, ['diajukan', 'diperiksa', 'disetujui'])
						)
					)
			: []
	]);
	return {
		total: students.length,
		academic: academicRows.length,
		dormitory: dormitoryRows.length,
		pendingDocuments: canDocuments ? Number(pending[0]?.count ?? 0) : null
	};
}
