import db from '$lib/server/db/index.js';
import { tableMurid } from '$lib/server/db/schema.js';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { buildKelasContext } from '$lib/server/route-utils';
import { writeAuditLog } from '$lib/server/audit-log';
import { syncMuridGovernance } from '$lib/server/murid-lifecycle';

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
		sql`NOT EXISTS (
			SELECT 1 FROM murid_lifecycle ml
			WHERE ml.sekolah_id = ${tableMurid.sekolahId}
			AND ml.identity_key = CASE
				WHEN trim(coalesce(${tableMurid.nisn}, '')) <> '' THEN 'nisn:' || lower(trim(${tableMurid.nisn}))
				ELSE 'nis:' || lower(trim(${tableMurid.nis}))
			END
			AND ml.status <> 'aktif'
		)`,
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
	async deleteSelected({ request, locals }) {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		const formData = await request.formData();
		const rawIds = formData.getAll('muridIds');
		const muridIds = rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);

		if (!muridIds.length) {
			return fail(400, { fail: 'Pilih minimal satu murid untuk dihapus' });
		}

		const deletedMurid = await db.query.tableMurid.findMany({
			where: and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, muridIds))
		});
		await syncMuridGovernance(sekolahId, deletedMurid.map((murid) => murid.id), 'keluar', {
			tanggalStatus: new Date().toISOString().slice(0, 10),
			alasan: 'Data murid dihapus dari daftar aktif.'
		});

		await db
			.delete(tableMurid)
			.where(and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, muridIds)));

		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'murid',
			entityId: muridIds.join(','),
			summary: `${deletedMurid.length} data murid dihapus dari daftar aktif.`,
			before: deletedMurid
		});

		return { message: `${deletedMurid.length} murid berhasil dihapus dan jejak identitasnya disimpan di arsip` };
	}
};
