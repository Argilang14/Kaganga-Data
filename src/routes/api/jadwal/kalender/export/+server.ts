/* eslint-disable @typescript-eslint/no-explicit-any -- Tipe ExcelJS di workspace ini tidak memuat semua API runtime. */
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKalenderPendidikan, tableTahunAjaran } from '$lib/server/db/schema';
import {
	loadAbsensiKelasOptions,
	parsePositiveInteger,
	resolveKelasId
} from '$lib/server/absensi-digital';
import { requireJadwalAccess } from '$lib/server/jadwal';
import { error } from '@sveltejs/kit';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const KALENDER_JENIS = [
	'hari_efektif',
	'libur_nasional',
	'libur_sekolah',
	'ujian',
	'asesmen',
	'pembagian_rapor',
	'kegiatan_sekolah',
	'kegiatan_asrama',
	'lainnya'
] as const;
type KalenderJenis = (typeof KALENDER_JENIS)[number];
const JENJANG = ['semua', 'srd', 'srmp', 'srma'] as const;
type Jenjang = (typeof JENJANG)[number];
type PeriodeMode = 'tahun_kalender' | 'tahun_ajaran';
const LEGACY_JENJANG: Record<Exclude<Jenjang, 'semua'>, 'sd' | 'smp' | 'sma'> = {
	srd: 'sd',
	srmp: 'smp',
	srma: 'sma'
};
const jenisLabels: Record<string, string> = {
	hari_efektif: 'Hari Efektif',
	libur_nasional: 'Libur Nasional',
	libur_sekolah: 'Libur Sekolah',
	ujian: 'Ujian',
	asesmen: 'Asesmen',
	pembagian_rapor: 'Pembagian Rapor',
	kegiatan_sekolah: 'Kegiatan Sekolah',
	kegiatan_asrama: 'Kegiatan Asrama',
	lainnya: 'Lainnya'
};

function parseKalenderJenis(value: string | null): KalenderJenis | null {
	return KALENDER_JENIS.includes(value as KalenderJenis) ? (value as KalenderJenis) : null;
}

function parseJenjang(value: string | null): Jenjang | null {
	if (JENJANG.includes(value as Jenjang)) return value as Jenjang;
	if (value === 'sd') return 'srd';
	if (value === 'smp') return 'srmp';
	if (value === 'sma') return 'srma';
	return null;
}

function parsePeriodeMode(value: string | null): PeriodeMode {
	return value === 'tahun_ajaran' ? 'tahun_ajaran' : 'tahun_kalender';
}

function sanitizeFilename(value: string) {
	return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'kalender-pendidikan';
}

function academicYears(tahunAjaranNama?: string | null) {
	const match = tahunAjaranNama?.match(/(\d{4})\s*[/-]\s*(\d{4})/);
	if (match) return { start: Number(match[1]), end: Number(match[2]) };
	const current = new Date().getFullYear();
	return { start: current, end: current + 1 };
}

function resolvePeriodeRange(mode: PeriodeMode, tahunAjaranNama?: string | null) {
	const years = academicYears(tahunAjaranNama);
	if (mode === 'tahun_ajaran') {
		return {
			start: `${years.start}-07-01`,
			end: `${years.end}-06-30`,
			label: `tahun-ajaran-${years.start}-${years.end}`
		};
	}
	return {
		start: `${years.end}-01-01`,
		end: `${years.end}-12-31`,
		label: `tahun-kalender-${years.end}`
	};
}

export async function GET({ locals, url }) {
	requireJadwalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw error(401, 'Sesi sekolah tidak valid.');

	const academic = await resolveSekolahAcademicContext(sekolahId);
	const { kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const selectedTahunAjaranId =
		parsePositiveInteger(url.searchParams.get('tahun_ajaran_id')) ?? academic.activeTahunAjaranId;
	const selectedSemesterId = parsePositiveInteger(url.searchParams.get('semester_id'));
	const selectedKelasId = resolveKelasId(
		kelasList,
		parsePositiveInteger(url.searchParams.get('kelas_id'))
	);
	const selectedJenis = parseKalenderJenis(url.searchParams.get('jenis'));
	const selectedJenjang = parseJenjang(url.searchParams.get('jenjang'));
	const periodeMode = parsePeriodeMode(url.searchParams.get('periode_mode'));

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
	if (selectedJenis) whereParts.push(eq(tableKalenderPendidikan.jenis, selectedJenis));
	if (selectedJenjang) {
		if (selectedJenjang === 'semua') {
			whereParts.push(eq(tableKalenderPendidikan.jenjang, 'semua'));
		} else {
			whereParts.push(
				inArray(tableKalenderPendidikan.jenjang, [
					'semua',
					selectedJenjang,
					LEGACY_JENJANG[selectedJenjang]
				])
			);
		}
	}

	const rows = await db.query.tableKalenderPendidikan.findMany({
		where: and(...whereParts),
		with: {
			tahunAjaran: { columns: { nama: true } },
			semester: { columns: { nama: true, tipe: true } },
			kelas: { columns: { nama: true, fase: true } }
		},
		orderBy: [
			asc(tableKalenderPendidikan.tanggalMulai),
			asc(tableKalenderPendidikan.tanggalSelesai)
		]
	});

	const workbook = new ExcelJS.Workbook() as any;
	workbook.creator = 'Kaganga';
	workbook.created = new Date();
	const sheet = workbook.addWorksheet('Kalender Pendidikan') as any;
	sheet.columns = [
		{ header: 'Tanggal Mulai', key: 'tanggalMulai', width: 16 },
		{ header: 'Tanggal Selesai', key: 'tanggalSelesai', width: 16 },
		{ header: 'Judul', key: 'judul', width: 34 },
		{ header: 'Jenis', key: 'jenis', width: 22 },
		{ header: 'Label Jenis', key: 'jenisLabel', width: 22 },
		{ header: 'Jenjang', key: 'jenjang', width: 14 },
		{ header: 'Kelas', key: 'kelas', width: 24 },
		{ header: 'Warna', key: 'warna', width: 14 },
		{ header: 'Keterangan', key: 'keterangan', width: 42 },
		{ header: 'Tahun Ajaran', key: 'tahunAjaran', width: 18 },
		{ header: 'Semester', key: 'semester', width: 18 }
	];
	for (const row of rows) {
		sheet.addRow({
			tanggalMulai: row.tanggalMulai,
			tanggalSelesai: row.tanggalSelesai,
			judul: row.judul,
			jenis: row.jenis,
			jenisLabel: jenisLabels[row.jenis] ?? row.jenis,
			jenjang: row.jenjang,
			kelas: row.kelas ? `${row.kelas.nama}${row.kelas.fase ? ' - ' + row.kelas.fase : ''}` : '',
			warna: row.warna ?? '',
			keterangan: row.keterangan ?? '',
			tahunAjaran: row.tahunAjaran?.nama ?? '',
			semester: row.semester?.nama ?? row.semester?.tipe ?? ''
		});
	}
	sheet.getRow(1).font = { bold: true };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	sheet.autoFilter = { from: 'A1', to: 'K1' };

	const buffer = await workbook.xlsx.writeBuffer();
	const filename = sanitizeFilename(
		`data-kalender-pendidikan-${periodeRange.label}-${new Date().toISOString().slice(0, 10)}.xlsx`
	);
	return new Response(buffer as unknown as BodyInit, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="${filename}"`
		}
	});
}
