import { error, redirect } from '@sveltejs/kit';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableJadwalJam,
	tableJadwalKegiatan,
	tableJadwalMapel,
	tableJadwalPelajaran,
	tableJadwalTemplate,
	tableKelas,
	tablePegawai,
	tableSekolah
} from '$lib/server/db/schema';
import {
	ensureDefaultJadwalFoundation,
	ensureJadwalPelajaranTemplate,
	inferKelasJadwalJenjang,
	JADWAL_HARI_LABELS,
	JADWAL_JENIS_LABELS,
	JADWAL_JENJANG,
	JADWAL_JENJANG_LABELS,
	mapelSesuaiJenjang,
	requireJadwalAccess,
	selectJadwalContext,
	type JadwalJenjang
} from '$lib/server/jadwal';
import {
	formatTanggal,
	getLogoDinasSrc,
	getLogoSrc,
	optionalInteger,
	resolveWakaKurikulumSignature
} from '$lib/server/pdf/preview-utils';
import { and, asc, eq, inArray } from 'drizzle-orm';

type JenjangFilter = 'semua' | JadwalJenjang;
type Orientation = 'landscape' | 'portrait';

const AGAMA_MAPEL_NAMES = new Set([
	'Pendidikan Agama dan Budi Pekerti',
	'Pendidikan Agama Islam dan Budi Pekerti',
	'Pendidikan Agama Kristen dan Budi Pekerti',
	'Pendidikan Agama Katolik dan Budi Pekerti',
	'Pendidikan Agama Buddha dan Budi Pekerti',
	'Pendidikan Agama Hindu dan Budi Pekerti',
	'Pendidikan Agama Konghuchu dan Budi Pekerti'
]);

function parseJenjang(value: string | null): JenjangFilter {
	return value === 'srd' || value === 'srmp' || value === 'srma' ? value : 'semua';
}

function parseOrientation(value: string | null): Orientation {
	return value === 'portrait' ? 'portrait' : 'landscape';
}

function normalizeKode(value?: string | null) {
	return value?.trim().toUpperCase() ?? '';
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
	const context = selectJadwalContext(academic, {
		tahunAjaranId: url.searchParams.get('tahun_ajaran_id'),
		jenis: url.searchParams.get('jenis')
	});
	if (!context.tahunAjaranId) throw error(400, 'Tahun ajaran belum tersedia.');

	const selectedJenjang = parseJenjang(url.searchParams.get('jenjang'));
	const orientation = parseOrientation(url.searchParams.get('orientation'));
	const wakaKurikulumPegawaiId = optionalInteger(
		'waka_kurikulum_pegawai_id',
		url.searchParams.get('waka_kurikulum_pegawai_id')
	);
	const selectedYear = academic.tahunAjaranList.find((item) => item.id === context.tahunAjaranId);
	const classSemesterId =
		context.semesterId ?? selectedYear?.semester.find((item) => item.tipe === 'ganjil')?.id ?? null;
	const scheduleTemplate = await ensureJadwalPelajaranTemplate(sekolahId, context);

	await Promise.all(
		JADWAL_JENJANG.map((jenjang) =>
			ensureDefaultJadwalFoundation(sekolahId, { ...context, jenjang })
		)
	);

	const settingTemplates = await db.query.tableJadwalTemplate.findMany({
		columns: { id: true },
		where: and(
			eq(tableJadwalTemplate.sekolahId, sekolahId),
			eq(tableJadwalTemplate.tahunAjaranId, context.tahunAjaranId),
			eq(tableJadwalTemplate.jenis, context.jenis)
		)
	});
	const templateIds = settingTemplates.map((item) => item.id);

	const [sekolah, kelasRows, jadwalRows, jamRows, mapelRows, kegiatanRows, guruRows] =
		await Promise.all([
			db.query.tableSekolah.findFirst({
				where: eq(tableSekolah.id, sekolahId),
				columns: {
					nama: true,
					lokasiTandaTangan: true,
					statusKepalaSekolah: true
				},
				with: { kepalaSekolah: { columns: { nama: true, nip: true } } }
			}),
			db.query.tableKelas.findMany({
				where: classSemesterId
					? and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, classSemesterId))
					: eq(tableKelas.sekolahId, sekolahId),
				columns: { id: true, nama: true, fase: true },
				orderBy: [asc(tableKelas.nama)]
			}),
			db.query.tableJadwalPelajaran.findMany({
				where: and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.templateId, scheduleTemplate.id)
				),
				orderBy: [asc(tableJadwalPelajaran.hari), asc(tableJadwalPelajaran.jamKe)]
			}),
			templateIds.length
				? db.query.tableJadwalJam.findMany({
						where: and(
							eq(tableJadwalJam.sekolahId, sekolahId),
							inArray(tableJadwalJam.templateId, templateIds)
						),
						orderBy: [asc(tableJadwalJam.urutan), asc(tableJadwalJam.jamKe)]
					})
				: [],
			db.query.tableJadwalMapel.findMany({
				where: eq(tableJadwalMapel.sekolahId, sekolahId),
				orderBy: [asc(tableJadwalMapel.nama)]
			}),
			db.query.tableJadwalKegiatan.findMany({
				where: eq(tableJadwalKegiatan.sekolahId, sekolahId),
				orderBy: [asc(tableJadwalKegiatan.nama)]
			}),
			db.query.tablePegawai.findMany({
				columns: { id: true, nama: true },
				where: eq(tablePegawai.sekolahId, sekolahId)
			})
		]);

	const kelasList = kelasRows
		.map((kelas) => ({ ...kelas, jenjang: inferKelasJadwalJenjang(kelas) }))
		.filter((kelas) => selectedJenjang === 'semua' || kelas.jenjang === selectedJenjang);
	const kelasIds = new Set(kelasList.map((kelas) => kelas.id));
	const visibleJenjang = new Set(kelasList.map((kelas) => kelas.jenjang));
	const jadwalList = jadwalRows.filter((item) => kelasIds.has(item.kelasId));
	const jadwalBySlot = new Map(
		jadwalList.map((item) => [item.kelasId + '|' + item.hari + '|' + item.jamKe, item])
	);
	const guruById = new Map(guruRows.map((item) => [item.id, item.nama]));
	const kegiatanByKode = new Map(
		kegiatanRows.filter((item) => item.aktif).map((item) => [normalizeKode(item.kode), item])
	);
	const mapelByKode = new Map<string, typeof mapelRows>();
	for (const mapel of mapelRows) {
		if (!mapel.aktif || !mapel.kode) continue;
		const kode = AGAMA_MAPEL_NAMES.has(mapel.nama) ? 'PAPB' : normalizeKode(mapel.kode);
		const group = mapelByKode.get(kode) ?? [];
		group.push(mapel);
		mapelByKode.set(kode, group);
	}

	const jamMap = new Map<string, (typeof jamRows)[number]>();
	for (const jam of jamRows) {
		if (!jam.aktif || !visibleJenjang.has(jam.jenjang)) continue;
		const key = jam.jenjang + '|' + jam.hari + '|' + jam.jamKe;
		if (!jamMap.has(key)) jamMap.set(key, jam);
	}
	const jamList = Array.from(jamMap.values()).sort(
		(a, b) =>
			Object.keys(JADWAL_HARI_LABELS).indexOf(a.hari) -
				Object.keys(JADWAL_HARI_LABELS).indexOf(b.hari) ||
			a.jamKe - b.jamKe ||
			a.jenjang.localeCompare(b.jenjang)
	);

	const cells = kelasList.flatMap((kelas) =>
		jamList
			.filter((jam) => jam.jenjang === kelas.jenjang)
			.map((jam) => {
				const jadwal = jadwalBySlot.get(kelas.id + '|' + jam.hari + '|' + jam.jamKe);
				const kode = normalizeKode(jadwal?.kodeKegiatan);
				const mapelCandidates = (mapelByKode.get(kode) ?? []).filter((item) =>
					mapelSesuaiJenjang(item.jenjang, kelas.jenjang)
				);
				const mapel =
					mapelCandidates.find((item) => item.id === jadwal?.jadwalMapelId) ??
					(mapelCandidates.length === 1 ? mapelCandidates[0] : null);
				const kegiatan = kegiatanByKode.get(kode);
				const guruId = jadwal?.guruPegawaiId ?? mapel?.guruPegawaiId ?? null;
				const tipe = mapel
					? 'pelajaran'
					: kegiatan?.kategori === 'istirahat'
						? 'istirahat'
						: kegiatan
							? 'kegiatan'
							: jam.tipe;
				return {
					kelasId: kelas.id,
					jamId: jam.id,
					jamKe: jam.jamKe,
					hari: jam.hari,
					tipe,
					label: kode || jam.namaDefault || '',
					mapelKode: mapel ? kode : '',
					mapelNama: mapel?.nama ?? '',
					guru: guruId ? guruById.get(guruId) ?? '' : '',
					catatan: jadwal?.catatan ?? '',
					warna: mapel?.warna ?? kegiatan?.warna ?? null
				};
			})
	);

	const jenjangLabel =
		selectedJenjang === 'semua' ? 'Semua Jenjang' : JADWAL_JENJANG_LABELS[selectedJenjang];
	const [logoUrl, logoDinasUrl, wakaKurikulum] = await Promise.all([
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId),
		resolveWakaKurikulumSignature(sekolahId, wakaKurikulumPegawaiId)
	]);

	return {
		meta: { title: 'Jadwal Pelajaran - ' + jenjangLabel },
		jadwalPelajaranData: {
			sekolah: {
				nama: sekolah?.nama ?? locals.sekolah?.nama ?? 'Sekolah',
				lokasiTandaTangan: sekolah?.lokasiTandaTangan ?? '',
				logoUrl,
				logoDinasUrl,
				wakaKurikulum,
				kepalaSekolah: {
					nama: sekolah?.kepalaSekolah?.nama ?? '',
					nip: sekolah?.kepalaSekolah?.nip ?? '',
					status: sekolah?.statusKepalaSekolah ?? 'definitif'
				}
			},
			periode: {
				tahunPelajaran: selectedYear?.nama ?? '',
				semester:
					context.jenis === 'persiapan'
						? JADWAL_JENIS_LABELS.persiapan
						: JADWAL_JENIS_LABELS[context.jenis]
			},
			jenisJadwal: context.jenis,
			jenisLabel: JADWAL_JENIS_LABELS[context.jenis],
			tanggalCetak: formatTanggal(new Date()),
			orientation,
			selectedJenjang,
			jenjangLabel,
			hariLabels: JADWAL_HARI_LABELS,
			kelasList,
			jamList,
			cells
		}
	};
}