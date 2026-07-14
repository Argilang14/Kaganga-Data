import { error, redirect } from '@sveltejs/kit';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableJadwalPelajaran,
	tableJadwalMapel,
	tableKokurikuler,
	tablePegawai,
	tableSekolah
} from '$lib/server/db/schema';
import { loadAbsensiKelasOptions } from '$lib/server/absensi-digital';
import {
	ensureDefaultJadwalFoundation,
	JADWAL_HARI_LABELS,
	loadJadwalJam,
	loadJadwalKegiatan,
	requireJadwalAccess
} from '$lib/server/jadwal';
import { and, asc, eq, inArray } from 'drizzle-orm';

type JenjangFilter = 'semua' | 'srd' | 'srmp' | 'srma';
type Orientation = 'landscape' | 'portrait';

const JENJANG_OPTIONS = ['semua', 'srd', 'srmp', 'srma'] as const;

function parseJenjangFilter(value: string | null): JenjangFilter {
	return JENJANG_OPTIONS.includes(value as JenjangFilter) ? (value as JenjangFilter) : 'semua';
}

function parseOrientation(value: string | null): Orientation {
	return value === 'portrait' ? 'portrait' : 'landscape';
}

function inferJenjangKelas(nama: string, fase?: string | null): Exclude<JenjangFilter, 'semua'> {
	const normalizedFase = (fase ?? '')
		.trim()
		.toLowerCase()
		.replace(/^fase\s+/, '');
	if (normalizedFase === 'a' || normalizedFase === 'b' || normalizedFase === 'c') return 'srd';
	if (normalizedFase === 'd') return 'srmp';
	if (normalizedFase === 'e' || normalizedFase === 'f') return 'srma';

	const match = nama.match(/\d+/);
	const tingkat = match ? Number.parseInt(match[0], 10) : null;
	if (tingkat && tingkat >= 1 && tingkat <= 6) return 'srd';
	if (tingkat && tingkat >= 7 && tingkat <= 9) return 'srmp';
	return 'srma';
}

function formatTahunSemester(academic: Awaited<ReturnType<typeof resolveSekolahAcademicContext>>) {
	const tahun = academic.tahunAjaranList.find((item) => item.id === academic.activeTahunAjaranId);
	const semester = tahun?.semester.find((item) => item.id === academic.activeSemesterId);
	return {
		tahunPelajaran: tahun?.nama ?? '',
		semester: semester?.nama ?? semester?.tipe ?? ''
	};
}

function displayKokurikuler(tujuan: string) {
	return tujuan.length > 24 ? tujuan.slice(0, 24).trimEnd() + '...' : tujuan;
}

function formatTanggalCetak(date = new Date()) {
	return new Intl.DateTimeFormat('id-ID', {
		day: '2-digit',
		month: 'long',
		year: 'numeric',
		timeZone: 'Asia/Jakarta'
	}).format(date);
}

export type JadwalPelajaranPrintData = Awaited<
	ReturnType<typeof getJadwalPelajaranPreviewPayload>
>['jadwalPelajaranData'];

export async function getJadwalPelajaranPreviewPayload({
	locals,
	url
}: {
	locals: App.Locals;
	url: URL;
}) {
	requireJadwalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const academic = await resolveSekolahAcademicContext(sekolahId);
	if (!academic.activeSemesterId) throw error(400, 'Semester aktif belum tersedia.');
	await ensureDefaultJadwalFoundation(sekolahId, {
		tahunAjaranId: academic.activeTahunAjaranId,
		semesterId: academic.activeSemesterId
	});

	const selectedJenjang = parseJenjangFilter(url.searchParams.get('jenjang'));
	const orientation = parseOrientation(url.searchParams.get('orientation'));
	const { kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasListWithJenjang = kelasList.map((kelas) => ({
		...kelas,
		jenjang: inferJenjangKelas(kelas.nama, kelas.fase)
	}));
	const selectedKelasList =
		selectedJenjang === 'semua'
			? kelasListWithJenjang
			: kelasListWithJenjang.filter((kelas) => kelas.jenjang === selectedJenjang);
	const kelasIds = selectedKelasList.map((kelas) => kelas.id);
	const visibleJenjangList = Array.from(new Set(selectedKelasList.map((kelas) => kelas.jenjang)));
	const jamJenjangFilter = selectedJenjang === 'semua' ? null : selectedJenjang;

	const [sekolah, jamListRaw, jadwalList, mapelList, kokurikulerList, kegiatanList, guruList] =
		await Promise.all([
			db.query.tableSekolah.findFirst({
				where: eq(tableSekolah.id, sekolahId),
				columns: {
					id: true,
					nama: true,
					lokasiTandaTangan: true,
					statusKepalaSekolah: true
				},
				with: {
					kepalaSekolah: {
						columns: { nama: true, nip: true }
					}
				}
			}),
			loadJadwalJam(sekolahId, jamJenjangFilter),
			kelasIds.length
				? db.query.tableJadwalPelajaran.findMany({
						where: and(
							eq(tableJadwalPelajaran.sekolahId, sekolahId),
							eq(tableJadwalPelajaran.semesterId, academic.activeSemesterId),
							inArray(tableJadwalPelajaran.kelasId, kelasIds)
						)
					})
				: [],
			db.query.tableJadwalMapel.findMany({
				columns: { id: true, nama: true, kode: true, jenjang: true, guruPegawaiId: true },
				where: and(
					eq(tableJadwalMapel.sekolahId, sekolahId),
					selectedJenjang === 'semua'
						? inArray(tableJadwalMapel.jenjang, ['semua', 'srd', 'srmp', 'srma'])
						: inArray(tableJadwalMapel.jenjang, ['semua', selectedJenjang])
				),
				orderBy: asc(tableJadwalMapel.nama)
			}),
			kelasIds.length
				? db.query.tableKokurikuler.findMany({
						columns: { id: true, kelasId: true, kode: true, tujuan: true },
						where: inArray(tableKokurikuler.kelasId, kelasIds),
						orderBy: asc(tableKokurikuler.kode)
					})
				: [],
			loadJadwalKegiatan(sekolahId),
			db.query.tablePegawai.findMany({
				columns: { id: true, nama: true },
				where: eq(tablePegawai.sekolahId, sekolahId),
				orderBy: asc(tablePegawai.nama)
			})
		]);

	const mapelById = new Map(mapelList.map((item) => [item.id, item]));
	const kokurikulerById = new Map(kokurikulerList.map((item) => [item.id, item]));
	const kegiatanById = new Map(kegiatanList.map((item) => [item.id, item]));
	const guruById = new Map(guruList.map((item) => [item.id, item]));
	const jadwalBySlot = new Map(jadwalList.map((item) => [`${item.kelasId}:${item.jamId}`, item]));
	const jamList = jamListRaw
		.filter(
			(jam) =>
				jam.aktif && (selectedJenjang !== 'semua' || visibleJenjangList.includes(jam.jenjang))
		)
		.map((jam) => ({
			id: jam.id,
			hari: jam.hari,
			jamKe: jam.jamKe,
			label: jam.label,
			jenjang: jam.jenjang,
			pukulMulai: jam.pukulMulai,
			pukulSelesai: jam.pukulSelesai,
			tipe: jam.tipe,
			namaDefault: jam.namaDefault
		}));
	const cells = selectedKelasList.flatMap((kelas) =>
		jamList
			.filter((jam) => jam.jenjang === kelas.jenjang)
			.map((jam) => {
				const jadwal = jadwalBySlot.get(`${kelas.id}:${jam.id}`);
				const mapel = jadwal?.jadwalMapelId ? mapelById.get(jadwal.jadwalMapelId) : null;
				const kokurikuler = jadwal?.kokurikulerId
					? kokurikulerById.get(jadwal.kokurikulerId)
					: null;
				const kegiatan = jadwal?.kegiatanId ? kegiatanById.get(jadwal.kegiatanId) : null;
				const guruId = jadwal?.guruPegawaiId ?? mapel?.guruPegawaiId ?? null;
				const guru = guruId ? guruById.get(guruId) : null;
				const label =
					mapel?.kode ||
					mapel?.nama ||
					kokurikuler?.kode ||
					(kokurikuler ? displayKokurikuler(kokurikuler.tujuan) : '') ||
					kegiatan?.nama ||
					jam.namaDefault ||
					jadwal?.catatan ||
					'';

				return {
					kelasId: kelas.id,
					jamId: jam.id,
					hari: jam.hari,
					tipe: jadwal?.tipe ?? jam.tipe,
					label,
					mapelKode: mapel?.kode ?? '',
					mapelNama: mapel?.nama ?? '',
					guru: guru?.nama ?? '',
					catatan: jadwal?.catatan ?? ''
				};
			})
	);
	const period = formatTahunSemester(academic);
	const jenjangLabel =
		selectedJenjang === 'semua'
			? 'Semua Jenjang'
			: selectedJenjang === 'srd'
				? 'SRD'
				: selectedJenjang === 'srmp'
					? 'SRMP'
					: 'SRMA';

	return {
		meta: { title: `Jadwal Pelajaran - ${jenjangLabel}` },
		jadwalPelajaranData: {
			sekolah: {
				nama: sekolah?.nama ?? locals.sekolah?.nama ?? 'Sekolah',
				lokasiTandaTangan: sekolah?.lokasiTandaTangan ?? '',
				kepalaSekolah: {
					nama: sekolah?.kepalaSekolah?.nama ?? '',
					nip: sekolah?.kepalaSekolah?.nip ?? '',
					status: sekolah?.statusKepalaSekolah ?? 'definitif'
				}
			},
			periode: period,
			tanggalCetak: formatTanggalCetak(),
			orientation,
			selectedJenjang,
			jenjangLabel,
			hariLabels: JADWAL_HARI_LABELS,
			kelasList: selectedKelasList.map((kelas) => ({
				id: kelas.id,
				nama: kelas.nama,
				fase: kelas.fase,
				jenjang: kelas.jenjang
			})),
			jamList,
			cells
		}
	};
}
