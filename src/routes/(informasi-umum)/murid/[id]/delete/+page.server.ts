import db from '$lib/server/db/index.js';
import { tableMurid } from '$lib/server/db/schema.js';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function load() {
	return { meta: { title: 'Hapus Murid' } };
}

export const actions = {
	async delete({ params, locals }) {
		if (locals.user?.type === 'wali_asuh' || locals.user?.type === 'wali_asrama') {
			throw error(403, 'Anda tidak memiliki izin untuk menghapus data murid.');
		}
		await db.delete(tableMurid).where(eq(tableMurid.id, +params.id));
		return { message: `Data murid berhasil dihapus` };
	}
};
