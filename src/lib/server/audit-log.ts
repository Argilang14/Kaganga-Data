import db from '$lib/server/db';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { tableAuditLog } from '$lib/server/db/schema';
import { safeAuditRecord } from '$lib/server/audit-sanitize';

export type AuditAction =
	'create' | 'update' | 'delete' | 'import' | 'status_change' | 'promote' | 'archive' | 'restore';

export async function writeAuditLog(
	options: {
		locals: App.Locals;
		request?: Request;
		action: AuditAction;
		entityType: string;
		entityId?: string | number | null;
		summary: string;
		before?: unknown;
		after?: unknown;
	},
	transaction?: DBTransaction
) {
	if (!transaction) await ensureDataGovernanceSchema();
	const user = options.locals.user;
	await (transaction ?? db).insert(tableAuditLog).values({
		sekolahId: options.locals.sekolah?.id ?? null,
		userId: user?.id ?? null,
		usernameSnapshot: user?.username ?? 'sistem',
		roleSnapshot: user?.type ?? 'sistem',
		action: options.action,
		entityType: options.entityType,
		entityId: options.entityId == null ? null : String(options.entityId),
		summary: options.summary.slice(0, 500),
		beforeData: safeAuditRecord(options.before),
		afterData: safeAuditRecord(options.after),
		ipAddress:
			options.request?.headers.get('cf-connecting-ip') ??
			options.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
			null,
		userAgent: options.request?.headers.get('user-agent')?.slice(0, 500) ?? null
	});
}
