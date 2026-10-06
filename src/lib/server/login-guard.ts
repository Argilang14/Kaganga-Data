import { createHash } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableLoginAttempt } from '$lib/server/db/schema';
import { ensureLoginAttemptSchema } from '$lib/server/db/ensure-login-attempt';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

function attemptKey(username: string, clientAddress: string) {
	return createHash('sha256').update(`${username.trim().toLowerCase()}\0${clientAddress}`).digest('hex');
}

export async function getLoginGuard(username: string, clientAddress: string, now = new Date()) {
	await ensureLoginAttemptSchema();
	const keyHash = attemptKey(username, clientAddress);
	const row = await db.query.tableLoginAttempt.findFirst({ where: eq(tableLoginAttempt.keyHash, keyHash) });
	const blockedUntil = row?.blockedUntil ? new Date(row.blockedUntil) : null;
	return {
		keyHash,
		blocked: Boolean(blockedUntil && blockedUntil.getTime() > now.getTime()),
		retryAfterSeconds: blockedUntil ? Math.max(0, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)) : 0,
		row
	};
}

export async function recordLoginFailure(username: string, clientAddress: string, now = new Date()) {
	const guard = await getLoginGuard(username, clientAddress, now);
	const windowStarted = guard.row ? new Date(guard.row.windowStartedAt).getTime() : 0;
	const withinWindow = Number.isFinite(windowStarted) && now.getTime() - windowStarted < WINDOW_MS;
	const failedCount = withinWindow ? (guard.row?.failedCount ?? 0) + 1 : 1;
	const blockedUntil = failedCount >= MAX_FAILURES ? new Date(now.getTime() + BLOCK_MS).toISOString() : null;
	const timestamp = now.toISOString();
	await db.insert(tableLoginAttempt).values({
		keyHash: guard.keyHash,
		failedCount,
		windowStartedAt: withinWindow && guard.row ? guard.row.windowStartedAt : timestamp,
		blockedUntil,
		updatedAt: timestamp
	}).onConflictDoUpdate({
		target: tableLoginAttempt.keyHash,
		set: { failedCount, windowStartedAt: withinWindow && guard.row ? guard.row.windowStartedAt : timestamp, blockedUntil, updatedAt: timestamp }
	});
	return { blocked: Boolean(blockedUntil), remainingAttempts: Math.max(0, MAX_FAILURES - failedCount) };
}

export async function clearLoginFailures(username: string, clientAddress: string) {
	await ensureLoginAttemptSchema();
	await db.delete(tableLoginAttempt).where(eq(tableLoginAttempt.keyHash, attemptKey(username, clientAddress)));
}

export async function pruneLoginAttempts(now = new Date()) {
	await ensureLoginAttemptSchema();
	await db.delete(tableLoginAttempt).where(lt(tableLoginAttempt.updatedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()));
}
