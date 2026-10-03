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
import { ensureUjianSchema } from '$lib/server/db/ensure-ujian';
import { isAuthorizedUser } from '../../routes/pengguna/permissions';
import { loadAbsensiKelasOptions, todayLocalDate } from '$lib/server/absensi-digital';
import {
	canAccessAbsensiKegiatan,
	loadKegiatanAbsensiOptions
} from '$lib/server/absensi-kegiatan';

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
	const absensiAccess = canAccessAbsensiKegiatan(locals.user);
	const [absensiKelasResult, absensiKegiatanList] =
		sekolahId && locals.user && absensiAccess
			? await Promise.all([
					loadAbsensiKelasOptions(sekolahId, locals.user),
					loadKegiatanAbsensiOptions(sekolahId)
				])
			: [{ kelasList: [] }, []];
	const absensiPrintContext = {
		absensiAccess,
		absensiToday: todayLocalDate(),
		absensiKelasList: absensiKelasResult.kelasList.map((kelas) => ({
			id: kelas.id,
			nama: kelas.nama,
			fase: kelas.fase
		})),
		absensiKegiatanList: absensiKegiatanList.map((kegiatan) => ({
			id: kegiatan.id,
			nama: kegiatan.nama,
			kategori: kegiatan.kategori
		}))
	};
	let ujianSessions: Array<{
		id: number;
		nama: string;
		singkatan: string | null;
		tahunAjaran: string;
		semester: string | null;
		participantCount: number;
		classes: string[];
		rooms: string[];
	}> = [];
	if (sekolahId && isAuthorizedUser(['ujian_cetak', 'ujian_manage'], locals.user)) {
		await ensureUjianSchema();
		const [sessionsResult, classesResult] = await Promise.all([
			db.$client.execute({
				sql: `SELECT s.id, s.nama, s.singkatan, ta.nama AS tahunAjaran, se.nama AS semester,
					COUNT(p.id) AS participantCount
				FROM ujian_session s JOIN tahun_ajaran ta ON ta.id=s.tahun_ajaran_id
				LEFT JOIN semester se ON se.id=s.semester_id
				LEFT JOIN ujian_peserta p ON p.session_id=s.id
				WHERE s.sekolah_id=? GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC`,
				args: [sekolahId]
			}),
			db.$client.execute({
				sql: `SELECT DISTINCT p.session_id AS sessionId, p.kelas_nama_snapshot AS kelas, p.ruang
				FROM ujian_peserta p JOIN ujian_session s ON s.id=p.session_id
				WHERE s.sekolah_id=?
				ORDER BY p.kelas_nama_snapshot, p.ruang`,
				args: [sekolahId]
			})
		]);
		const classMap = new Map<number, string[]>();
		const roomMap = new Map<number, string[]>();
		for (const row of classesResult.rows) {
			const sessionId = Number(row.sessionId);
			const list = classMap.get(sessionId) ?? [];
			if (row.kelas && !list.includes(String(row.kelas))) list.push(String(row.kelas));
			classMap.set(sessionId, list);
			const rooms = roomMap.get(sessionId) ?? [];
			if (row.ruang && !rooms.includes(String(row.ruang))) rooms.push(String(row.ruang));
			roomMap.set(sessionId, rooms);
		}
		ujianSessions = sessionsResult.rows.map((row) => ({
			id: Number(row.id),
			nama: String(row.nama),
			singkatan: row.singkatan ? String(row.singkatan) : null,
			tahunAjaran: String(row.tahunAjaran),
			semester: row.semester ? String(row.semester) : null,
			participantCount: Number(row.participantCount ?? 0),
			classes: classMap.get(Number(row.id)) ?? [],
			rooms: roomMap.get(Number(row.id)) ?? []
		}));
	}
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
			ujianSessions,
			...absensiPrintContext,
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
		ujianSessions,
		...absensiPrintContext,
		...printContext,
		...jurnalPeriod
	};
}
