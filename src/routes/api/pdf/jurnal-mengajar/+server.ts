import { error } from '@sveltejs/kit';
import { pdfFilename, pdfDisposition } from '$lib/pdf-filename';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import { ensureJurnalMengajarSchema } from '$lib/server/db/ensure-jurnal-mengajar';
import {
	tableJurnalMengajar,
	tableKelas,
	tableJadwalMapel,
	tableMataPelajaran,
	tableTujuanPembelajaran,
	tableMurid,
	tableKetidakhadiranHarian,
	tableSemester,
	tableTahunAjaran,
	tableSekolah,
	tablePegawai,
	tableAuthUserKelas
} from '$lib/server/db/schema';
import { getJurnalPrintAccessError } from '$lib/server/jurnal-print-access';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { renderJurnalMengajarHTML } from '$lib/server/pdf/templates/jurnal-mengajar';
import {
	composeAlamat,
	fallbackTempat,
	formatTanggal,
	getLogoDinasSrc,
	getLogoSrc
} from '$lib/server/pdf/preview-utils';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	const sekolahId = locals.sekolah?.id;
	const user = locals.user as {
		id?: number;
		type?: string;
		pegawaiId?: number;
		kelasId?: number | null;
		mataPelajaranId?: number | null;
	} | null;

	if (!sekolahId || !user?.id) {
		throw error(401, 'Unauthorized');
	}

	await ensureJurnalMengajarSchema();

	const tanggalMulai = url.searchParams.get('tanggal_mulai');
	const tanggalSelesai = url.searchParams.get('tanggal_selesai');
	const lingkup = url.searchParams.get('lingkup') === 'mapel' ? 'mapel' : 'kelas';
	const jenisJadwalParam = url.searchParams.get('jenis_jadwal');
	const penandatangan =
		url.searchParams.get('penandatangan') === 'guru_mapel' ? 'guru_mapel' : 'wali_kelas';
	const kelasId = Number(url.searchParams.get('kelas_id')) || null;
	const jadwalMapelId = Number(url.searchParams.get('mapel_id')) || null;
	const showBgLogo = url.searchParams.get('bg_logo') === '1';

	if (!tanggalMulai || !tanggalSelesai) {
		throw error(400, 'Parameter tanggal_mulai dan tanggal_selesai wajib diisi');
	}
	if (tanggalMulai > tanggalSelesai) throw error(400, 'Rentang tanggal jurnal tidak valid');
	if (!jenisJadwalParam || !['persiapan', 'ganjil', 'genap'].includes(jenisJadwalParam)) {
		throw error(400, 'Jenis jadwal tidak valid');
	}
	const jenisJadwal = jenisJadwalParam as 'persiapan' | 'ganjil' | 'genap';
	if (lingkup === 'kelas' && !kelasId) throw error(400, 'Pilih kelas yang akan dicetak');
	if (lingkup === 'mapel' && !jadwalMapelId) {
		throw error(400, 'Pilih mata pelajaran yang akan dicetak');
	}

	const [selectedKelas, selectedMapel, schoolClasses] = await Promise.all([
		kelasId
			? db.query.tableKelas.findFirst({
					where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId)),
					with: { waliKelas: { columns: { id: true, nama: true, nip: true } } }
				})
			: null,
		jadwalMapelId
			? db.query.tableJadwalMapel.findFirst({
					where: and(
						eq(tableJadwalMapel.id, jadwalMapelId),
						eq(tableJadwalMapel.sekolahId, sekolahId)
					),
					with: { guru: { columns: { id: true, nama: true, nip: true } } }
				})
			: null,
		db.query.tableKelas.findMany({
			columns: { id: true },
			where: eq(tableKelas.sekolahId, sekolahId)
		})
	]);
	if (kelasId && !selectedKelas) throw error(404, 'Kelas tidak ditemukan pada sekolah aktif');
	if (jadwalMapelId && !selectedMapel) {
		throw error(404, 'Mata pelajaran tidak ditemukan pada sekolah aktif');
	}
	if (!schoolClasses.length) throw error(400, 'Data kelas belum tersedia');

	let hasClassAccess = user.type === 'admin';
	if (selectedKelas && user.type === 'wali_kelas') {
		hasClassAccess =
			selectedKelas.waliKelasId === user.pegawaiId || selectedKelas.id === user.kelasId;
	} else if (selectedKelas && user.type === 'user') {
		const [directAccess, assignedClasses] = await Promise.all([
			db.query.tableAuthUserKelas.findFirst({
				columns: { id: true },
				where: and(
					eq(tableAuthUserKelas.authUserId, user.id),
					eq(tableAuthUserKelas.kelasId, selectedKelas.id)
				)
			}),
			db.query.tableAuthUserKelas.findMany({
				columns: {},
				where: eq(tableAuthUserKelas.authUserId, user.id),
				with: { kelas: { columns: { nama: true } } }
			})
		]);
		hasClassAccess =
			Boolean(directAccess) ||
			assignedClasses.some((item) => item.kelas?.nama === selectedKelas.nama);
	}
	const hasSubjectAccess =
		user.type === 'admin' ||
		(user.type === 'user' && selectedMapel?.guruPegawaiId === user.pegawaiId);
	const accessError = getJurnalPrintAccessError({
		userType: user.type,
		lingkup,
		penandatangan,
		hasSelectedClass: Boolean(selectedKelas),
		hasClassAccess,
		hasSelectedSubject: Boolean(selectedMapel),
		hasSubjectAccess
	});
	if (accessError) throw error(403, accessError);

	const signer = penandatangan === 'wali_kelas' ? selectedKelas?.waliKelas : selectedMapel?.guru;
	if (!signer) {
		throw error(
			400,
			penandatangan === 'wali_kelas'
				? 'Wali kelas belum ditentukan pada Data Kelas'
				: 'Guru belum ditentukan pada Data Mata Pelajaran'
		);
	}

	// Get active semester info
	const semester = await db
		.select({
			tahunAjaranNama: tableTahunAjaran.nama,
			semesterNama: tableSemester.nama,
			tipe: tableSemester.tipe
		})
		.from(tableSemester)
		.innerJoin(tableTahunAjaran, eq(tableSemester.tahunAjaranId, tableTahunAjaran.id))
		.where(and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableSemester.isAktif, true)))
		.limit(1)
		.then((r) => r[0]);

	// Admin dan wali kelas dapat merekap konteks yang menjadi tanggung jawabnya.
	// Guru mata pelajaran hanya melihat jurnal yang dibuat oleh akunnya sendiri.
	const rows = await db
		.select({
			id: tableJurnalMengajar.id,
			tanggal: tableJurnalMengajar.tanggal,
			jamPelajaran: tableJurnalMengajar.jamPelajaran,
			pukul: tableJurnalMengajar.pukul,
			tahunAjaranId: tableJurnalMengajar.tahunAjaranId,
			semesterId: tableJurnalMengajar.semesterId,
			jenisJadwal: tableJurnalMengajar.jenisJadwal,
			lingkupMateri: tableJurnalMengajar.lingkupMateri,
			tujuanPembelajaranManual: tableJurnalMengajar.tujuanPembelajaranManual,
			catatan: tableJurnalMengajar.catatan,
			kelasId: tableJurnalMengajar.kelasId,
			mataPelajaranId: tableJurnalMengajar.mataPelajaranId,
			jadwalMapelId: tableJurnalMengajar.jadwalMapelId,
			tujuanPembelajaranId: tableJurnalMengajar.tujuanPembelajaranId,
			kelasNama: tableKelas.nama,
			mapelNamaLegacy: tableMataPelajaran.nama,
			mapelNamaJadwal: tableJadwalMapel.nama,
			tpDeskripsi: tableTujuanPembelajaran.deskripsi
		})
		.from(tableJurnalMengajar)
		.leftJoin(tableKelas, eq(tableJurnalMengajar.kelasId, tableKelas.id))
		.leftJoin(tableMataPelajaran, eq(tableJurnalMengajar.mataPelajaranId, tableMataPelajaran.id))
		.leftJoin(tableJadwalMapel, eq(tableJurnalMengajar.jadwalMapelId, tableJadwalMapel.id))
		.leftJoin(
			tableTujuanPembelajaran,
			eq(tableJurnalMengajar.tujuanPembelajaranId, tableTujuanPembelajaran.id)
		)
		.where(
			and(
				inArray(
					tableJurnalMengajar.kelasId,
					kelasId ? [kelasId] : schoolClasses.map((item) => item.id)
				),
				jadwalMapelId ? eq(tableJurnalMengajar.jadwalMapelId, jadwalMapelId) : undefined,
				eq(tableJurnalMengajar.jenisJadwal, jenisJadwal),
				user.type === 'user' ? eq(tableJurnalMengajar.authUserId, user.id) : undefined,
				sql`${tableJurnalMengajar.tanggal} >= ${tanggalMulai}`,
				sql`${tableJurnalMengajar.tanggal} <= ${tanggalSelesai}`
			)
		)
		.orderBy(asc(tableJurnalMengajar.tanggal));

	// Calculate attendance (H/S/I/A) for each journal entry — batched
	const uniqueKelasIds = [...new Set(rows.map((r) => r.kelasId))];
	const uniqueDates = [...new Set(rows.map((r) => r.tanggal))];

	const studentCounts =
		uniqueKelasIds.length > 0
			? await db
					.select({
						kelasId: tableMurid.kelasId,
						total: sql<number>`count(*)`
					})
					.from(tableMurid)
					.where(
						and(inArray(tableMurid.kelasId, uniqueKelasIds), eq(tableMurid.sekolahId, sekolahId))
					)
					.groupBy(tableMurid.kelasId)
			: [];
	const studentCountMap = new Map(studentCounts.map((s) => [s.kelasId, s.total]));

	const allAbsences: Array<{
		tanggal: string;
		kelasId: number;
		sakit: number;
		izin: number;
		alfa: number;
	}> =
		uniqueKelasIds.length > 0 && uniqueDates.length > 0
			? await db
					.select({
						tanggal: tableKetidakhadiranHarian.tanggal,
						kelasId: tableMurid.kelasId,
						sakit: sql<number>`COALESCE(SUM(CASE WHEN ${tableKetidakhadiranHarian.keterangan} = 'sakit' THEN 1 ELSE 0 END), 0)`,
						izin: sql<number>`COALESCE(SUM(CASE WHEN ${tableKetidakhadiranHarian.keterangan} = 'izin' THEN 1 ELSE 0 END), 0)`,
						alfa: sql<number>`COALESCE(SUM(CASE WHEN ${tableKetidakhadiranHarian.keterangan} = 'alfa' THEN 1 ELSE 0 END), 0)`
					})
					.from(tableKetidakhadiranHarian)
					.innerJoin(tableMurid, eq(tableKetidakhadiranHarian.muridId, tableMurid.id))
					.where(
						and(
							inArray(tableKetidakhadiranHarian.tanggal, uniqueDates),
							inArray(tableMurid.kelasId, uniqueKelasIds),
							eq(tableMurid.sekolahId, sekolahId)
						)
					)
					.groupBy(tableKetidakhadiranHarian.tanggal, tableMurid.kelasId)
			: [];

	const absenceMap = new Map<string, { sakit: number; izin: number; alfa: number }>();
	for (const a of allAbsences) {
		absenceMap.set(`${a.tanggal}|${a.kelasId}`, {
			sakit: Number(a.sakit),
			izin: Number(a.izin),
			alfa: Number(a.alfa)
		});
	}

	const rowsWithAttendance = rows.map((row) => {
		const total = studentCountMap.get(row.kelasId) ?? 0;
		const absences = absenceMap.get(`${row.tanggal}|${row.kelasId}`) ?? {
			sakit: 0,
			izin: 0,
			alfa: 0
		};
		const hadir = Math.max(0, total - absences.sakit - absences.izin - absences.alfa);

		return {
			tanggal: formatTanggal(row.tanggal),
			kelas: row.kelasNama ?? '',
			mataPelajaran: row.mapelNamaJadwal ?? row.mapelNamaLegacy ?? '',
			jamPelajaran: row.jamPelajaran,
			pukul: row.pukul ?? '',
			lingkupMateri: row.lingkupMateri,
			tujuanPembelajaran: row.tpDeskripsi ?? row.tujuanPembelajaranManual ?? '',
			hadir,
			sakit: absences.sakit,
			izin: absences.izin,
			alfa: absences.alfa,
			catatan: row.catatan ?? ''
		};
	});

	const storedYearIds = [
		...new Set(rows.map((row) => row.tahunAjaranId).filter((id): id is number => !!id))
	];
	const storedSemesterIds = [
		...new Set(rows.map((row) => row.semesterId).filter((id): id is number => !!id))
	];
	const [storedYears, storedSemesters] = await Promise.all([
		storedYearIds.length
			? db.query.tableTahunAjaran.findMany({ where: inArray(tableTahunAjaran.id, storedYearIds) })
			: [],
		storedSemesterIds.length
			? db.query.tableSemester.findMany({ where: inArray(tableSemester.id, storedSemesterIds) })
			: []
	]);
	const historicalYears = [...new Set(storedYears.map((item) => item.nama))];
	const historicalSemesters = [...new Set(storedSemesters.map((item) => item.nama))];
	const historicalJenis = [...new Set(rows.map((row) => row.jenisJadwal).filter(Boolean))];

	// Get sekolah name + kepala sekolah + tempat tanda tangan
	const sekolah = await db.query.tableSekolah.findFirst({
		columns: {
			nama: true,
			npsn: true,
			naungan: true,
			email: true,
			kepalaSekolahId: true,
			lokasiTandaTangan: true,
			statusKepalaSekolah: true
		},
		where: eq(tableSekolah.id, sekolahId)
	});

	// Get kepala sekolah info
	let kepalaSekolahNama = '';
	let kepalaSekolahNip: string | null = null;
	const kepalaSekolahStatus = sekolah?.statusKepalaSekolah;
	if (sekolah?.kepalaSekolahId) {
		const kepala = await db.query.tablePegawai.findFirst({
			columns: { nama: true, nip: true },
			where: eq(tablePegawai.id, sekolah.kepalaSekolahId)
		});
		kepalaSekolahNama = kepala?.nama ?? '';
		kepalaSekolahNip = kepala?.nip ?? null;
	}

	const isWaliKelas = penandatangan === 'wali_kelas';
	const guruLabel = isWaliKelas ? 'Wali Kelas' : 'Guru Mata Pelajaran';

	const [logoUrl, logoDinasUrl] = await Promise.all([
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId)
	]);
	const tempatTtd = locals.sekolah
		? fallbackTempat(locals.sekolah)
		: (sekolah?.lokasiTandaTangan ?? '');
	const tanggalTtd = new Date().toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});

	const printData = {
		backgroundLogoUrl: showBgLogo ? logoUrl : null,
		sekolah: {
			nama: sekolah?.nama ?? '',
			npsn: sekolah?.npsn ?? '',
			naungan: sekolah?.naungan ?? 'kemendikbud',
			alamat: locals.sekolah ? composeAlamat(locals.sekolah) : '',
			email: sekolah?.email ?? '',
			logoUrl,
			logoDinasUrl
		},
		filter: {
			label: lingkup === 'kelas' ? 'Kelas' : 'Mata Pelajaran',
			value:
				lingkup === 'kelas'
					? (selectedKelas?.nama ?? '')
					: `${selectedMapel?.kode ?? ''} - ${selectedMapel?.nama ?? ''}`,
			jenisJadwal:
				jenisJadwal === 'persiapan'
					? 'Masa Persiapan'
					: `Semester ${jenisJadwal === 'ganjil' ? 'Ganjil' : 'Genap'}`
		},
		periode: {
			tahunPelajaran: historicalYears.join(', ') || semester?.tahunAjaranNama || '',
			semester:
				historicalSemesters.join(', ') ||
				historicalJenis
					.map((jenis) =>
						jenis === 'persiapan'
							? 'Masa Persiapan'
							: `Semester ${jenis === 'ganjil' ? 'Ganjil' : 'Genap'}`
					)
					.join(', ') ||
				semester?.tipe ||
				'',
			tanggalMulai: formatTanggal(tanggalMulai),
			tanggalSelesai: formatTanggal(tanggalSelesai)
		},
		rows: rowsWithAttendance,
		kepalaSekolah: {
			nama: kepalaSekolahNama,
			nip: kepalaSekolahNip,
			statusKepalaSekolah: kepalaSekolahStatus
		},
		guru: {
			nama: signer.nama,
			nip: signer.nip
		},
		isWaliKelas,
		guruLabel,
		ttd: {
			tempat: tempatTtd,
			tanggal: tanggalTtd
		}
	};

	const html = renderJurnalMengajarHTML(printData);
	const pdf = await renderPDF(html);
	const pdfBuffer = Buffer.from(pdf);

	return new Response(new Blob([pdfBuffer], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': pdfDisposition(pdfFilename('Jurnal Mengajar', printData.filter.value, printData.filter.jenisJadwal, tanggalMulai, tanggalSelesai))
		}
	});
}) satisfies RequestHandler;
