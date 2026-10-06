import { getAiSettings } from '$lib/server/ai';
import { json } from '@sveltejs/kit';

export const GET = async ({ locals }) => {
	if (!locals.user) return json({ message: 'Sesi berakhir.' }, { status: 401 });
	const sekolahId = locals.sekolah?.id;
	const isAdmin = locals.user.type === 'admin';
	if (!sekolahId) return json({ configured: false, isAdmin });
	return json({ configured: Boolean(await getAiSettings(sekolahId, locals.user.id)), isAdmin });
};
