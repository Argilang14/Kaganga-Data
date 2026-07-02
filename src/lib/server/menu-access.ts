import { and, eq, inArray } from 'drizzle-orm';
import {
	DEFAULT_MENU_ACCESS,
	MENU_ACCESS_KEYS,
	MENU_ACCESS_LOCK_PREFIX,
	isMenuAccessKey,
	menuAccessLockKey,
	type MenuAccessKey,
	type MenuAccessSettings
} from '$lib/menu-access';
import db from '$lib/server/db';
import { tableFeatureUnlock } from '$lib/server/db/schema';

export async function loadMenuAccessSettings(sekolahId: number | null | undefined) {
	if (!sekolahId) return { ...DEFAULT_MENU_ACCESS };

	const rows = await db.query.tableFeatureUnlock.findMany({
		columns: { featureKey: true },
		where: and(
			eq(tableFeatureUnlock.sekolahId, sekolahId),
			inArray(
				tableFeatureUnlock.featureKey,
				MENU_ACCESS_KEYS.map((key) => menuAccessLockKey(key))
			)
		)
	});

	const locked = new Set(
		rows.map((row) => row.featureKey.replace(MENU_ACCESS_LOCK_PREFIX, '')).filter(isMenuAccessKey)
	);

	return MENU_ACCESS_KEYS.reduce<MenuAccessSettings>(
		(settings, key) => {
			settings[key] = !locked.has(key);
			return settings;
		},
		{ ...DEFAULT_MENU_ACCESS }
	);
}

export async function saveMenuAccessSettings(sekolahId: number, settings: MenuAccessSettings) {
	const now = new Date().toISOString();
	const keysToLock: MenuAccessKey[] = MENU_ACCESS_KEYS.filter((key) => !settings[key]);
	const lockFeatureKeys = MENU_ACCESS_KEYS.map((key) => menuAccessLockKey(key));

	await db.transaction(async (tx) => {
		await tx
			.delete(tableFeatureUnlock)
			.where(
				and(
					eq(tableFeatureUnlock.sekolahId, sekolahId),
					inArray(tableFeatureUnlock.featureKey, lockFeatureKeys)
				)
			);

		if (keysToLock.length) {
			await tx.insert(tableFeatureUnlock).values(
				keysToLock.map((key) => ({
					sekolahId,
					featureKey: menuAccessLockKey(key),
					unlockedAt: now,
					createdAt: now,
					updatedAt: now
				}))
			);
		}
	});

	return loadMenuAccessSettings(sekolahId);
}

export function parseMenuAccessFormValue(value: FormDataEntryValue | null) {
	return value === 'on' || value === 'true' || value === '1';
}
