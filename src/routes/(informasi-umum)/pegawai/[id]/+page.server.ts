import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import {
	tableAuthUser,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableKelas,
	tablePegawai,
	tableSekolah
} from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';
import type { PageServerLoad } from './$types';

function parseId(value: string | undefined) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	authority('sekolah_manage');
	if (!locals.user) throw redirect(303, '/login');

	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');

	const pegawaiId = parseId(params.id);
	if (!pegawaiId) throw error(404, 'Data pegawai tidak ditemukan.');

	await ensurePegawaiSchema();

	const pegawai = await db.query.tablePegawai.findFirst({
		where: and(eq(tablePegawai.id, pegawaiId), eq(tablePegawai.sekolahId, sekolahId))
	});
	if (!pegawai) throw error(404, 'Data pegawai tidak ditemukan.');

	const [sekolahRows, kelasRows, mapelRows, akunRows, jadwalRows] = await Promise.all([
		db
			.select({ nama: tableSekolah.nama })
			.from(tableSekolah)
			.where(and(eq(tableSekolah.id, sekolahId), eq(tableSekolah.kepalaSekolahId, pegawaiId))),
		db
			.select({
				id: tableKelas.id,
				nama: tableKelas.nama,
				waliKelasId: tableKelas.waliKelasId,
				waliAsramaId: tableKelas.waliAsramaId,
				waliAsuhId: tableKelas.waliAsuhId
			})
			.from(tableKelas)
			.where(
				and(
					eq(tableKelas.sekolahId, sekolahId),
					or(
						eq(tableKelas.waliKelasId, pegawaiId),
						eq(tableKelas.waliAsramaId, pegawaiId),
						eq(tableKelas.waliAsuhId, pegawaiId)
					)
				)
			)
			.orderBy(asc(tableKelas.nama)),
		db
			.select({
				id: tableJadwalMapel.id,
				kode: tableJadwalMapel.kode,
				nama: tableJadwalMapel.nama,
				jenjang: tableJadwalMapel.jenjang,
				kategori: tableJadwalMapel.kategori,
				aktif: tableJadwalMapel.aktif
			})
			.from(tableJadwalMapel)
			.where(
				and(
					eq(tableJadwalMapel.sekolahId, sekolahId),
					eq(tableJadwalMapel.guruPegawaiId, pegawaiId)
				)
			)
			.orderBy(asc(tableJadwalMapel.nama)),
		db
			.select({
				id: tableAuthUser.id,
				username: tableAuthUser.username,
				type: tableAuthUser.type,
				createdAt: tableAuthUser.createdAt,
				passwordUpdatedAt: tableAuthUser.passwordUpdatedAt
			})
			.from(tableAuthUser)
			.where(and(eq(tableAuthUser.sekolahId, sekolahId), eq(tableAuthUser.pegawaiId, pegawaiId)))
			.orderBy(asc(tableAuthUser.username)),
		db
			.select({ total: sql<number>`count(*)` })
			.from(tableJadwalPelajaran)
			.where(
				and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.guruPegawaiId, pegawaiId)
				)
			)
	]);

	const kelas = kelasRows.map((item) => ({
		id: item.id,
		nama: item.nama,
		peran: [
			item.waliKelasId === pegawaiId ? 'Wali Kelas' : null,
			item.waliAsramaId === pegawaiId ? 'Wali Asrama' : null,
			item.waliAsuhId === pegawaiId ? 'Wali Asuh' : null
		].filter((value): value is string => Boolean(value))
	}));

	return {
		meta: { title: `Informasi ${pegawai.nama}` } satisfies PageMeta,
		pegawai,
		penugasan: {
			kepalaSekolah: sekolahRows.map((item) => item.nama),
			kelas,
			mapel: mapelRows,
			jumlahJadwal: jadwalRows[0]?.total ?? 0
		},
		akun: akunRows
	};
};
