import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureLongTermFoundationSchema } from '$lib/server/db/ensure-long-term-foundation';
import {
	tableJadwalJam,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableJadwalPreferensiGuru,
	tableJadwalTargetJp,
	tableKelas,
	tablePegawai
} from '$lib/server/db/schema';
import { buildScheduleRecommendations } from '$lib/server/jadwal-recommendation';
import { inferKelasJadwalJenjang } from '$lib/server/jadwal';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { authority } from '../../pengguna/utils.server';

const canPreferences = (locals: App.Locals) =>
	locals.user?.type === 'admin' ||
	locals.user?.permissions?.includes('penjadwalan_preferensi') === true;
export async function load({ locals }) {
	authority('penjadwalan_rekomendasi', 'penjadwalan_preferensi');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureLongTermFoundationSchema();
	const academic = await resolveSekolahAcademicContext(sekolahId);
	if (!academic.activeSemesterId)
		return {
			meta: { title: 'Rekomendasi Jadwal' } satisfies PageMeta,
			proposals: [],
			unresolved: [],
			teachers: [],
			preferences: [],
			context: null,
			canPreferences: canPreferences(locals)
		};
	const kind = academic.activeSemesterTipe === 'genap' ? 'genap' : 'ganjil';
	const [classRows, subjects, targetRows, slotRows, entryRows, preferences, teachers] =
		await Promise.all([
			db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				where: and(
					eq(tableKelas.sekolahId, sekolahId),
					eq(tableKelas.semesterId, academic.activeSemesterId)
				),
				orderBy: asc(tableKelas.nama)
			}),
			db.query.tableJadwalMapel.findMany({
				columns: {
					id: true,
					kode: true,
					nama: true,
					jenjang: true,
					jpPerMinggu: true,
					guruPegawaiId: true
				},
				where: and(eq(tableJadwalMapel.sekolahId, sekolahId), eq(tableJadwalMapel.aktif, true))
			}),
			academic.activeTahunAjaranId
				? db.query.tableJadwalTargetJp.findMany({
						where: and(
							eq(tableJadwalTargetJp.sekolahId, sekolahId),
							eq(tableJadwalTargetJp.tahunAjaranId, academic.activeTahunAjaranId),
							eq(tableJadwalTargetJp.jenis, kind)
						)
					})
				: [],
			db.query.tableJadwalJam.findMany({
				columns: { hari: true, jamKe: true, jenjang: true },
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.aktif, true),
					eq(tableJadwalJam.tipe, 'pelajaran')
				),
				orderBy: [asc(tableJadwalJam.hari), asc(tableJadwalJam.jamKe)]
			}),
			db.query.tableJadwalPelajaran.findMany({
				columns: {
					kelasId: true,
					hari: true,
					jamKe: true,
					kodeKegiatan: true,
					guruPegawaiId: true
				},
				where: and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.semesterId, academic.activeSemesterId)
				)
			}),
			db.query.tableJadwalPreferensiGuru.findMany({
				where: and(
					eq(tableJadwalPreferensiGuru.sekolahId, sekolahId),
					eq(tableJadwalPreferensiGuru.tersedia, false)
				)
			}),
			db.query.tablePegawai.findMany({
				columns: { id: true, nama: true },
				where: and(
					eq(tablePegawai.sekolahId, sekolahId),
					eq(tablePegawai.status, 'aktif'),
					inArray(tablePegawai.jenis, ['guru', 'kepala_sekolah'])
				),
				orderBy: asc(tablePegawai.nama)
			})
		]);
	const classes = classRows.map((item) => ({ ...item, jenjang: inferKelasJadwalJenjang(item) }));
	const targetMap = new Map(
		targetRows.map((item) => [`${item.kelasId}|${item.jadwalMapelId}`, item.jpPerMinggu])
	);
	const result = buildScheduleRecommendations({
		classes,
		subjects: classes.flatMap((kelas) =>
			subjects.map((subject) => ({
				...subject,
				target: targetMap.get(`${kelas.id}|${subject.id}`) ?? subject.jpPerMinggu,
				kelasId: kelas.id
			}))
		),
		slots: [
			...new Map(
				slotRows.map((item) => [`${item.jenjang}|${item.hari}|${item.jamKe}`, item])
			).values()
		],
		entries: entryRows.map((item) => ({ ...item, kode: item.kodeKegiatan })),
		unavailable: preferences
	});
	return {
		meta: { title: 'Rekomendasi Jadwal' } satisfies PageMeta,
		...result,
		teachers,
		preferences,
		context: {
			semester: academic.activeSemesterTipe,
			tahunAjaran:
				academic.tahunAjaranList.find((item) => item.id === academic.activeTahunAjaranId)?.nama ??
				'-'
		},
		canPreferences: canPreferences(locals)
	};
}
export const actions = {
	savePreference: async ({ request, locals }) => {
		if (!canPreferences(locals))
			return fail(403, { fail: 'Tidak memiliki izin mengelola preferensi.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const pegawaiId = Number(form.get('pegawaiId'));
		const hari = String(form.get('hari') ?? '');
		const jamKe = Number(form.get('jamKe'));
		if (!sekolahId || !pegawaiId || !hari || !jamKe)
			return fail(400, { fail: 'Guru, hari, dan jam wajib diisi.' });
		const employee = await db.query.tablePegawai.findFirst({
			where: and(eq(tablePegawai.id, pegawaiId), eq(tablePegawai.sekolahId, sekolahId))
		});
		if (!employee) return fail(404, { fail: 'Guru tidak ditemukan.' });
		await db
			.insert(tableJadwalPreferensiGuru)
			.values({
				sekolahId,
				pegawaiId,
				hari,
				jamKe,
				tersedia: false,
				catatan: String(form.get('catatan') ?? '').trim() || null
			})
			.onConflictDoUpdate({
				target: [
					tableJadwalPreferensiGuru.sekolahId,
					tableJadwalPreferensiGuru.pegawaiId,
					tableJadwalPreferensiGuru.hari,
					tableJadwalPreferensiGuru.jamKe
				],
				set: {
					tersedia: false,
					catatan: String(form.get('catatan') ?? '').trim() || null,
					updatedAt: new Date().toISOString()
				}
			});
		return { message: 'Waktu tidak tersedia berhasil disimpan.' };
	},
	deletePreference: async ({ request, locals }) => {
		if (!canPreferences(locals)) return fail(403, { fail: 'Tidak memiliki izin.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number((await request.formData()).get('id'));
		await db
			.delete(tableJadwalPreferensiGuru)
			.where(
				and(
					eq(tableJadwalPreferensiGuru.id, id),
					eq(tableJadwalPreferensiGuru.sekolahId, sekolahId!)
				)
			);
		return { message: 'Preferensi berhasil dihapus.' };
	}
};
