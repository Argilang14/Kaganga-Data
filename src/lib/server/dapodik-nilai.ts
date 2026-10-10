import db from '$lib/server/db';
import { assertSingleSchoolDapodikWrite } from '$lib/server/education-units';
import {
	tableAsesmenSumatif,
	tableAsesmenSumatifTujuan,
	tableDapodikNilaiKirim,
	tableDapodikSettings,
	tableDapodikSyncLog,
	tableKelas,
	tableMataPelajaran,
	tableMurid,
	tableSekolah,
	tableSemester,
	tableTahunAjaran,
	tableTujuanPembelajaran
} from '$lib/server/db/schema';
import {
	dapodikDeterministicUuid,
	dapodikNilaiSelectionKey,
	DapodikInputError,
	normalizeDapodikDescription,
	normalizeDapodikScore,
	normalizeWebServiceUrl,
	parseDapodikSemesterId
} from '$lib/dapodik-utils';
import { buildCapaianKompetensi, type TujuanScoreEntry } from '$lib/rapor-modes';
import { and, eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';

type Row = Record<string, unknown>;
type Input = { url?: string; token?: string; npsn?: string; semesterId?: string };
type Credentials = { base: string; token: string; npsn: string };

export type DapodikNilaiPreviewItem = {
	key: string;
	kelasId: number;
	kelas: string;
	mapelId: number;
	mapel: string;
	nilaiSiap: number;
	totalMurid: number;
	tanpaBinding: number;
	nilaiKosong: number;
	status: 'siap' | 'sebagian' | 'dilewati';
	alasan: string | null;
};

export type DapodikNilaiPreview = {
	semesterId: string;
	tahunAjaran: string;
	semester: 'ganjil' | 'genap';
	items: DapodikNilaiPreviewItem[];
	summary: { kelas: number; mapel: number; nilaiSiap: number; dilewati: number };
	warnings: string[];
};

export type DapodikNilaiSendResult = {
	message: string;
	semesterId: string;
	matevSent: number;
	matevFailed: number;
	nilaiSent: number;
	nilaiFailed: number;
};

type StudentScore = {
	muridId: number;
	nama: string;
	anggotaRombelId: string | null;
	nilai: number | null;
	deskripsi: string | null;
};

type Candidate = {
	key: string;
	kelasId: number;
	kelas: string;
	rombelId: string | null;
	mapelId: number;
	mapel: string;
	kkm: number;
	pembelajaranId: string | null;
	mataPelajaranDapodikId: string | null;
	students: StudentScore[];
};

class DapodikNilaiError extends DapodikInputError {}

function rowsOf(value: unknown): Row[] {
	if (Array.isArray(value)) return value as Row[];
	if (!value || typeof value !== 'object') return [];
	const container = value as Row;
	if (Array.isArray(container.rows)) return container.rows as Row[];
	if (container.rows && typeof container.rows === 'object') return [container.rows as Row];
	if (Array.isArray(container.datas)) return container.datas as Row[];
	return [container];
}

function rowString(row: Row, key: string) {
	const value = row[key];
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (typeof value === 'number') return String(value);
	return null;
}

function parseResponse(text: string) {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(text.slice(start, end + 1)) as unknown;
			} catch {
				// Pesan konsisten ditampilkan di bawah.
			}
		}
		throw new DapodikNilaiError('Respons Dapodik bukan JSON yang valid.');
	}
}

async function request(
	credentials: Credentials,
	endpoint: string,
	semesterId: string,
	options?: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: Row }
) {
	const query = new URLSearchParams({
		npsn: credentials.npsn,
		semester_id: semesterId,
		...(options?.query ?? {})
	});
	let response: Response;
	try {
		response = await fetch(`${credentials.base}/${endpoint}?${query}`, {
			method: options?.method ?? 'GET',
			headers: {
				Authorization: `Bearer ${credentials.token}`,
				Accept: 'application/json',
				...(options?.method === 'POST' ? { 'Content-Type': 'application/json' } : {})
			},
			body: options?.method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
			signal: AbortSignal.timeout(20_000)
		});
	} catch (error) {
		throw new DapodikNilaiError(`Tidak dapat menghubungi Dapodik: ${(error as Error).message}`);
	}
	const data = parseResponse(await response.text());
	const payload = data as Row;
	if (!response.ok || payload.success === false) {
		throw new DapodikNilaiError(
			typeof payload.message === 'string'
				? payload.message
				: `Permintaan ${endpoint} gagal (HTTP ${response.status}).`
		);
	}
	return data;
}

async function resolveCredentials(sekolahId: number, input: Input): Promise<Credentials> {
	const saved = await db.query.tableDapodikSettings.findFirst({
		where: eq(tableDapodikSettings.sekolahId, sekolahId)
	});
	const base = normalizeWebServiceUrl(input.url?.trim() || saved?.url || '');
	const token = input.token?.trim() || saved?.token || '';
	const npsn = input.npsn?.trim() || saved?.npsn || '';
	if (!token) throw new DapodikNilaiError('Token WebService Dapodik wajib diisi.');
	if (!npsn) throw new DapodikNilaiError('NPSN wajib diisi.');
	return { base, token, npsn };
}

async function resolveSemester(sekolahId: number, requested?: string) {
	const settings = await db.query.tableDapodikSettings.findFirst({
		where: eq(tableDapodikSettings.sekolahId, sekolahId)
	});
	const dapodikId = requested?.trim() || settings?.semesterIdDapodikTerakhir || '';
	const parsed = parseDapodikSemesterId(dapodikId);
	if (!parsed) {
		throw new DapodikNilaiError(
			'Isi semester Dapodik yang valid, misalnya 20261 untuk ganjil atau 20262 untuk genap.'
		);
	}
	const semester = await db
		.select({ id: tableSemester.id })
		.from(tableSemester)
		.innerJoin(tableTahunAjaran, eq(tableSemester.tahunAjaranId, tableTahunAjaran.id))
		.where(
			and(
				eq(tableTahunAjaran.sekolahId, sekolahId),
				eq(tableTahunAjaran.nama, parsed.namaTahun),
				eq(tableSemester.tipe, parsed.tipe)
			)
		)
		.then((rows) => rows[0]);
	if (!semester) {
		throw new DapodikNilaiError(
			`Semester ${parsed.namaTahun} ${parsed.tipe} belum tersedia di Kaganga.`
		);
	}
	return { dapodikId, parsed, localId: semester.id };
}

async function buildCandidates(sekolahId: number, semesterId: number): Promise<Candidate[]> {
	const classes = await db
		.select({
			id: tableKelas.id,
			nama: tableKelas.nama,
			rombelId: tableKelas.dapodikRombonganBelajarId
		})
		.from(tableKelas)
		.where(and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, semesterId)));
	if (!classes.length) return [];

	const classIds = classes.map((item) => item.id);
	const [mapels, students] = await Promise.all([
		db
			.select({
				id: tableMataPelajaran.id,
				kelasId: tableMataPelajaran.kelasId,
				nama: tableMataPelajaran.nama,
				namaLokal: tableMataPelajaran.namaLokal,
				kkm: tableMataPelajaran.kkm,
				pembelajaranId: tableMataPelajaran.dapodikPembelajaranId,
				mataPelajaranDapodikId: tableMataPelajaran.dapodikMataPelajaranId
			})
			.from(tableMataPelajaran)
			.where(inArray(tableMataPelajaran.kelasId, classIds)),
		db
			.select({
				id: tableMurid.id,
				kelasId: tableMurid.kelasId,
				nama: tableMurid.nama,
				anggotaRombelId: tableMurid.dapodikAnggotaRombelId
			})
			.from(tableMurid)
			.where(
				and(
					eq(tableMurid.sekolahId, sekolahId),
					eq(tableMurid.semesterId, semesterId),
					inArray(tableMurid.kelasId, classIds)
				)
			)
	]);
	const scores =
		mapels.length && students.length
			? await db
					.select({
						muridId: tableAsesmenSumatif.muridId,
						mapelId: tableAsesmenSumatif.mataPelajaranId,
						nilai: tableAsesmenSumatif.nilaiAkhir
					})
					.from(tableAsesmenSumatif)
					.where(
						and(
							inArray(
								tableAsesmenSumatif.muridId,
								students.map((item) => item.id)
							),
							inArray(
								tableAsesmenSumatif.mataPelajaranId,
								mapels.map((item) => item.id)
							)
						)
					)
			: [];
	const tujuanScores =
		mapels.length && students.length
			? await db
					.select({
						muridId: tableAsesmenSumatifTujuan.muridId,
						mapelId: tableAsesmenSumatifTujuan.mataPelajaranId,
						tujuanPembelajaranId: tableAsesmenSumatifTujuan.tujuanPembelajaranId,
						deskripsi: tableTujuanPembelajaran.deskripsi,
						nilai: tableAsesmenSumatifTujuan.nilai
					})
					.from(tableAsesmenSumatifTujuan)
					.innerJoin(
						tableTujuanPembelajaran,
						eq(tableAsesmenSumatifTujuan.tujuanPembelajaranId, tableTujuanPembelajaran.id)
					)
					.where(
						and(
							inArray(
								tableAsesmenSumatifTujuan.muridId,
								students.map((item) => item.id)
							),
							inArray(
								tableAsesmenSumatifTujuan.mataPelajaranId,
								mapels.map((item) => item.id)
							)
						)
					)
			: [];
	const scoreByPair = new Map(
		scores.map((item) => [`${item.muridId}:${item.mapelId}`, item.nilai])
	);
	const tujuanByPair = new Map<string, TujuanScoreEntry[]>();
	for (const item of tujuanScores) {
		if (item.nilai == null) continue;
		const key = `${item.muridId}:${item.mapelId}`;
		const entries = tujuanByPair.get(key) ?? [];
		entries.push({
			tujuanPembelajaranId: item.tujuanPembelajaranId,
			deskripsi: item.deskripsi,
			nilai: item.nilai
		});
		tujuanByPair.set(key, entries);
	}
	const classById = new Map(classes.map((item) => [item.id, item]));
	return mapels.map((mapel) => {
		const kelas = classById.get(mapel.kelasId)!;
		return {
			key: dapodikNilaiSelectionKey(kelas.id, mapel.id),
			kelasId: kelas.id,
			kelas: kelas.nama,
			rombelId: kelas.rombelId,
			mapelId: mapel.id,
			mapel: mapel.namaLokal || mapel.nama,
			kkm: mapel.kkm,
			pembelajaranId: mapel.pembelajaranId,
			mataPelajaranDapodikId: mapel.mataPelajaranDapodikId,
			students: students
				.filter((student) => student.kelasId === kelas.id)
				.map((student) => {
					const pairKey = `${student.id}:${mapel.id}`;
					return {
						muridId: student.id,
						nama: student.nama,
						anggotaRombelId: student.anggotaRombelId,
						nilai: normalizeDapodikScore(scoreByPair.get(pairKey)),
						deskripsi: normalizeDapodikDescription(
							buildCapaianKompetensi(student.nama, tujuanByPair.get(pairKey) ?? [], mapel.kkm)
						)
					};
				})
		};
	});
}

function itemFromCandidate(candidate: Candidate): DapodikNilaiPreviewItem {
	const hasMapelBinding = Boolean(
		candidate.rombelId && candidate.pembelajaranId && candidate.mataPelajaranDapodikId
	);
	const nilaiSiap = hasMapelBinding
		? candidate.students.filter((student) => student.anggotaRombelId && student.nilai != null)
				.length
		: 0;
	const tanpaBinding = candidate.students.filter((student) => !student.anggotaRombelId).length;
	const nilaiKosong = candidate.students.filter((student) => student.nilai == null).length;
	let alasan: string | null = null;
	if (!candidate.rombelId) alasan = 'Kelas belum memiliki ID rombel Dapodik.';
	else if (!candidate.pembelajaranId || !candidate.mataPelajaranDapodikId) {
		alasan = 'Mata pelajaran belum memiliki binding pembelajaran Dapodik.';
	} else if (!candidate.students.length) alasan = 'Kelas belum memiliki murid.';
	else if (!nilaiSiap) alasan = 'Belum ada nilai dengan binding anggota rombel yang lengkap.';
	return {
		key: candidate.key,
		kelasId: candidate.kelasId,
		kelas: candidate.kelas,
		mapelId: candidate.mapelId,
		mapel: candidate.mapel,
		nilaiSiap,
		totalMurid: candidate.students.length,
		tanpaBinding,
		nilaiKosong,
		status: alasan ? 'dilewati' : tanpaBinding || nilaiKosong ? 'sebagian' : 'siap',
		alasan
	};
}

function fingerprint(credentials: Credentials, dapodikSemesterId: string, candidates: Candidate[]) {
	return createHash('sha256')
		.update(
			JSON.stringify({
				base: credentials.base,
				token: credentials.token,
				npsn: credentials.npsn,
				semester: dapodikSemesterId,
				rows: candidates.map((candidate) => ({
					key: candidate.key,
					rombel: candidate.rombelId,
					pb: candidate.pembelajaranId,
					mp: candidate.mataPelajaranDapodikId,
					students: candidate.students.map((student) => [
						student.muridId,
						student.anggotaRombelId,
						student.nilai,
						student.deskripsi
					])
				}))
			})
		)
		.digest('hex');
}

async function buildPreview(sekolahId: number, input: Input) {
	const credentials = await resolveCredentials(sekolahId, input);
	const semester = await resolveSemester(sekolahId, input.semesterId);
	const candidates = await buildCandidates(sekolahId, semester.localId);
	const items = candidates.map(itemFromCandidate);
	const ready = items.filter((item) => item.status !== 'dilewati');
	const preview: DapodikNilaiPreview = {
		semesterId: semester.dapodikId,
		tahunAjaran: semester.parsed.namaTahun,
		semester: semester.parsed.tipe,
		items,
		summary: {
			kelas: new Set(items.map((item) => item.kelasId)).size,
			mapel: ready.length,
			nilaiSiap: ready.reduce((total, item) => total + item.nilaiSiap, 0),
			dilewati: items.filter((item) => item.status === 'dilewati').length
		},
		warnings: [
			'Hanya nilai akhir sumatif 0-100 yang dikirim.',
			'Deskripsi capaian tujuan pembelajaran dikirim bila tersedia, maksimal 300 karakter.',
			'Murid tanpa ID anggota rombel dan mapel tanpa binding Dapodik selalu dilewati.',
			'Pratinjau berlaku satu jam dan batal otomatis bila nilai atau binding berubah.'
		]
	};
	return { credentials, semester, candidates, preview };
}

async function writeLog(
	sekolahId: number,
	action: 'preview_nilai' | 'send_nilai',
	status: 'success' | 'failed',
	message: string,
	semesterDapodik?: string,
	summary?: Record<string, unknown>
) {
	await db.insert(tableDapodikSyncLog).values({
		sekolahId,
		action,
		status,
		message,
		semesterDapodik: semesterDapodik ?? null,
		summary: summary ?? null
	});
}

export async function previewDapodikNilai(
	sekolahId: number,
	input: Input
): Promise<DapodikNilaiPreview> {
	try {
		await assertSingleSchoolDapodikWrite(sekolahId);
		const built = await buildPreview(sekolahId, input);
		await request(built.credentials, 'getSekolah', built.semester.dapodikId);
		await db
			.update(tableDapodikSettings)
			.set({
				lastNilaiPreviewAt: new Date().toISOString(),
				lastNilaiPreviewFingerprint: fingerprint(
					built.credentials,
					built.semester.dapodikId,
					built.candidates
				)
			})
			.where(eq(tableDapodikSettings.sekolahId, sekolahId));
		await writeLog(
			sekolahId,
			'preview_nilai',
			'success',
			'Pratinjau pengiriman nilai berhasil.',
			built.semester.dapodikId,
			built.preview.summary
		);
		return built.preview;
	} catch (error) {
		await writeLog(
			sekolahId,
			'preview_nilai',
			'failed',
			error instanceof Error ? error.message : 'Pratinjau nilai gagal.',
			input.semesterId
		);
		throw error;
	}
}

function dapodikTimestamp(offsetMinutes = 0) {
	return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

async function resolveUpdaterId(
	credentials: Credentials,
	semesterId: string,
	candidates: string[]
) {
	try {
		const users = rowsOf(await request(credentials, 'getPengguna', semesterId));
		const wanted = new Set(candidates.map((item) => item.trim().toLowerCase()).filter(Boolean));
		for (const user of users) {
			const username = rowString(user, 'username')?.toLowerCase();
			const id = rowString(user, 'pengguna_id');
			if (username && id && wanted.has(username)) return id;
		}
	} catch {
		// updater_id bersifat opsional menurut kontrak WebService.
	}
	return null;
}

async function journal(
	sekolahId: number,
	semesterId: number,
	candidate: Candidate,
	student: StudentScore,
	nilaiId: string,
	idEvaluasi: string,
	payload: Row,
	status: 'sent' | 'failed',
	message: string | null
) {
	const now = new Date().toISOString();
	await db
		.insert(tableDapodikNilaiKirim)
		.values({
			sekolahId,
			semesterId,
			mataPelajaranId: candidate.mapelId,
			muridId: student.muridId,
			dapodikNilaiId: nilaiId,
			dapodikIdEvaluasi: idEvaluasi,
			payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
			status,
			message,
			sentAt: status === 'sent' ? now : null,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: [
				tableDapodikNilaiKirim.sekolahId,
				tableDapodikNilaiKirim.semesterId,
				tableDapodikNilaiKirim.mataPelajaranId,
				tableDapodikNilaiKirim.muridId
			],
			set: {
				dapodikNilaiId: nilaiId,
				dapodikIdEvaluasi: idEvaluasi,
				payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
				status,
				message,
				sentAt: status === 'sent' ? now : null,
				updatedAt: now
			}
		});
}

export async function sendDapodikNilai(
	sekolahId: number,
	input: Input & { selectedKeys: string[] }
): Promise<DapodikNilaiSendResult> {
	let semesterDapodik = input.semesterId;
	try {
		await assertSingleSchoolDapodikWrite(sekolahId);
		if (!input.selectedKeys.length)
			throw new DapodikNilaiError('Pilih minimal satu mata pelajaran.');
		const built = await buildPreview(sekolahId, input);
		semesterDapodik = built.semester.dapodikId;
		const settings = await db.query.tableDapodikSettings.findFirst({
			where: eq(tableDapodikSettings.sekolahId, sekolahId)
		});
		const previewAge = settings?.lastNilaiPreviewAt
			? Date.now() - new Date(settings.lastNilaiPreviewAt).getTime()
			: Number.POSITIVE_INFINITY;
		if (
			previewAge > 60 * 60 * 1000 ||
			settings?.lastNilaiPreviewFingerprint !==
				fingerprint(built.credentials, built.semester.dapodikId, built.candidates)
		) {
			throw new DapodikNilaiError(
				'Pratinjau nilai berubah atau kedaluwarsa. Buat pratinjau kembali sebelum mengirim.'
			);
		}
		const selected = new Set(input.selectedKeys);
		const candidates = built.candidates.filter(
			(candidate) =>
				selected.has(candidate.key) && itemFromCandidate(candidate).status !== 'dilewati'
		);
		if (!candidates.length)
			throw new DapodikNilaiError('Tidak ada nilai valid pada pilihan tersebut.');

		const school = await db.query.tableSekolah.findFirst({
			where: eq(tableSekolah.id, sekolahId),
			columns: { email: true }
		});
		const updaterId = await resolveUpdaterId(built.credentials, built.semester.dapodikId, [
			school?.email ?? ''
		]);
		const existingMatev = await request(
			built.credentials,
			'getMatevNilai',
			built.semester.dapodikId,
			{ query: { a_dari_template: '1' } }
		)
			.then(rowsOf)
			.catch(() => []);
		const existingByBinding = new Map<string, string>();
		for (const row of existingMatev) {
			const pb = rowString(row, 'pembelajaran_id');
			const mp = rowString(row, 'mata_pelajaran_id');
			const id = rowString(row, 'id_evaluasi');
			if (pb && mp && id) existingByBinding.set(`${pb}|${mp}`, id);
		}

		const result: DapodikNilaiSendResult = {
			message: '',
			semesterId: built.semester.dapodikId,
			matevSent: 0,
			matevFailed: 0,
			nilaiSent: 0,
			nilaiFailed: 0
		};
		for (const [index, candidate] of candidates.entries()) {
			const idEvaluasi =
				existingByBinding.get(`${candidate.pembelajaranId}|${candidate.mataPelajaranDapodikId}`) ??
				dapodikDeterministicUuid(
					`kaganga-matev:${built.semester.dapodikId}:${candidate.rombelId}:${candidate.mapelId}:${candidate.pembelajaranId}:${candidate.mataPelajaranDapodikId}`
				);
			try {
				await request(built.credentials, 'postMatevRapor', built.semester.dapodikId, {
					method: 'POST',
					body: {
						id_evaluasi: idEvaluasi,
						rombongan_belajar_id: candidate.rombelId,
						mata_pelajaran_id: candidate.mataPelajaranDapodikId,
						pembelajaran_id: candidate.pembelajaranId,
						nm_mata_evaluasi: candidate.mapel.slice(0, 40),
						a_dari_template: 1,
						no_urut: index + 1,
						kkm_kognitif: candidate.kkm,
						kkm_psikomotorik: candidate.kkm,
						create_date: dapodikTimestamp(),
						last_update: dapodikTimestamp(360),
						soft_delete: 0,
						last_sync: dapodikTimestamp(330),
						updater_id: updaterId
					}
				});
				result.matevSent++;
			} catch {
				result.matevFailed++;
				continue;
			}

			for (const student of candidate.students) {
				if (!student.anggotaRombelId || student.nilai == null) continue;
				const nilaiId = dapodikDeterministicUuid(
					`kaganga-nilai:${built.semester.dapodikId}:${candidate.mapelId}:${student.muridId}`
				);
				const payload: Row = {
					nilai_id: nilaiId,
					id_evaluasi: idEvaluasi,
					anggota_rombel_id: student.anggotaRombelId,
					nilai_kognitif_angka: student.nilai,
					...(student.deskripsi ? { ket_kognitif: student.deskripsi } : {}),
					create_date: dapodikTimestamp(-60),
					last_update: dapodikTimestamp(),
					soft_delete: 0,
					last_sync: dapodikTimestamp(-30),
					updater_id: updaterId
				};
				try {
					await request(built.credentials, 'postNilai', built.semester.dapodikId, {
						method: 'POST',
						query: { table: 'rapor' },
						body: payload
					});
					result.nilaiSent++;
					await journal(
						sekolahId,
						built.semester.localId,
						candidate,
						student,
						nilaiId,
						idEvaluasi,
						payload,
						'sent',
						null
					);
				} catch (error) {
					result.nilaiFailed++;
					await journal(
						sekolahId,
						built.semester.localId,
						candidate,
						student,
						nilaiId,
						idEvaluasi,
						payload,
						'failed',
						error instanceof Error ? error.message : 'Pengiriman gagal.'
					);
				}
			}
		}
		result.message = `${result.nilaiSent} nilai terkirim${result.nilaiFailed ? `, ${result.nilaiFailed} gagal` : ''}.`;
		await writeLog(
			sekolahId,
			'send_nilai',
			result.nilaiFailed || result.matevFailed ? 'failed' : 'success',
			result.message,
			built.semester.dapodikId,
			result as unknown as Record<string, unknown>
		);
		return result;
	} catch (error) {
		await writeLog(
			sekolahId,
			'send_nilai',
			'failed',
			error instanceof Error ? error.message : 'Pengiriman nilai gagal.',
			semesterDapodik
		);
		throw error;
	}
}
