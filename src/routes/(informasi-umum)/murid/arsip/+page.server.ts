import { writeAuditLog } from '$lib/server/audit-log';
import db, { databaseUrl } from '$lib/server/db';
import path from 'node:path';
import { createConsistentDatabaseBackup } from '$lib/server/db/database-safety';
import { deleteMuridPermanently, loadMuridPurgePlan } from '$lib/server/murid-purge';
import { getClassEducationIdentity } from '$lib/server/education-units';
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
import {
	linkMuridIdentity,
	assertMuridNotArchived,
	assertMuridIdentityConsistent,
	getMuridIdentityMembers
} from '$lib/server/murid-identity-service';
import {
	identityIntegrityProblem,
	MuridIdentityConflictError
} from '$lib/server/murid-identity-integrity';
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
	return [
		...new Set(
			form
				.getAll(key)
				.map(Number)
				.filter((id) => Number.isInteger(id) && id > 0)
		)
	];
}

async function loadLifecycleRows(sekolahId: number, lifecycleIds: number[]) {
	if (!lifecycleIds.length) return [];
	return db
		.select({
			id: tableMuridLifecycle.id,
			identityKey: tableMuridLifecycle.identityKey,
			status: tableMuridLifecycle.status,
			needsIdentityReview: tableMuridLifecycle.needsIdentityReview,
			nama: tableMuridLifecycle.namaSnapshot,
			nis: tableMuridLifecycle.nis,
			nisn: tableMuridLifecycle.nisn,
			lastMuridId: tableMuridLifecycle.lastMuridId,
			tanggalStatus: tableMuridLifecycle.tanggalStatus,
			alasan: tableMuridLifecycle.alasan
		})
		.from(tableMuridLifecycle)
		.where(
			and(
				eq(tableMuridLifecycle.sekolahId, sekolahId),
				inArray(tableMuridLifecycle.id, lifecycleIds)
			)
		);
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
	if (
		lifecycles.some(
			(row) =>
				row.status !== 'aktif' || row.needsIdentityReview || !row.identityKey.startsWith('uid:')
		)
	)
		return {
			error: 'Hanya murid aktif dengan identitas yang sudah diperiksa dapat diproses.'
		} as const;
	if (lifecycles.length !== lifecycleIds.length || lifecycles.some((row) => !row.lastMuridId)) {
		return {
			error: 'Sebagian data murid tidak ditemukan atau tidak lagi memiliki data sumber.'
		} as const;
	}
	const sourceIds = lifecycles.map((row) => row.lastMuridId as number);
	const sourceRows = await db.query.tableMurid.findMany({
		where: and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, sourceIds))
	});
	if (sourceRows.length !== sourceIds.length)
		return { error: 'Data sumber murid tidak lengkap.' } as const;
	if (sourceRows.some((row) => row.semesterId === targetClass.semesterId)) {
		return {
			error:
				'Penempatan kelas hanya tersedia untuk semester berbeda. Pindah kelas dalam semester yang sama belum tersedia.'
		} as const;
	}
	const existing = await db.query.tableMurid.findMany({
		columns: { nis: true, nama: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, targetClass.semesterId),
			inArray(
				tableMurid.nis,
				sourceRows.map((row) => row.nis)
			)
		)
	});
	if (existing.length) {
		return {
			error: `${existing.length} murid sudah tersedia pada semester tujuan: ${existing.map((row) => row.nama).join(', ')}.`
		} as const;
	}
	try {
		const identity = await getClassEducationIdentity(sekolahId, targetClass.id);
		return {
			lifecycles,
			sourceRows,
			targetClass: { ...targetClass, satuanPendidikan: identity }
		} as const;
	} catch (cause) {
		return {
			error: cause instanceof Error ? cause.message : 'Satuan kelas tujuan belum dipetakan.'
		} as const;
	}
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
		sql`(${tableMuridLifecycle.identityKey} LIKE 'uid:%' OR ${tableMuridLifecycle.status} <> 'aktif')`,
		url.searchParams.get('perlu_periksa') === '1'
			? eq(tableMuridLifecycle.needsIdentityReview, 1)
			: undefined,
		status ? eq(tableMuridLifecycle.status, status) : undefined,
		q
			? or(
					sql`${tableMuridLifecycle.namaSnapshot} LIKE ${pattern} COLLATE NOCASE`,
					sql`${tableMuridLifecycle.nis} LIKE ${pattern} COLLATE NOCASE`,
					sql`${tableMuridLifecycle.nisn} LIKE ${pattern} COLLATE NOCASE`
				)
			: undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableMuridLifecycle)
		.where(filter);
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
			needsIdentityReview: tableMuridLifecycle.needsIdentityReview,
			tanggalStatus: tableMuridLifecycle.tanggalStatus,
			alasan: tableMuridLifecycle.alasan,
			lastMuridId: tableMuridLifecycle.lastMuridId,
			semesterId: tableMurid.semesterId,
			updatedAt: tableMuridLifecycle.updatedAt,
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
				.where(
					and(
						eq(tableMuridRiwayatKelas.sekolahId, sekolahId),
						inArray(tableMuridRiwayatKelas.identityKey, identityKeys)
					)
				)
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
			semesterId: tableKelas.semesterId,
			semester: tableSemester.nama,
			tahunAjaran: tableTahunAjaran.nama
		})
		.from(tableKelas)
		.innerJoin(tableSemester, eq(tableKelas.semesterId, tableSemester.id))
		.innerJoin(tableTahunAjaran, eq(tableKelas.tahunAjaranId, tableTahunAjaran.id))
		.where(eq(tableKelas.sekolahId, sekolahId))
		.orderBy(desc(tableTahunAjaran.nama), asc(tableSemester.nama), asc(tableKelas.nama));
	const identityEvidence = new Map<
		number,
		{
			sources: Awaited<ReturnType<typeof getMuridIdentityMembers>>;
			legacy: {
				id: number;
				nama: string;
				nis: string;
				nisn: string | null;
				status: string;
				alasan: string | null;
			}[];
			problem: string | null;
		}
	>();
	if (locals.user?.type === 'admin') {
		for (const row of rows.filter(
			(item) => item.needsIdentityReview && item.identityKey.startsWith('uid:')
		)) {
			const uid = row.identityKey.slice(4);
			const sources = await getMuridIdentityMembers(db, sekolahId, uid);
			const review = await db.$client.execute({
				sql: 'SELECT evidence FROM murid_identity_review WHERE sekolah_id=? AND identity_uid=?',
				args: [sekolahId, uid]
			});
			let legacyIds: number[] = [];
			try {
				const evidence = JSON.parse(String(review.rows[0]?.evidence ?? '{}'));
				if (Array.isArray(evidence.legacyIds))
					legacyIds = evidence.legacyIds.filter(
						(id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0
					);
			} catch {
				/* Invalid historical evidence is not permission to recover. */
			}
			const legacy = legacyIds.length
				? await db
						.select({
							id: tableMuridLifecycle.id,
							nama: tableMuridLifecycle.namaSnapshot,
							nis: tableMuridLifecycle.nis,
							nisn: tableMuridLifecycle.nisn,
							status: tableMuridLifecycle.status,
							alasan: tableMuridLifecycle.alasan
						})
						.from(tableMuridLifecycle)
						.where(
							and(
								eq(tableMuridLifecycle.sekolahId, sekolahId),
								inArray(tableMuridLifecycle.id, legacyIds)
							)
						)
				: [];
			identityEvidence.set(row.id, {
				sources,
				legacy,
				problem: row.lastMuridId
					? identityIntegrityProblem(sources, sekolahId, row.lastMuridId)
					: 'Data sumber tidak tersedia.'
			});
		}
	}
	return {
		meta: { title: 'Arsip Murid & Alumni' },
		rows: rows.map((row) => ({
			...row,
			history: historyByIdentity.get(row.identityKey) ?? [],
			identityEvidence: identityEvidence.get(row.id) ?? null
		})),
		canReviewIdentity: locals.user?.type === 'admin',
		targetClasses,
		statuses: muridLifecycleStatuses,
		filters: { q, status, perluPeriksa: url.searchParams.get('perlu_periksa') === '1' },
		page: { currentPage, totalPages, totalItems, perPage: PER_PAGE }
	};
};

export const actions: Actions = {
	previewPurge: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		if (locals.user?.type !== 'admin')
			return fail(403, { fail: 'Hapus permanen hanya untuk admin.' });
		const ids = parseIds(await request.formData());
		if (ids.length !== 1) return fail(400, { fail: 'Pilih tepat satu arsip murid.' });
		try {
			const purgePreview = await db.transaction((tx) => loadMuridPurgePlan(tx, sekolahId, ids[0]));
			return { purgePreview };
		} catch (cause) {
			if (cause instanceof MuridIdentityConflictError) return fail(409, { fail: cause.message });
			throw cause;
		}
	},
	purge: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		if (locals.user?.type !== 'admin')
			return fail(403, { fail: 'Hapus permanen hanya untuk admin.' });
		const form = await request.formData();
		const ids = parseIds(form);
		const reason = String(form.get('alasan') ?? '').trim();
		if (ids.length !== 1 || form.get('purgeAck') !== 'true' || !reason || reason.length > 500)
			return fail(400, { fail: 'Pratinjau, alasan dan konfirmasi penghapusan wajib diisi.' });
		if (!databaseUrl.startsWith('file:'))
			return fail(409, { fail: 'Backup wajib; penghapusan hanya tersedia untuk SQLite lokal.' });
		try {
			const before = await db.transaction((tx) => loadMuridPurgePlan(tx, sekolahId, ids[0]));
			if (before.blockers.length) return fail(409, { fail: before.blockers.join(' ') });
			if (form.get('fingerprint') !== before.fingerprint || form.get('confirmName') !== before.nama)
				return fail(409, {
					fail: 'Ketik nama persis seperti pratinjau. Jika data berubah, buat pratinjau baru.'
				});
			let backupPath: string;
			try {
				backupPath = await createConsistentDatabaseBackup({
					client: db.$client,
					databasePath: path.resolve(databaseUrl.slice(5)),
					label: `pre-purge-murid-${before.lifecycleId}`
				});
			} catch {
				return fail(500, { fail: 'Backup database gagal; tidak ada data murid yang dihapus.' });
			}
			await db.transaction(async (tx) => {
				const current = await loadMuridPurgePlan(tx, sekolahId, ids[0]);
				if (current.fingerprint !== before.fingerprint)
					throw new MuridIdentityConflictError(
						'Data berubah saat backup. Buat pratinjau baru; tidak ada penghapusan.'
					);
				await deleteMuridPermanently(tx, sekolahId, current);
				await writeAuditLog(
					{
						locals,
						request,
						action: 'delete',
						entityType: 'murid_permanent',
						entityId: current.lifecycleId,
						summary: `Hapus permanen ${current.nama} (${current.ids.length} data periode).`,
						before: current,
						after: {
							alasan: reason,
							backupFile: path.basename(backupPath),
							photoFilesRetained: true
						}
					},
					tx
				);
			});
			return {
				message: `Arsip ${before.nama} dihapus permanen. Backup database berhasil dibuat.`,
				backupFile: path.basename(backupPath),
				purgedLifecycleId: before.lifecycleId
			};
		} catch (cause) {
			if (cause instanceof MuridIdentityConflictError) return fail(409, { fail: cause.message });
			throw cause;
		}
	},
	updateStatus: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		const form = await request.formData();
		const lifecycleIds = parseIds(form);
		const status = String(form.get('status') ?? '') as MuridLifecycleStatus;
		const tanggalStatus = String(form.get('tanggalStatus') ?? '').trim();
		const alasan = String(form.get('alasan') ?? '').trim();
		if (!lifecycleIds.length) return fail(400, { fail: 'Pilih minimal satu murid.' });
		if (!muridLifecycleStatuses.includes(status))
			return fail(400, { fail: 'Status murid tidak valid.' });
		if (status !== 'aktif' && !tanggalStatus)
			return fail(400, { fail: 'Tanggal status wajib diisi.' });
		const before = await loadLifecycleRows(sekolahId, lifecycleIds);
		if (before.length !== lifecycleIds.length)
			return fail(404, { fail: 'Sebagian murid tidak ditemukan.' });
		if (before.some((row) => !row.identityKey.startsWith('uid:') || !row.lastMuridId))
			return fail(400, {
				fail: 'Snapshot arsip lama tanpa data sumber tidak dapat diaktifkan ulang melalui perubahan status.'
			});
		if (before.some((row) => row.needsIdentityReview))
			return fail(400, {
				fail: 'Identitas ambigu harus diperiksa admin satu per satu melalui Periksa Identitas.'
			});
		try {
			await db.transaction(async (tx) => {
				const current = await tx
					.select()
					.from(tableMuridLifecycle)
					.where(
						and(
							eq(tableMuridLifecycle.sekolahId, sekolahId),
							inArray(tableMuridLifecycle.id, lifecycleIds)
						)
					);
				if (current.length !== lifecycleIds.length)
					throw new MuridIdentityConflictError('Data arsip berubah. Muat ulang halaman.');
				for (const row of current) {
					if (row.needsIdentityReview || !row.identityKey.startsWith('uid:') || !row.lastMuridId)
						throw new MuridIdentityConflictError(
							'Data memerlukan pemeriksaan identitas sebelum perubahan status.'
						);
					await assertMuridIdentityConsistent(
						tx,
						sekolahId,
						row.identityKey.slice(4),
						row.lastMuridId
					);
				}
				await tx
					.update(tableMuridLifecycle)
					.set({
						status,
						needsIdentityReview: 0,
						tanggalStatus: status === 'aktif' ? null : tanggalStatus,
						alasan: alasan || null,
						updatedAt: new Date().toISOString()
					})
					.where(
						and(
							eq(tableMuridLifecycle.sekolahId, sekolahId),
							inArray(tableMuridLifecycle.id, lifecycleIds)
						)
					);
				await writeAuditLog(
					{
						locals,
						request,
						action: status === 'aktif' ? 'restore' : 'archive',
						entityType: 'murid_lifecycle',
						entityId: lifecycleIds.join(','),
						summary: `${before.length} murid diubah menjadi ${status}.`,
						before,
						after: {
							status,
							tanggalStatus: status === 'aktif' ? null : tanggalStatus,
							alasan,
							identityReviewed: false
						}
					},
					tx
				);
			});
		} catch (cause) {
			if (cause instanceof MuridIdentityConflictError) return fail(409, { fail: cause.message });
			throw cause;
		}
		const statusLabel = {
			aktif: 'Aktif',
			pindah: 'Pindah Sekolah',
			keluar: 'Keluar Sekolah',
			alumni: 'Alumni / Lulus'
		}[status];
		return { message: `${before.length} murid berhasil diperbarui menjadi ${statusLabel}.` };
	},
	resolveIdentity: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		if (locals.user?.type !== 'admin')
			return fail(403, { fail: 'Pemeriksaan identitas hanya untuk admin.' });
		const form = await request.formData();
		const ids = parseIds(form);
		const status = String(form.get('status') ?? '');
		const alasan = String(form.get('alasan') ?? '').trim();
		const tanggalStatus = String(form.get('tanggalStatus') ?? '').trim();
		if (
			ids.length !== 1 ||
			!['aktif', 'keluar', 'pindah', 'alumni'].includes(status) ||
			!alasan ||
			alasan.length > 500 ||
			form.get('identityReviewed') !== 'true'
		)
			return fail(400, {
				fail: 'Periksa satu murid, isi alasan, pilih status, dan konfirmasi pemeriksaan.'
			});
		if (status !== 'aktif' && !/^\d{4}-\d{2}-\d{2}$/.test(tanggalStatus))
			return fail(400, { fail: 'Tanggal status wajib diisi.' });
		try {
			await db.transaction(async (tx) => {
				const row = await tx.query.tableMuridLifecycle.findFirst({
					where: and(
						eq(tableMuridLifecycle.sekolahId, sekolahId),
						eq(tableMuridLifecycle.id, ids[0])
					)
				});
				if (
					!row?.needsIdentityReview ||
					!row.identityKey.startsWith('uid:') ||
					!row.lastMuridId ||
					row.identityKey !== form.get('identityKey') ||
					row.updatedAt !== form.get('expectedUpdatedAt')
				)
					throw new MuridIdentityConflictError(
						'Data pemeriksaan berubah atau tidak memiliki sumber. Muat ulang halaman.'
					);
				const sources = await assertMuridIdentityConsistent(
					tx,
					sekolahId,
					row.identityKey.slice(4),
					row.lastMuridId
				);
				await tx
					.update(tableMuridLifecycle)
					.set({
						status: status as MuridLifecycleStatus,
						needsIdentityReview: 0,
						tanggalStatus: status === 'aktif' ? null : tanggalStatus,
						alasan,
						updatedAt: new Date().toISOString()
					})
					.where(eq(tableMuridLifecycle.id, row.id));
				await tx.run(
					sql`UPDATE murid_identity_review SET resolved_at=${new Date().toISOString()} WHERE sekolah_id=${sekolahId} AND identity_uid=${row.identityKey.slice(4)}`
				);
				await writeAuditLog(
					{
						locals,
						request,
						action: 'status_change',
						entityType: 'murid_lifecycle',
						entityId: row.id,
						summary: `Pemeriksaan identitas ${row.namaSnapshot}: ${status}.`,
						before: row,
						after: {
							status,
							alasan,
							tanggalStatus: status === 'aktif' ? null : tanggalStatus,
							muridIds: sources.map((source) => source.id)
						}
					},
					tx
				);
			});
		} catch (cause) {
			if (cause instanceof MuridIdentityConflictError) return fail(409, { fail: cause.message });
			throw cause;
		}
		return {
			message:
				status === 'aktif'
					? 'Identitas diperiksa; murid dipulihkan ke daftar aktif.'
					: 'Identitas diperiksa; murid tetap diarsipkan.'
		};
	},
	previewPromotion: async ({ request, locals }) => {
		await ensureDataGovernanceSchema();
		const sekolahId = requireAccess(locals);
		const form = await request.formData();
		const lifecycleIds = parseIds(form);
		const targetClassId = Number(form.get('targetClassId'));
		if (!lifecycleIds.length || !Number.isInteger(targetClassId))
			return fail(400, { fail: 'Pilih murid dan kelas tujuan.' });
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
		if (form.get('confirmed') !== 'true')
			return fail(400, { fail: 'Pratinjau dan konfirmasi diperlukan.' });
		const validation = await validatePromotion(sekolahId, lifecycleIds, targetClassId);
		if ('error' in validation) return fail(400, { fail: validation.error });
		const insertedIds: number[] = [];
		const now = new Date().toISOString();
		await db.transaction(async (tx) => {
			for (const murid of validation.sourceRows) {
				const sourceUid = validation.lifecycles
					.find((row) => row.lastMuridId === murid.id)!
					.identityKey.slice(4);
				await assertMuridNotArchived(tx, sekolahId, sourceUid);
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
				if (inserted) {
					await linkMuridIdentity(
						tx,
						sekolahId,
						{ ...murid, id: inserted.id, semesterId: validation.targetClass.semesterId },
						sourceUid
					);
					insertedIds.push(inserted.id);
				}
			}
			await syncMuridGovernance(sekolahId, insertedIds, undefined, {}, tx);
			await writeAuditLog(
				{
					locals,
					request,
					action: 'promote',
					entityType: 'murid',
					entityId: insertedIds.join(','),
					summary: `${insertedIds.length} murid ditempatkan ke ${validation.targetClass.nama} pada ${validation.targetClass.semesterNama} (${validation.targetClass.tahunAjaranNama}).`,
					before: validation.lifecycles,
					after: { targetClass: validation.targetClass, insertedIds }
				},
				tx
			);
		});
		return { message: `${insertedIds.length} murid berhasil diproses ke kelas tujuan.` };
	}
};
