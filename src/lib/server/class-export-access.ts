import db from './db';
import { tableAuthUserKelas, tableKelas, tableMurid, tablePegawai } from './db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { canLegacyWaliKelasAccess } from './legacy-wali-kelas';
import { hasClassExportAccess } from '../export-access';
import { resolveSekolahAcademicContext } from './db/academic';
import { guardianStudentCondition } from './assignment-summary';

export async function canAccessExportClass(user: App.Locals['user'], sekolahId: number, kelasId: number) {
	if (!user || !Number.isSafeInteger(kelasId) || kelasId <= 0) return false;
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, sekolahId: true, nama: true, semesterId: true, tahunAjaranId: true },
		where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!kelas) return false;
	let assigned = false;
	if (user.type === 'wali_kelas') {
		assigned = await canLegacyWaliKelasAccess(user, sekolahId, kelasId);
	} else if ((user.type === 'wali_asuh' || user.type === 'wali_asrama') && user.pegawaiId) {
		const pegawai = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: and(eq(tablePegawai.id, user.pegawaiId), eq(tablePegawai.sekolahId, sekolahId))
		});
		if (pegawai?.nama.trim()) {
			const column = user.type === 'wali_asrama' ? tableMurid.waliAsramaNama : tableMurid.waliAsuhNama;
			assigned = Boolean(await db.query.tableMurid.findFirst({
				columns: { id: true },
				where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId),
					sql`LOWER(trim(${column})) = ${pegawai.nama.trim().toLowerCase()}`,
					await guardianStudentCondition(user, sekolahId))
			}));
		}
	} else if (user.type === 'user') {
		const records = await db.query.tableAuthUserKelas.findMany({
			columns: { kelasId: true }, where: eq(tableAuthUserKelas.authUserId, user.id)
		});
		const ids = [...new Set([...records.map(row => row.kelasId), ...(user.kelasId ? [user.kelasId] : [])])];
		const assignments = ids.length ? await db.query.tableKelas.findMany({
			columns: { id: true, nama: true, semesterId: true, tahunAjaranId: true },
			where: and(inArray(tableKelas.id, ids), eq(tableKelas.sekolahId, sekolahId))
		}) : [];
		assigned = assignments.some(row => row.id === kelasId);
		// Match the existing semester fallback, but never carry assignments into a new year.
		if (!assigned && assignments.length) {
			const context = await resolveSekolahAcademicContext(sekolahId);
			assigned = Boolean(context?.activeSemesterId && kelas.semesterId === context.activeSemesterId &&
				!assignments.some(row => row.semesterId === context.activeSemesterId) &&
				assignments.some(row => row.nama === kelas.nama && row.tahunAjaranId === kelas.tahunAjaranId));
		}
	}
	return hasClassExportAccess({ user, sekolahId, classSchoolId: kelas.sekolahId, assigned });
}
