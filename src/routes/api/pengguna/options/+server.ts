import db from '$lib/server/db';
import { ensurePenggunaIdentitySchema } from '$lib/server/db/ensure-pengguna';
import { tableAuthUser, tableKelas, tableMataPelajaran, tablePegawai } from '$lib/server/db/schema';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

export async function GET({ locals, url }) {
	authority('user_add');
	await ensurePenggunaIdentitySchema();

	const sekolahId = locals.sekolah?.id;
	const includeUserId = Number(url.searchParams.get('includeUserId'));
	if (!sekolahId)
		return Response.json({ message: 'Sekolah aktif tidak ditemukan' }, { status: 400 });

	const [pegawaiList, mataPelajaran, kelasList] = await Promise.all([
		db
			.select({
				id: tablePegawai.id,
				nama: tablePegawai.nama,
				nip: tablePegawai.nip,
				jenis: tablePegawai.jenis,
				jabatan: tablePegawai.jabatan,
				status: tablePegawai.status
			})
			.from(tablePegawai)
			.leftJoin(tableAuthUser, eq(tableAuthUser.pegawaiId, tablePegawai.id))
			.where(
				and(
					eq(tablePegawai.sekolahId, sekolahId),
					eq(tablePegawai.status, 'aktif'),
					Number.isInteger(includeUserId) && includeUserId > 0
						? or(isNull(tableAuthUser.id), eq(tableAuthUser.id, includeUserId))
						: isNull(tableAuthUser.id)
				)
			)
			.orderBy(asc(tablePegawai.nama)),
		db
			.selectDistinct({ id: tableMataPelajaran.id, nama: tableMataPelajaran.nama })
			.from(tableMataPelajaran)
			.innerJoin(tableKelas, eq(tableMataPelajaran.kelasId, tableKelas.id))
			.where(eq(tableKelas.sekolahId, sekolahId))
			.orderBy(asc(tableMataPelajaran.nama)),
		db
			.select({ id: tableKelas.id, nama: tableKelas.nama, fase: tableKelas.fase })
			.from(tableKelas)
			.where(eq(tableKelas.sekolahId, sekolahId))
			.orderBy(asc(tableKelas.nama))
	]);

	return Response.json({ pegawaiList, mataPelajaran, kelasList });
}
