import db from '$lib/server/db';
import {
	tableJadwalMapel,
	tableKelas,
	tablePegawai,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { computeNilaiAkhirRekap } from '$lib/server/nilai-akhir';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { buildKelasContext, fetchMuridList } from '$lib/server/route-utils';
import type { RequestEvent } from '@sveltejs/kit';

export async function loadCetakContext({ locals, url, depends, parent }: Pick<RequestEvent, 'locals' | 'url'> & { depends: (...dependencies: string[]) => void; parent: () => Promise<Parameters<typeof buildKelasContext>[1]> }) {
	depends('app:cetak-sr');

	const user = locals.user as { type?: string; pegawaiId?: number | null } | null;
	const jurnalAccess = {
		canPrint: ['admin', 'wali_kelas', 'user'].includes(user?.type ?? ''),
		requiresClass: user?.type !== 'admin',
		allowedSigners:
			user?.type === 'user' ? (['guru_mapel'] as const) : (['wali_kelas', 'guru_mapel'] as const),
		defaultScope: user?.type === 'user' ? ('mapel' as const) : ('kelas' as const),
		defaultSigner: user?.type === 'user' ? ('guru_mapel' as const) : ('wali_kelas' as const)
	};
	const parentData = await parent();
	const { sekolahId, kelasId, kelasIds, academicContext } = await buildKelasContext(
		locals,
		parentData,
		url
	);
	const tahunAjaranList = (academicContext?.tahunAjaranList ?? []).map((tahun) => ({
		id: tahun.id,
		nama: tahun.nama,
		semester: tahun.semester.map((semester) => ({
			id: semester.id,
			nama: semester.nama,
			tipe: semester.tipe
		}))
	}));
	const printContext = {
		tahunAjaranList,
		activeTahunAjaranId: academicContext?.activeTahunAjaranId ?? null,
		activeSemesterId: academicContext?.activeSemesterId ?? null,
		activeSemesterTipe: academicContext?.activeSemesterTipe ?? null
	};
	const activeSemester = sekolahId
		? await db
				.select({
					tanggalMasuk: tableSemester.tanggalMasuk,
					tanggalMulai: tableSemester.tanggalMulai,
					tanggalBagiRaport: tableSemester.tanggalBagiRaport,
					tanggalSelesai: tableSemester.tanggalSelesai
				})
				.from(tableSemester)
				.innerJoin(tableTahunAjaran, eq(tableSemester.tahunAjaranId, tableTahunAjaran.id))
				.where(and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableSemester.isAktif, true)))
				.limit(1)
				.then((rows) => rows[0])
		: null;
	const jurnalPeriod = {
		tanggalMasuk: activeSemester?.tanggalMasuk ?? activeSemester?.tanggalMulai ?? '',
		tanggalBagiRaport: activeSemester?.tanggalBagiRaport ?? activeSemester?.tanggalSelesai ?? ''
	};
	const pegawaiGuruList = sekolahId
		? await db.query.tablePegawai.findMany({
				columns: { id: true, nama: true, nip: true, jabatan: true },
				where: and(
					eq(tablePegawai.sekolahId, sekolahId),
					eq(tablePegawai.jenis, 'guru'),
					eq(tablePegawai.status, 'aktif')
				),
				orderBy: [asc(tablePegawai.nama)]
			})
		: [];
	const [jurnalKelasList, jurnalMapelList] = sekolahId
		? await Promise.all([
				kelasIds.length
					? db.query.tableKelas.findMany({
							columns: {
								id: true,
								nama: true,
								fase: true,
								tahunAjaranId: true,
								semesterId: true,
								waliKelasId: true
							},
							with: {
								waliKelas: { columns: { id: true, nama: true, nip: true } },
								tahunAjaran: { columns: { nama: true } },
								semester: { columns: { nama: true, tipe: true } }
							},
							where: and(eq(tableKelas.sekolahId, sekolahId), inArray(tableKelas.id, kelasIds)),
							orderBy: [asc(tableKelas.nama)]
						})
					: [],
				db.query.tableJadwalMapel.findMany({
					columns: {
						id: true,
						kode: true,
						nama: true,
						jenjang: true,
						guruPegawaiId: true
					},
					with: { guru: { columns: { id: true, nama: true, nip: true } } },
					where: and(
						eq(tableJadwalMapel.sekolahId, sekolahId),
						eq(tableJadwalMapel.aktif, true),
						user?.type === 'user'
							? user.pegawaiId
								? eq(tableJadwalMapel.guruPegawaiId, user.pegawaiId)
								: eq(tableJadwalMapel.id, -1)
							: undefined,
						jurnalAccess.canPrint ? undefined : eq(tableJadwalMapel.id, -1)
					),
					orderBy: [asc(tableJadwalMapel.nama)]
				})
			])
		: [[], []];

	if (!sekolahId || !kelasIds.length) {
		return {
			academicContext,
			kelasId,
			daftarMurid: [],
			muridCount: 0,
			piagamRankingOptions: [],
			pegawaiGuruList,
			jurnalKelasList,
			jurnalMapelList,
			jurnalAccess,
			...printContext,
			...jurnalPeriod
		};
	}

	const daftarMurid = await fetchMuridList(sekolahId, kelasId, kelasIds);
	let piagamRankingOptions: Array<{
		muridId: number;
		peringkat: number;
		nama: string;
		nilaiRataRata: number | null;
	}> = [];

	if (kelasId) {
		const rekap = await computeNilaiAkhirRekap({ sekolahId, kelasId: Number(kelasId) });
		piagamRankingOptions = rekap.rows
			.filter((row) => Number.isFinite(row.peringkat) && row.peringkat >= 1)
			.sort((a, b) => a.peringkat - b.peringkat)
			.slice(0, 4)
			.map((row) => ({
				muridId: row.id,
				peringkat: row.peringkat,
				nama: row.nama,
				nilaiRataRata: row.nilaiRataRata
			}));
	}

	return {
		academicContext,
		kelasId,
		daftarMurid,
		muridCount: daftarMurid.length,
		piagamRankingOptions,
		pegawaiGuruList,
		jurnalKelasList,
		jurnalMapelList,
		jurnalAccess,
		...printContext,
		...jurnalPeriod
	};
}
