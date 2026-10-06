import db from '$lib/server/db';
import { tablePegawaiRiwayat } from '$lib/server/db/schema';

export async function recordPegawaiHistory(options: {
	sekolahId: number;
	pegawaiId: number;
	userId?: number | null;
	aksi: string;
	bagian: string;
	ringkasan: string;
}) {
	try {
		await db.insert(tablePegawaiRiwayat).values({
			sekolahId: options.sekolahId,
			pegawaiId: options.pegawaiId,
			authUserId: options.userId || null,
			aksi: options.aksi,
			bagian: options.bagian,
			ringkasan: options.ringkasan
		});
	} catch (historyError) {
		console.warn('[pegawai] Riwayat perubahan tidak dapat dicatat:', historyError);
	}
}
