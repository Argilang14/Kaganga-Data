import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import {
	deleteAttachment,
	detectAttachment,
	MAX_ATTACHMENT_BYTES,
	saveAttachment
} from '$lib/server/document-attachments';
import { ensureDocumentManagementSchema } from '$lib/server/db/ensure-document-management';
import {
	tableDocumentAttachment,
	tableInventaris,
	tableMurid,
	tablePegawai,
	tableSuratArsip
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

const ENTITY_TYPES = ['murid', 'pegawai', 'surat', 'sekolah', 'inventaris'] as const;
const PAGE_SIZE = 20;

function canManage(locals: App.Locals) {
	return (
		locals.user?.type === 'admin' || locals.user?.permissions?.includes('berkas_manage') === true
	);
}
function canDelete(locals: App.Locals) {
	return (
		locals.user?.type === 'admin' || locals.user?.permissions?.includes('berkas_delete') === true
	);
}

async function resolveEntity(sekolahId: number, type: string, id: string) {
	const numericId = Number(id);
	if (type === 'sekolah' && numericId === sekolahId) return { id, label: 'Dokumen Sekolah' };
	if (!Number.isInteger(numericId) || numericId <= 0) return null;
	if (type === 'murid') {
		const row = await db.query.tableMurid.findFirst({
			columns: { id: true, nama: true, nis: true },
			where: and(eq(tableMurid.id, numericId), eq(tableMurid.sekolahId, sekolahId))
		});
		return row ? { id, label: `${row.nama} (${row.nis})` } : null;
	}
	if (type === 'pegawai') {
		const row = await db.query.tablePegawai.findFirst({
			columns: { id: true, nama: true, nip: true },
			where: and(eq(tablePegawai.id, numericId), eq(tablePegawai.sekolahId, sekolahId))
		});
		return row ? { id, label: `${row.nama} (${row.nip || '-'})` } : null;
	}
	if (type === 'surat') {
		const row = await db.query.tableSuratArsip.findFirst({
			columns: { id: true, nomorSurat: true, perihal: true },
			where: and(eq(tableSuratArsip.id, numericId), eq(tableSuratArsip.sekolahId, sekolahId))
		});
		return row ? { id, label: `${row.nomorSurat || 'Tanpa nomor'} - ${row.perihal}` } : null;
	}
	if (type === 'inventaris') {
		const row = await db.query.tableInventaris.findFirst({
			columns: { id: true, kode: true, nama: true },
			where: and(eq(tableInventaris.id, numericId), eq(tableInventaris.sekolahId, sekolahId))
		});
		return row ? { id, label: `${row.kode} - ${row.nama}` } : null;
	}
	return null;
}

export async function load({ locals, url }) {
	authority('berkas_lihat', 'berkas_manage');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureDocumentManagementSchema();
	const q = url.searchParams.get('q')?.trim() ?? '';
	const typeValue = url.searchParams.get('type') ?? '';
	const type = ENTITY_TYPES.includes(typeValue as (typeof ENTITY_TYPES)[number]) ? typeValue : '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const search = `%${q}%`;
	const where = and(
		eq(tableDocumentAttachment.sekolahId, sekolahId),
		type ? eq(tableDocumentAttachment.entityType, type) : undefined,
		q
			? or(
					like(tableDocumentAttachment.originalName, search),
					like(tableDocumentAttachment.entityLabelSnapshot, search),
					like(tableDocumentAttachment.category, search)
				)
			: undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableDocumentAttachment)
		.where(where);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);
	const rows = await db
		.select()
		.from(tableDocumentAttachment)
		.where(where)
		.orderBy(desc(tableDocumentAttachment.createdAt), desc(tableDocumentAttachment.id))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);
	return {
		meta: { title: 'Manajemen Berkas' } satisfies PageMeta,
		rows,
		canManage: canManage(locals),
		canDelete: canDelete(locals),
		maxSizeMb: MAX_ATTACHMENT_BYTES / 1024 / 1024,
		filters: { q, type },
		page: { currentPage: page, totalPages, totalItems }
	};
}

export const actions = {
	upload: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengunggah berkas.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		await ensureDocumentManagementSchema();
		const formData = await request.formData();
		const entityType = String(formData.get('entityType') ?? '');
		const entityId = String(formData.get('entityId') ?? '');
		const category = String(formData.get('category') ?? '').trim();
		const expiresAt = String(formData.get('expiresAt') ?? '').trim() || null;
		const upload = formData.get('file');
		if (
			!ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number]) ||
			!category ||
			!(upload instanceof File) ||
			upload.size <= 0
		)
			return fail(400, { fail: 'Entitas, kategori, dan berkas wajib diisi.' });
		if (upload.size > MAX_ATTACHMENT_BYTES)
			return fail(413, {
				fail: `Ukuran berkas melebihi ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`
			});
		const entity = await resolveEntity(sekolahId, entityType, entityId);
		if (!entity)
			return fail(404, { fail: 'Data pemilik berkas tidak ditemukan pada sekolah aktif.' });
		const buffer = Buffer.from(await upload.arrayBuffer());
		const detected = detectAttachment(buffer, upload.type, upload.name);
		if (!detected)
			return fail(400, {
				fail: 'Berkas harus berupa PDF, JPG, PNG, WebP, DOCX, atau XLSX yang valid.'
			});
		const stored = await saveAttachment(sekolahId, buffer, detected.extension);
		try {
			const [created] = await db
				.insert(tableDocumentAttachment)
				.values({
					sekolahId,
					entityType,
					entityId: entity.id,
					entityLabelSnapshot: entity.label,
					category,
					originalName: upload.name.slice(0, 200),
					storedPath: stored.relativePath,
					mimeType: detected.mime,
					sizeBytes: buffer.length,
					sha256: stored.sha256,
					expiresAt,
					uploadedById: locals.user.id
				})
				.returning();
			await writeAuditLog({
				locals,
				request,
				action: 'create',
				entityType: 'document_attachment',
				entityId: String(created.id),
				summary: `Berkas ${category} diunggah untuk ${entity.label}.`,
				after: { ...created, storedPath: '[protected]' }
			});
		} catch (error) {
			await deleteAttachment(stored.relativePath);
			throw error;
		}
		return { message: 'Berkas berhasil diunggah.' };
	},
	delete: async ({ request, locals }) => {
		if (!canDelete(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus berkas.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number((await request.formData()).get('id'));
		if (!sekolahId || !Number.isInteger(id)) return fail(400, { fail: 'Berkas tidak valid.' });
		const row = await db.query.tableDocumentAttachment.findFirst({
			where: and(
				eq(tableDocumentAttachment.id, id),
				eq(tableDocumentAttachment.sekolahId, sekolahId)
			)
		});
		if (!row) return fail(404, { fail: 'Berkas tidak ditemukan.' });
		await db
			.delete(tableDocumentAttachment)
			.where(
				and(eq(tableDocumentAttachment.id, id), eq(tableDocumentAttachment.sekolahId, sekolahId))
			);
		await deleteAttachment(row.storedPath);
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'document_attachment',
			entityId: String(id),
			summary: `Berkas ${row.category} dihapus dari ${row.entityLabelSnapshot}.`,
			before: { ...row, storedPath: '[protected]' }
		});
		return { message: 'Berkas berhasil dihapus.' };
	}
};
