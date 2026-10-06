import db from '$lib/server/db/index.js';
import { tableMurid } from '$lib/server/db/schema.js';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { buildKelasContext } from '$lib/server/route-utils';
import { writeAuditLog } from '$lib/server/audit-log';
import { syncMuridGovernance } from '$lib/server/murid-lifecycle';
import { activeMuridFilter } from '$lib/server/murid-query';
import { canManageMurid } from '$lib/murid-permissions';
import { getKelasContextForUser } from '$lib/server/route-utils';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';

export async function load({ locals, url, depends, parent }) {
	depends('app:murid');
	const search = url.searchParams.get('q');
	const parentData = await parent();
	const { sekolahId, kelasId, kelasIds, academicContext } = await buildKelasContext(
		locals,
		parentData,
		url
	);
	const perPage = 20;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	if (!sekolahId || !kelasIds.length) {
		return {
			daftarMurid: [],
			identityReviewCount: 0,
			academicContext,
			page: {
				kelasId,
				search,
				currentPage: 1,
				totalPages: 1,
				totalItems: 0,
				perPage
			}
		};
	}

	const filter = and(
		eq(tableMurid.sekolahId, sekolahId),
		kelasId ? eq(tableMurid.kelasId, +kelasId) : inArray(tableMurid.kelasId, kelasIds),
		activeMuridFilter(),
		search ? sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE` : undefined,
		url.searchParams.get('belum_lengkap') === 'foto'
			? sql`trim(coalesce(${tableMurid.foto}, '')) = ''`
			: url.searchParams.get('belum_lengkap') === 'qr'
				? sql`not exists (select 1 from qr_murid q where q.murid_id = ${tableMurid.id} and q.revoked_at is null)`
				: undefined
	);

	const [{ totalItems }] = await db
		.select({ totalItems: sql<number>`count(*)` })
		.from(tableMurid)
		.where(filter);

	const total = totalItems ?? 0;
	const [review] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableMurid)
		.where(
			and(
				eq(tableMurid.sekolahId, sekolahId),
				kelasId ? eq(tableMurid.kelasId, +kelasId) : inArray(tableMurid.kelasId, kelasIds),
				sql`EXISTS (SELECT 1 FROM murid_identity_link mi JOIN murid_lifecycle ml ON ml.sekolah_id=mi.sekolah_id AND ml.identity_key='uid:' || mi.identity_uid WHERE mi.murid_id=${tableMurid.id} AND mi.sekolah_id=${sekolahId} AND ml.needs_identity_review=1)`
			)
		);
	const totalPages = Math.max(1, Math.ceil(total / perPage));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * perPage;

	const daftarMurid = await db.query.tableMurid.findMany({
		where: filter,
		orderBy: asc(tableMurid.nama),
		limit: perPage,
		offset
	});

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	return {
		daftarMurid,
		identityReviewCount: Number(review?.total ?? 0),
		academicContext,
		page: {
			kelasId,
			search,
			currentPage,
			totalPages,
			totalItems: total,
			perPage
		}
	};
}

export const actions = {
	async deleteSelected({ request, locals, url }) {
		if (!canManageMurid(locals.user))
			return fail(403, { fail: 'Tidak memiliki izin mengarsipkan murid.' });
		await ensureDataGovernanceSchema();
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		const formData = await request.formData();
		const rawIds = formData.getAll('muridIds');
		const muridIds = [
			...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
		];

		if (!muridIds.length) {
			return fail(400, { fail: 'Pilih minimal satu murid untuk dihapus' });
		}

		const deletedMurid = await db.query.tableMurid.findMany({
			where: and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, muridIds))
		});
		if (deletedMurid.length !== muridIds.length)
			return fail(404, { fail: 'Sebagian murid tidak ditemukan; tidak ada perubahan.' });
		for (const id of muridIds) {
			if (!(await getKelasContextForUser(locals, url, String(id))).hasAccess)
				return fail(403, { fail: 'Tidak memiliki akses ke kelas murid terpilih.' });
		}
		await db.transaction(async (tx) => {
			await syncMuridGovernance(
				sekolahId,
				deletedMurid.map((murid) => murid.id),
				'keluar',
				{
					tanggalStatus: new Date().toISOString().slice(0, 10),
					alasan: 'Data murid dihapus dari daftar aktif.'
				},
				tx
			);

			await writeAuditLog(
				{
					locals,
					request,
					action: 'archive',
					entityType: 'murid',
					entityId: muridIds.join(','),
					summary: `${deletedMurid.length} murid diarsipkan; data nilai, foto, dan presensi dipertahankan.`,
					before: deletedMurid
				},
				tx
			);
		});

		return {
			message: `${deletedMurid.length} murid diarsipkan. Data dapat dipulihkan melalui Arsip Murid & Alumni.`
		};
	}
};
