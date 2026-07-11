import db from '$lib/server/db/index.js';
import { tableMurid } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { meta: { title: 'Hapus Murid' } };
};

export const actions: Actions = {
	async delete({ params }) {
		await db.delete(tableMurid).where(eq(tableMurid.id, +params.id));
		return { message: `Data murid berhasil dihapus` };
	}
};
