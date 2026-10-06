import db from '$lib/server/db';
import { ensureLongTermFoundationSchema } from '$lib/server/db/ensure-long-term-foundation';
import {
	tableAbsensiHarian,
	tableAsesmenSumatif,
	tableAuthUserMurid,
	tableDocumentApproval,
	tableKesehatanMurid,
	tableKelas,
	tableMurid,
	tablePengumuman
} from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

export async function load({ locals }) {
	authority('portal_wali_lihat', 'portal_wali_manage');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');
	await ensureLongTermFoundationSchema();
	const links = await db
		.select({
			muridId: tableMurid.id,
			nama: tableMurid.nama,
			nis: tableMurid.nis,
			kelas: tableKelas.nama,
			fase: tableKelas.fase,
			hubungan: tableAuthUserMurid.hubungan
		})
		.from(tableAuthUserMurid)
		.innerJoin(tableMurid, eq(tableAuthUserMurid.muridId, tableMurid.id))
		.innerJoin(tableKelas, eq(tableMurid.kelasId, tableKelas.id))
		.where(
			and(eq(tableAuthUserMurid.authUserId, locals.user.id), eq(tableMurid.sekolahId, sekolahId))
		);
	const ids = links.map((item) => item.muridId);
	const [growthRows, attendance, grades, publishedReports, announcements] = await Promise.all([
		ids.length
			? db
					.select({
						muridId: tableKesehatanMurid.muridId,
						tanggal: tableKesehatanMurid.tanggalPengukuran,
						tinggiBadan: tableKesehatanMurid.tinggiBadan,
						beratBadan: tableKesehatanMurid.beratBadan,
						statusGizi: tableKesehatanMurid.statusGizi
					})
					.from(tableKesehatanMurid)
					.where(
						and(
							eq(tableKesehatanMurid.sekolahId, sekolahId),
							inArray(tableKesehatanMurid.muridId, ids)
						)
					)
					.orderBy(desc(tableKesehatanMurid.tanggalPengukuran))
			: [],
		ids.length
			? db
					.select({
						muridId: tableAbsensiHarian.muridId,
						status: tableAbsensiHarian.status,
						total: sql<number>`count(*)`
					})
					.from(tableAbsensiHarian)
					.where(inArray(tableAbsensiHarian.muridId, ids))
					.groupBy(tableAbsensiHarian.muridId, tableAbsensiHarian.status)
			: [],
		ids.length
			? db
					.select({
						muridId: tableAsesmenSumatif.muridId,
						rataRata: sql<number>`round(avg(coalesce(${tableAsesmenSumatif.nilaiAkhir}, ${tableAsesmenSumatif.nilaiAkhirRts})), 1)`,
						jumlah: sql<number>`count(*)`
					})
					.from(tableAsesmenSumatif)
					.where(inArray(tableAsesmenSumatif.muridId, ids))
					.groupBy(tableAsesmenSumatif.muridId)
			: [],
		ids.length
			? db
					.select({
						entityId: tableDocumentApproval.entityId,
						title: tableDocumentApproval.titleSnapshot,
						publishedAt: tableDocumentApproval.publishedAt
					})
					.from(tableDocumentApproval)
					.where(
						and(
							eq(tableDocumentApproval.sekolahId, sekolahId),
							eq(tableDocumentApproval.status, 'diterbitkan'),
							sql`lower(${tableDocumentApproval.titleSnapshot}) like '%rapor%'`,
							inArray(tableDocumentApproval.entityId, ids.map(String))
						)
					)
					.orderBy(desc(tableDocumentApproval.publishedAt))
			: [],
		db
			.select({
				id: tablePengumuman.id,
				judul: tablePengumuman.judul,
				isi: tablePengumuman.isi,
				prioritas: tablePengumuman.prioritas,
				tanggalMulai: tablePengumuman.tanggalMulai
			})
			.from(tablePengumuman)
			.where(
				and(
					eq(tablePengumuman.sekolahId, sekolahId),
					eq(tablePengumuman.aktif, true),
					eq(tablePengumuman.audiens, 'semua'),
					sql`${tablePengumuman.tanggalMulai} <= date('now')`,
					sql`(${tablePengumuman.tanggalSelesai} is null or ${tablePengumuman.tanggalSelesai} >= date('now'))`
				)
			)
			.orderBy(desc(tablePengumuman.prioritas), desc(tablePengumuman.tanggalMulai))
			.limit(10)
	]);
	return {
		meta: { title: 'Portal Wali Murid' } satisfies PageMeta,
		children: links.map((child) => ({
			...child,
			attendance: attendance
				.filter((item) => item.muridId === child.muridId)
				.map((item) => ({ status: item.status, total: Number(item.total) })),
			grade: grades.find((item) => item.muridId === child.muridId) ?? null,
			growth: growthRows.find((item) => item.muridId === child.muridId) ?? null,
			reports: publishedReports.filter((item) => Number(item.entityId) === child.muridId)
		})),
		announcements,
		canManage:
			locals.user.type === 'admin' ||
			locals.user.permissions?.includes('portal_wali_manage') === true
	};
}
