import { recordServerHeartbeat } from '$lib/server/system-operations';
import { error, json } from '@sveltejs/kit';

export async function GET({ locals }) {
	if (!locals.user) throw error(401, 'Tidak terautentikasi.');
	const server = await recordServerHeartbeat(true);
	return json(
		{
			connected: true,
			serverTime: new Date().toISOString(),
			instanceId: server.instanceId,
			machineName: server.machineName,
			conflict: server.conflict,
			school: locals.sekolah ? { id: locals.sekolah.id, nama: locals.sekolah.nama } : null
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
}
