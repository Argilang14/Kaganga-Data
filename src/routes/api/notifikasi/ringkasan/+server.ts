import { _getNotificationData } from '../../../notifikasi/+page.server';
import { json } from '@sveltejs/kit';

export async function GET({ locals }) {
	const user = locals.user;
	if (!user || !locals.sekolah) {
		return json({ message: 'Belum masuk.' }, { status: 401 });
	}
	if (user.type !== 'admin' && !user.permissions?.includes('notifikasi_lihat')) {
		return json({ message: 'Tidak diizinkan.' }, { status: 403 });
	}

	const data = await _getNotificationData(locals);
	return json({ total: data.total, generatedAt: data.generatedAt });
}
