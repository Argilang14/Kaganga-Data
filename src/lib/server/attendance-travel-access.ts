import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { canScanStudentTravel } from '$lib/attendance-scan';
import db from './db';
import { tablePegawai } from './db/schema';

export async function assertTravelAccess(locals: App.Locals) {
	const { user, sekolah } = locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	if (!canScanStudentTravel(user) || (user.type !== 'admin' && user.sekolahId !== sekolah.id))
		throw error(403, 'Akun ini tidak memiliki izin perjalanan murid.');
	if (user.type === 'tim_keamanan') {
		const employee = await db.query.tablePegawai.findFirst({
			columns: { id: true },
			where: and(
				eq(tablePegawai.id, user.pegawaiId ?? -1),
				eq(tablePegawai.sekolahId, sekolah.id),
				eq(tablePegawai.status, 'aktif'),
				eq(tablePegawai.jenis, 'keamanan')
			)
		});
		if (!employee)
			throw error(403, 'Akun harus terhubung ke pegawai keamanan yang aktif. Hubungi operator.');
	}
}
