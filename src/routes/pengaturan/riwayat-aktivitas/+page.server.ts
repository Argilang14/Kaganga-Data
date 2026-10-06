import db from '$lib/server/db';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { tableAuditLog } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const PER_PAGE = 30;

function requireAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.type !== 'admin') throw error(403, 'Akses ditolak.');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif belum dipilih.');
	return sekolahId;
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:audit-log');
	await ensureDataGovernanceSchema();
	const sekolahId = requireAdmin(locals);
	const q = url.searchParams.get('q')?.trim() ?? '';
	const action = url.searchParams.get('action')?.trim() ?? '';
	const entityType = url.searchParams.get('entity')?.trim() ?? '';
	const dateFrom = url.searchParams.get('from')?.trim() ?? '';
	const dateTo = url.searchParams.get('to')?.trim() ?? '';
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const searchPattern = `%${q}%`;
	const filter = and(
		eq(tableAuditLog.sekolahId, sekolahId),
		action ? eq(tableAuditLog.action, action) : undefined,
		entityType ? eq(tableAuditLog.entityType, entityType) : undefined,
		dateFrom ? gte(tableAuditLog.createdAt, `${dateFrom}T00:00:00`) : undefined,
		dateTo ? lte(tableAuditLog.createdAt, `${dateTo}T23:59:59.999`) : undefined,
		q
			? or(
					sql`${tableAuditLog.usernameSnapshot} LIKE ${searchPattern} COLLATE NOCASE`,
					sql`${tableAuditLog.summary} LIKE ${searchPattern} COLLATE NOCASE`,
					sql`${tableAuditLog.entityId} LIKE ${searchPattern} COLLATE NOCASE`
				)
			: undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(tableAuditLog)
		.where(filter);
	const totalItems = Number(total ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
	const currentPage = Math.min(requestedPage, totalPages);
	const rows = await db
		.select()
		.from(tableAuditLog)
		.where(filter)
		.orderBy(desc(tableAuditLog.createdAt), desc(tableAuditLog.id))
		.limit(PER_PAGE)
		.offset((currentPage - 1) * PER_PAGE);
	const [actions, entities] = await Promise.all([
		db.selectDistinct({ value: tableAuditLog.action }).from(tableAuditLog).where(eq(tableAuditLog.sekolahId, sekolahId)),
		db.selectDistinct({ value: tableAuditLog.entityType }).from(tableAuditLog).where(eq(tableAuditLog.sekolahId, sekolahId))
	]);
	return {
		meta: { title: 'Riwayat Aktivitas' },
		rows,
		filters: { q, action, entityType, dateFrom, dateTo },
		actions: actions.map((item) => item.value).sort(),
		entities: entities.map((item) => item.value).sort(),
		page: { currentPage, totalPages, totalItems, perPage: PER_PAGE }
	};
};
