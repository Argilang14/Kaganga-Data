import { error } from '@sveltejs/kit';
import { schoolWideAcademic, hasRole } from '$lib/user-role';
import { getLegacyWaliKelasIds } from './legacy-wali-kelas';
import { canAccessExportClass } from './class-export-access';
import { getAksesMapelUser } from './mapel-access';
import db from './db';
import { activeMuridSql } from './murid-query';
export async function assertAcademicAssessmentAccess(
	locals: App.Locals,
	studentId: number,
	classId: number | null,
	subjectId?: number
) {
	const { user, sekolah } = locals;
	if (
		!user ||
		!sekolah ||
		!classId ||
		(!schoolWideAcademic(user) && !hasRole(user, 'user')) ||
		!(await canAccessExportClass(user, sekolah.id, classId, {
			schoolWide: schoolWideAcademic(user),
			includeGuardians: false
		}))
	)
		error(403, 'Kelas berada di luar penugasan penilaian akademik.');
	if (
		!schoolWideAcademic(user) &&
		!(await getLegacyWaliKelasIds(user, sekolah.id)).includes(classId)
	) {
		if (!subjectId) error(403, 'Mata pelajaran penugasan wajib dipilih.');
		const access = await getAksesMapelUser(user, classId);
		const subject = await db.query.tableMataPelajaran.findFirst({
			where: (m, { and, eq }) => and(eq(m.id, subjectId), eq(m.kelasId, classId))
		});
		if (
			!subject ||
			(!access.ids.has(subject.id) && !access.names.has(subject.nama.trim().toLowerCase()))
		)
			error(403, 'Mata pelajaran berada di luar penugasan akun.');
	}
	const active = await db.$client.execute({
		sql: `SELECT m.id FROM murid m JOIN kelas k ON k.id=m.kelas_id JOIN semester s ON s.id=m.semester_id JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id WHERE m.id=? AND m.sekolah_id=? AND k.id=? AND k.semester_id=m.semester_id AND s.is_aktif=1 AND t.is_aktif=1 AND ${activeMuridSql('m')}`,
		args: [studentId, sekolah.id, classId]
	});
	if (!active.rows.length)
		error(409, 'Murid belum berada pada kelas dan periode aktif. Muat ulang halaman.');
}
