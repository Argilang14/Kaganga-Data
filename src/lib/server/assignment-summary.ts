import db from './db';
import { hasRole } from '$lib/user-role';
import {
	tableAuthUserKelas,
	tableKelas,
	tableMurid,
	tableAsramaPenugasan,
	tableAsramaKamar,
	tableAsrama
} from './db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { ensureDormitorySchema } from './db/ensure-dormitory';
import { activeMuridFilter } from './murid-query';
import { dormToday } from '$lib/dormitory';
import { dormGuardianCondition } from './dormitory-membership';

type SummaryUser = {
	id: number;
	type: string;
	roles?: readonly string[] | null;
	pegawaiId?: number | null;
	kelasId?: number | null;
};

export async function getAssignmentSummaries(
	users: SummaryUser[],
	sekolahId: number,
	semesterId: number | null,
	tahunAjaranId: number | null
) {
	const result = new Map<number, string>();
	for (const user of users) result.set(user.id, 'Belum ada penugasan');
	if (!users.length || !semesterId || !tahunAjaranId) return result;
	const classes = await db.query.tableKelas.findMany({
		columns: { id: true, nama: true, waliKelasId: true },
		where: and(
			eq(tableKelas.sekolahId, sekolahId),
			eq(tableKelas.semesterId, semesterId),
			eq(tableKelas.tahunAjaranId, tahunAjaranId)
		)
	});
	const rows = await db
		.select({
			kelasId: tableMurid.kelasId,
			asuh: sql<string>`lower(trim(coalesce(${tableMurid.waliAsuhNama}, '')))`,
			asrama: sql<string>`lower(trim(coalesce(${tableMurid.waliAsramaNama}, '')))`,
			count: sql<number>`count(distinct ${tableMurid.id})`
		})
		.from(tableMurid)
		.where(
			and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, semesterId),
				activeMuridFilter(),
				inArray(
					tableMurid.kelasId,
					classes.map((row) => row.id)
				)
			)
		)
		.groupBy(
			tableMurid.kelasId,
			sql`lower(trim(coalesce(${tableMurid.waliAsuhNama}, '')))`,
			sql`lower(trim(coalesce(${tableMurid.waliAsramaNama}, '')))`
		);
	const assignments = await db.query.tableAuthUserKelas.findMany({
		columns: { authUserId: true, kelasId: true },
		where: inArray(
			tableAuthUserKelas.authUserId,
			users.map((row) => row.id)
		)
	});
	for (const user of users) {
		if (user.type === 'admin') {
			result.set(user.id, 'Administrator');
			continue;
		}
		if (user.type === 'wali_asuh' || user.type === 'wali_asrama') {
			if (user.type === 'wali_asrama' && user.pegawaiId) {
				const [summary] = await db
					.select({ count: sql<number>`count(*)` })
					.from(tableMurid)
					.where(
						and(
							eq(tableMurid.sekolahId, sekolahId),
							eq(tableMurid.semesterId, semesterId),
							activeMuridFilter(),
							await guardianStudentCondition(
								{
									...user,
									type: 'wali_asrama',
									roles: ['wali_asrama'],
									pegawaiId: user.pegawaiId ?? null,
									username: '',
									permissions: [],
									jabatanAkses: null,
									sekolahId,
									kelasId: user.kelasId ?? null,
									mataPelajaranId: null,
									mustChangePassword: false
								},
								sekolahId
							)
						)
					);
				const rooms = await db
					.selectDistinct({ nama: tableAsramaKamar.nama, asrama: tableAsrama.nama })
					.from(tableAsramaPenugasan)
					.innerJoin(tableAsramaKamar, eq(tableAsramaKamar.id, tableAsramaPenugasan.kamarId))
					.innerJoin(tableAsrama, eq(tableAsrama.id, tableAsramaKamar.asramaId))
					.where(
						and(
							eq(tableAsramaPenugasan.sekolahId, sekolahId),
							eq(tableAsramaPenugasan.pegawaiId, user.pegawaiId),
							eq(tableAsramaKamar.aktif, 1),
							eq(tableAsrama.aktif, 1),
							eq(tableAsrama.semesterId, semesterId),
							sql`${tableAsramaPenugasan.mulai} <= ${dormToday()}`,
							sql`(${tableAsramaPenugasan.selesai} IS NULL OR ${tableAsramaPenugasan.selesai} > ${dormToday()})`
						)
					);
				result.set(
					user.id,
					`${rooms.map((row) => `${row.asrama} / ${row.nama}`).join(', ') || 'Belum ada asrama aktif'}; ${summary.count} murid aktif`
				);
				continue;
			}
			const [summary] = await db
				.select({ count: sql<number>`count(*)` })
				.from(tableMurid)
				.where(
					and(
						eq(tableMurid.sekolahId, sekolahId),
						eq(tableMurid.semesterId, semesterId),
						activeMuridFilter(),
						eq(tableMurid.waliAsuhPegawaiId, user.pegawaiId ?? -1)
					)
				);
			result.set(user.id, `${summary.count} murid diasuh`);
		} else {
			const ids = new Set(
				assignments.filter((row) => row.authUserId === user.id).map((row) => row.kelasId)
			);
			const ownClasses = classes.filter((row) =>
				user.pegawaiId
					? row.waliKelasId === user.pegawaiId
					: user.type === 'wali_kelas' && row.id === user.kelasId
			);
			if (user.type === 'wali_kelas') {
				ids.clear();
				for (const row of ownClasses) ids.add(row.id);
			}
			const selected = classes.filter((row) => ids.has(row.id));
			if (!selected.length) continue;
			const count = rows
				.filter((row) => row.kelasId !== null && ids.has(row.kelasId))
				.reduce((sum, row) => sum + Number(row.count), 0);
			const ownLabel =
				user.type === 'user' && ownClasses.length
					? `; wali kelas ${ownClasses.map((row) => row.nama).join(', ')}`
					: '';
			result.set(
				user.id,
				`${selected.map((row) => row.nama).join(', ')} - ${count} murid${ownLabel}`
			);
		}
	}
	return result;
}

export async function guardianStudentCondition(user: App.Locals['user'] | null, sekolahId: number) {
	if (!user || !hasRole(user, 'wali_asuh', 'wali_asrama')) return undefined;
	if (!user.pegawaiId) return sql`0`;
	const conditions = [];
	if (hasRole(user, 'wali_asrama')) {
		await ensureDormitorySchema();
		conditions.push(dormGuardianCondition(sekolahId, user.pegawaiId));
	}
	if (hasRole(user, 'wali_asuh'))
		conditions.push(sql`${tableMurid.waliAsuhPegawaiId} = ${user.pegawaiId} AND EXISTS (
  SELECT 1 FROM pegawai care WHERE care.id=${user.pegawaiId} AND care.sekolah_id=${sekolahId} AND care.status='aktif')`);
	return or(...conditions);
}
