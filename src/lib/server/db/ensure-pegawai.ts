import db from '$lib/server/db';
import { ensurePegawaiFoundation } from './pegawai-foundation';

let ensurePromise: Promise<void> | null = null;

export async function ensurePegawaiSchema() {
	if (!ensurePromise) {
		ensurePromise = ensurePegawaiFoundation(db.$client).catch((error) => {
			ensurePromise = null;
			throw error;
		});
	}
	await ensurePromise;
}
