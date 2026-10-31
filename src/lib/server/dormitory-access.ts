import { error, type Cookies } from '@sveltejs/kit';
import db from './db';
import { ensureDormitorySchema } from './db/ensure-dormitory';
import { canDorm, dormId, dormToday, type DormRoom } from '$lib/dormitory';
import { hasSchoolWideAttendanceStudentAccess } from '$lib/attendance-access';

export const dormCookie = 'active-kamar-id';
export async function dormRooms(locals: App.Locals, attendance = false): Promise<DormRoom[]> {
	const { user, sekolah } = locals;
	if (
		!sekolah ||
		!canDorm(user, 'lihat') ||
		(user?.type !== 'admin' && user?.sekolahId !== sekolah.id)
	)
		return [];
	await ensureDormitorySchema();
	const wide =
		canDorm(user, 'manage') ||
		canDorm(user, 'penempatan') ||
		canDorm(user, 'penugasan') ||
		(attendance && hasSchoolWideAttendanceStudentAccess(user, sekolah.id));
	const employee = user?.pegawaiId ?? -1;
	const result = await db.$client.execute({
		sql: `SELECT k.id,k.asrama_id AS asramaId,g.nama AS asrama,k.nama,g.kategori,
	 k.kapasitas,k.aktif*g.aktif AS aktif,k.versi,
	 (SELECT COUNT(*) FROM asrama_penempatan p WHERE p.kamar_id=k.id AND p.selesai IS NULL) AS penghuni,
	 (SELECT e.nama FROM asrama_penugasan w JOIN pegawai e ON e.id=w.pegawai_id
	 WHERE w.kamar_id=k.id AND w.peran='utama' AND w.selesai IS NULL) AS wali
	 FROM asrama_kamar k JOIN asrama g ON g.id=k.asrama_id WHERE k.sekolah_id=? AND (
	 ?=1 OR EXISTS(SELECT 1 FROM asrama_penugasan w JOIN pegawai e ON e.id=w.pegawai_id
	 WHERE w.kamar_id=k.id AND w.pegawai_id=? AND e.status='aktif' AND w.selesai IS NULL)
	 OR (?='wali_asuh' AND EXISTS(SELECT 1 FROM asrama_penempatan p JOIN murid_identity_link mi
	 ON mi.identity_uid=p.identity_uid AND mi.sekolah_id=p.sekolah_id JOIN murid m ON m.id=mi.murid_id
	 JOIN pegawai e ON e.id=? AND e.sekolah_id=m.sekolah_id AND e.status='aktif'
	 WHERE p.kamar_id=k.id AND p.selesai IS NULL AND lower(trim(m.wali_asuh_nama))=lower(trim(e.nama))
	 AND (SELECT COUNT(*) FROM pegawai e2 WHERE e2.sekolah_id=e.sekolah_id AND lower(trim(e2.nama))=lower(trim(e.nama)))=1)))
	 ORDER BY g.nama,k.nama`,
		args: [sekolah.id, wide ? 1 : 0, employee, user?.type ?? '', employee]
	});
	return result.rows as unknown as DormRoom[];
}
export async function dormView(
	locals: App.Locals,
	params: URLSearchParams,
	cookies?: Cookies,
	attendance = false
) {
	const rooms = await dormRooms(locals, attendance);
	const supplied = params.get('kamar_id');
	let id = 0;
	try {
		id = dormId(supplied ?? cookies?.get(dormCookie) ?? '0', true);
	} catch {
		if (supplied !== null) error(400, 'Pilihan kamar tidak valid.');
	}
	const room = rooms.find((room) => room.id === id) ?? null;
	if (id && !room && supplied !== null) error(403, 'Kamar tidak ditemukan atau di luar penugasan.');
	return { rooms, room, date: dormToday() };
}
