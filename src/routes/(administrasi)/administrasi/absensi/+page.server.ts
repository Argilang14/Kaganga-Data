import {
	ABSENSI_STATUSES,
	buildKelasAccessWhere,
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parseAbsensiStatus,
	parsePositiveInteger,
	requireAbsensiDigitalAccess,
	resolveKelasId,
	todayLocalDate
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { studentAccessCondition } from '$lib/server/student-access';
import { saveAttendance } from '$lib/server/attendance-mutation';
import { canAttendance, canAttendActivity, attendanceDateAllowed } from '$lib/attendance-access';
import {
	tableAbsensiHarian,
	tableKehadiranMurid,
	tableKelas,
	tableMurid
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const STATUS_LABELS = {
	hadir: 'Hadir',
	terlambat: 'Terlambat',
	sakit: 'Sakit',
	izin: 'Izin',
	alfa: 'Alfa'
} as const;

type AbsensiRow = typeof tableAbsensiHarian.$inferSelect;

function emptySummary() {
	return Object.fromEntries(ABSENSI_STATUSES.map((status) => [status, 0])) as Record<
		(typeof ABSENSI_STATUSES)[number],
		number
	>;
}

export async function load({ locals, url }) {
	requireAbsensiDigitalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const tanggal = normalizeDateInput(url.searchParams.get('tanggal'));
	const access = {
		canEdit:
			canAttendActivity(locals.user, 'sekolah') &&
			attendanceDateAllowed(locals.user, tanggal, todayLocalDate()),
		canSyncRapor: canAttendance(locals.user, 'sinkron_rapor')
	};
	const requestedKelasId = parsePositiveInteger(url.searchParams.get('kelas_id'));
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasId = resolveKelasId(kelasList, requestedKelasId);

	if (!academic.activeSemesterId || !kelasId) {
		return {
			meta: { title: 'Absensi Hari Ini' } satisfies PageMeta,
			tanggal,
			activeSemesterId: academic.activeSemesterId,
			kelasId,
			kelasList,
			rows: [],
			summary: emptySummary(),
			statusLabels: STATUS_LABELS,
			...access
		};
	}

	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true },
		where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!kelas) throw redirect(303, '/administrasi/absensi');

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true, kelasId: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, academic.activeSemesterId),
			eq(tableMurid.kelasId, kelasId),
			activeMuridFilter(),
			await studentAccessCondition(locals.user, sekolahId)
		),
		orderBy: asc(tableMurid.nama)
	});

	const muridIds = muridList.map((murid) => murid.id);
	const absensiRows = muridIds.length
		? await db.query.tableAbsensiHarian.findMany({
				where: and(
					eq(tableAbsensiHarian.sekolahId, sekolahId),
					eq(tableAbsensiHarian.semesterId, academic.activeSemesterId),
					eq(tableAbsensiHarian.kelasId, kelasId),
					eq(tableAbsensiHarian.tanggal, tanggal),
					inArray(tableAbsensiHarian.muridId, muridIds)
				)
			})
		: [];

	const absensiByMurid = new Map<number, AbsensiRow>();
	for (const row of absensiRows) absensiByMurid.set(row.muridId, row);

	const summary = emptySummary();
	const rows = muridList.map((murid, index) => {
		const absensi = absensiByMurid.get(murid.id) ?? null;
		if (absensi) summary[absensi.status] += 1;
		return {
			no: index + 1,
			id: murid.id,
			nama: murid.nama,
			nis: murid.nis,
			nisn: murid.nisn,
			status: absensi?.status ?? null,
			metode: absensi?.metode ?? null,
			waktuScan: absensi?.waktuScan ?? null,
			catatan: absensi?.catatan ?? ''
		};
	});

	return {
		meta: { title: 'Absensi Hari Ini' } satisfies PageMeta,
		tanggal,
		activeSemesterId: academic.activeSemesterId,
		kelasId,
		kelasList,
		rows,
		summary,
		statusLabels: STATUS_LABELS,
		...access
	};
}

export const actions = {
	updateManual: async ({ request, locals }) => {
		requireAbsensiDigitalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const user = locals.user;

		const formData = await request.formData();
		const tanggal = normalizeDateInput(formData.get('tanggal')?.toString(), todayLocalDate());
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const muridId = parsePositiveInteger(formData.get('muridId'));
		const status = parseAbsensiStatus(formData.get('status'));
		const catatan = formData.get('catatan')?.toString().trim() || null;

		if (!kelasId || !semesterId || !muridId || !status) {
			return fail(400, { fail: 'Data absensi tidak lengkap.' });
		}

		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(
				await buildKelasAccessWhere(sekolahId, kelasId, user),
				eq(tableKelas.semesterId, semesterId)
			)
		});
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const murid = await db.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(
				eq(tableMurid.id, muridId),
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, semesterId),
				eq(tableMurid.kelasId, kelasId),
				activeMuridFilter(),
				await studentAccessCondition(locals.user, sekolahId)
			)
		});
		if (!murid) return fail(404, { fail: 'Siswa tidak ditemukan di sekolah aktif.' });

		await saveAttendance({
			locals,
			request,
			semesterId,
			kelasId,
			muridIds: [muridId],
			tanggal,
			status,
			catatan
		});

		return { message: 'Absensi manual berhasil disimpan.' };
	},
	clearStatus: async ({ request, locals }) => {
		requireAbsensiDigitalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const user = locals.user;

		const formData = await request.formData();
		const tanggal = normalizeDateInput(formData.get('tanggal')?.toString(), todayLocalDate());
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const muridId = parsePositiveInteger(formData.get('muridId'));

		if (!kelasId || !semesterId || !muridId) {
			return fail(400, { fail: 'Data absensi tidak lengkap.' });
		}

		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(
				await buildKelasAccessWhere(sekolahId, kelasId, user),
				eq(tableKelas.semesterId, semesterId)
			)
		});
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		await saveAttendance({
			locals,
			request,
			semesterId,
			kelasId,
			muridIds: [muridId],
			tanggal,
			status: null,
			catatan: formData.get('catatan')?.toString()
		});

		return { message: 'Status absensi berhasil dihapus.' };
	},
	syncRapor: async ({ request, locals }) => {
		requireAbsensiDigitalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sekolah aktif tidak ditemukan.' });
		const user = locals.user;

		const formData = await request.formData();
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		if (!semesterId) return fail(400, { fail: 'Semester aktif belum tersedia.' });
		if (kelasId) {
			const kelas = await db.query.tableKelas.findFirst({
				columns: { id: true },
				where: and(
					await buildKelasAccessWhere(sekolahId, kelasId, user),
					eq(tableKelas.semesterId, semesterId)
				)
			});
			if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });
		}

		const muridRows = await db.query.tableMurid.findMany({
			columns: { id: true },
			where: and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, semesterId),
				kelasId ? eq(tableMurid.kelasId, kelasId) : undefined,
				activeMuridFilter(),
				await studentAccessCondition(locals.user, sekolahId)
			)
		});
		const muridIds = muridRows.map((murid) => murid.id);
		if (!muridIds.length) return { message: 'Tidak ada siswa untuk disinkronkan.' };

		const recapRows = await db
			.select({
				muridId: tableAbsensiHarian.muridId,
				sakit: sql<number>`sum(case when ${tableAbsensiHarian.status} = 'sakit' then 1 else 0 end)`,
				izin: sql<number>`sum(case when ${tableAbsensiHarian.status} = 'izin' then 1 else 0 end)`,
				alfa: sql<number>`sum(case when ${tableAbsensiHarian.status} = 'alfa' then 1 else 0 end)`
			})
			.from(tableAbsensiHarian)
			.where(
				and(
					eq(tableAbsensiHarian.sekolahId, sekolahId),
					eq(tableAbsensiHarian.semesterId, semesterId),
					inArray(tableAbsensiHarian.muridId, muridIds)
				)
			)
			.groupBy(tableAbsensiHarian.muridId);

		const recapByMurid = new Map(recapRows.map((row) => [row.muridId, row]));
		const now = new Date().toISOString();
		for (const muridId of muridIds) {
			const recap = recapByMurid.get(muridId);
			const existing = await db.query.tableKehadiranMurid.findFirst({
				columns: { id: true },
				where: eq(tableKehadiranMurid.muridId, muridId)
			});
			const values = {
				sakit: Number(recap?.sakit ?? 0),
				izin: Number(recap?.izin ?? 0),
				alfa: Number(recap?.alfa ?? 0),
				updatedAt: now
			};
			if (existing) {
				await db
					.update(tableKehadiranMurid)
					.set(values)
					.where(eq(tableKehadiranMurid.id, existing.id));
			} else {
				await db.insert(tableKehadiranMurid).values({
					muridId,
					...values,
					createdAt: now
				});
			}
		}

		return { message: 'Kehadiran rapor berhasil disinkronkan dari absensi digital.' };
	}
};
import { activeMuridFilter } from '$lib/server/murid-query';
