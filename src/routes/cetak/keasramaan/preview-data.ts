import { error } from '@sveltejs/kit';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';
import { asc, and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { getClassEducationIdentity } from '$lib/server/education-units';
import {
	tableAsesmenKeasramaan,
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKeasramaanTujuan,
	tableMurid,
	tablePegawai
} from '$lib/server/db/schema';
import {
	kategoriToRubrikValue,
	hitungNilaiIndikator,
	nilaiAngkaToHuruf
} from '$lib/components/asesmen-keasramaan/utils';
import {
	optionalInteger,
	composeAlamat,
	formatTanggal,
	fallbackTempat,
	getLogoSrc
} from '$lib/server/pdf/preview-utils';
import { parseTPMode } from '$lib/rapor-params';
import { computeRaporAttendance } from '$lib/server/pdf/attendance-utils';
import { dormEvaluationContext, evaluationRows } from '$lib/server/dorm-evaluation';
import { ensureDormEvaluationSchema } from '$lib/server/db/ensure-dorm-evaluation';
import { canAccessExportClass } from '$lib/server/class-export-access';

export type KeasramaanContext = {
	locals: App.Locals;
	url: URL;
};

type PredikatKey = 'perlu-bimbingan' | 'cukup' | 'baik' | 'sangat-baik';

type PredikatMap = {
	[key in PredikatKey]: { label: string; order: number };
};

const PREDIKAT_MAP: PredikatMap = {
	'sangat-baik': { label: 'Sangat Baik', order: 3 },
	baik: { label: 'Baik', order: 2 },
	cukup: { label: 'Cukup', order: 1 },
	'perlu-bimbingan': { label: 'Perlu Bimbingan', order: 0 }
};

function joinList(items: string[]): string {
	if (!items.length) return '';
	if (items.length === 1) return items[0];
	if (items.length === 2) return `${items[0]} dan ${items[1]}`;
	return items.slice(0, -1).join(', ') + ', dan ' + items.at(-1);
}

function lowercaseFirstChar(text: string): string {
	if (!text) return text;
	return text.charAt(0).toLowerCase() + text.slice(1);
}

type KeasramaanTPData = {
	nilai: number;
	deskripsi: string;
	predikat: PredikatKey;
};

function buildKeasramaanCompactMode(muridNama: string, tpData: KeasramaanTPData[]): string {
	if (!tpData.length) return '';

	// Sort all by nilai descending for highest, ascending for lowest
	const sortedDesc = [...tpData].sort((a, b) => b.nilai - a.nilai);
	const sortedAsc = [...tpData].sort((a, b) => a.nilai - b.nilai);

	const lines: string[] = [];

	// Paragraph 1: highest TP
	const highest = sortedDesc[0];
	const cleanHighest = highest.deskripsi.replace(/[.!?]+$/gu, '').trim();
	lines.push(`Ananda ${muridNama} ${narrativeFor(highest)} ${cleanHighest}.`);

	// Paragraph 2: lowest TP (skip if only 1 TP — same as highest)
	if (tpData.length > 1) {
		const lowest = sortedAsc[0];
		const cleanLowest = lowest.deskripsi.replace(/[.!?]+$/gu, '').trim();
		if (lowest.predikat === 'perlu-bimbingan') {
			lines.push(`Ananda ${muridNama} masih perlu bimbingan dalam ${cleanLowest}.`);
		} else {
			lines.push(`Ananda ${muridNama} ${narrativeFor(lowest)} ${cleanLowest}.`);
		}
	}

	return lines.join('\n');
}

function narrativeFor(d: KeasramaanTPData): string {
	switch (d.predikat) {
		case 'sangat-baik':
			return 'menunjukkan penguasaan yang sangat baik dalam';
		case 'baik':
			return 'menunjukkan penguasaan yang baik dalam';
		case 'cukup':
			return 'cukup mampu';
		default:
			return '';
	}
}

function buildKeasramaanFullDescMode(
	muridNama: string,
	tpsByPredikat: Record<PredikatKey, string[]>
): string {
	const achievedOrder: PredikatKey[] = ['sangat-baik', 'baik', 'cukup'];
	const achievedSegments: string[] = [];

	// Build "tercapai" paragraph
	for (const key of achievedOrder) {
		const tpList = tpsByPredikat[key] || [];
		if (!tpList.length) continue;

		const cleanDescs = tpList.map((d) => lowercaseFirstChar(d.replace(/[.!?]+$/gu, '').trim()));
		const joined = joinList(cleanDescs);

		if (key === 'sangat-baik') {
			achievedSegments.push(`menunjukkan penguasaan yang sangat baik dalam ${joined}`);
		} else if (key === 'baik') {
			achievedSegments.push(`menunjukkan penguasaan yang baik dalam ${joined}`);
		} else if (key === 'cukup') {
			achievedSegments.push(`cukup mampu ${joined}`);
		}
	}

	// Join segments with "; " and prefix last with "serta"
	let achievedParagraph = '';
	if (achievedSegments.length === 1) {
		achievedParagraph = `Ananda ${muridNama} ${achievedSegments[0]}.`;
	} else if (achievedSegments.length > 1) {
		const parts: string[] = [];
		for (let i = 0; i < achievedSegments.length; i++) {
			if (i === 0) {
				parts.push(`Ananda ${muridNama} ${achievedSegments[i]}`);
			} else if (i === achievedSegments.length - 1) {
				// Last segment gets "serta" prefix
				const lastPhrase = achievedSegments[i].startsWith('cukup mampu')
					? achievedSegments[i].replace('cukup mampu', 'serta cukup mampu dalam')
					: `serta ${achievedSegments[i]}`;
				parts.push(lastPhrase);
			} else {
				parts.push(achievedSegments[i]);
			}
		}
		achievedParagraph = parts.join('; ') + '.';
	}

	// Build "belum tercapai" paragraph
	const needList = tpsByPredikat['perlu-bimbingan'] || [];
	let notAchievedParagraph = '';
	if (needList.length) {
		const cleanDescs = needList.map((d) => lowercaseFirstChar(d.replace(/[.!?]+$/gu, '').trim()));
		const joined = joinList(cleanDescs);
		notAchievedParagraph = `Ananda ${muridNama} masih perlu bimbingan dalam ${joined}.`;
	}

	// Return both paragraphs separated by newline, or just the achieved one if no belum tercapai
	if (achievedParagraph && notAchievedParagraph) {
		return `${achievedParagraph}\n${notAchievedParagraph}`;
	}
	if (achievedParagraph) return achievedParagraph;
	if (notAchievedParagraph) return notAchievedParagraph;
	return '';
}
export type KeasramaanRow = {
	no: number;
	indikator: string;
	predikat: PredikatKey | '';
	deskripsi: string;
	kategoriHeader?: string; // untuk grouping header
};

export type KeasramaanPrintData = {
	sekolah: {
		nama: string;
		alamat: string;
		logoUrl: string | null;
		jenjangVariant: string | null;
	};
	murid: {
		nama: string;
		nis: string;
		nisn: string;
	};
	rombel: {
		nama: string;
		fase: string;
		label?: string;
	};
	periode: {
		tahunAjaran: string;
		semester: string;
	};
	waliAsrama: { nama: string; nip: string } | null;
	waliKelas: { nama: string; nip: string } | null;
	waliAsuh: { nama: string; nip: string } | null;
	kepalaSekolah: { nama: string; nip: string } | null;
	ttd: {
		tempat: string;
		tanggal: string;
	};
	kehadiran: {
		sakit: number;
		izin: number;
		alfa: number;
	};
	keasramaanRows: KeasramaanRow[];
	catatanWaliAsrama?: string;
};

async function placementReport(locals: App.Locals, url: URL, studentId: number) {
	const placementId = optionalInteger('penempatan_id', url.searchParams.get('penempatan_id'));
	const semesterId = optionalInteger('semester_id', url.searchParams.get('semester_id'));
	const [placement] = await evaluationRows<{ id: number; kamar_id: number; semester_id: number }>(
		`SELECT p.id,p.kamar_id,m.semester_id
	 FROM asrama_penempatan p JOIN murid_identity_link mi ON mi.identity_uid=p.identity_uid AND mi.sekolah_id=p.sekolah_id
	 JOIN murid m ON m.id=mi.murid_id WHERE m.id=? AND p.sekolah_id=? AND (? IS NULL OR p.id=?)
	 AND (? IS NULL OR m.semester_id=?) ORDER BY (p.selesai IS NULL) DESC,p.mulai DESC,p.id DESC LIMIT 1`,
		[
			studentId,
			locals.sekolah!.id,
			placementId ?? null,
			placementId ?? null,
			semesterId ?? null,
			semesterId ?? null
		]
	);
	if (!placement) error(404, 'Penempatan asrama murid tidak ditemukan pada periode ini.');
	const scoped = new URL(url);
	scoped.searchParams.set('kamar_id', String(placement.kamar_id));
	scoped.searchParams.set('semester_id', String(placement.semester_id));
	scoped.searchParams.set('riwayat', '1');
	const ctx = await dormEvaluationContext({
		locals,
		url: scoped,
		cookies: { get: () => undefined } as never
	});
	const selected = ctx.students.find((s) => s.penempatan_id === placement.id && s.id === studentId);
	if (!selected || !ctx.room || !ctx.period)
		error(403, 'Murid berada di luar asrama, periode, atau anak binaan akun ini.');
	const pupil = await db.query.tableMurid.findFirst({ where: eq(tableMurid.id, selected.id) });
	const period = await db.query.tableSemester.findFirst({
		where: (t, { eq }) => eq(t.id, ctx.period!.id)
	});
	if (!pupil || !period) error(404, 'Data murid atau periode tidak ditemukan.');
	const rows: KeasramaanRow[] = [];
	const mode = parseTPMode(url.searchParams.get('full_tp'));
	for (const [index, evaluation] of ctx.evaluations.entries()) {
		rows.push({
			no: 0,
			indikator: evaluation.nama,
			predikat: 'cukup',
			deskripsi: '',
			kategoriHeader: `${String.fromCharCode(65 + index)}. ${evaluation.nama}`
		});
		const indicators = [
			...new Set(ctx.goals.filter((t) => t.evaluasi_id === evaluation.id).map((t) => t.indikator))
		];
		for (const [i, indicator] of indicators.entries()) {
			const values = ctx.goals
				.filter((t) => t.evaluasi_id === evaluation.id && t.indikator === indicator)
				.flatMap((t) => {
					const grade = ctx.grades.find(
						(n) => n.penempatan_id === placement.id && n.tujuan_id === t.id
					);
					return grade
						? [
								{
									nilai: kategoriToRubrikValue(grade.kategori),
									deskripsi: t.deskripsi,
									predikat: grade.kategori
								}
							]
						: [];
				});
			const average = hitungNilaiIndikator(values.map((v) => v.nilai));
			const predikat = ({ A: 'sangat-baik', B: 'baik', C: 'cukup', D: 'perlu-bimbingan' } as const)[
				nilaiAngkaToHuruf(average) as 'A' | 'B' | 'C' | 'D'
			];
			const grouped: Record<PredikatKey, string[]> = {
				'sangat-baik': [],
				baik: [],
				cukup: [],
				'perlu-bimbingan': []
			};
			for (const v of values) grouped[v.predikat].push(v.deskripsi);
			rows.push({
				no: i + 1,
				indikator: indicator,
				predikat: values.length ? (predikat ?? 'cukup') : '',
				deskripsi: values.length
					? mode === 'compact'
						? buildKeasramaanCompactMode(pupil.nama, values)
						: buildKeasramaanFullDescMode(pupil.nama, grouped)
					: 'Belum dinilai.'
			});
		}
	}
	const signatureDate = ctx.period.aktif
		? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
		: ctx.period.selesai;
	const [guardian] = await evaluationRows<{ nama: string; nip: string }>(
		`SELECT w.nama_snapshot nama,e.nip FROM asrama_penugasan w JOIN pegawai e ON e.id=w.pegawai_id WHERE w.kamar_id=? AND w.peran='utama' AND w.mulai<=? AND (w.selesai IS NULL OR w.selesai>?) ORDER BY w.mulai DESC LIMIT 1`,
		[placement.kamar_id, signatureDate, signatureDate]
	);
	const [caregiver] = await evaluationRows<{ nama: string; nip: string }>(
		`SELECT n.wali_asuh_nama_snapshot nama,n.wali_asuh_nip_snapshot nip FROM asrama_evaluasi_nilai n JOIN asrama_evaluasi_tujuan t ON t.id=n.tujuan_id JOIN asrama_evaluasi e ON e.id=t.evaluasi_id WHERE n.penempatan_id=? AND e.semester_id=? AND n.wali_asuh_nama_snapshot IS NOT NULL ORDER BY n.updated_at DESC,n.id DESC LIMIT 1`,
		[placement.id, ctx.period.id]
	);
	const [note] = await evaluationRows<{ catatan: string }>(
		'SELECT catatan FROM asrama_evaluasi_catatan WHERE penempatan_id=? AND semester_id=?',
		[placement.id, ctx.period.id]
	);
	const school = locals.sekolah!;
	const data: KeasramaanPrintData = {
		sekolah: {
			nama: school.nama,
			alamat: composeAlamat(school),
			logoUrl: await getLogoSrc(school.id),
			jenjangVariant: school.jenjangVariant ?? null
		},
		murid: { nama: pupil.nama, nis: pupil.nis, nisn: pupil.nisn },
		rombel: {
			nama:
				ctx.room.asrama === ctx.room.nama ? ctx.room.nama : `${ctx.room.asrama} / ${ctx.room.nama}`,
			fase: '',
			label: 'Asrama'
		},
		periode: { tahunAjaran: ctx.period.tahun, semester: ctx.period.nama },
		waliAsrama: guardian ?? null,
		waliKelas: null,
		waliAsuh:
			caregiver ??
			(pupil.waliAsuhNama ? { nama: pupil.waliAsuhNama, nip: pupil.waliAsuhNip ?? '' } : null),
		kepalaSekolah: school.kepalaSekolah
			? { nama: school.kepalaSekolah.nama, nip: school.kepalaSekolah.nip ?? '' }
			: null,
		ttd: { tempat: fallbackTempat(school), tanggal: formatTanggal(period.tanggalBagiRaport) },
		kehadiran: await computeRaporAttendance(school.id, period.tahunAjaranId, pupil.id, period),
		keasramaanRows: rows,
		catatanWaliAsrama: note?.catatan ?? ''
	};
	return { meta: { title: `Rapor Keasramaan - ${pupil.nama}` }, keasramaanData: data };
}

export async function getKeasramaanPreviewPayload({ locals, url }: KeasramaanContext) {
	await ensureDormEvaluationSchema();
	const sekolah = locals.sekolah;
	if (!sekolah?.id) {
		throw error(404, 'Sekolah tidak ditemukan.');
	}

	const muridId = optionalInteger('murid_id', url.searchParams.get('murid_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));
	const tpMode = parseTPMode(url.searchParams.get('full_tp'));

	// If no murid_id provided, return null (used in bulk preview mode)
	if (!muridId) {
		return null;
	}
	if (
		url.searchParams.has('penempatan_id') ||
		url.searchParams.has('kamar_id') ||
		(!kelasId && url.searchParams.get('sumber') !== 'kelas')
	)
		return placementReport(locals, url, muridId);

	const murid = await db.query.tableMurid.findFirst({
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolah.id)),
		with: {
			kelas: {
				with: {
					waliKelas: true,
					waliAsrama: true,
					tahunAjaran: true,
					semester: true
				}
			}
		}
	});

	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan.');
	}

	// Wali_asuh: only allow viewing their own students
	const userWithType = locals.user as { type?: string; pegawaiId?: number } | null;
	if (
		userWithType?.type === 'wali_asuh' &&
		userWithType.pegawaiId &&
		!hasSchoolWideOperationalAccess(locals.user)
	) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: eq(tablePegawai.id, userWithType.pegawaiId)
		});
		if (!peg || murid.waliAsuhPegawaiId !== userWithType.pegawaiId) {
			throw error(403, 'Anda hanya dapat mencetak rapor keasramaan murid asuhan sendiri');
		}
	}

	let legacyClassId = kelasId ?? murid.kelasId;
	if (!legacyClassId) {
		const candidates = await evaluationRows<{ kelas_id: number }>(
			`SELECT DISTINCT e.kelas_id FROM asesmen_keasramaan n JOIN keasramaan e ON e.id=n.keasramaan_id JOIN kelas k ON k.id=e.kelas_id WHERE n.murid_id=? AND k.sekolah_id=? AND k.semester_id=?`,
			[murid.id, sekolah.id, murid.semesterId]
		);
		if (candidates.length !== 1) error(409, 'Pilih kelas asal pada riwayat rapor murid.');
		legacyClassId = candidates[0].kelas_id;
	}
	const kelasData = await db.query.tableKelas.findFirst({
		where: (k, { and, eq }) =>
			and(
				eq(k.id, legacyClassId!),
				eq(k.sekolahId, sekolah.id),
				eq(k.semesterId, murid.semesterId)
			),
		with: { waliKelas: true, waliAsrama: true, tahunAjaran: true, semester: true }
	});
	if (!kelasData || !(await canAccessExportClass(locals.user, sekolah.id, kelasData.id)))
		error(403, 'Kelas rapor lama berada di luar periode atau penugasan.');
	if (murid.kelasId !== kelasData.id) {
		const history = await db.query.tableMuridRiwayatKelas.findFirst({
			where: (h, { and, eq }) =>
				and(
					eq(h.sekolahId, sekolah.id),
					eq(h.muridId, murid.id),
					eq(h.kelasId, kelasData.id),
					eq(h.semesterId, murid.semesterId)
				)
		});
		if (!history) error(409, 'Riwayat kelas asal belum dapat dipastikan.');
	}

	// Fetch all keasramaan evaluations for this class
	const keasramaanList = await db.query.tableKeasramaan.findMany({
		where: eq(tableKeasramaan.kelasId, kelasData.id),
		with: {
			indikator: {
				orderBy: asc(tableKeasramaanIndikator.id),
				with: {
					tujuan: {
						orderBy: asc(tableKeasramaanTujuan.id)
					}
				}
			}
		},
		orderBy: asc(tableKeasramaan.id)
	});

	// Fetch all assessments for this student
	const asesmenList = await db.query.tableAsesmenKeasramaan.findMany({
		where: eq(tableAsesmenKeasramaan.muridId, murid.id),
		with: {
			tujuan: {
				with: {
					indikator: true
				}
			},
			keasramaan: true
		}
	});

	// Build a map of assessments grouped by (keasramaanId -> indikatorId -> array of TP values and descriptions)
	type IndicatorAssessment = {
		nilaiTP: (number | null)[]; // Array of rubrik values (1-4) from each TP
		tpDescriptions: string[]; // Array of TP descriptions
	};
	type AsesmenByIndicator = Record<number, IndicatorAssessment>;
	type AsesmenByKeasramaan = Record<number, AsesmenByIndicator>;
	const asesmenMap: AsesmenByKeasramaan = {};

	for (const item of asesmenList) {
		if (!item.keasramaan || !item.tujuan) continue;
		const keasramaanId = item.keasramaan.id;
		const indikatorId = item.tujuan.indikatorId;
		const kategori = item.kategori as PredikatKey;
		const rubrikValue = kategoriToRubrikValue(kategori);

		if (!asesmenMap[keasramaanId]) {
			asesmenMap[keasramaanId] = {};
		}
		if (!asesmenMap[keasramaanId][indikatorId]) {
			asesmenMap[keasramaanId][indikatorId] = {
				nilaiTP: [],
				tpDescriptions: []
			};
		}

		asesmenMap[keasramaanId][indikatorId].nilaiTP.push(rubrikValue);
		asesmenMap[keasramaanId][indikatorId].tpDescriptions.push(item.tujuan.deskripsi);
	}

	// Build final rows: group by keasramaan, then list indikators with calculated predikat
	const finalRows: KeasramaanRow[] = [];

	for (let keasramaanIndex = 0; keasramaanIndex < keasramaanList.length; keasramaanIndex++) {
		const keasramaan = keasramaanList[keasramaanIndex];
		// Generate category letter (A, B, C, ...)
		const categoryLetter = String.fromCharCode(65 + keasramaanIndex);
		const categoryHeaderText = `${categoryLetter}. ${keasramaan.nama}`;

		// Add category header
		finalRows.push({
			no: 0,
			indikator: keasramaan.nama,
			predikat: 'cukup',
			deskripsi: '',
			kategoriHeader: categoryHeaderText
		});

		const asesmenForKeasramaan = asesmenMap[keasramaan.id] ?? {};

		// Reset row number for each category
		let categoryRowNumber = 1;

		// Collect indikators for this keasramaan with calculated predikat
		const indikatorList = keasramaan.indikator
			.map((ind) => {
				const asesmen = asesmenForKeasramaan[ind.id];

				// Calculate indicator predikat from average of TP values
				let predikat: PredikatKey = 'cukup';
				let deskripsi = '';

				if (asesmen && asesmen.nilaiTP.length > 0) {
					// Calculate average nilai indikator from TP values
					const nilaiIndikator = hitungNilaiIndikator(asesmen.nilaiTP as (number | null)[]);

					if (nilaiIndikator !== null) {
						// Convert average to huruf (A, B, C, D)
						const huruf = nilaiAngkaToHuruf(nilaiIndikator);

						// Map huruf back to predikat key
						const hurfToPredikat: Record<string, PredikatKey> = {
							A: 'sangat-baik',
							B: 'baik',
							C: 'cukup',
							D: 'perlu-bimbingan'
						};
						predikat = hurfToPredikat[huruf || 'C'] || 'cukup';
					}

					// Build descriptive text based on tpMode
					if (tpMode === 'compact') {
						// Build individual TP data for compact mode
						const tpData: KeasramaanTPData[] = [];

						for (let i = 0; i < asesmen.nilaiTP.length; i++) {
							const tpNilai = asesmen.nilaiTP[i];
							const tpDesc = asesmen.tpDescriptions[i];
							if (tpNilai === null || !tpDesc) continue;

							const tpHuruf = nilaiAngkaToHuruf(tpNilai as number);
							const tpHurfToPredikat: Record<string, PredikatKey> = {
								A: 'sangat-baik',
								B: 'baik',
								C: 'cukup',
								D: 'perlu-bimbingan'
							};
							const tpPredikat = tpHurfToPredikat[tpHuruf || 'C'] || 'cukup';
							tpData.push({ nilai: tpNilai as number, deskripsi: tpDesc, predikat: tpPredikat });
						}

						deskripsi = buildKeasramaanCompactMode(murid.nama, tpData);
					} else {
						// Build full-desc by grouping all TP by their predikat
						const tpsByPredikat: Record<PredikatKey, string[]> = {
							'sangat-baik': [],
							baik: [],
							cukup: [],
							'perlu-bimbingan': []
						};

						for (let i = 0; i < asesmen.nilaiTP.length; i++) {
							const tpNilai = asesmen.nilaiTP[i];
							const tpDesc = asesmen.tpDescriptions[i];
							if (tpNilai === null || !tpDesc) continue;

							const tpHuruf = nilaiAngkaToHuruf(tpNilai as number);
							const tpHurfToPredikat: Record<string, PredikatKey> = {
								A: 'sangat-baik',
								B: 'baik',
								C: 'cukup',
								D: 'perlu-bimbingan'
							};
							const tpPredikat = tpHurfToPredikat[tpHuruf || 'C'] || 'cukup';
							tpsByPredikat[tpPredikat].push(tpDesc);
						}

						deskripsi = buildKeasramaanFullDescMode(murid.nama, tpsByPredikat);
					}
				}

				return {
					indikator: ind,
					predikat,
					deskripsi
				};
			})
			.sort((a, b) => {
				const scoreA = PREDIKAT_MAP[a.predikat].order;
				const scoreB = PREDIKAT_MAP[b.predikat].order;
				return scoreB - scoreA; // Highest first
			});

		for (const item of indikatorList) {
			finalRows.push({
				no: categoryRowNumber++,
				indikator: item.indikator.deskripsi,
				predikat: item.predikat,
				deskripsi: item.deskripsi
			});
		}
	}

	const ttdTanggal = formatTanggal(kelasData.semester?.tanggalBagiRaport);
	const ttdTempat = fallbackTempat(sekolah);

	const logoSrc = await getLogoSrc(sekolah.id);

	const computedKehadiran =
		kelasData.semester?.id && kelasData.tahunAjaran?.id
			? await computeRaporAttendance(
					sekolah.id,
					kelasData.tahunAjaran.id,
					murid.id,
					kelasData.semester
				)
			: { sakit: 0, izin: 0, alfa: 0 };

	const keasramaanData: KeasramaanPrintData = {
		sekolah: {
			nama: (await getClassEducationIdentity(sekolah.id, kelasData.id)).nama,
			alamat: composeAlamat(sekolah),
			logoUrl: logoSrc,
			jenjangVariant: sekolah.jenjangVariant ?? null
		},
		murid: {
			nama: murid.nama,
			nis: murid.nis,
			nisn: murid.nisn
		},
		rombel: {
			nama: kelasData.nama ?? '',
			fase: kelasData.fase ?? ''
		},
		periode: {
			tahunAjaran: kelasData.tahunAjaran?.nama ?? '',
			semester: kelasData.semester?.nama ?? ''
		},
		waliAsrama: kelasData.waliAsrama
			? { nama: kelasData.waliAsrama.nama, nip: kelasData.waliAsrama.nip ?? '' }
			: null,
		waliKelas: kelasData.waliKelas
			? { nama: kelasData.waliKelas.nama, nip: kelasData.waliKelas.nip ?? '' }
			: null,
		waliAsuh: murid.waliAsuhNama
			? { nama: murid.waliAsuhNama, nip: murid.waliAsuhNip ?? '' }
			: null,
		kepalaSekolah: sekolah.kepalaSekolah
			? ({
					nama: sekolah.kepalaSekolah.nama,
					nip: sekolah.kepalaSekolah.nip ?? '',
					statusKepalaSekolah: sekolah.statusKepalaSekolah ?? 'definitif'
				} as KeasramaanPrintData['kepalaSekolah'])
			: null,
		ttd: {
			tempat: ttdTempat,
			tanggal: ttdTanggal
		},
		kehadiran: {
			sakit: computedKehadiran.sakit,
			izin: computedKehadiran.izin,
			alfa: computedKehadiran.alfa
		},
		keasramaanRows: finalRows
	};

	return {
		meta: {
			title: `Rapor Keasramaan - ${murid.nama}`
		},
		keasramaanData
	};
}
