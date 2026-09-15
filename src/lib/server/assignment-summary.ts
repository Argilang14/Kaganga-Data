import db from './db';
import { tableAuthUserKelas, tableKelas, tableMurid, tablePegawai } from './db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

type SummaryUser = { id: number; type: string; pegawaiId?: number | null; kelasId?: number | null };

export async function getAssignmentSummaries(users: SummaryUser[], sekolahId: number, semesterId: number | null, tahunAjaranId: number | null) {
	const result = new Map<number, string>();
	for (const user of users) result.set(user.id, 'Belum ada penugasan');
	if (!users.length || !semesterId || !tahunAjaranId) return result;
	const classes = await db.query.tableKelas.findMany({
		columns: { id: true, nama: true, waliKelasId: true },
		where: and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, semesterId), eq(tableKelas.tahunAjaranId, tahunAjaranId))
	});
	if (!classes.length) return result;
	const rows = await db.select({ kelasId: tableMurid.kelasId,
		asuh: sql<string>`lower(trim(coalesce(${tableMurid.waliAsuhNama}, '')))`,
		asrama: sql<string>`lower(trim(coalesce(${tableMurid.waliAsramaNama}, '')))`,
		count: sql<number>`count(distinct ${tableMurid.id})` }).from(tableMurid)
		.where(and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, semesterId), inArray(tableMurid.kelasId, classes.map(row => row.id))))
		.groupBy(tableMurid.kelasId, sql`lower(trim(coalesce(${tableMurid.waliAsuhNama}, '')))`, sql`lower(trim(coalesce(${tableMurid.waliAsramaNama}, '')))`);
	const employees = await db.query.tablePegawai.findMany({ columns: { id: true, nama: true }, where: eq(tablePegawai.sekolahId, sekolahId) });
	const names = new Map(employees.map(row => [row.id, row.nama.trim().toLowerCase()]));
	const nameCounts = new Map<string, number>();
	for (const name of names.values()) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
	const assignments = await db.query.tableAuthUserKelas.findMany({ columns: { authUserId: true, kelasId: true }, where: inArray(tableAuthUserKelas.authUserId, users.map(row => row.id)) });
	for (const user of users) {
		if (user.type === 'admin') { result.set(user.id, 'Administrator'); continue; }
		if (user.type === 'wali_asuh' || user.type === 'wali_asrama') {
			const name = user.pegawaiId ? names.get(user.pegawaiId) : null;
			if (!name) continue;
			if ((nameCounts.get(name) ?? 0) > 1) { result.set(user.id, 'Nama wali sama; periksa penugasan'); continue; }
			const count = rows.filter(row => (user.type === 'wali_asuh' ? row.asuh : row.asrama) === name).reduce((sum, row) => sum + Number(row.count), 0);
			result.set(user.id, `${count} murid ${user.type === 'wali_asuh' ? 'diasuh' : 'dibina'}`);
		} else {
			const ids = new Set(assignments.filter(row => row.authUserId === user.id).map(row => row.kelasId));
			const ownClasses = classes.filter(row => user.pegawaiId ? row.waliKelasId === user.pegawaiId : user.type === 'wali_kelas' && row.id === user.kelasId);
			if (user.type === 'wali_kelas') { ids.clear(); for (const row of ownClasses) ids.add(row.id); }
			const selected = classes.filter(row => ids.has(row.id));
			if (!selected.length) continue;
			const count = rows.filter(row => ids.has(row.kelasId)).reduce((sum, row) => sum + Number(row.count), 0);
			const ownLabel = user.type === 'user' && ownClasses.length ? `; wali kelas ${ownClasses.map(row => row.nama).join(', ')}` : '';
			result.set(user.id, `${selected.map(row => row.nama).join(', ')} - ${count} murid${ownLabel}`);
		}
	}
	return result;
}

export async function guardianStudentCondition(user: App.Locals['user'] | null, sekolahId: number) {
	if (!user || !['wali_asuh', 'wali_asrama'].includes(user.type)) return undefined;
	if (!user.pegawaiId) return sql`0`;
	const employees = await db.query.tablePegawai.findMany({ columns: { id: true, nama: true }, where: eq(tablePegawai.sekolahId, sekolahId) });
	const name = employees.find(row => row.id === user.pegawaiId)?.nama.trim().toLowerCase();
	if (!name || employees.filter(row => row.nama.trim().toLowerCase() === name).length !== 1) return sql`0`;
	const column = user.type === 'wali_asrama' ? tableMurid.waliAsramaNama : tableMurid.waliAsuhNama;
	return sql`lower(trim(${column})) = ${name}`;
}
