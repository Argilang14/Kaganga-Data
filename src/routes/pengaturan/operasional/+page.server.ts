import { writeAuditLog } from '$lib/server/audit-log';
import { deleteOtherSessionsForUser, deleteSessionForUser } from '$lib/server/auth';
import db from '$lib/server/db';
import { ensureProductionOperationsSchema } from '$lib/server/db/ensure-production-operations';
import { tableAuthSession, tableMaintenanceRun } from '$lib/server/db/schema';
import {
	cleanupSafeFiles,
	createTieredBackup,
	getSystemHealth
} from '$lib/server/system-operations';
import { fail, redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { authority } from '../../pengguna/utils.server';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw redirect(303, '/login');
	return locals.user;
}

export async function load({ locals }) {
	authority('operasional_lihat');
	const user = requireUser(locals);
	await ensureProductionOperationsSchema();
	const [health, sessions, runs] = await Promise.all([
		getSystemHealth(),
		db
			.select({
				id: tableAuthSession.id,
				userAgent: tableAuthSession.userAgent,
				ipAddress: tableAuthSession.ipAddress,
				expiresAt: tableAuthSession.expiresAt,
				updatedAt: tableAuthSession.updatedAt,
				createdAt: tableAuthSession.createdAt
			})
			.from(tableAuthSession)
			.where(eq(tableAuthSession.userId, user.id))
			.orderBy(desc(tableAuthSession.updatedAt)),
		db.select().from(tableMaintenanceRun).orderBy(desc(tableMaintenanceRun.id)).limit(12)
	]);
	return {
		meta: { title: 'Operasional Sistem' } satisfies PageMeta,
		health,
		sessions: sessions.map((session) => ({
			...session,
			current: session.id === locals.session?.id
		})),
		runs,
		isAdmin: user.type === 'admin'
	};
}

export const actions = {
	backup: async ({ locals, request }) => {
		const user = requireUser(locals);
		if (user.type !== 'admin')
			return fail(403, { message: 'Hanya admin yang dapat membuat backup.' });
		const form = await request.formData();
		const requested = String(form.get('kind') ?? 'manual');
		const kind = ['daily', 'weekly', 'pre-update', 'manual'].includes(requested)
			? (requested as 'daily' | 'weekly' | 'pre-update' | 'manual')
			: 'manual';
		try {
			const result = await createTieredBackup(kind);
			await writeAuditLog({
				locals,
				request,
				action: 'create',
				entityType: 'database_backup',
				summary: `Backup ${kind} dibuat.`,
				after: { size: result.size, file: result.target.split(/[\\/]/).pop() }
			});
			return { message: `Backup ${kind} berhasil dibuat.` };
		} catch (error) {
			return fail(500, { message: error instanceof Error ? error.message : 'Backup gagal.' });
		}
	},
	cleanup: async ({ locals, request }) => {
		const user = requireUser(locals);
		if (user.type !== 'admin')
			return fail(403, { message: 'Hanya admin yang dapat membersihkan berkas.' });
		const result = await cleanupSafeFiles();
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'storage_cleanup',
			summary: `${result.deleted} berkas yatim/sementara lama dibersihkan.`,
			before: result
		});
		return { message: `${result.deleted} berkas aman dibersihkan.` };
	},
	'record-test': async ({ locals, request }) => {
		const user = requireUser(locals);
		if (user.type !== 'admin')
			return fail(403, { message: 'Hanya admin yang dapat mencatat hasil pengujian.' });
		const form = await request.formData();
		const type = String(form.get('type') ?? '');
		const status = String(form.get('status') ?? '');
		const summary = String(form.get('summary') ?? '').trim();
		if (!['restore_test', 'update_test'].includes(type))
			return fail(400, { message: 'Jenis pengujian tidak valid.' });
		if (!['success', 'failed', 'warning'].includes(status))
			return fail(400, { message: 'Status pengujian tidak valid.' });
		if (summary.length < 5 || summary.length > 500)
			return fail(400, { message: 'Catatan pengujian harus berisi 5-500 karakter.' });
		const now = new Date().toISOString();
		await db.insert(tableMaintenanceRun).values({
			type: type as 'restore_test' | 'update_test',
			status: status as 'success' | 'failed' | 'warning',
			summary,
			startedAt: now,
			finishedAt: now
		});
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: type,
			summary: `Hasil ${type === 'restore_test' ? 'uji pemulihan' : 'uji pembaruan'} dicatat.`,
			after: { status, summary }
		});
		return { message: 'Hasil pengujian berhasil dicatat.' };
	},
	revoke: async ({ locals, request }) => {
		const user = requireUser(locals);
		const sessionId = Number((await request.formData()).get('sessionId'));
		if (!Number.isInteger(sessionId) || sessionId === locals.session?.id)
			return fail(400, { message: 'Sesi aktif tidak dapat dicabut dari daftar ini.' });
		await deleteSessionForUser(sessionId, user.id);
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'auth_session',
			entityId: sessionId,
			summary: 'Sesi perangkat dicabut oleh pengguna.'
		});
		return { message: 'Sesi perangkat berhasil dicabut.' };
	},
	'revoke-others': async ({ locals, request }) => {
		const user = requireUser(locals);
		if (!locals.session?.id) return fail(400, { message: 'Sesi aktif tidak ditemukan.' });
		await deleteOtherSessionsForUser(user.id, locals.session.id);
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'auth_session',
			summary: 'Semua sesi perangkat lain dicabut.'
		});
		return { message: 'Semua perangkat lain telah dikeluarkan.' };
	}
};
