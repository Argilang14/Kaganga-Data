import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureLongTermFoundationSchema } from '$lib/server/db/ensure-long-term-foundation';
import {
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableJadwalRuangan,
	tableKelas,
	tableRuangan
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

const CONDITIONS = ['baik', 'rusak_ringan', 'rusak_berat', 'tidak_aktif'] as const;
const canManage = (locals: App.Locals) =>
	locals.user?.type === 'admin' || locals.user?.permissions?.includes('ruangan_manage') === true;
const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export async function load({ locals }) {
	authority('ruangan_lihat', 'ruangan_manage');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureLongTermFoundationSchema();
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const [rooms, schedules] = await Promise.all([
		db
			.select({
				id: tableRuangan.id,
				kode: tableRuangan.kode,
				nama: tableRuangan.nama,
				jenis: tableRuangan.jenis,
				kapasitas: tableRuangan.kapasitas,
				lokasi: tableRuangan.lokasi,
				kondisi: tableRuangan.kondisi,
				fasilitas: tableRuangan.fasilitas,
				catatan: tableRuangan.catatan,
				pemakaian: sql<number>`count(${tableJadwalRuangan.id})`
			})
			.from(tableRuangan)
			.leftJoin(tableJadwalRuangan, eq(tableRuangan.id, tableJadwalRuangan.ruanganId))
			.where(eq(tableRuangan.sekolahId, sekolahId))
			.groupBy(tableRuangan.id)
			.orderBy(asc(tableRuangan.kode)),
		academic.activeSemesterId
			? db
					.select({
						id: tableJadwalPelajaran.id,
						hari: tableJadwalPelajaran.hari,
						jamKe: tableJadwalPelajaran.jamKe,
						jamId: tableJadwalPelajaran.jamId,
						kode: tableJadwalPelajaran.kodeKegiatan,
						kelas: tableKelas.nama,
						mapel: tableJadwalMapel.nama,
						ruanganId: tableJadwalRuangan.ruanganId,
						ruangan: tableRuangan.nama
					})
					.from(tableJadwalPelajaran)
					.innerJoin(tableKelas, eq(tableJadwalPelajaran.kelasId, tableKelas.id))
					.leftJoin(tableJadwalMapel, eq(tableJadwalPelajaran.jadwalMapelId, tableJadwalMapel.id))
					.leftJoin(
						tableJadwalRuangan,
						eq(tableJadwalPelajaran.id, tableJadwalRuangan.jadwalPelajaranId)
					)
					.leftJoin(tableRuangan, eq(tableJadwalRuangan.ruanganId, tableRuangan.id))
					.where(
						and(
							eq(tableJadwalPelajaran.sekolahId, sekolahId),
							eq(tableJadwalPelajaran.semesterId, academic.activeSemesterId),
							eq(tableJadwalPelajaran.tipe, 'pelajaran')
						)
					)
					.orderBy(
						asc(tableJadwalPelajaran.hari),
						asc(tableJadwalPelajaran.jamKe),
						asc(tableKelas.nama)
					)
			: []
	]);
	return {
		meta: { title: 'Manajemen Ruangan' } satisfies PageMeta,
		rooms: rooms.map((item) => ({ ...item, pemakaian: Number(item.pemakaian) })),
		schedules,
		conditions: CONDITIONS,
		canManage: canManage(locals)
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		if (!canManage(locals)) return fail(403, { fail: 'Tidak memiliki izin mengelola ruangan.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const kode = value(form, 'kode');
		const nama = value(form, 'nama');
		if (!sekolahId || !kode || !nama)
			return fail(400, { fail: 'Kode dan nama ruangan wajib diisi.' });
		const kondisi = value(form, 'kondisi') as (typeof CONDITIONS)[number];
		if (!CONDITIONS.includes(kondisi)) return fail(400, { fail: 'Kondisi tidak valid.' });
		try {
			const [created] = await db
				.insert(tableRuangan)
				.values({
					sekolahId,
					kode,
					nama,
					jenis: value(form, 'jenis') || 'kelas',
					kapasitas: Number(value(form, 'kapasitas')) || null,
					lokasi: value(form, 'lokasi') || null,
					kondisi,
					fasilitas: value(form, 'fasilitas') || null,
					catatan: value(form, 'catatan') || null
				})
				.returning();
			await writeAuditLog({
				locals,
				request,
				action: 'create',
				entityType: 'ruangan',
				entityId: created.id,
				summary: `Ruangan ${kode} - ${nama} ditambahkan.`,
				after: created
			});
			return { message: 'Ruangan berhasil ditambahkan.' };
		} catch (error) {
			if (String(error).includes('UNIQUE'))
				return fail(409, { fail: 'Kode ruangan sudah digunakan.' });
			throw error;
		}
	},
	update: async ({ request, locals }) => {
		if (!canManage(locals)) return fail(403, { fail: 'Tidak memiliki izin mengelola ruangan.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = Number(form.get('id'));
		const before = sekolahId
			? await db.query.tableRuangan.findFirst({
					where: and(eq(tableRuangan.id, id), eq(tableRuangan.sekolahId, sekolahId))
				})
			: null;
		if (!before) return fail(404, { fail: 'Ruangan tidak ditemukan.' });
		const kondisi = value(form, 'kondisi') as (typeof CONDITIONS)[number];
		if (!CONDITIONS.includes(kondisi)) return fail(400, { fail: 'Kondisi tidak valid.' });
		const changes = {
			kode: value(form, 'kode'),
			nama: value(form, 'nama'),
			jenis: value(form, 'jenis') || 'kelas',
			kapasitas: Number(value(form, 'kapasitas')) || null,
			lokasi: value(form, 'lokasi') || null,
			kondisi,
			fasilitas: value(form, 'fasilitas') || null,
			catatan: value(form, 'catatan') || null,
			updatedAt: new Date().toISOString()
		};
		if (!changes.kode || !changes.nama) return fail(400, { fail: 'Kode dan nama wajib diisi.' });
		await db.update(tableRuangan).set(changes).where(eq(tableRuangan.id, id));
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'ruangan',
			entityId: id,
			summary: `Ruangan ${changes.kode} diperbarui.`,
			before,
			after: changes
		});
		return { message: 'Ruangan berhasil diperbarui.' };
	},
	assign: async ({ request, locals }) => {
		if (!canManage(locals)) return fail(403, { fail: 'Tidak memiliki izin menempatkan ruangan.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const jadwalId = Number(form.get('jadwalId'));
		const ruanganId = Number(form.get('ruanganId'));
		const schedule = sekolahId
			? await db.query.tableJadwalPelajaran.findFirst({
					where: and(
						eq(tableJadwalPelajaran.id, jadwalId),
						eq(tableJadwalPelajaran.sekolahId, sekolahId)
					)
				})
			: null;
		const room = sekolahId
			? await db.query.tableRuangan.findFirst({
					where: and(eq(tableRuangan.id, ruanganId), eq(tableRuangan.sekolahId, sekolahId))
				})
			: null;
		if (!schedule || !room || room.kondisi === 'tidak_aktif')
			return fail(400, { fail: 'Jadwal atau ruangan tidak valid.' });
		const conflict = await db
			.select({ id: tableJadwalPelajaran.id, kelas: tableKelas.nama })
			.from(tableJadwalRuangan)
			.innerJoin(
				tableJadwalPelajaran,
				eq(tableJadwalRuangan.jadwalPelajaranId, tableJadwalPelajaran.id)
			)
			.innerJoin(tableKelas, eq(tableJadwalPelajaran.kelasId, tableKelas.id))
			.where(
				and(
					eq(tableJadwalRuangan.ruanganId, ruanganId),
					eq(tableJadwalPelajaran.hari, schedule.hari),
					schedule.jamId
						? eq(tableJadwalPelajaran.jamId, schedule.jamId)
						: eq(tableJadwalPelajaran.jamKe, schedule.jamKe),
					ne(tableJadwalPelajaran.id, jadwalId)
				)
			)
			.limit(1);
		if (conflict[0])
			return fail(409, {
				fail: `Ruangan sudah dipakai kelas ${conflict[0].kelas} pada slot yang sama.`
			});
		await db
			.insert(tableJadwalRuangan)
			.values({ jadwalPelajaranId: jadwalId, ruanganId })
			.onConflictDoUpdate({
				target: tableJadwalRuangan.jadwalPelajaranId,
				set: { ruanganId, updatedAt: new Date().toISOString() }
			});
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'jadwal_ruangan',
			entityId: jadwalId,
			summary: `Jadwal ditempatkan di ${room.nama}.`,
			after: { jadwalId, ruanganId }
		});
		return { message: 'Penempatan ruangan berhasil disimpan.' };
	},
	delete: async ({ request, locals }) => {
		if (!canManage(locals)) return fail(403, { fail: 'Tidak memiliki izin.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number((await request.formData()).get('id'));
		const before = sekolahId
			? await db.query.tableRuangan.findFirst({
					where: and(eq(tableRuangan.id, id), eq(tableRuangan.sekolahId, sekolahId))
				})
			: null;
		if (!before) return fail(404, { fail: 'Ruangan tidak ditemukan.' });
		const used = await db.query.tableJadwalRuangan.findFirst({
			where: eq(tableJadwalRuangan.ruanganId, id)
		});
		if (used)
			return fail(409, {
				fail: 'Ruangan masih digunakan jadwal. Ubah kondisinya menjadi Tidak Aktif.'
			});
		await db.delete(tableRuangan).where(eq(tableRuangan.id, id));
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'ruangan',
			entityId: id,
			summary: `Ruangan ${before.kode} dihapus.`,
			before
		});
		return { message: 'Ruangan berhasil dihapus.' };
	}
};
