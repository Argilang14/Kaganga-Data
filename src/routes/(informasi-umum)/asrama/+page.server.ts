import { error } from '@sveltejs/kit';
import { canDorm } from '$lib/dormitory';
import db from '$lib/server/db';
import { dormRooms } from '$lib/server/dormitory-access';
import { dormitoryActions } from '$lib/server/dormitory-page';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!canDorm(locals.user, 'lihat')) error(403, 'Akses data asrama tidak diizinkan.');
	const rooms = await dormRooms(locals);
	const school = locals.sekolah?.id;
	if (!school) error(400, 'Pilih sekolah aktif terlebih dahulu.');
	const records = await db.$client.execute({
		sql: `SELECT k.id,k.nama,k.kapasitas,k.versi,k.aktif,
	 (SELECT w.pegawai_id FROM asrama_penugasan w WHERE w.kamar_id=k.id AND w.peran='utama' AND w.selesai IS NULL) AS pegawaiId
	 FROM asrama_kamar k WHERE k.sekolah_id=?`,
		args: [school]
	});
	const employees = await db.$client.execute({
		sql: "SELECT id,nama,nip FROM pegawai WHERE sekolah_id=? AND jenis='wali_asrama' AND status='aktif' ORDER BY nama",
		args: [school]
	});
	depends('app:asrama');
	return {
		meta: { title: 'Data Asrama' },
		rooms: rooms.map((room) => ({
			...room,
			pegawaiId: Number(
				records.rows.find((record) => Number(record.id) === room.id)?.pegawaiId ?? 0
			)
		})),
		employees: employees.rows as unknown as { id: number; nama: string; nip: string }[],
		manage: canDorm(locals.user, 'manage') && canDorm(locals.user, 'penugasan')
	};
};
export const actions: Actions = dormitoryActions;
