import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import db from '$lib/server/db';
import { ensureBukuTamuSchema } from '$lib/server/db/ensure-buku-tamu';
import { tableBukuTamuSettings } from '$lib/server/db/schema';

const KEY_LENGTH = 64;
const MAX_UNLOCK_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, number[]>();

function hashPasskey(passkey: string, salt = randomBytes(16).toString('hex')) {
	return { hash: scryptSync(passkey, salt, KEY_LENGTH).toString('hex'), salt };
}

function safeEqual(a: string | null | undefined, b: string | null | undefined) {
	if (!a || !b || a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function cookieName(publicToken: string) {
	return `kaganga-tamu-${publicToken.slice(0, 16)}`;
}

function prune(key: string) {
	const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
	const values = (attempts.get(key) ?? []).filter((value) => value >= cutoff);
	if (values.length) attempts.set(key, values);
	else attempts.delete(key);
	return values;
}

export async function getOrCreateBukuTamuSettings(sekolahId: number) {
	await ensureBukuTamuSchema();
	let row = await db.query.tableBukuTamuSettings.findFirst({
		where: eq(tableBukuTamuSettings.sekolahId, sekolahId)
	});
	if (row?.publicToken) return row;

	const publicToken = randomBytes(24).toString('base64url');
	const now = new Date().toISOString();
	if (row) {
		await db
			.update(tableBukuTamuSettings)
			.set({ publicToken, updatedAt: now })
			.where(eq(tableBukuTamuSettings.id, row.id));
	} else {
		await db.insert(tableBukuTamuSettings).values({ sekolahId, publicToken, createdAt: now });
	}
	row = await db.query.tableBukuTamuSettings.findFirst({
		where: eq(tableBukuTamuSettings.sekolahId, sekolahId)
	});
	if (!row?.publicToken) throw new Error('Tautan publik Buku Tamu gagal dibuat.');
	return row;
}

export async function getBukuTamuSettingsByToken(publicToken: string) {
	await ensureBukuTamuSchema();
	return db.query.tableBukuTamuSettings.findFirst({
		where: eq(tableBukuTamuSettings.publicToken, publicToken)
	});
}

export async function setBukuTamuPasskey(sekolahId: number, passkey: string | null) {
	const row = await getOrCreateBukuTamuSettings(sekolahId);
	const now = new Date().toISOString();
	if (!passkey) {
		await db
			.update(tableBukuTamuSettings)
			.set({ passkeyHash: null, passkeySalt: null, unlockToken: null, updatedAt: now })
			.where(eq(tableBukuTamuSettings.id, row.id));
		return;
	}
	const { hash, salt } = hashPasskey(passkey);
	await db
		.update(tableBukuTamuSettings)
		.set({
			passkeyHash: hash,
			passkeySalt: salt,
			unlockToken: randomBytes(32).toString('base64url'),
			updatedAt: now
		})
		.where(eq(tableBukuTamuSettings.id, row.id));
}

export async function rotateBukuTamuPublicToken(sekolahId: number) {
	const row = await getOrCreateBukuTamuSettings(sekolahId);
	const publicToken = randomBytes(24).toString('base64url');
	await db
		.update(tableBukuTamuSettings)
		.set({ publicToken, unlockToken: randomBytes(32).toString('base64url'), updatedAt: new Date().toISOString() })
		.where(eq(tableBukuTamuSettings.id, row.id));
	return publicToken;
}

export function verifyBukuTamuPasskey(passkey: string, hash: string, salt: string) {
	try {
		return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(passkey, salt, KEY_LENGTH));
	} catch {
		return false;
	}
}

export function isBukuTamuUnlocked(
	cookies: Cookies,
	settings: { publicToken: string; passkeyHash: string | null; unlockToken: string | null }
) {
	if (!settings.passkeyHash) return true;
	return safeEqual(cookies.get(cookieName(settings.publicToken)), settings.unlockToken);
}

export function applyBukuTamuUnlockCookie(
	cookies: Cookies,
	settings: { publicToken: string; unlockToken: string | null },
	secure: boolean
) {
	if (!settings.unlockToken) return;
	cookies.set(cookieName(settings.publicToken), settings.unlockToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: 12 * 60 * 60
	});
}

export function checkBukuTamuUnlockLimit(publicToken: string, ip: string) {
	const key = `${publicToken}:${ip}`;
	const values = prune(key);
	return {
		blocked: values.length >= MAX_UNLOCK_ATTEMPTS,
		retryAfterSeconds: values.length
			? Math.max(1, Math.ceil((values[0] + ATTEMPT_WINDOW_MS - Date.now()) / 1000))
			: 0
	};
}

export function recordBukuTamuUnlockFailure(publicToken: string, ip: string) {
	const key = `${publicToken}:${ip}`;
	attempts.set(key, [...prune(key), Date.now()]);
}

export function clearBukuTamuUnlockFailures(publicToken: string, ip: string) {
	attempts.delete(`${publicToken}:${ip}`);
}
