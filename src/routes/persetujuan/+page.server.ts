import { writeAuditLog } from '$lib/server/audit-log';
import { DOCUMENT_TYPES } from '$lib/server/document-approval';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureDocumentManagementSchema } from '$lib/server/db/ensure-document-management';
import {
	tableDinasLuarPermohonan,
	tableDocumentApproval,
	tableSppd,
	tableSppdPegawai,
	tableSuratArsip
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

const STATUSES = ['draft', 'diajukan', 'diperiksa', 'disetujui', 'ditolak', 'diterbitkan'] as const;
const PAGE_SIZE = 20;
const allowed = (locals: App.Locals, permission: UserPermission) =>
	locals.user?.type === 'admin' || locals.user?.permissions?.includes(permission) === true;
const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const positiveId = (value: FormDataEntryValue | null) => {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
};

async function owned(sekolahId: number, id: number) {
	return db.query.tableDocumentApproval.findFirst({
		where: and(eq(tableDocumentApproval.sekolahId, sekolahId), eq(tableDocumentApproval.id, id))
	});
}

async function applySourceDecision(
	sekolahId: number,
	approval: typeof tableDocumentApproval.$inferSelect,
	target: (typeof STATUSES)[number],
	userId: number,
	now: string,
	note: string | null
) {
	const sourceId = Number(approval.entityId);
	if (!Number.isInteger(sourceId) || sourceId <= 0 || !['disetujui', 'ditolak'].includes(target))
		return;
	if (approval.documentType === 'surat_masuk' || approval.documentType === 'surat_keluar') {
		await db
			.update(tableSuratArsip)
			.set({
				status: target as 'disetujui' | 'ditolak',
				disetujuiOlehId: userId,
				tanggalPersetujuan: now,
				catatanPersetujuan: note,
				snapshotJson:
					target === 'disetujui'
						? JSON.stringify({
								title: approval.titleSnapshot,
								version: approval.version,
								approvedAt: now
							})
						: null,
				updatedAt: now
			})
			.where(and(eq(tableSuratArsip.id, sourceId), eq(tableSuratArsip.sekolahId, sekolahId)));
	}
	if (approval.documentType === 'dinas_luar') {
		const source = await db.query.tableDinasLuarPermohonan.findFirst({
			with: { pegawai: { columns: { nama: true } } },
			where: and(
				eq(tableDinasLuarPermohonan.id, sourceId),
				eq(tableDinasLuarPermohonan.sekolahId, sekolahId)
			)
		});
		if (!source) return;
		let sppdId = source.sppdId;
		if (target === 'disetujui' && !sppdId) {
			const academic = await resolveSekolahAcademicContext(sekolahId);
			const [sppd] = await db
				.insert(tableSppd)
				.values({
					sekolahId,
					pegawaiId: source.pegawaiId,
					tahunAjaranId: academic.activeTahunAjaranId,
					semesterId: academic.activeSemesterId,
					maksud: source.maksud,
					tempatTujuan: source.tempatTujuan,
					tanggalBerangkat: source.tanggalBerangkat,
					tanggalKembali: source.tanggalKembali,
					undanganFile: source.undanganFile,
					status: 'draft'
				})
				.returning({ id: tableSppd.id });
			sppdId = sppd.id;
			await db
				.insert(tableSppdPegawai)
				.values({ sppdId, pegawaiId: source.pegawaiId, nama: source.pegawai.nama, urutan: 0 });
		}
		await db
			.update(tableDinasLuarPermohonan)
			.set({ status: target as 'disetujui' | 'ditolak', sppdId, updatedAt: now })
			.where(
				and(
					eq(tableDinasLuarPermohonan.id, sourceId),
					eq(tableDinasLuarPermohonan.sekolahId, sekolahId)
				)
			);
	}
}

export async function load({ locals, url }) {
	authority('persetujuan_lihat');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureDocumentManagementSchema();
	const q = url.searchParams.get('q')?.trim() ?? '';
	const statusValue = url.searchParams.get('status') ?? '';
	const status = STATUSES.includes(statusValue as (typeof STATUSES)[number])
		? (statusValue as (typeof STATUSES)[number])
		: '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const where = and(
		eq(tableDocumentApproval.sekolahId, sekolahId),
		status ? eq(tableDocumentApproval.status, status) : undefined,
		q
			? or(
					like(tableDocumentApproval.titleSnapshot, `%${q}%`),
					like(tableDocumentApproval.documentType, `%${q}%`)
				)
			: undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableDocumentApproval)
		.where(where);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);
	const rows = await db
		.select()
		.from(tableDocumentApproval)
		.where(where)
		.orderBy(desc(tableDocumentApproval.updatedAt), desc(tableDocumentApproval.id))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);
	return {
		meta: { title: 'Pusat Persetujuan' } satisfies PageMeta,
		rows,
		documentTypes: DOCUMENT_TYPES,
		capabilities: {
			submit: allowed(locals, 'persetujuan_ajukan'),
			review: allowed(locals, 'persetujuan_periksa'),
			approve: allowed(locals, 'persetujuan_setujui'),
			publish: allowed(locals, 'persetujuan_terbitkan')
		},
		filters: { q, status },
		page: { currentPage: page, totalPages, totalItems }
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		if (!allowed(locals, 'persetujuan_ajukan'))
			return fail(403, { fail: 'Tidak memiliki izin mengajukan dokumen.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const data = await request.formData();
		const documentType = text(data, 'documentType');
		const title = text(data, 'title');
		if (!DOCUMENT_TYPES.includes(documentType as (typeof DOCUMENT_TYPES)[number]) || !title)
			return fail(400, { fail: 'Jenis dan judul dokumen wajib diisi.' });
		const [created] = await db
			.insert(tableDocumentApproval)
			.values({
				sekolahId,
				documentType,
				entityId: text(data, 'entityId') || null,
				titleSnapshot: title,
				status: 'draft',
				submittedById: locals.user.id,
				note: text(data, 'note') || null
			})
			.returning();
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'document_approval',
			entityId: String(created.id),
			summary: `Draft persetujuan ${title} dibuat.`,
			after: created
		});
		return { message: 'Draft persetujuan berhasil dibuat.' };
	},
	transition: async ({ request, locals }) => {
		authority('persetujuan_lihat');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const data = await request.formData();
		const id = positiveId(data.get('id'));
		const target = text(data, 'target') as (typeof STATUSES)[number];
		if (!id || !STATUSES.includes(target))
			return fail(400, { fail: 'Perubahan status tidak valid.' });
		const before = await owned(sekolahId, id);
		if (!before) return fail(404, { fail: 'Dokumen tidak ditemukan.' });
		const rules: Record<string, { from: string[]; permission: UserPermission }> = {
			diajukan: { from: ['draft', 'ditolak'], permission: 'persetujuan_ajukan' },
			diperiksa: { from: ['diajukan'], permission: 'persetujuan_periksa' },
			disetujui: { from: ['diajukan', 'diperiksa'], permission: 'persetujuan_setujui' },
			ditolak: { from: ['diajukan', 'diperiksa'], permission: 'persetujuan_setujui' },
			diterbitkan: { from: ['disetujui'], permission: 'persetujuan_terbitkan' }
		};
		const rule = rules[target];
		if (!rule || !rule.from.includes(before.status) || !allowed(locals, rule.permission))
			return fail(409, { fail: 'Transisi status tidak diizinkan.' });
		const now = new Date().toISOString();
		const changes: Record<string, unknown> = {
			status: target,
			note: text(data, 'note') || before.note,
			updatedAt: now
		};
		if (target === 'diajukan')
			Object.assign(changes, { submittedById: locals.user.id, submittedAt: now });
		if (target === 'diperiksa')
			Object.assign(changes, { reviewedById: locals.user.id, reviewedAt: now });
		if (target === 'disetujui')
			Object.assign(changes, {
				approvedById: locals.user.id,
				approvedAt: now,
				snapshotJson: JSON.stringify({
					documentType: before.documentType,
					entityId: before.entityId,
					title: before.titleSnapshot,
					version: before.version,
					approvedAt: now
				})
			});
		if (target === 'diterbitkan') Object.assign(changes, { publishedAt: now });
		await applySourceDecision(
			sekolahId,
			before,
			target,
			locals.user.id,
			now,
			(changes.note as string | null) ?? null
		);
		await db.update(tableDocumentApproval).set(changes).where(eq(tableDocumentApproval.id, id));
		await writeAuditLog({
			locals,
			request,
			action: 'status_change',
			entityType: 'document_approval',
			entityId: String(id),
			summary: `${before.titleSnapshot} diubah menjadi ${target}.`,
			before,
			after: changes
		});
		return { message: `Status dokumen berhasil diubah menjadi ${target}.` };
	},
	revise: async ({ request, locals }) => {
		if (!allowed(locals, 'persetujuan_ajukan'))
			return fail(403, { fail: 'Tidak memiliki izin membuat revisi.' });
		const sekolahId = locals.sekolah?.id;
		const id = positiveId((await request.formData()).get('id'));
		if (!sekolahId || !id || !locals.user) return fail(400, { fail: 'Dokumen tidak valid.' });
		const before = await owned(sekolahId, id);
		if (!before || !['disetujui', 'diterbitkan', 'ditolak'].includes(before.status))
			return fail(409, { fail: 'Dokumen belum dapat direvisi.' });
		const [created] = await db
			.insert(tableDocumentApproval)
			.values({
				sekolahId,
				documentType: before.documentType,
				entityId: before.entityId,
				titleSnapshot: before.titleSnapshot,
				version: before.version + 1,
				status: 'draft',
				submittedById: locals.user.id,
				parentApprovalId: before.id,
				note: 'Revisi dari versi sebelumnya.'
			})
			.returning();
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'document_approval',
			entityId: String(created.id),
			summary: `Revisi v${created.version} dibuat tanpa mengubah versi lama.`,
			before,
			after: created
		});
		return { message: `Revisi versi ${created.version} berhasil dibuat.` };
	}
};
