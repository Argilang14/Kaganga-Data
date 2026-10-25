import { and, eq } from 'drizzle-orm';
import db from './db';
import { tableAuthUser, tablePegawai } from './db/schema';
import { userRoleLabels } from '$lib/user-role';

export async function attendanceStaffName(
	userId: number | null,
	sekolahId: number,
	client: Pick<typeof db, 'select'> = db
) {
	if (!userId) return null;
	const [staff] = await client
		.select({ username: tableAuthUser.username, type: tableAuthUser.type, nama: tablePegawai.nama })
		.from(tableAuthUser)
		.leftJoin(
			tablePegawai,
			and(eq(tablePegawai.id, tableAuthUser.pegawaiId), eq(tablePegawai.sekolahId, sekolahId))
		)
		.where(and(eq(tableAuthUser.id, userId), eq(tableAuthUser.sekolahId, sekolahId)))
		.limit(1);
	if (!staff) return null;
	const labels: Record<string, string> = {
		...userRoleLabels,
		admin: 'Admin',
		wali_kelas: 'Wali Kelas',
		wali_murid: 'Wali Murid'
	};
	return `${staff.nama?.trim() || staff.username} (${labels[staff.type] ?? staff.type})`;
}
