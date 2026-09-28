import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import {
	tableKelas,
	tableMurid,
	tableMuridLifecycle,
	tableMuridRiwayatKelas,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import {
	muridLifecycleStatuses,
	syncMuridGovernance,
	type MuridLifecycleStatus
} from '$lib/server/murid-lifecycle';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const PER_PAGE = 20;

function requireAccess(locals: App.Locals) {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.type !== 'admin' && !locals.user.permissions?.includes('murid_arsip')) {
		throw redirect(303, '/forbidden?required=murid_arsip');
	}
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/sekolah');
	return sekolahId;
}

function parseIds(form: FormData, key = 'lifecycleIds') {
	return [...new Set(form.getAll(key).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function loadLifecycleRows(sekolahId: number, lifecycleIds: number[]) {
	if (!lifecycleIds.length) return [];
	return db
		.select({
			id: tableMuridLifecycle.id,
			identityKey: tableMuridLifecycle.identityKey,
			status: tableMuridLifecycle.status,
			nama: tableMuridLifecycle.namaSnapshot,
			nis: tableMuridLifecycle.nis,
			nisn: tableMuridLifecycle.nisn,
			lastMuridId: tableMuridLifecycle.lastMuridId,
			tanggalStatus: tableMuridLifecycle.tanggalStatus,
			alasan: tableMuridLifecycle.alasan
		})
		.from(tableMuridLifecycle)
		.where(and(eq(tableMuridLifecycle.sekolahId, sekolahId), inArray(tableMuridLifecycle.id, lifecycleIds)));
}

async function loadTargetClass(sekolahId: number, targetClassId: number) {
	return db
		.select({
			id: tableKelas.id,
			nama: tableKelas.nama,
			fase: tableKelas.fase,
			semesterId: tableKelas.semesterId,
			tahunAjaranId: tableKelas.tahunAjaranId,
			semesterNama: tableSemester.nama,
			tahunAjaranNama: tableTahunAjaran.nama
		})
		.from(tableKelas)
		.innerJoin(tableSemester, eq(tableKelas.semesterId, tableSemester.id))
		.innerJoin(tableTahunAjaran, eq(tableKelas.tahunAjaranId, tableTahunAjaran.id))
		.where(and(eq(tableKelas.id, targetClassId), eq(tableKelas.sekolahId, sekolahId)))
		.then((rows) => rows[0] ?? null);
}

async function validatePromotion(sekolahId: number, lifecycleIds: number[], targetClassId: number) {
	const [lifecycles, targetClass] = await Promise.all([
		loadLifecycleRows(sekolahId, lifecycleIds),
		loadTargetClass(sekolahId, targetClassId)
	]);
	if (!targetClass) return { error: 'Kelas tujuan tidak ditemukan.' } as const;
	if (lifecycles.length !== lifecycleIds.length || lifecycles.some((row) => !row.lastMuridId)) {
		return { error: 'Sebagian data murid tidak ditemukan atau tidak lagi memiliki data sumber.' } as const;
	}
	const sourceIds = lifecycles.map((row) => row.lastMuridId as number);
	const sourceRows = await db.query.tableMurid.findMany({
		where: and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, sourceIds))
	});
	if (sourceRows.length !== sourceIds.length) return { error: 'Data sumber murid tidak lengkap.' } as const;
	if (sourceRows.some((row) => row.semesterId === targetClass.semesterId)) {
		return { error: 'Kenaikan kelas harus menuju kelas pada semester yang berbeda agar riwayat lama tetap utuh.' } as const;
	}
	const existing = await db.query.tableMurid.findMany({
		columns: { nis: true, nama: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, targetClass.semesterId),
			inArray(tableMurid.nis, sourceRows.map((row) => row.nis))
		)
	});
	if (existing.length) {
		return { error: `${existing.length} murid sudah tersedia pada semester tujuan: ${existing.map((row) => row.nama).join(', ')}.` } as const;
	}
	return { lifecycles, sourceRows, targetClass } as const;
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:murid-arsip');
	await ensureDataGovernanceSchema();
	const sekolahId = requireAccess(locals);
	const q = url.searchParams.get('q')?.trim() ?? '';
	const requestedStatus = url.searchParams.get('status')?.trim() ?? '';
	const status = muridLifecycleStatuses.includes(requestedStatus as MuridLifecycleStatus)
		? (requestedStatus as MuridLifecycleStatus)
		: '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const pattern = `%${q}%`;
	const filter = and(
		eq(tableMuridLifecycle.sekolahId, sekolahId),
		status ? eq(tableMuridLifecycle.status, status) : undefined,
		q
			? or(
					sql`${tableMuridLifecycle.namaSnapshot} LIKE ${pattern} COLLATE NOCASE`,
					sql`${tableMuridLifecycle.nis} LIKE ${pattern} COLLATE NOCASE`,
					sql`${tableMuridLifecycle.nisn} LIKE ${pattern} COLLATE NOCASE`
				)
			: undefined
	);
	const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(tableMuridLifecycle).where(filter);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
	const currentPage = Math.min(requestedPage, totalPages);
	const rows = await db
		.select({
			id: tableMuridLifecycle.id,
			identityKey: tableMuridLifecycle.identityKey,
			nama: tableMuridLifecycle.namaSnapshot,
			nis: tableMuridLifecycle.nis,
			nisn: tableMuridLifecycle.nisn,
			status: tableMuridLifecycle.status,
			tanggalStatus: tableMuridLifecycle.tanggalStatus,
			alasan: tableMuridLifecycle.alasan,
			lastMuridId: tableMuridLifecycle.lastMuridId,
			kelas: tableKelas.nama,
			fase: tableKelas.fase,
			semester: tableSemester.nama,
			tahunAjaran: tableTahunAjaran.nama
		})
		.from(tableMuridLifecycle)
		.leftJoin(tableMurid, eq(tableMuridLifecycle.lastMuridId, tableMurid.id))
		.leftJoin(tableKelas, eq(tableMurid.kelasId, tableKelas.id))
		.leftJoin(tableSemester, eq(tableMurid.semesterId, tableSemester.id))
		.leftJoin(tableTahunAjaran, eq(tableKelas.tahunAjaranId, tableTahunAjaran.id))
		.where(filter)
		.orderBy(asc(tableMuridLifecycle.namaSnapshot))
		.limit(PER_PAGE)
		.offset((currentPage - 1) * PER_PAGE);
	const identityKeys = rows.map((row) => row.identityKey);
	const historyRows = identityKeys.length
		? await db
				.select()
				.from(tableMuridRiwayatKelas)
				.where(and(eq(tableMuridRiwayatKelas.sekolahId, sekolahId), inArray(tableMuridRiwayatKelas.identityKey, identityKeys)))
				.orderBy(desc(tableMuridRiwayatKelas.recordedAt))
		: [];
	const historyByIdentity = new Map<string, typeof historyRows>();
	for (const history of historyRows) {
		const list = historyByIdentity.get(history.identityKey) ?? [];
		list.push(history);
		historyByIdentity.set(history.identityKey, list);
	}
	const targetClasses = await db
		.select({
			id: tableKelas.id,
			nama: tableKelas.nama,
			fase: tableKelas.fase,
			semester: tableSemester.nama,
			tahunAjaran: tableTahunAjaran.nama
		})
		.from(tableKelas)
		.innerJoin(tableSemester, eq(tableKelas.semesterId, tableSemester.id))
		.innerJoin(tableTahunAjaran, eq(tableKelas.tahunAjaranId, tableTahunAjaran.id))
		.where(eq(tableKelas.sekolahId, sekolahId))
		.orderBy(desc(tableTahunAjaran.nama), asc(tableSemester.nama), asc(tableKelas.nama));
	return {
		meta: { title: 'Arsip Murid & Alumni' },
		rows: rows.map((row) => ({ ...row, history: historyByIdentity.get(row.identityKey) ?? [] })),
		targetClasses,
		statuses: muridLifecycleStatuses,
		filters: { q, status },
		page: { currentPage, totalPages, totalItems, perPage: PER_PAGE }
	};
};

export const actions: Actions = {
	updateStatus: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		const form = await request.formData();
		const lifecycleIds = parseIds(form);
		const status = String(form.get('status') ?? '') as MuridLifecycleStatus;
		const tanggalStatus = String(form.get('tanggalStatus') ?? '').trim();
		const alasan = String(form.get('alasan') ?? '').trim();
		if (!lifecycleIds.length) return fail(400, { fail: 'Pilih minimal satu murid.' });
		if (!muridLifecycleStatuses.includes(status)) return fail(400, { fail: 'Status murid tidak valid.' });
		if (status !== 'aktif' && !tanggalStatus) return fail(400, { fail: 'Tanggal status wajib diisi.' });
		const before = await loadLifecycleRows(sekolahId, lifecycleIds);
		if (before.length !== lifecycleIds.length) return fail(404, { fail: 'Sebagian murid tidak ditemukan.' });
		await db
			.update(tableMuridLifecycle)
			.set({
				status,
				tanggalStatus: status === 'aktif' ? null : tanggalStatus,
				alasan: status === 'aktif' ? null : alasan || null,
				updatedAt: new Date().toISOString()
			})
			.where(and(eq(tableMuridLifecycle.sekolahId, sekolahId), inArray(tableMuridLifecycle.id, lifecycleIds)));
		await writeAuditLog({
			locals,
			request,
			action: status === 'aktif' ? 'restore' : 'archive',
			entityType: 'murid_lifecycle',
			entityId: lifecycleIds.join(','),
			summary: `${before.length} murid diubah menjadi ${status}.`,
			before,
			after: { status, tanggalStatus: status === 'aktif' ? null : tanggalStatus, alasan }
		});
		return { message: `${before.length} murid berhasil diperbarui menjadi ${status}.` };
	},
	previewPromotion: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		const form = await request.formData();
		const lifecycleIds = parseIds(form);
		const targetClassId = Number(form.get('targetClassId'));
		if (!lifecycleIds.length || !Number.isInteger(targetClassId)) return fail(400, { fail: 'Pilih murid dan kelas tujuan.' });
		const validation = await validatePromotion(sekolahId, lifecycleIds, targetClassId);
		if ('error' in validation) return fail(400, { fail: validation.error });
		return {
			preview: {
				lifecycleIds,
				targetClassId,
				targetLabel: `${validation.targetClass.nama} - ${validation.targetClass.semesterNama} (${validation.targetClass.tahunAjaranNama})`,
				students: validation.lifecycles.map((row) => ({ nama: row.nama, nis: row.nis }))
			}
		};
	},
	promote: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		const form = await request.formData();
		const lifecycleIds = parseIds(form);
		const targetClassId = Number(form.get('targetClassId'));
		if (form.get('confirmed') !== 'true') return fail(400, { fail: 'Pratinjau dan konfirmasi diperlukan.' });
		const validation = await validatePromotion(sekolahId, lifecycleIds, targetClassId);
		if ('error' in validation) return fail(400, { fail: validation.error });
		const insertedIds: number[] = [];
		const now = new Date().toISOString();
		await db.transaction(async (tx) => {
			for (const murid of validation.sourceRows) {
				const [inserted] = await tx
					.insert(tableMurid)
					.values({
						nis: murid.nis,
						nisn: murid.nisn,
						sekolahId,
						semesterId: validation.targetClass.semesterId,
						kelasId: validation.targetClass.id,
						nama: murid.nama,
						tempatLahir: murid.tempatLahir,
						tanggalLahir: murid.tanggalLahir,
						jenisKelamin: murid.jenisKelamin,
						agama: murid.agama,
						pendidikanSebelumnya: murid.pendidikanSebelumnya,
						tanggalMasuk: murid.tanggalMasuk,
						alamatId: murid.alamatId,
						ibuId: murid.ibuId,
						ayahId: murid.ayahId,
						waliId: murid.waliId,
						foto: murid.foto,
						waliAsramaNama: murid.waliAsramaNama,
						waliAsramaNip: murid.waliAsramaNip,
						waliAsuhNama: murid.waliAsuhNama,
						waliAsuhNip: murid.waliAsuhNip,
						qrToken: null,
						dapodikPesertaDidikId: murid.dapodikPesertaDidikId,
						dapodikAnggotaRombelId: null,
						nik: murid.nik,
						anakKe: murid.anakKe,
						updatedAt: now
					})
					.returning({ id: tableMurid.id });
				if (inserted) insertedIds.push(inserted.id);
			}
		});
		await syncMuridGovernance(sekolahId, insertedIds, 'aktif');
		await writeAuditLog({
			locals,
			request,
			action: 'promote',
			entityType: 'murid',
			entityId: insertedIds.join(','),
			summary: `${insertedIds.length} murid dinaikkan/dipindahkan ke ${validation.targetClass.nama}.`,
			before: validation.lifecycles,
			after: { targetClass: validation.targetClass, insertedIds }
		});
		return { message: `${insertedIds.length} murid berhasil diproses ke kelas tujuan.` };
	}
};
