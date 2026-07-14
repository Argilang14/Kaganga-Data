import { error, redirect } from '@sveltejs/kit';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKalenderPendidikan, tableSemester, tableTahunAjaran } from '$lib/server/db/schema';
import {
	loadAbsensiKelasOptions,
	parsePositiveInteger,
	resolveKelasId
} from '$lib/server/absensi-digital';
import { requireJadwalAccess } from '$lib/server/jadwal';
import { fallbackTempat, formatTanggal } from '$lib/server/pdf/preview-utils';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

type KalenderJenis =
	| 'hari_efektif'
	| 'libur_nasional'
	| 'libur_sekolah'
	| 'ujian'
	| 'asesmen'
	| 'pembagian_rapor'
	| 'kegiatan_sekolah'
	| 'kegiatan_asrama'
	| 'lainnya';
type CanonicalJenjang = 'semua' | 'srd' | 'srmp' | 'srma';
type PeriodeMode = 'tahun_kalender' | 'tahun_ajaran' | 'semester_ganjil' | 'semester_genap';
type Orientation = 'landscape' | 'portrait';

const JENJANG_OPTIONS = ['semua', 'srd', 'srmp', 'srma'] as const;
const monthLabels = [
	'Januari',
	'Februari',
	'Maret',
	'April',
	'Mei',
	'Juni',
	'Juli',
	'Agustus',
	'September',
	'Oktober',
	'November',
	'Desember'
];

function parseJenjang(value: string | null): CanonicalJenjang {
	if (JENJANG_OPTIONS.includes(value as CanonicalJenjang)) return value as CanonicalJenjang;
	if (value === 'sd') return 'srd';
	if (value === 'smp') return 'srmp';
	if (value === 'sma') return 'srma';
	return 'semua';
}

function parsePeriodeMode(value: string | null): PeriodeMode {
	if (value === 'tahun_ajaran') return 'tahun_ajaran';
	if (value === 'semester_ganjil') return 'semester_ganjil';
	if (value === 'semester_genap') return 'semester_genap';
	return 'tahun_kalender';
}

function parseOrientation(value: string | null): Orientation {
	return value === 'portrait' ? 'portrait' : 'landscape';
}

function parseSemesterTipe(value?: string | null): 'ganjil' | 'genap' {
	if (value === 'genap') return 'genap';
	if (value === 'ganjil') return 'ganjil';
	return value?.toLowerCase().includes('genap') ? 'genap' : 'ganjil';
}

function academicYears(tahunAjaranNama?: string | null) {
	const match = tahunAjaranNama?.match(/(\d{4})\s*[/-]\s*(\d{4})/);
	if (match) return { start: Number(match[1]), end: Number(match[2]) };
	const current = new Date().getFullYear();
	return { start: current, end: current + 1 };
}

function resolvePeriodeRange(mode: PeriodeMode, tahunAjaranNama?: string | null) {
	const years = academicYears(tahunAjaranNama);
	if (mode === 'semester_ganjil') {
		return {
			mode,
			start: `${years.start}-07-01`,
			end: `${years.start}-12-31`,
			year: years.start,
			label: `Semester Ganjil ${years.start}/${years.end}`,
			months: [6, 7, 8, 9, 10, 11].map((month) => ({ year: years.start, month }))
		};
	}
	if (mode === 'semester_genap') {
		return {
			mode,
			start: `${years.end}-01-01`,
			end: `${years.end}-06-30`,
			year: years.end,
			label: `Semester Genap ${years.start}/${years.end}`,
			months: [0, 1, 2, 3, 4, 5].map((month) => ({ year: years.end, month }))
		};
	}
	if (mode === 'tahun_ajaran') {
		return {
			mode,
			start: `${years.start}-07-01`,
			end: `${years.end}-06-30`,
			year: years.end,
			label: `Tahun Ajaran ${years.start}/${years.end}`,
			months: [
				...[6, 7, 8, 9, 10, 11].map((month) => ({ year: years.start, month })),
				...[0, 1, 2, 3, 4, 5].map((month) => ({ year: years.end, month }))
			]
		};
	}
	return {
		mode,
		start: `${years.end}-01-01`,
		end: `${years.end}-12-31`,
		year: years.end,
		label: `Tahun Kalender ${years.end}`,
		months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((month) => ({
			year: years.end,
			month
		}))
	};
}

function dateValue(value: string) {
	return new Date(`${value}T00:00:00`).getTime();
}

function calendarWeeks(year: number, month: number) {
	const totalDays = new Date(year, month + 1, 0).getDate();
	const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
	const cells: Array<number | null> = [];
	for (let i = 0; i < firstDay; i += 1) cells.push(null);
	for (let day = 1; day <= totalDays; day += 1) cells.push(day);
	while (cells.length % 7 !== 0) cells.push(null);
	const weeks: Array<Array<number | null>> = [];
	for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
	return weeks;
}

function agendaForMonth(
	kalenderList: Array<{
		tanggalMulai: string;
		tanggalSelesai: string;
		judul?: string;
		warna?: string | null;
	}>,
	year: number,
	month: number
) {
	const start = new Date(year, month, 1).getTime();
	const end = new Date(year, month + 1, 0).getTime();
	return kalenderList.filter(
		(item) => dateValue(item.tanggalMulai) <= end && dateValue(item.tanggalSelesai) >= start
	);
}

function isLiburDate(
	kalenderList: Array<{ tanggalMulai: string; tanggalSelesai: string; jenis: KalenderJenis }>,
	date: Date
) {
	const value = date.toISOString().slice(0, 10);
	return kalenderList.some(
		(item) =>
			(item.jenis === 'libur_nasional' || item.jenis === 'libur_sekolah') &&
			item.tanggalMulai <= value &&
			item.tanggalSelesai >= value
	);
}

function buildMonths(
	periodeMonths: Array<{ year: number; month: number }>,
	kalenderList: Array<{ tanggalMulai: string; tanggalSelesai: string; jenis: KalenderJenis }>
) {
	return periodeMonths.map(({ year, month }) => {
		let hariEfektif = 0;
		const days = new Date(year, month + 1, 0).getDate();
		for (let day = 1; day <= days; day += 1) {
			const date = new Date(year, month, day);
			const weekDay = date.getDay();
			if (weekDay === 0 || weekDay === 6 || isLiburDate(kalenderList, date)) continue;
			hariEfektif += 1;
		}
		return {
			year,
			month,
			label: `${monthLabels[month]} ${year}`,
			weeks: calendarWeeks(year, month),
			agendas: agendaForMonth(kalenderList, year, month),
			hariEfektif
		};
	});
}

export type KalenderPendidikanPrintData = Awaited<
	ReturnType<typeof getKalenderPendidikanPreviewPayload>
>['kalenderPendidikanData'];

export async function getKalenderPendidikanPreviewPayload({
	locals,
	url
}: {
	locals: App.Locals;
	url: URL;
}) {
	requireJadwalAccess(locals.user);
	const sekolah = locals.sekolah;
	const sekolahId = sekolah?.id;
	if (!sekolahId || !sekolah || !locals.user) throw redirect(303, '/login');

	const academic = await resolveSekolahAcademicContext(sekolahId);
	const { kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const selectedTahunAjaranId =
		parsePositiveInteger(url.searchParams.get('tahun_ajaran_id')) ?? academic.activeTahunAjaranId;
	const selectedSemesterId = parsePositiveInteger(url.searchParams.get('semester_id'));
	const selectedKelasId = resolveKelasId(
		kelasList,
		parsePositiveInteger(url.searchParams.get('kelas_id'))
	);
	const selectedJenjang = parseJenjang(url.searchParams.get('jenjang'));
	const periodeMode = parsePeriodeMode(url.searchParams.get('periode_mode'));
	const orientation = parseOrientation(url.searchParams.get('orientation'));

	const selectedTahunAjaran = selectedTahunAjaranId
		? await db.query.tableTahunAjaran.findFirst({
				columns: { id: true, nama: true },
				where: and(
					eq(tableTahunAjaran.id, selectedTahunAjaranId),
					eq(tableTahunAjaran.sekolahId, sekolahId)
				)
			})
		: null;
	const periodeRange = resolvePeriodeRange(periodeMode, selectedTahunAjaran?.nama);

	const whereParts = [eq(tableKalenderPendidikan.sekolahId, sekolahId)];
	whereParts.push(
		or(
			selectedTahunAjaranId
				? eq(tableKalenderPendidikan.tahunAjaranId, selectedTahunAjaranId)
				: isNull(tableKalenderPendidikan.tahunAjaranId),
			and(
				lte(tableKalenderPendidikan.tanggalMulai, periodeRange.end),
				gte(tableKalenderPendidikan.tanggalSelesai, periodeRange.start)
			)
		)!
	);
	if (selectedSemesterId)
		whereParts.push(
			or(
				eq(tableKalenderPendidikan.semesterId, selectedSemesterId),
				isNull(tableKalenderPendidikan.semesterId)
			)!
		);
	if (selectedKelasId) {
		whereParts.push(
			or(
				eq(tableKalenderPendidikan.kelasId, selectedKelasId),
				isNull(tableKalenderPendidikan.kelasId)
			)!
		);
	} else if (locals.user.type === 'wali_kelas') {
		const kelasIds = kelasList.map((kelas) => kelas.id);
		whereParts.push(
			or(
				isNull(tableKalenderPendidikan.kelasId),
				kelasIds.length
					? inArray(tableKalenderPendidikan.kelasId, kelasIds)
					: eq(tableKalenderPendidikan.kelasId, -1)
			)!
		);
	}
	if (selectedJenjang === 'semua') {
		whereParts.push(eq(tableKalenderPendidikan.jenjang, 'semua'));
	} else {
		whereParts.push(
			inArray(tableKalenderPendidikan.jenjang, ['semua', selectedJenjang])
		);
	}

	const [kalenderList, semester] = await Promise.all([
		db.query.tableKalenderPendidikan.findMany({
			where: and(...whereParts),
			with: {
				kelas: { columns: { id: true, nama: true, fase: true } }
			},
			orderBy: [
				asc(tableKalenderPendidikan.tanggalMulai),
				asc(tableKalenderPendidikan.tanggalSelesai)
			]
		}),
		selectedSemesterId
			? db.query.tableSemester.findFirst({
					columns: { id: true, nama: true, tipe: true, tahunAjaranId: true },
					where: eq(tableSemester.id, selectedSemesterId)
				})
			: Promise.resolve(null)
	]);

	if (semester && selectedTahunAjaranId && semester.tahunAjaranId !== selectedTahunAjaranId) {
		throw error(400, 'Semester tidak sesuai dengan tahun ajaran yang dipilih.');
	}

	const semesterTipe = selectedSemesterId
		? parseSemesterTipe(semester?.tipe ?? semester?.nama ?? null)
		: null;
	const printPeriodeLabel = semester
		? `Semester ${semesterTipe === 'ganjil' ? 'Ganjil' : 'Genap'} Tahun Ajaran ${selectedTahunAjaran?.nama ?? '-'}`
		: `Tahun Ajaran ${selectedTahunAjaran?.nama ?? '-'}`;
	const months = buildMonths(periodeRange.months, kalenderList);
	const totalHariEfektif = months.reduce((sum, month) => sum + month.hariEfektif, 0);
	const totalMingguEfektif = Math.ceil(totalHariEfektif / 5);
	const jenjangLabel =
		selectedJenjang === 'semua'
			? 'Semua Jenjang'
			: selectedJenjang === 'srd'
				? 'SRD'
				: selectedJenjang === 'srmp'
					? 'SRMP'
					: 'SRMA';

	return {
		meta: { title: `Kalender Pendidikan - ${periodeRange.label}` },
		kalenderPendidikanData: {
			sekolah: {
				nama: sekolah.nama,
				kepalaSekolah: sekolah.kepalaSekolah
					? { nama: sekolah.kepalaSekolah.nama, nip: sekolah.kepalaSekolah.nip ?? '' }
					: null
			},
			orientation,
			periode: {
				tahunPelajaran: selectedTahunAjaran?.nama ?? '',
				semester: semester?.nama ?? '',
				calendarYear: periodeRange.year,
				mode: periodeMode,
				label: printPeriodeLabel,
				semesterTipe: semesterTipe ?? 'genap'
			},
			selectedJenjang,
			jenjangLabel,
			selectedKelas: selectedKelasId
				? (kelasList.find((kelas) => kelas.id === selectedKelasId) ?? null)
				: null,
			months,
			kalenderList,
			ttd: {
				tempat: fallbackTempat(sekolah),
				tanggal: formatTanggal(new Date())
			},
			summary: {
				totalAgenda: kalenderList.length,
				totalHariEfektif,
				totalMingguEfektif,
				totalLibur: kalenderList.filter(
					(item) => item.jenis === 'libur_nasional' || item.jenis === 'libur_sekolah'
				).length,
				totalAkademik: kalenderList.filter((item) =>
					['ujian', 'asesmen', 'pembagian_rapor'].includes(item.jenis)
				).length
			}
		}
	};
}
