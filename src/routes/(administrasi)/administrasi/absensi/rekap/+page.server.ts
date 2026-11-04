import {
	ABSENSI_STATUSES,
	loadAbsensiKelasOptions,
	normalizeDateInput,
	parsePositiveInteger,
	requireAbsensiDigitalAccess,
	resolveKelasId,
	todayLocalDate
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { loadSchoolPermitRecap } from '$lib/server/attendance-permit-recap';
import { studentAccessCondition } from '$lib/server/attendance-student-access';
import { tableMurid } from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';

const STATUS_LABELS = {
	hadir: 'Hadir',
	terlambat: 'Terlambat',
	sakit: 'Sakit',
	izin: 'Izin',
	alfa: 'Alfa'
} as const;

function emptyCounts() {
	return Object.fromEntries(ABSENSI_STATUSES.map((status) => [status, 0])) as Record<
		(typeof ABSENSI_STATUSES)[number],
		number
	>;
}

export async function load({ locals, url }) {
	requireAbsensiDigitalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const today = todayLocalDate();
	const tanggalAwal = normalizeDateInput(url.searchParams.get('tanggal_awal'), today);
	const tanggalAkhir = normalizeDateInput(url.searchParams.get('tanggal_akhir'), tanggalAwal);
	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasId = resolveKelasId(kelasList, parsePositiveInteger(url.searchParams.get('kelas_id')));
	const muridId = parsePositiveInteger(url.searchParams.get('murid_id'));

	const muridList =
		academic.activeSemesterId && kelasId
			? await db.query.tableMurid.findMany({
					columns: { id: true, nama: true, kelasId: true },
					where: and(
						eq(tableMurid.sekolahId, sekolahId),
						eq(tableMurid.semesterId, academic.activeSemesterId),
						eq(tableMurid.kelasId, kelasId),
						await studentAccessCondition(locals.user, sekolahId)
					),
					orderBy: asc(tableMurid.nama)
				})
			: [];

	const selectedMuridIds = muridList.filter((m) => !muridId || m.id === muridId).map((m) => m.id);
	const schoolRecap = academic.activeSemesterId
		? await loadSchoolPermitRecap({
				schoolId: sekolahId,
				semesterId: academic.activeSemesterId,
				studentIds: selectedMuridIds,
				start: tanggalAwal,
				end: tanggalAkhir
			})
		: new Map();

	const rekapSiswa = muridList
		.filter((murid) => !muridId || murid.id === muridId)
		.map((murid) => ({
			id: murid.id,
			nama: murid.nama,
			counts: schoolRecap.get(murid.id)?.counts ?? emptyCounts(),
			permitRecap: schoolRecap.get(murid.id)
		}));

	const summary = emptyCounts();
	for (const item of rekapSiswa) {
		for (const status of ABSENSI_STATUSES) summary[status] += item.counts[status];
	}

	return {
		meta: { title: 'Rekap Absensi' } satisfies PageMeta,
		tanggalAwal,
		tanggalAkhir,
		kelasId,
		muridId,
		kelasList,
		muridList,
		summary,
		rekapSiswa,
		rekapKelas: kelasId
			? [{ kelas: kelasList.find((kelas) => kelas.id === kelasId)?.nama ?? '-', counts: summary }]
			: [],
		statusLabels: STATUS_LABELS
	};
}
