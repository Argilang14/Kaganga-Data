import { writeAuditLog } from '$lib/server/audit-log';
import { syncDocumentApproval } from '$lib/server/document-approval';
import db from '$lib/server/db';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import { tableSuratArsip } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

const DIRECTIONS = ['masuk', 'keluar'] as const;
const STATUSES = ['draft', 'diajukan', 'disetujui', 'ditolak', 'diarsipkan'] as const;
const PAGE_SIZE = 20;

function text(formData: FormData, key: string) {
	return String(formData.get(key) ?? '').trim();
}

function positiveId(value: FormDataEntryValue | null) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function canApprove(locals: App.Locals) {
	return (
		locals.user?.type === 'admin' ||
		locals.user?.permissions?.includes('surat_persetujuan') === true
	);
}

async function ownedLetter(sekolahId: number, id: number) {
	return db.query.tableSuratArsip.findFirst({
		where: and(eq(tableSuratArsip.id, id), eq(tableSuratArsip.sekolahId, sekolahId))
	});
}

export async function load({ locals, url }) {
	authority('surat_arsip');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureSuratMenyuratSchema();

	const q = url.searchParams.get('q')?.trim() ?? '';
	const directionValue = url.searchParams.get('arah') ?? '';
	const statusValue = url.searchParams.get('status') ?? '';
	const arah = DIRECTIONS.includes(directionValue as (typeof DIRECTIONS)[number])
		? (directionValue as (typeof DIRECTIONS)[number])
		: '';
	const status = STATUSES.includes(statusValue as (typeof STATUSES)[number])
		? (statusValue as (typeof STATUSES)[number])
		: '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const search = `%${q}%`;
	const where = and(
		eq(tableSuratArsip.sekolahId, sekolahId),
		arah ? eq(tableSuratArsip.arah, arah) : undefined,
		status ? eq(tableSuratArsip.status, status) : undefined,
		q
			? or(
					like(tableSuratArsip.nomorSurat, search),
					like(tableSuratArsip.pengirimPenerima, search),
					like(tableSuratArsip.perihal, search)
				)
			: undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableSuratArsip)
		.where(where);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);
	const rows = await db
		.select()
		.from(tableSuratArsip)
		.where(where)
		.orderBy(desc(tableSuratArsip.tanggalSurat), desc(tableSuratArsip.id))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);

	return {
		meta: { title: 'Surat Masuk & Keluar' } satisfies PageMeta,
		rows,
		canApprove: canApprove(locals),
		filters: { q, arah, status },
		page: { currentPage: page, totalPages, totalItems }
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		authority('surat_arsip');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		await ensureSuratMenyuratSchema();
		const formData = await request.formData();
		const arah = text(formData, 'arah') as (typeof DIRECTIONS)[number];
		const tanggalSurat = text(formData, 'tanggalSurat');
		const pengirimPenerima = text(formData, 'pengirimPenerima');
		const perihal = text(formData, 'perihal');
		if (!DIRECTIONS.includes(arah) || !tanggalSurat || !pengirimPenerima || !perihal) {
			return fail(400, { fail: 'Jenis, tanggal, pengirim/penerima, dan perihal wajib diisi.' });
		}
		const values = {
			sekolahId,
			arah,
			nomorSurat: text(formData, 'nomorSurat') || null,
			tanggalSurat,
			tanggalDiterima: arah === 'masuk' ? text(formData, 'tanggalDiterima') || null : null,
			pengirimPenerima,
			perihal,
			ringkasan: text(formData, 'ringkasan') || null,
			status: 'draft' as const,
			dibuatOlehId: locals.user.id
		};
		const [created] = await db.insert(tableSuratArsip).values(values).returning();
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: `surat_${arah}`,
			entityId: String(created.id),
			summary: `Draft surat ${arah} ditambahkan.`,
			after: created
		});
		return { message: 'Draft surat berhasil ditambahkan.' };
	},
	update: async ({ request, locals }) => {
		authority('surat_arsip');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = positiveId(formData.get('id'));
		if (!id) return fail(400, { fail: 'Surat tidak valid.' });
		const before = await ownedLetter(sekolahId, id);
		if (!before) return fail(404, { fail: 'Surat tidak ditemukan.' });
		if (!['draft', 'ditolak'].includes(before.status)) {
			return fail(409, { fail: 'Hanya draft atau surat yang ditolak yang dapat diedit.' });
		}
		const arah = text(formData, 'arah') as (typeof DIRECTIONS)[number];
		const tanggalSurat = text(formData, 'tanggalSurat');
		const pengirimPenerima = text(formData, 'pengirimPenerima');
		const perihal = text(formData, 'perihal');
		if (!DIRECTIONS.includes(arah) || !tanggalSurat || !pengirimPenerima || !perihal) {
			return fail(400, { fail: 'Data wajib surat belum lengkap.' });
		}
		const changes = {
			arah,
			nomorSurat: text(formData, 'nomorSurat') || null,
			tanggalSurat,
			tanggalDiterima: arah === 'masuk' ? text(formData, 'tanggalDiterima') || null : null,
			pengirimPenerima,
			perihal,
			ringkasan: text(formData, 'ringkasan') || null,
			status: 'draft' as const,
			catatanPersetujuan: null,
			updatedAt: new Date().toISOString()
		};
		await db.update(tableSuratArsip).set(changes).where(eq(tableSuratArsip.id, id));
		await writeAuditLog({ locals, request, action: 'update', entityType: `surat_${arah}`, entityId: String(id), summary: 'Draft surat diperbarui.', before, after: changes });
		return { message: 'Draft surat berhasil diperbarui.' };
	},
	submit: async ({ request, locals }) => {
		authority('surat_arsip');
		const sekolahId = locals.sekolah?.id;
		const id = positiveId((await request.formData()).get('id'));
		if (!sekolahId || !id) return fail(400, { fail: 'Surat tidak valid.' });
		const before = await ownedLetter(sekolahId, id);
		if (!before || !['draft', 'ditolak'].includes(before.status)) return fail(409, { fail: 'Surat tidak dapat diajukan.' });
		const after = { status: 'diajukan' as const, catatanPersetujuan: null, updatedAt: new Date().toISOString() };
		await db.update(tableSuratArsip).set(after).where(eq(tableSuratArsip.id, id));
		await syncDocumentApproval({ sekolahId, documentType: `surat_${before.arah}`, entityId: String(id), title: before.perihal, status: 'diajukan', userId: locals.user?.id });
		await writeAuditLog({ locals, request, action: 'status_change', entityType: `surat_${before.arah}`, entityId: String(id), summary: 'Surat diajukan untuk persetujuan.', before, after });
		return { message: 'Surat diajukan untuk persetujuan.' };
	},
	decide: async ({ request, locals }) => {
		if (!canApprove(locals)) return fail(403, { fail: 'Anda tidak memiliki izin persetujuan surat.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = positiveId(formData.get('id'));
		const decision = text(formData, 'decision');
		if (!id || !['disetujui', 'ditolak'].includes(decision)) return fail(400, { fail: 'Keputusan tidak valid.' });
		const before = await ownedLetter(sekolahId, id);
		if (!before || before.status !== 'diajukan') return fail(409, { fail: 'Surat tidak sedang menunggu persetujuan.' });
		const now = new Date().toISOString();
		const snapshot = decision === 'disetujui' ? JSON.stringify({ nomorSurat: before.nomorSurat, tanggalSurat: before.tanggalSurat, pengirimPenerima: before.pengirimPenerima, perihal: before.perihal, ringkasan: before.ringkasan, approvedAt: now }) : null;
		const after = {
			status: decision as 'disetujui' | 'ditolak',
			disetujuiOlehId: locals.user.id,
			tanggalPersetujuan: now,
			catatanPersetujuan: text(formData, 'catatan') || null,
			snapshotJson: snapshot,
			updatedAt: now
		};
		await db.update(tableSuratArsip).set(after).where(eq(tableSuratArsip.id, id));
		await syncDocumentApproval({ sekolahId, documentType: `surat_${before.arah}`, entityId: String(id), title: before.perihal, status: decision as 'disetujui' | 'ditolak', userId: locals.user.id, note: after.catatanPersetujuan, snapshot: decision === 'disetujui' ? JSON.parse(snapshot!) : undefined });
		await writeAuditLog({ locals, request, action: 'status_change', entityType: `surat_${before.arah}`, entityId: String(id), summary: `Surat ${decision}.`, before, after });
		return { message: `Surat berhasil ${decision}.` };
	},
	archive: async ({ request, locals }) => {
		authority('surat_arsip');
		const sekolahId = locals.sekolah?.id;
		const id = positiveId((await request.formData()).get('id'));
		if (!sekolahId || !id) return fail(400, { fail: 'Surat tidak valid.' });
		const before = await ownedLetter(sekolahId, id);
		if (!before || before.status !== 'disetujui') return fail(409, { fail: 'Hanya surat yang disetujui dapat diarsipkan.' });
		const after = { status: 'diarsipkan' as const, updatedAt: new Date().toISOString() };
		await db.update(tableSuratArsip).set(after).where(eq(tableSuratArsip.id, id));
		await writeAuditLog({ locals, request, action: 'archive', entityType: `surat_${before.arah}`, entityId: String(id), summary: 'Surat dimasukkan ke arsip final.', before, after });
		return { message: 'Surat berhasil diarsipkan.' };
	},
	delete: async ({ request, locals }) => {
		authority('surat_arsip');
		const sekolahId = locals.sekolah?.id;
		const id = positiveId((await request.formData()).get('id'));
		if (!sekolahId || !id) return fail(400, { fail: 'Surat tidak valid.' });
		const before = await ownedLetter(sekolahId, id);
		if (!before || !['draft', 'ditolak'].includes(before.status)) return fail(409, { fail: 'Hanya draft atau surat ditolak yang dapat dihapus.' });
		await db.delete(tableSuratArsip).where(eq(tableSuratArsip.id, id));
		await writeAuditLog({ locals, request, action: 'delete', entityType: `surat_${before.arah}`, entityId: String(id), summary: 'Draft surat dihapus.', before });
		return { message: 'Draft surat berhasil dihapus.' };
	}
};
