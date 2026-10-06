import db from '$lib/server/db';
import { tableMurid, tableKelas } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { activeMuridFilter } from '$lib/server/murid-query';

export async function GET({ url, locals }) {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) {
		throw error(401, 'Unauthorized');
	}

	const kelasIdRaw = url.searchParams.get('kelas_id');
	if (!kelasIdRaw) {
		throw error(400, 'kelas_id required');
	}
	const kelasId = Number(kelasIdRaw);
	if (!Number.isInteger(kelasId) || kelasId <= 0) {
		throw error(400, 'Invalid kelas_id');
	}

	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, sekolahId: true },
		where: eq(tableKelas.id, kelasId)
	});

	if (!kelas || kelas.sekolahId !== sekolahId) {
		throw error(404, 'Kelas tidak ditemukan');
	}

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, agama: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasId),
			activeMuridFilter()
		),
		orderBy: asc(tableMurid.nama)
	});

	return json(muridList);
}
