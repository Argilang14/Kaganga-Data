import { error } from '@sveltejs/kit';

function hasMigrationShapeError(value: unknown) {
	const message = String(value);
	return (
		message.includes('no such table') ||
		message.includes('no such column') ||
		(message.includes('SQLITE_ERROR') && message.includes('has no column named'))
	);
}

export function isMigrationRequiredError(value: unknown) {
	if (hasMigrationShapeError(value)) return true;
	if (typeof value === 'object' && value !== null) {
		const record = value as { cause?: unknown; message?: unknown };
		return hasMigrationShapeError(record.message) || hasMigrationShapeError(record.cause);
	}
	return false;
}

export async function withSchemaReady<T>(featureName: string, task: () => Promise<T>): Promise<T> {
	try {
		return await task();
	} catch (err) {
		if (isMigrationRequiredError(err)) {
			console.warn('[schema-guard] ' + featureName + ' belum siap di database aktif', err);
			throw error(
				503,
				'Database untuk fitur ' +
					featureName +
					' belum siap. Jalankan migrasi database terlebih dahulu melalui pnpm db:push atau migrasi aplikasi Kaganga.'
			);
		}
		throw err;
	}
}
