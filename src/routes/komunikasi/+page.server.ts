import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { ensureProductionOperationsSchema } from '$lib/server/db/ensure-production-operations';
import { tableCommunicationQueue, tableCommunicationTemplate } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

const CHANNELS = ['internal', 'email', 'whatsapp'] as const;
const AUDIENCES = [
	'semua',
	'guru',
	'wali_kelas',
	'wali_asuh',
	'wali_asrama',
	'wali_murid',
	'individu'
] as const;

function hasPermission(locals: App.Locals, permission: UserPermission) {
	return locals.user?.type === 'admin' || locals.user?.permissions?.includes(permission) === true;
}

export async function load({ locals }) {
	authority('komunikasi_lihat');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureProductionOperationsSchema();
	const [templates, queue] = await Promise.all([
		db
			.select()
			.from(tableCommunicationTemplate)
			.where(eq(tableCommunicationTemplate.sekolahId, sekolahId))
			.orderBy(tableCommunicationTemplate.name),
		db
			.select()
			.from(tableCommunicationQueue)
			.where(eq(tableCommunicationQueue.sekolahId, sekolahId))
			.orderBy(desc(tableCommunicationQueue.id))
			.limit(100)
	]);
	return {
		meta: { title: 'Komunikasi Terintegrasi' } satisfies PageMeta,
		templates,
		queue,
		canManage: hasPermission(locals, 'komunikasi_manage'),
		canApprove: hasPermission(locals, 'komunikasi_approve')
	};
}

export const actions = {
	'template-create': async ({ request, locals }) => {
		if (!hasPermission(locals, 'komunikasi_manage'))
			return fail(403, { message: 'Izin kelola komunikasi diperlukan.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { message: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const channel = String(form.get('channel') ?? 'internal');
		const audience = String(form.get('audience') ?? 'semua');
		const subject = String(form.get('subject') ?? '').trim() || null;
		const body = String(form.get('body') ?? '').trim();
		if (
			!name ||
			!body ||
			!CHANNELS.includes(channel as (typeof CHANNELS)[number]) ||
			!AUDIENCES.includes(audience as (typeof AUDIENCES)[number])
		)
			return fail(400, { message: 'Template belum lengkap.' });
		try {
			const [created] = await db
				.insert(tableCommunicationTemplate)
				.values({
					sekolahId,
					name: name.slice(0, 100),
					channel: channel as (typeof CHANNELS)[number],
					audience,
					subject: subject?.slice(0, 200),
					body: body.slice(0, 5000)
				})
				.returning();
			await writeAuditLog({
				locals,
				request,
				action: 'create',
				entityType: 'communication_template',
				entityId: created.id,
				summary: `Template komunikasi ${name} dibuat.`
			});
			return { message: 'Template berhasil disimpan.' };
		} catch {
			return fail(400, { message: 'Nama template sudah digunakan atau data tidak valid.' });
		}
	},
	'queue-create': async ({ request, locals }) => {
		if (!hasPermission(locals, 'komunikasi_manage'))
			return fail(403, { message: 'Izin kelola komunikasi diperlukan.' });
		const sekolahId = locals.sekolah?.id;
		const userId = locals.user?.id;
		if (!sekolahId || !userId) return fail(400, { message: 'Sesi tidak valid.' });
		const form = await request.formData();
		const templateId = Number(form.get('templateId')) || null;
		const channel = String(form.get('channel') ?? 'internal');
		const audience = String(form.get('audience') ?? 'semua');
		const recipient = String(form.get('recipient') ?? '').trim() || null;
		const subject = String(form.get('subject') ?? '').trim() || null;
		const body = String(form.get('body') ?? '').trim();
		const containsSensitiveData = form.get('containsSensitiveData') === '1';
		if (containsSensitiveData)
			return fail(400, {
				message:
					'Nilai dan data sensitif tidak boleh dikirim melalui pusat komunikasi tanpa kebijakan khusus sekolah.'
			});
		if (
			!body ||
			!CHANNELS.includes(channel as (typeof CHANNELS)[number]) ||
			!AUDIENCES.includes(audience as (typeof AUDIENCES)[number])
		)
			return fail(400, { message: 'Draf komunikasi belum lengkap.' });
		if (audience === 'individu' && !recipient)
			return fail(400, { message: 'Penerima individu wajib diisi.' });
		const [created] = await db
			.insert(tableCommunicationQueue)
			.values({
				sekolahId,
				templateId,
				channel: channel as (typeof CHANNELS)[number],
				audience,
				recipient,
				subject: subject?.slice(0, 200),
				body: body.slice(0, 5000),
				status: 'draft',
				containsSensitiveData: false,
				createdById: userId
			})
			.returning();
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'communication_queue',
			entityId: created.id,
			summary: `Draf komunikasi untuk ${audience} dibuat.`,
			after: { channel, audience, recipient, subject }
		});
		return { message: 'Draf komunikasi berhasil dibuat.' };
	},
	request: async ({ request, locals }) => {
		if (!hasPermission(locals, 'komunikasi_manage'))
			return fail(403, { message: 'Izin kelola komunikasi diperlukan.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number((await request.formData()).get('id'));
		if (!sekolahId || !Number.isInteger(id)) return fail(400, { message: 'Draf tidak valid.' });
		const result = await db
			.update(tableCommunicationQueue)
			.set({ status: 'pending_approval', updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(tableCommunicationQueue.id, id),
					eq(tableCommunicationQueue.sekolahId, sekolahId),
					eq(tableCommunicationQueue.status, 'draft')
				)
			)
			.returning();
		if (!result.length) return fail(400, { message: 'Hanya draf yang dapat diajukan.' });
		await writeAuditLog({
			locals,
			request,
			action: 'status_change',
			entityType: 'communication_queue',
			entityId: id,
			summary: 'Komunikasi diajukan untuk persetujuan.',
			before: { status: 'draft' },
			after: { status: 'pending_approval' }
		});
		return { message: 'Komunikasi menunggu persetujuan.' };
	},
	approve: async ({ request, locals }) => {
		if (!hasPermission(locals, 'komunikasi_approve'))
			return fail(403, { message: 'Izin persetujuan komunikasi diperlukan.' });
		const sekolahId = locals.sekolah?.id;
		const userId = locals.user?.id;
		const id = Number((await request.formData()).get('id'));
		if (!sekolahId || !userId || !Number.isInteger(id))
			return fail(400, { message: 'Antrean tidak valid.' });
		const now = new Date().toISOString();
		const result = await db
			.update(tableCommunicationQueue)
			.set({ status: 'approved', approvedById: userId, approvedAt: now, updatedAt: now })
			.where(
				and(
					eq(tableCommunicationQueue.id, id),
					eq(tableCommunicationQueue.sekolahId, sekolahId),
					eq(tableCommunicationQueue.status, 'pending_approval'),
					eq(tableCommunicationQueue.containsSensitiveData, false)
				)
			)
			.returning();
		if (!result.length) return fail(400, { message: 'Komunikasi tidak dapat disetujui.' });
		await writeAuditLog({
			locals,
			request,
			action: 'status_change',
			entityType: 'communication_queue',
			entityId: id,
			summary: 'Komunikasi disetujui.',
			before: { status: 'pending_approval' },
			after: { status: 'approved' }
		});
		return { message: 'Komunikasi disetujui. Pengiriman tetap dilakukan secara terkontrol.' };
	},
	'mark-sent': async ({ request, locals }) => {
		if (!hasPermission(locals, 'komunikasi_approve'))
			return fail(403, { message: 'Izin persetujuan komunikasi diperlukan.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number((await request.formData()).get('id'));
		if (!sekolahId || !Number.isInteger(id)) return fail(400, { message: 'Antrean tidak valid.' });
		const now = new Date().toISOString();
		const result = await db
			.update(tableCommunicationQueue)
			.set({ status: 'sent', sentAt: now, attempts: 1, updatedAt: now })
			.where(
				and(
					eq(tableCommunicationQueue.id, id),
					eq(tableCommunicationQueue.sekolahId, sekolahId),
					eq(tableCommunicationQueue.status, 'approved')
				)
			)
			.returning();
		if (!result.length)
			return fail(400, {
				message: 'Hanya komunikasi yang sudah disetujui dapat ditandai terkirim.'
			});
		await writeAuditLog({
			locals,
			request,
			action: 'status_change',
			entityType: 'communication_queue',
			entityId: id,
			summary: 'Komunikasi ditandai berhasil dikirim.',
			after: { status: 'sent' }
		});
		return { message: 'Status pengiriman dicatat berhasil.' };
	},
	cancel: async ({ request, locals }) => {
		if (!hasPermission(locals, 'komunikasi_manage'))
			return fail(403, { message: 'Izin kelola komunikasi diperlukan.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number((await request.formData()).get('id'));
		if (!sekolahId || !Number.isInteger(id)) return fail(400, { message: 'Antrean tidak valid.' });
		await db
			.update(tableCommunicationQueue)
			.set({ status: 'cancelled', updatedAt: new Date().toISOString() })
			.where(
				and(eq(tableCommunicationQueue.id, id), eq(tableCommunicationQueue.sekolahId, sekolahId))
			);
		return { message: 'Komunikasi dibatalkan.' };
	}
};
