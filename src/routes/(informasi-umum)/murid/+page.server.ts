import { personalQrExists } from '$lib/server/student-qr';
import db from '$lib/server/db/index.js';
import { tableMurid, tablePegawai } from '$lib/server/db/schema.js';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { buildKelasContext } from '$lib/server/route-utils';
import { activeMuridFilter } from '$lib/server/murid-query';
import { loadStudentRegistry, studentRegistryActions } from '$lib/server/student-registry';
import { passivateStudents } from '$lib/server/student-passive';
import type { ServerLoadEvent } from '@sveltejs/kit';

export async function load(event: ServerLoadEvent) {
	const { locals, url, depends, parent } = event;
	const registryData = await loadStudentRegistry(event, 'kelas');
	depends('app:murid');
	const search = url.searchParams.get('q');
	const parentData = await parent();
	if (locals.user?.type !== 'admin') {
		const allowed = new Set(registryData.registry.classes.map((item) => item.id));
		parentData.daftarKelas = (parentData.daftarKelas ?? []).filter((item: { id: number }) =>
			allowed.has(item.id)
		);
		if (url.searchParams.has('kelas_id') && !allowed.has(Number(url.searchParams.get('kelas_id'))))
			error(403, 'Kelas berada di luar penugasan Anda.');
	}
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
			...registryData,
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
				? sql`not ${personalQrExists(tableMurid.id, tableMurid.sekolahId)}`
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

	const daftarMurid = await db
		.select({
			...getTableColumns(tableMurid),
			waliAsuhDisplay: sql<
				string | null
			>`coalesce(nullif(trim(${tablePegawai.nama}), ''), nullif(trim(${tableMurid.waliAsuhNama}), ''))`
		})
		.from(tableMurid)
		.leftJoin(
			tablePegawai,
			and(
				eq(tablePegawai.id, tableMurid.waliAsuhPegawaiId),
				eq(tablePegawai.sekolahId, tableMurid.sekolahId)
			)
		)
		.where(filter)
		.orderBy(asc(tableMurid.nama))
		.limit(perPage)
		.offset(offset);

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
		...registryData,
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

export const actions = { ...studentRegistryActions, deleteSelected: passivateStudents };
