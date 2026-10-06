import db from '$lib/server/db';
import { ensureDocumentManagementSchema } from '$lib/server/db/ensure-document-management';
import { tableDocumentApproval } from '$lib/server/db/schema';
import { and, desc, eq, notInArray } from 'drizzle-orm';

export const DOCUMENT_TYPES = ['jadwal_pelajaran', 'kalender_pendidikan', 'sk_martikulasi', 'sttm', 'sppd', 'dinas_luar', 'surat_masuk', 'surat_keluar', 'lainnya'] as const;

export async function syncDocumentApproval(input: {
	sekolahId: number;
	documentType: string;
	entityId: string;
	title: string;
	status: 'diajukan' | 'disetujui' | 'ditolak' | 'diterbitkan';
	userId?: number | null;
	note?: string | null;
	snapshot?: unknown;
}) {
	await ensureDocumentManagementSchema();
	const existing = await db.query.tableDocumentApproval.findFirst({
		where: and(eq(tableDocumentApproval.sekolahId, input.sekolahId), eq(tableDocumentApproval.documentType, input.documentType), eq(tableDocumentApproval.entityId, input.entityId), notInArray(tableDocumentApproval.status, ['diterbitkan'])),
		orderBy: [desc(tableDocumentApproval.version), desc(tableDocumentApproval.id)]
	});
	const now = new Date().toISOString();
	const statusFields = input.status === 'diajukan'
		? { submittedById: input.userId ?? null, submittedAt: now }
		: input.status === 'disetujui'
			? { approvedById: input.userId ?? null, approvedAt: now, snapshotJson: JSON.stringify(input.snapshot ?? { title: input.title, approvedAt: now }) }
			: input.status === 'diterbitkan'
				? { publishedAt: now }
				: {};
	if (existing) {
		await db.update(tableDocumentApproval).set({ titleSnapshot: input.title, status: input.status, note: input.note ?? existing.note, updatedAt: now, ...statusFields }).where(eq(tableDocumentApproval.id, existing.id));
		return existing.id;
	}
	const [created] = await db.insert(tableDocumentApproval).values({ sekolahId: input.sekolahId, documentType: input.documentType, entityId: input.entityId, titleSnapshot: input.title, status: input.status, note: input.note ?? null, ...statusFields }).returning({ id: tableDocumentApproval.id });
	return created.id;
}
