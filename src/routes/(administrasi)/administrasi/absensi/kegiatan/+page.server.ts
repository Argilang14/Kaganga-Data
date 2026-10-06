import {
	buildKelasAccessWhere,
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	resolveKelasId,
	todayLocalDate
} from '$lib/server/absensi-digital';
import {
	ABSENSI_KEGIATAN_STATUS_LABELS,
	ABSENSI_KEGIATAN_STATUSES,
	applyAutoAlfaKegiatan,
	canEditAbsensiKegiatan,
	loadKegiatanAbsensiOptions,
	parseAbsensiKegiatanStatus,
	requireAbsensiKegiatanAccess
} from '$lib/server/absensi-kegiatan';
import db from '$lib/server/db';
import { studentAccessCondition } from '$lib/server/student-access';
import { saveAttendance } from '$lib/server/attendance-mutation';
import { canAttendance, attendanceDateAllowed } from '$lib/attendance-access';
import {
	tableAbsensiKegiatan,
	tableKegiatanAbsensi,
	tableKelas,
	tableMurid
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

type AbsensiKegiatanRow = typeof tableAbsensiKegiatan.$inferSelect;

function emptySummary() {
	return Object.fromEntries(ABSENSI_KEGIATAN_STATUSES.map((status) => [status, 0])) as Record<
		(typeof ABSENSI_KEGIATAN_STATUSES)[number],
		number
	>;
}

export async function load({ locals, url }) {
	requireAbsensiKegiatanAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const tanggal = normalizeDateInput(url.searchParams.get('tanggal'));
	const requestedKelasId = parsePositiveInteger(url.searchParams.get('kelas_id'));
	const requestedKegiatanId = parsePositiveInteger(url.searchParams.get('kegiatan_id'));
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kegiatanList = await loadKegiatanAbsensiOptions(sekolahId, true, locals.user);
	const kegiatanId =
		requestedKegiatanId && kegiatanList.some((kegiatan) => kegiatan.id === requestedKegiatanId)
			? requestedKegiatanId
			: (kegiatanList[0]?.id ?? null);
	const selectedKegiatan = kegiatanList.find((kegiatan) => kegiatan.id === kegiatanId) ?? null;
	const canEditSelected = selectedKegiatan
		? canEditAbsensiKegiatan(locals.user, selectedKegiatan.aksesEdit, selectedKegiatan.kategori, {
				kode: selectedKegiatan.kode,
				tanggal
			}) && attendanceDateAllowed(locals.user, tanggal, todayLocalDate())
		: false;
	const kelasId = resolveKelasId(kelasList, requestedKelasId);

	if (!academic.activeSemesterId || !kelasId || !kegiatanId) {
		return {
			meta: { title: 'Catat Absensi' } satisfies PageMeta,
			tanggal,
			activeSemesterId: academic.activeSemesterId,
			kelasId,
			kelasList,
			kegiatanId,
			kegiatanList,
			selectedKegiatan,
			canEditSelected,
			rows: [],
			summary: emptySummary(),
			statusLabels: ABSENSI_KEGIATAN_STATUS_LABELS
		};
	}

	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true },
		where: and(
			await buildKelasAccessWhere(sekolahId, kelasId, locals.user),
			eq(tableKelas.semesterId, academic.activeSemesterId)
		)
	});
	if (!kelas) throw redirect(303, '/administrasi/absensi/kegiatan');

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true },
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
	const autoAlfaResult = canAttendance(locals.user, 'pengaturan')
		? await applyAutoAlfaKegiatan({
				sekolahId,
				semesterId: academic.activeSemesterId,
				kelasId,
				tanggal,
				kegiatanIds: [kegiatanId]
			})
		: { inserted: 0 };
	const absensiRows = muridIds.length
		? await db.query.tableAbsensiKegiatan.findMany({
				where: and(
					eq(tableAbsensiKegiatan.sekolahId, sekolahId),
					eq(tableAbsensiKegiatan.semesterId, academic.activeSemesterId),
					eq(tableAbsensiKegiatan.kelasId, kelasId),
					eq(tableAbsensiKegiatan.kegiatanId, kegiatanId),
					eq(tableAbsensiKegiatan.tanggal, tanggal),
					inArray(tableAbsensiKegiatan.muridId, muridIds)
				)
			})
		: [];

	const absensiByMurid = new Map<number, AbsensiKegiatanRow>();
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
		meta: { title: 'Catat Absensi' } satisfies PageMeta,
		tanggal,
		activeSemesterId: academic.activeSemesterId,
		kelasId,
		kelasList,
		kegiatanId,
		kegiatanList,
		selectedKegiatan,
		canEditSelected,
		rows,
		summary,
		autoAlfaInserted: autoAlfaResult.inserted,
		statusLabels: ABSENSI_KEGIATAN_STATUS_LABELS
	};
}

export const actions = {
	updateManual: async ({ request, locals }) => {
		requireAbsensiKegiatanAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const tanggal = normalizeDateInput(formData.get('tanggal')?.toString(), todayLocalDate());
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const kegiatanId = parsePositiveInteger(formData.get('kegiatanId'));
		const muridId = parsePositiveInteger(formData.get('muridId'));
		const status = parseAbsensiKegiatanStatus(formData.get('status'));
		const catatan = formData.get('catatan')?.toString().trim() || null;

		if (!kelasId || !semesterId || !kegiatanId || !muridId || !status) {
			return fail(400, { fail: 'Data absensi kegiatan tidak lengkap.' });
		}

		const kegiatan = await db.query.tableKegiatanAbsensi.findFirst({
			where: and(
				eq(tableKegiatanAbsensi.id, kegiatanId),
				eq(tableKegiatanAbsensi.sekolahId, sekolahId),
				eq(tableKegiatanAbsensi.aktif, true)
			)
		});
		if (!kegiatan) return fail(404, { fail: 'Kegiatan tidak ditemukan.' });
		if (
			!canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit, kegiatan.kategori, {
				kode: kegiatan.kode,
				tanggal
			})
		) {
			return fail(403, { fail: 'Anda tidak memiliki akses input kegiatan ini.' });
		}

		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(
				await buildKelasAccessWhere(sekolahId, kelasId, locals.user),
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
			kegiatanId,
			muridIds: [muridId],
			tanggal,
			status,
			catatan
		});

		return { message: 'Absensi kegiatan berhasil disimpan.' };
	},
	clearStatus: async ({ request, locals }) => {
		requireAbsensiKegiatanAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const tanggal = normalizeDateInput(formData.get('tanggal')?.toString(), todayLocalDate());
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const kegiatanId = parsePositiveInteger(formData.get('kegiatanId'));
		const muridId = parsePositiveInteger(formData.get('muridId'));

		if (!kelasId || !semesterId || !kegiatanId || !muridId) {
			return fail(400, { fail: 'Data absensi kegiatan tidak lengkap.' });
		}

		const kegiatan = await db.query.tableKegiatanAbsensi.findFirst({
			where: and(
				eq(tableKegiatanAbsensi.id, kegiatanId),
				eq(tableKegiatanAbsensi.sekolahId, sekolahId)
			)
		});
		if (!kegiatan) return fail(404, { fail: 'Kegiatan tidak ditemukan.' });
		if (
			!canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit, kegiatan.kategori, {
				kode: kegiatan.kode,
				tanggal
			})
		) {
			return fail(403, { fail: 'Anda tidak memiliki akses menghapus kegiatan ini.' });
		}

		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(
				await buildKelasAccessWhere(sekolahId, kelasId, locals.user),
				eq(tableKelas.semesterId, semesterId)
			)
		});
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		await saveAttendance({
			locals,
			request,
			semesterId,
			kelasId,
			kegiatanId,
			muridIds: [muridId],
			tanggal,
			status: null,
			catatan: formData.get('catatan')?.toString()
		});

		return { message: 'Status absensi kegiatan berhasil dihapus.' };
	},
	bulkUpdateManual: async ({ request, locals }) => {
		requireAbsensiKegiatanAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const tanggal = normalizeDateInput(formData.get('tanggal')?.toString(), todayLocalDate());
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		const semesterId = parsePositiveInteger(formData.get('semesterId'));
		const kegiatanId = parsePositiveInteger(formData.get('kegiatanId'));
		const status = parseAbsensiKegiatanStatus(formData.get('status'));
		const catatan = formData.get('catatan')?.toString().trim() || null;
		const onlyEmpty = formData.get('onlyEmpty') === 'on';

		if (!kelasId || !semesterId || !kegiatanId || !status) {
			return fail(400, { fail: 'Data input massal tidak lengkap.' });
		}

		const kegiatan = await db.query.tableKegiatanAbsensi.findFirst({
			where: and(
				eq(tableKegiatanAbsensi.id, kegiatanId),
				eq(tableKegiatanAbsensi.sekolahId, sekolahId),
				eq(tableKegiatanAbsensi.aktif, true)
			)
		});
		if (!kegiatan) return fail(404, { fail: 'Kegiatan tidak ditemukan.' });
		if (
			!canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit, kegiatan.kategori, {
				kode: kegiatan.kode,
				tanggal
			})
		) {
			return fail(403, { fail: 'Anda tidak memiliki akses input kegiatan ini.' });
		}

		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(
				await buildKelasAccessWhere(sekolahId, kelasId, locals.user),
				eq(tableKelas.semesterId, semesterId)
			)
		});
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const muridList = await db.query.tableMurid.findMany({
			columns: { id: true },
			where: and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, semesterId),
				eq(tableMurid.kelasId, kelasId),
				activeMuridFilter(),
				await studentAccessCondition(locals.user, sekolahId)
			)
		});
		const muridIds = muridList.map((murid) => murid.id);
		if (!muridIds.length) return fail(400, { fail: 'Tidak ada siswa pada kelas ini.' });

		const { affected } = await saveAttendance({
			locals,
			request,
			semesterId,
			kelasId,
			kegiatanId,
			muridIds,
			tanggal,
			status,
			catatan,
			onlyEmpty
		});

		return { message: `Input massal berhasil menyimpan ${affected} siswa.` };
	}
};
import { activeMuridFilter } from '$lib/server/murid-query';
