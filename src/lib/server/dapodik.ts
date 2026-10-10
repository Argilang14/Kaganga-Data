import db from '$lib/server/db';
import { ensureEducationUnitsSchema } from '$lib/server/db/ensure-education-units';
import { assertSingleSchoolDapodikWrite } from '$lib/server/education-units';
import { normalizedNisn, sameMuridPerson } from '$lib/server/murid-identity';
import { validateMuridIdentityInput } from '$lib/server/murid-identity-service';
import { syncMuridGovernance } from '$lib/server/murid-lifecycle';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import {
	tableAlamat,
	tableDapodikMataPelajaran,
	tableDapodikPembelajaran,
	tableDapodikSettings,
	tableDapodikSyncLog,
	tableEkstrakurikuler,
	tableKelas,
	tableMataPelajaran,
	tableMurid,
	tableMuridEkstrakurikuler,
	tablePegawai,
	tableSemester,
	tableSekolah,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
	collectDapodikExtracurricular,
	collectDapodikPembelajaran,
	dapodikPembelajaranKey,
	DapodikInputError,
	normalizeWebServiceUrl,
	parseDapodikSemesterId,
	uniqueDapodikPembelajaran
} from '$lib/dapodik-utils';

export function normMapelName(name: string): string {
	return name
		.toLowerCase()
		.replace(/\(.*?\)/g, '')
		.replace(/\bkatholik\b/g, 'katolik')
		.replace(/\s+/g, ' ')
		.trim();
}

export function pilihIndukPembelajaran<
	T extends { nama?: string | null; mataPelajaranId?: string | null }
>(pbRows: T[]): T | null {
	return (
		pbRows.find((p) => normMapelName(p.nama ?? '').startsWith('guru kelas')) ??
		(pbRows.length === 1 ? pbRows[0] : null) ??
		pbRows.find((p) => p.mataPelajaranId) ??
		null
	);
}

export async function resolveReferensiMapelId(nama: string): Promise<string | null> {
	const exact = await db.query.tableDapodikMataPelajaran.findFirst({
		where: eq(tableDapodikMataPelajaran.nama, nama)
	});
	if (exact) return String(exact.mataPelajaranId);
	const rows = await db
		.select({ id: tableDapodikMataPelajaran.mataPelajaranId, nama: tableDapodikMataPelajaran.nama })
		.from(tableDapodikMataPelajaran);
	const target = normMapelName(nama);
	const match = rows.find((row) => normMapelName(row.nama) === target);
	return match ? String(match.id) : null;
}

type Row = Record<string, unknown>;
type SyncAction = 'test' | 'preview' | 'apply';
export type DapodikCategory =
	'sekolah' | 'pegawai' | 'kelas' | 'murid' | 'mapel' | 'ekstrakurikuler';

export type DapodikCategoryPreview = {
	source: number;
	matched: number;
	newItems: number;
	skipped: number;
	examples: string[];
};

export type DapodikMapelPreviewItem = {
	key: string;
	kelas: string;
	nama: string;
	guru: string | null;
	status: 'cocok' | 'baru' | 'dilewati';
	alasan: string | null;
};

export type DapodikPreview = {
	sekolahNama: string;
	semesterId: string;
	tahunAjaran: string;
	semester: 'ganjil' | 'genap';
	categories: Record<DapodikCategory, DapodikCategoryPreview>;
	mapelItems: DapodikMapelPreviewItem[];
	warnings: string[];
};

export type DapodikApplyResult = {
	message: string;
	semesterId: string;
	results: Partial<Record<DapodikCategory, { created: number; updated: number; skipped: number }>>;
};

export type DapodikSettingsView = {
	url: string;
	npsn: string;
	tokenSet: boolean;
	semesterId: string;
	lastSyncAt: string | null;
};

type Credentials = { base: string; token: string; npsn: string; satuanId?: number };
type DapodikContextInput = {
	url?: string;
	token?: string;
	npsn?: string;
	semesterId?: string;
	satuanId?: number;
};
type TargetSemester = { id: number; tahunAjaranId: number; semesterId: string };
type SourceBundle = {
	credentials: Credentials;
	sekolah: Row;
	semesterId: string;
	rombel: Row[];
	pegawai: Row[];
	murid: Row[];
	mapelReferensi: Row[];
	warnings: string[];
};

const AGAMA: Record<string, string> = {
	'1': 'Islam',
	'2': 'Kristen Protestan',
	'3': 'Katolik',
	'4': 'Hindu',
	'5': 'Buddha',
	'6': 'Khong Hu Chu',
	'7': 'Penghayat Kepercayaan'
};

class DapodikError extends DapodikInputError {}

function str(row: Row, key: string) {
	const value = row[key];
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (typeof value === 'number') return String(value);
	const label = row[`${key}_str`];
	return typeof label === 'string' && label.trim() ? label.trim() : undefined;
}

function rowsOf(value: unknown): Row[] {
	if (Array.isArray(value)) return value as Row[];
	if (!value || typeof value !== 'object') return [];
	const container = value as Row;
	if (Array.isArray(container.rows)) return container.rows as Row[];
	if (container.rows && typeof container.rows === 'object') return [container.rows as Row];
	if (Array.isArray(container.datas)) return container.datas as Row[];
	return [container];
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
				// Ditangani oleh pesan ramah di bawah.
			}
		}
		throw new DapodikError('Respons Dapodik bukan JSON yang valid.');
	}
}

async function dapodikGet(credentials: Credentials, endpoint: string, semesterId?: string) {
	const query = new URLSearchParams({ npsn: credentials.npsn });
	if (semesterId) query.set('semester_id', semesterId);
	const url = `${credentials.base}/${endpoint}?${query}`;
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Authorization: `Bearer ${credentials.token}`, Accept: 'application/json' },
			signal: AbortSignal.timeout(20_000)
		});
	} catch (error) {
		throw new DapodikError(`Tidak dapat menghubungi Dapodik: ${(error as Error).message}`);
	}
	const data = parseResponse(await response.text());
	const payload = data as Row;
	if (!response.ok || payload.success === false) {
		throw new DapodikError(
			typeof payload.message === 'string'
				? payload.message
				: `Permintaan Dapodik gagal (HTTP ${response.status}).`
		);
	}
	return rowsOf(data);
}

async function storedSettings(
	sekolahId: number,
	satuanId?: number
): Promise<typeof tableDapodikSettings.$inferSelect | undefined> {
	if (satuanId) {
		await ensureEducationUnitsSchema();
		const row = (
			await db.$client.execute({
				sql: `SELECT d.*,u.npsn FROM sekolah_satuan_pendidikan u LEFT JOIN dapodik_satuan_settings d ON d.satuan_id=u.id WHERE u.id=? AND u.sekolah_id=?`,
				args: [satuanId, sekolahId]
			})
		).rows[0];
		if (!row) throw new DapodikError('Satuan pendidikan tidak ditemukan pada sekolah aktif.');
		return {
			id: satuanId,
			sekolahId,
			url: String(row.url || ''),
			token: String(row.token || ''),
			npsn: String(row.npsn),
			semesterIdDapodikTerakhir: row.semester_id ? String(row.semester_id) : null,
			lastSyncAt: null,
			lastPreviewAt: row.last_preview_at ? String(row.last_preview_at) : null,
			lastPreviewFingerprint: row.last_preview_fingerprint
				? String(row.last_preview_fingerprint)
				: null,
			lastNilaiPreviewAt: null,
			lastNilaiPreviewFingerprint: null,
			createdAt: String(row.updated_at || ''),
			updatedAt: row.updated_at ? String(row.updated_at) : null
		};
	}
	return db.query.tableDapodikSettings.findFirst({
		where: eq(tableDapodikSettings.sekolahId, sekolahId)
	});
}

export async function getDapodikSettings(
	sekolahId: number,
	satuanId?: number
): Promise<DapodikSettingsView> {
	const settings = await storedSettings(sekolahId, satuanId);
	return {
		url: settings?.url ?? '',
		npsn: settings?.npsn ?? '',
		tokenSet: Boolean(settings?.token),
		semesterId: settings?.semesterIdDapodikTerakhir ?? '',
		lastSyncAt: settings?.lastSyncAt ?? null
	};
}

export async function saveDapodikConfiguration(sekolahId: number, input: DapodikContextInput) {
	const credentials = await resolveCredentials(sekolahId, input);
	await saveSettings(sekolahId, credentials, input.semesterId);
	return { message: 'Konfigurasi Dapodik disimpan.' };
}

async function resolveCredentials(
	sekolahId: number,
	input: DapodikContextInput
): Promise<Credentials> {
	const school = (
		await db.$client.execute({
			sql: 'SELECT jenjang_pendidikan,jenjang_variant FROM sekolah WHERE id=?',
			args: [sekolahId]
		})
	).rows[0];
	if (
		(school?.jenjang_pendidikan === 'srt' || school?.jenjang_variant === 'srt') &&
		!input.satuanId
	)
		throw new DapodikError('Pilih satuan pendidikan sebelum mengakses Dapodik.');
	const saved = await storedSettings(sekolahId, input.satuanId);
	const base = normalizeWebServiceUrl(input.url?.trim() || saved?.url || '');
	const token = input.token?.trim() || saved?.token || '';
	const npsn = input.npsn?.trim() || saved?.npsn || '';
	if (input.satuanId && npsn !== saved?.npsn)
		throw new DapodikError('NPSN tidak sesuai satuan pendidikan yang dipilih.');
	if (!token) throw new DapodikError('Token WebService Dapodik wajib diisi.');
	if (!npsn) throw new DapodikError('NPSN wajib diisi.');
	return { base, token, npsn, satuanId: input.satuanId };
}

async function saveSettings(
	sekolahId: number,
	credentials: Credentials,
	semesterId?: string,
	markSynced = false
) {
	const now = new Date().toISOString();
	if (credentials.satuanId) {
		await storedSettings(sekolahId, credentials.satuanId);
		await db.$client.execute({
			sql: `INSERT INTO dapodik_satuan_settings (satuan_id,url,token,semester_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(satuan_id) DO UPDATE SET url=excluded.url,token=excluded.token,semester_id=COALESCE(excluded.semester_id,semester_id),last_preview_at=NULL,last_preview_fingerprint=NULL,updated_at=excluded.updated_at`,
			args: [credentials.satuanId, credentials.base, credentials.token, semesterId || null, now]
		});
		return;
	}
	const existing = await storedSettings(sekolahId);
	const values = {
		url: credentials.base,
		token: credentials.token,
		npsn: credentials.npsn,
		semesterIdDapodikTerakhir: semesterId ?? existing?.semesterIdDapodikTerakhir ?? null,
		lastSyncAt: markSynced ? now : (existing?.lastSyncAt ?? null),
		updatedAt: now
	};
	if (existing) {
		await db
			.update(tableDapodikSettings)
			.set(values)
			.where(eq(tableDapodikSettings.id, existing.id));
	} else {
		await db.insert(tableDapodikSettings).values({ sekolahId, ...values });
	}
}

function sourceIdentity(source: SourceBundle) {
	return [
		str(source.sekolah, 'sekolah_id') ?? '',
		...source.pegawai.map((row) => str(row, 'ptk_id') ?? '').sort(),
		...source.rombel.map((row) => str(row, 'rombongan_belajar_id') ?? '').sort(),
		...source.murid.map((row) => str(row, 'peserta_didik_id') ?? '').sort(),
		...collectDapodikPembelajaran(source.rombel)
			.map((item) => item.pembelajaranId ?? '')
			.sort()
	].join('\n');
}

function previewFingerprint(source: SourceBundle) {
	return createHash('sha256')
		.update(
			`${source.credentials.base}\n${source.credentials.token}\n${source.credentials.npsn}\n${source.semesterId}\n${sourceIdentity(source)}`
		)
		.digest('hex');
}

async function markPreview(sekolahId: number, source: SourceBundle) {
	if (source.credentials.satuanId) {
		await db.$client.execute({
			sql: 'UPDATE dapodik_satuan_settings SET last_preview_at=?,last_preview_fingerprint=? WHERE satuan_id=?',
			args: [new Date().toISOString(), previewFingerprint(source), source.credentials.satuanId]
		});
		return;
	}
	await db
		.update(tableDapodikSettings)
		.set({
			lastPreviewAt: new Date().toISOString(),
			lastPreviewFingerprint: previewFingerprint(source)
		})
		.where(eq(tableDapodikSettings.sekolahId, sekolahId));
}

async function writeLog(
	sekolahId: number,
	action: SyncAction,
	status: 'success' | 'failed',
	message: string,
	semesterId?: string,
	summary?: Record<string, unknown>
) {
	await db.insert(tableDapodikSyncLog).values({
		sekolahId,
		action,
		status,
		message,
		semesterDapodik: semesterId ?? null,
		summary: summary ?? null
	});
}

async function semesterCandidates(sekolahId: number, requested?: string, satuanId?: number) {
	const result: string[] = [];
	if (requested && parseDapodikSemesterId(requested)) result.push(requested);
	const saved = await storedSettings(sekolahId, satuanId);
	if (saved?.semesterIdDapodikTerakhir) result.push(saved.semesterIdDapodikTerakhir);
	const active = await db
		.select({ dapodikId: tableSemester.dapodikSemesterId })
		.from(tableSemester)
		.innerJoin(tableTahunAjaran, eq(tableSemester.tahunAjaranId, tableTahunAjaran.id))
		.where(and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableSemester.isAktif, true)));
	for (const item of active) if (item.dapodikId) result.push(item.dapodikId);
	const now = new Date();
	const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
	for (const year of [startYear, startYear - 1, startYear + 1]) {
		result.push(`${year}1`, `${year}2`);
	}
	return [...new Set(result)];
}

async function loadSource(sekolahId: number, input: DapodikContextInput): Promise<SourceBundle> {
	const credentials = await resolveCredentials(sekolahId, input);
	const sekolahRows = await dapodikGet(credentials, 'getSekolah', input.semesterId);
	const sekolah = sekolahRows[0];
	if (!sekolah) throw new DapodikError('Profil sekolah tidak ditemukan di Dapodik.');
	if (credentials.satuanId && str(sekolah, 'npsn') && str(sekolah, 'npsn') !== credentials.npsn)
		throw new DapodikError('NPSN sumber Dapodik berbeda dengan satuan yang dipilih.');

	let semesterId = '';
	let rombel: Row[] = [];
	for (const candidate of await semesterCandidates(sekolahId, input.semesterId, input.satuanId)) {
		try {
			const rows = await dapodikGet(credentials, 'getRombonganBelajar', candidate);
			if (rows.some((row) => str(row, 'rombongan_belajar_id'))) {
				semesterId = candidate;
				rombel = rows;
				break;
			}
		} catch {
			// Kandidat semester tanpa data dilewati.
		}
	}
	if (!semesterId) {
		throw new DapodikError('Semester dengan rombongan belajar tidak ditemukan di Dapodik.');
	}
	const warnings: string[] = [];
	const [pegawai, murid, mapelReferensi] = await Promise.all([
		dapodikGet(credentials, 'getGtk', semesterId),
		dapodikGet(credentials, 'getPesertaDidik', semesterId),
		dapodikGet(credentials, 'getMataPelajaran', semesterId).catch((error) => {
			warnings.push(
				`Referensi mata pelajaran tidak tersedia: ${error instanceof Error ? error.message : 'endpoint ditolak'}`
			);
			return [];
		})
	]);
	await saveSettings(sekolahId, credentials, semesterId);
	return { credentials, sekolah, semesterId, rombel, pegawai, murid, mapelReferensi, warnings };
}

export async function testDapodikConnection(sekolahId: number, input: DapodikContextInput) {
	try {
		const credentials = await resolveCredentials(sekolahId, input);
		const sekolah = (await dapodikGet(credentials, 'getSekolah'))[0];
		if (!sekolah) throw new DapodikError('Profil sekolah tidak ditemukan.');
		await saveSettings(sekolahId, credentials);
		const nama = str(sekolah, 'nama') ?? credentials.npsn;
		await writeLog(sekolahId, 'test', 'success', `Koneksi berhasil ke ${nama}.`);
		return { message: `Koneksi berhasil ke ${nama}.`, sekolahNama: nama };
	} catch (error) {
		await writeLog(sekolahId, 'test', 'failed', (error as Error).message);
		throw error;
	}
}

function regularRombel(rows: Row[]) {
	return rows.filter(
		(row) => Number(row.jenis_rombel ?? 1) === 1 && str(row, 'rombongan_belajar_id')
	);
}

function extracurricularRombel(rows: Row[]) {
	return collectDapodikExtracurricular(rows).map((item) => item.row);
}

function memberPlacement(rombel: Row[]) {
	const map = new Map<string, { rombelId: string; anggotaId: string | null }>();
	for (const row of regularRombel(rombel)) {
		const rombelId = str(row, 'rombongan_belajar_id');
		if (!rombelId) continue;
		const members = Array.isArray(row.anggota_rombel) ? (row.anggota_rombel as Row[]) : [];
		for (const member of members) {
			const id = str(member, 'peserta_didik_id');
			if (id) map.set(id, { rombelId, anggotaId: str(member, 'anggota_rombel_id') ?? null });
		}
	}
	return map;
}

async function targetSemesterIfExists(sekolahId: number, semesterId: string) {
	const parsed = parseDapodikSemesterId(semesterId);
	if (!parsed) return null;
	return db
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
		.then((rows) => rows[0]?.id ?? null);
}

export async function previewDapodikSync(
	sekolahId: number,
	input: DapodikContextInput
): Promise<DapodikPreview> {
	try {
		const source = await loadSource(sekolahId, input);
		const parsed = parseDapodikSemesterId(source.semesterId)!;
		const semesterLokal = await targetSemesterIfExists(sekolahId, source.semesterId);
		const [pegawaiLokal, allKelas, allMurid, sekolahLokal] = await Promise.all([
			db.select().from(tablePegawai).where(eq(tablePegawai.sekolahId, sekolahId)),
			semesterLokal
				? db
						.select()
						.from(tableKelas)
						.where(
							and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, semesterLokal))
						)
				: Promise.resolve([]),
			semesterLokal
				? db
						.select()
						.from(tableMurid)
						.where(
							and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, semesterLokal))
						)
				: Promise.resolve([]),
			db.query.tableSekolah.findFirst({ where: eq(tableSekolah.id, sekolahId) })
		]);
		const unitClasses = source.credentials.satuanId
			? (
					await db.$client.execute({
						sql: `SELECT m.kelas_id FROM kelas_satuan_pendidikan m JOIN kelas k ON k.id=m.kelas_id WHERE m.satuan_id=? AND k.sekolah_id=?`,
						args: [source.credentials.satuanId, sekolahId]
					})
				).rows.map((row) => Number(row.kelas_id))
			: null;
		const kelasLokal = unitClasses
			? allKelas.filter((row) => unitClasses.includes(row.id))
			: allKelas;
		const muridLokal = unitClasses
			? allMurid.filter((row) => unitClasses.includes(row.kelasId))
			: allMurid;

		const pegawaiRows = source.pegawai.filter((row) => str(row, 'ptk_id') && str(row, 'nama'));
		const rombelRows = regularRombel(source.rombel);
		const ekskulRows = extracurricularRombel(source.rombel);
		const allPembelajaran = uniqueDapodikPembelajaran(collectDapodikPembelajaran(source.rombel));
		const pembelajaranRows = allPembelajaran.filter((item) => item.pembelajaranId && item.nama);
		const placement = memberPlacement(source.rombel);
		const muridRows = source.murid.filter(
			(row) => str(row, 'peserta_didik_id') && str(row, 'nama')
		);
		const pegawaiMatch = (row: Row) =>
			pegawaiLokal.some(
				(item) =>
					item.dapodikPtkId === str(row, 'ptk_id') ||
					(Boolean(str(row, 'nip')) && item.nip === str(row, 'nip')) ||
					item.nama.trim().toLowerCase() === str(row, 'nama')?.toLowerCase()
			);
		const kelasMatch = (row: Row) =>
			kelasLokal.some(
				(item) =>
					item.dapodikRombonganBelajarId === str(row, 'rombongan_belajar_id') ||
					item.nama.trim().toLowerCase() === str(row, 'nama')?.toLowerCase()
			);
		const muridMatch = (row: Row) =>
			muridLokal.some(
				(item) =>
					item.dapodikPesertaDidikId === str(row, 'peserta_didik_id') ||
					(Boolean(str(row, 'nipd')) && item.nis === str(row, 'nipd'))
			);
		const matchedPegawai = pegawaiRows.filter(pegawaiMatch).length;
		const matchedKelas = rombelRows.filter(kelasMatch).length;
		const muridDenganKelas = muridRows.filter((row) => {
			const id = str(row, 'peserta_didik_id')!;
			return Boolean(str(row, 'rombongan_belajar_id') || placement.has(id));
		});
		const matchedMurid = muridDenganKelas.filter(muridMatch).length;
		const kelasByRombel = new Map<string, number>();
		for (const rombel of rombelRows) {
			const rombelId = str(rombel, 'rombongan_belajar_id');
			const nama = str(rombel, 'nama')?.toLowerCase();
			const local = kelasLokal.find(
				(item) =>
					item.dapodikRombonganBelajarId === rombelId || item.nama.trim().toLowerCase() === nama
			);
			if (rombelId && local) kelasByRombel.set(rombelId, local.id);
		}
		const mapelLokal = kelasLokal.length
			? await db
					.select()
					.from(tableMataPelajaran)
					.where(
						inArray(
							tableMataPelajaran.kelasId,
							kelasLokal.map((item) => item.id)
						)
					)
			: [];
		const ekskulLokal = kelasLokal.length
			? await db
					.select()
					.from(tableEkstrakurikuler)
					.where(
						inArray(
							tableEkstrakurikuler.kelasId,
							kelasLokal.map((item) => item.id)
						)
					)
			: [];
		const ekskulGroups = new Map<string, { kelasId: number; nama: string }>();
		let skippedEkskul = 0;
		for (const row of ekskulRows) {
			const nama = str(row, 'nm_ekskul') ?? str(row, 'nama');
			if (!nama) {
				skippedEkskul++;
				continue;
			}
			const members = Array.isArray(row.anggota_rombel) ? (row.anggota_rombel as Row[]) : [];
			for (const member of members) {
				const pesertaDidikId = str(member, 'peserta_didik_id');
				const targetRombelId = pesertaDidikId ? placement.get(pesertaDidikId)?.rombelId : null;
				const kelasId = targetRombelId ? kelasByRombel.get(targetRombelId) : null;
				if (kelasId) ekskulGroups.set(`${kelasId}|${nama.toLowerCase()}`, { kelasId, nama });
			}
		}
		const matchedEkskul = [...ekskulGroups.values()].filter((group) =>
			ekskulLokal.some(
				(item) =>
					item.kelasId === group.kelasId &&
					item.nama.trim().toLowerCase() === group.nama.trim().toLowerCase()
			)
		).length;
		const mapelItems: DapodikMapelPreviewItem[] = allPembelajaran.map((item) => {
			const kelasId = kelasByRombel.get(item.rombelId);
			const nama = item.nama ?? 'Tanpa nama';
			const guru = source.pegawai.find((row) => str(row, 'ptk_id') === item.ptkId);
			if (!item.pembelajaranId || !item.nama) {
				return {
					key: `${item.rombelId}|${item.pembelajaranId ?? 'invalid'}`,
					kelas: item.kelasNama,
					nama,
					guru: guru ? (str(guru, 'nama') ?? null) : null,
					status: 'dilewati',
					alasan: 'ID pembelajaran atau nama mapel tidak lengkap.'
				};
			}
			if (item.nama.toLowerCase().startsWith('guru kelas')) {
				return {
					key: dapodikPembelajaranKey(item.rombelId, item.pembelajaranId),
					kelas: item.kelasNama,
					nama,
					guru: guru ? (str(guru, 'nama') ?? null) : null,
					status: 'dilewati',
					alasan: 'Guru Kelas adalah penugasan, bukan mata pelajaran.'
				};
			}
			const existing = mapelLokal.find(
				(local) =>
					local.kelasId === kelasId &&
					(local.dapodikPembelajaranId === item.pembelajaranId ||
						local.nama.trim().toLowerCase() === item.nama?.trim().toLowerCase())
			);
			return {
				key: dapodikPembelajaranKey(item.rombelId, item.pembelajaranId),
				kelas: item.kelasNama,
				nama,
				guru: guru ? (str(guru, 'nama') ?? null) : null,
				status: existing ? 'cocok' : 'baru',
				alasan: kelasId ? null : 'Kelas lokal akan dibuat atau dicocokkan saat diterapkan.'
			};
		});
		const matchedMapel = mapelItems.filter((item) => item.status === 'cocok').length;
		const newMapel = mapelItems.filter((item) => item.status === 'baru').length;
		const skippedMapel = mapelItems.filter((item) => item.status === 'dilewati').length;
		const preview: DapodikPreview = {
			sekolahNama: str(source.sekolah, 'nama') ?? source.credentials.npsn,
			semesterId: source.semesterId,
			tahunAjaran: parsed.namaTahun,
			semester: parsed.tipe,
			categories: {
				sekolah: {
					source: 1,
					matched: sekolahLokal ? 1 : 0,
					newItems: sekolahLokal ? 0 : 1,
					skipped: 0,
					examples: [str(source.sekolah, 'nama') ?? source.credentials.npsn]
				},
				pegawai: {
					source: pegawaiRows.length,
					matched: matchedPegawai,
					newItems: pegawaiRows.length - matchedPegawai,
					skipped: source.pegawai.length - pegawaiRows.length,
					examples: pegawaiRows.slice(0, 5).map((row) => str(row, 'nama')!)
				},
				kelas: {
					source: rombelRows.length,
					matched: matchedKelas,
					newItems: rombelRows.length - matchedKelas,
					skipped: source.rombel.length - rombelRows.length,
					examples: rombelRows.slice(0, 5).map((row) => str(row, 'nama') ?? '-')
				},
				murid: {
					source: muridRows.length,
					matched: matchedMurid,
					newItems: muridDenganKelas.length - matchedMurid,
					skipped: muridRows.length - muridDenganKelas.length,
					examples: muridRows.slice(0, 5).map((row) => str(row, 'nama')!)
				},
				mapel: {
					source: mapelItems.length,
					matched: matchedMapel,
					newItems: newMapel,
					skipped: skippedMapel,
					examples: pembelajaranRows.slice(0, 5).map((item) => `${item.kelasNama}: ${item.nama}`)
				},
				ekstrakurikuler: {
					source: ekskulGroups.size,
					matched: matchedEkskul,
					newItems: ekskulGroups.size - matchedEkskul,
					skipped: skippedEkskul,
					examples: [...ekskulGroups.values()].slice(0, 5).map((item) => item.nama)
				}
			},
			mapelItems,
			warnings: [
				'Data khusus Kaganga tidak akan ditimpa.',
				'Murid tanpa penempatan rombel akan dilewati.',
				'Ekstrakurikuler hanya ditambahkan dan ditautkan; data lokal yang ada tidak dihapus.',
				'Mata pelajaran lokal yang sudah ada hanya diberi tautan Dapodik; nama, kode, KKM, dan tujuan pembelajaran dipertahankan.',
				'Bank Data Mata Pelajaran untuk Jadwal Pelajaran tidak diubah otomatis.',
				...source.warnings,
				...(semesterLokal
					? []
					: ['Tahun ajaran dan semester lokal baru akan dibuat saat diterapkan.'])
			]
		};
		await markPreview(sekolahId, source);
		await writeLog(
			sekolahId,
			'preview',
			'success',
			'Pratinjau sinkronisasi berhasil.',
			source.semesterId,
			preview as unknown as Record<string, unknown>
		);
		return preview;
	} catch (error) {
		await writeLog(sekolahId, 'preview', 'failed', (error as Error).message, input.semesterId);
		throw error;
	}
}

async function ensureTargetSemester(sekolahId: number, semesterId: string, activate: boolean) {
	const parsed = parseDapodikSemesterId(semesterId);
	if (!parsed) throw new DapodikError(`Semester Dapodik tidak valid: ${semesterId}`);
	let tahun = await db.query.tableTahunAjaran.findFirst({
		where: and(
			eq(tableTahunAjaran.sekolahId, sekolahId),
			eq(tableTahunAjaran.nama, parsed.namaTahun)
		)
	});
	if (!tahun) {
		[tahun] = await db
			.insert(tableTahunAjaran)
			.values({ sekolahId, nama: parsed.namaTahun, dapodikTahunAjaranId: String(parsed.year) })
			.returning();
	} else if (!tahun.dapodikTahunAjaranId) {
		await db
			.update(tableTahunAjaran)
			.set({ dapodikTahunAjaranId: String(parsed.year) })
			.where(eq(tableTahunAjaran.id, tahun.id));
	}
	if (!tahun) throw new DapodikError('Gagal menyiapkan tahun ajaran lokal.');
	let semester = await db.query.tableSemester.findFirst({
		where: and(eq(tableSemester.tahunAjaranId, tahun.id), eq(tableSemester.tipe, parsed.tipe))
	});
	if (!semester) {
		[semester] = await db
			.insert(tableSemester)
			.values({
				tahunAjaranId: tahun.id,
				tipe: parsed.tipe,
				nama: parsed.tipe === 'ganjil' ? 'Semester Ganjil' : 'Semester Genap',
				dapodikSemesterId: semesterId
			})
			.returning();
	} else if (!semester.dapodikSemesterId) {
		await db
			.update(tableSemester)
			.set({ dapodikSemesterId: semesterId })
			.where(eq(tableSemester.id, semester.id));
	}
	if (!semester) throw new DapodikError('Gagal menyiapkan semester lokal.');
	if (activate) {
		const tahunIds = await db
			.select({ id: tableTahunAjaran.id })
			.from(tableTahunAjaran)
			.where(eq(tableTahunAjaran.sekolahId, sekolahId));
		await db.transaction(async (tx) => {
			await tx
				.update(tableTahunAjaran)
				.set({ isAktif: false })
				.where(eq(tableTahunAjaran.sekolahId, sekolahId));
			await tx
				.update(tableTahunAjaran)
				.set({ isAktif: true })
				.where(eq(tableTahunAjaran.id, tahun!.id));
			if (tahunIds.length) {
				await tx
					.update(tableSemester)
					.set({ isAktif: false })
					.where(
						inArray(
							tableSemester.tahunAjaranId,
							tahunIds.map((item) => item.id)
						)
					);
			}
			await tx
				.update(tableSemester)
				.set({ isAktif: true })
				.where(eq(tableSemester.id, semester!.id));
		});
	}
	return { id: semester.id, tahunAjaranId: tahun.id, semesterId } satisfies TargetSemester;
}

function gender(value?: string) {
	if (!value) return null;
	const normalized = value.toLowerCase();
	if (normalized === 'p' || normalized.includes('perempuan')) return 'perempuan' as const;
	if (normalized === 'l' || normalized.includes('laki')) return 'laki-laki' as const;
	return null;
}

async function applyPegawai(sekolahId: number, rows: Row[]) {
	const local = await db.select().from(tablePegawai).where(eq(tablePegawai.sekolahId, sekolahId));
	const result = { created: 0, updated: 0, skipped: 0 };
	const idByPtk = new Map<string, number>();
	for (const item of local) if (item.dapodikPtkId) idByPtk.set(item.dapodikPtkId, item.id);
	for (const row of rows) {
		const ptkId = str(row, 'ptk_id');
		const nama = str(row, 'nama');
		if (!ptkId || !nama) {
			result.skipped++;
			continue;
		}
		const nip = str(row, 'nip') ?? '';
		const existing = local.find(
			(item) =>
				item.dapodikPtkId === ptkId ||
				(nip && item.nip === nip) ||
				item.nama.trim().toLowerCase() === nama.toLowerCase()
		);
		if (existing) {
			await db
				.update(tablePegawai)
				.set({
					dapodikPtkId: ptkId,
					nuptk: existing.nuptk || str(row, 'nuptk') || null,
					nip: existing.nip || nip,
					updatedAt: new Date().toISOString()
				})
				.where(eq(tablePegawai.id, existing.id));
			idByPtk.set(ptkId, existing.id);
			result.updated++;
		} else {
			const [created] = await db
				.insert(tablePegawai)
				.values({
					sekolahId,
					nama,
					nip,
					nuptk: str(row, 'nuptk') ?? null,
					dapodikPtkId: ptkId,
					jenis: 'guru',
					jabatan: str(row, 'jabatan_ptk_id_str') ?? str(row, 'jabatan_ptk') ?? null,
					status: 'aktif',
					jenisKelamin: gender(str(row, 'jenis_kelamin')),
					tempatLahir: str(row, 'tempat_lahir') ?? null,
					tanggalLahir: str(row, 'tanggal_lahir') ?? null,
					agama: str(row, 'agama_id_str') ?? AGAMA[str(row, 'agama_id') ?? ''] ?? null,
					email: str(row, 'email') ?? null,
					telepon: str(row, 'no_hp') ?? null
				})
				.returning({ id: tablePegawai.id });
			if (created) {
				idByPtk.set(ptkId, created.id);
				const createdRow = await db.query.tablePegawai.findFirst({
					where: eq(tablePegawai.id, created.id)
				});
				if (createdRow) local.push(createdRow);
				result.created++;
			}
		}
	}
	return { result, idByPtk };
}

async function existingPegawaiIndex(sekolahId: number) {
	const rows = await db
		.select({ id: tablePegawai.id, dapodikPtkId: tablePegawai.dapodikPtkId })
		.from(tablePegawai)
		.where(eq(tablePegawai.sekolahId, sekolahId));
	return new Map(rows.filter((row) => row.dapodikPtkId).map((row) => [row.dapodikPtkId!, row.id]));
}

async function applyKelas(
	sekolahId: number,
	target: TargetSemester,
	rows: Row[],
	pegawaiByPtk: Map<string, number>
) {
	const result = { created: 0, updated: 0, skipped: 0 };
	const kelasByRombel = new Map<string, number>();
	const anggota = new Map<string, { kelasId: number; anggotaId: string | null }>();
	for (const row of rows) {
		if (Number(row.jenis_rombel ?? 1) !== 1) {
			result.skipped++;
			continue;
		}
		const rombelId = str(row, 'rombongan_belajar_id');
		const nama = str(row, 'nama');
		if (!rombelId || !nama) {
			result.skipped++;
			continue;
		}
		const existing =
			(await db.query.tableKelas.findFirst({
				where: and(
					eq(tableKelas.sekolahId, sekolahId),
					eq(tableKelas.semesterId, target.id),
					eq(tableKelas.dapodikRombonganBelajarId, rombelId)
				)
			})) ??
			(await db.query.tableKelas.findFirst({
				where: and(
					eq(tableKelas.sekolahId, sekolahId),
					eq(tableKelas.semesterId, target.id),
					eq(tableKelas.nama, nama)
				)
			}));
		const waliKelasId = pegawaiByPtk.get(str(row, 'ptk_id') ?? '');
		let kelasId: number;
		if (existing) {
			await db
				.update(tableKelas)
				.set({
					dapodikRombonganBelajarId: rombelId,
					...(waliKelasId && !existing.waliKelasId ? { waliKelasId } : {}),
					updatedAt: new Date().toISOString()
				})
				.where(eq(tableKelas.id, existing.id));
			kelasId = existing.id;
			result.updated++;
		} else {
			const [created] = await db
				.insert(tableKelas)
				.values({
					sekolahId,
					tahunAjaranId: target.tahunAjaranId,
					semesterId: target.id,
					nama,
					dapodikRombonganBelajarId: rombelId,
					waliKelasId: waliKelasId ?? null
				})
				.returning({ id: tableKelas.id });
			if (!created) throw new DapodikError(`Gagal membuat kelas ${nama}.`);
			kelasId = created.id;
			result.created++;
		}
		kelasByRombel.set(rombelId, kelasId);
		const members = Array.isArray(row.anggota_rombel) ? (row.anggota_rombel as Row[]) : [];
		for (const member of members) {
			const pdId = str(member, 'peserta_didik_id');
			if (pdId) anggota.set(pdId, { kelasId, anggotaId: str(member, 'anggota_rombel_id') ?? null });
		}
	}
	return { result, kelasByRombel, anggota };
}

function intOrNull(value: unknown) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function uniqueNis(
	sekolahId: number,
	semesterId: number,
	preferred: string,
	reader: typeof db | DBTransaction = db
) {
	let candidate = preferred || 'DAPODIK';
	let suffix = 1;
	while (
		await reader.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, semesterId),
				eq(tableMurid.nis, candidate)
			)
		})
	) {
		candidate = `${preferred || 'DAPODIK'}-${suffix++}`;
	}
	return candidate;
}

async function applyMurid(
	sekolahId: number,
	target: TargetSemester,
	rows: Row[],
	kelasByRombel: Map<string, number>,
	anggota: Map<string, { kelasId: number; anggotaId: string | null }>,
	sekolahPayload: Row
) {
	await ensureDataGovernanceSchema();
	return db.transaction(async (db) => {
		const result = { created: 0, updated: 0, skipped: 0 };
		for (const row of rows) {
			const pdId = str(row, 'peserta_didik_id');
			const nama = str(row, 'nama');
			if (!pdId || !nama) {
				result.skipped++;
				continue;
			}
			const directRombel = str(row, 'rombongan_belajar_id');
			const placement =
				directRombel && kelasByRombel.has(directRombel)
					? {
							kelasId: kelasByRombel.get(directRombel)!,
							anggotaId: str(row, 'anggota_rombel_id') ?? null
						}
					: anggota.get(pdId);
			if (!placement) {
				result.skipped++;
				continue;
			}
			const nisn = normalizedNisn(str(row, 'nisn'));
			const nis = str(row, 'nipd') ?? '';
			const existing =
				(await db.query.tableMurid.findFirst({
					where: and(
						eq(tableMurid.sekolahId, sekolahId),
						eq(tableMurid.semesterId, target.id),
						eq(tableMurid.dapodikPesertaDidikId, pdId)
					)
				})) ??
				(nis
					? await db.query.tableMurid.findFirst({
							where: and(
								eq(tableMurid.sekolahId, sekolahId),
								eq(tableMurid.semesterId, target.id),
								eq(tableMurid.nis, nis)
							)
						})
					: null);
			const incoming = {
				nis: existing?.nis || nis || pdId.slice(0, 16),
				nisn,
				nama,
				tanggalLahir: str(row, 'tanggal_lahir') ?? '1900-01-01',
				semesterId: target.id
			};
			if (existing && !sameMuridPerson(existing, incoming))
				throw new DapodikError(
					`Identitas ${nama} tidak cocok dengan murid bernomor ${existing.nis}; impor murid dibatalkan.`
				);
			await validateMuridIdentityInput(
				db,
				sekolahId,
				{ ...incoming, id: existing?.id },
				{ imported: true }
			);
			if (existing) {
				await db
					.update(tableMurid)
					.set({
						dapodikPesertaDidikId: pdId,
						dapodikAnggotaRombelId: placement.anggotaId,
						kelasId: placement.kelasId,
						nik: existing.nik || str(row, 'nik') || null,
						anakKe: existing.anakKe || intOrNull(row.anak_keberapa),
						nisn: nisn || existing.nisn,
						updatedAt: new Date().toISOString()
					})
					.where(eq(tableMurid.id, existing.id));
				result.updated++;
				await syncMuridGovernance(sekolahId, [existing.id], undefined, {}, db);
				continue;
			}

			const [alamat] = await db
				.insert(tableAlamat)
				.values({
					jalan: str(row, 'alamat_jalan') ?? '-',
					desa: str(row, 'desa_kelurahan') ?? str(sekolahPayload, 'desa_kelurahan') ?? '-',
					kecamatan: str(row, 'kecamatan') ?? str(sekolahPayload, 'kecamatan') ?? '-',
					kabupaten: str(row, 'kabupaten_kota') ?? str(sekolahPayload, 'kabupaten_kota') ?? '-',
					provinsi: str(row, 'provinsi') ?? str(sekolahPayload, 'provinsi') ?? null,
					kodePos: str(row, 'kode_pos') ?? null
				})
				.returning({ id: tableAlamat.id });
			if (!alamat) throw new DapodikError(`Gagal membuat alamat untuk ${nama}.`);
			const agamaId = str(row, 'agama_id') ?? '';
			const jenisKelamin = (str(row, 'jenis_kelamin') ?? 'L').toUpperCase() === 'P' ? 'P' : 'L';
			const [inserted] = await db
				.insert(tableMurid)
				.values({
					sekolahId,
					semesterId: target.id,
					kelasId: placement.kelasId,
					nis: await uniqueNis(sekolahId, target.id, incoming.nis, db),
					nisn,
					nama,
					tempatLahir: str(row, 'tempat_lahir') ?? '-',
					tanggalLahir: str(row, 'tanggal_lahir') ?? '1900-01-01',
					jenisKelamin,
					agama: str(row, 'agama_id_str') ?? AGAMA[agamaId] ?? '-',
					pendidikanSebelumnya: str(row, 'sekolah_asal') ?? '-',
					tanggalMasuk: str(row, 'tanggal_masuk_sekolah') ?? new Date().toISOString().slice(0, 10),
					alamatId: alamat.id,
					dapodikPesertaDidikId: pdId,
					dapodikAnggotaRombelId: placement.anggotaId,
					nik: str(row, 'nik') ?? null,
					anakKe: intOrNull(row.anak_keberapa)
				})
				.returning({ id: tableMurid.id });
			await syncMuridGovernance(sekolahId, [inserted.id], undefined, {}, db);
			result.created++;
		}
		return result;
	});
}

function dapodikFlag(value: unknown) {
	return value === true || value === 1 || String(value ?? '') === '1';
}

async function cacheMapelReferensi(sekolahId: number, target: TargetSemester, rows: Row[]) {
	let stored = 0;
	for (const row of rows) {
		const mataPelajaranId = str(row, 'mata_pelajaran_id');
		const nama = str(row, 'nama');
		if (!mataPelajaranId || !nama) continue;
		await db
			.insert(tableDapodikMataPelajaran)
			.values({
				sekolahId,
				semesterId: target.id,
				mataPelajaranId,
				nama,
				jurusanId: str(row, 'jurusan_id') ?? null,
				pilihanSekolah: dapodikFlag(row.pilihan_sekolah),
				pilihanBuku: dapodikFlag(row.pilihan_buku),
				pilihanKepengawasan: dapodikFlag(row.pilihan_kepengawasan),
				pilihanEvaluasi: dapodikFlag(row.pilihan_evaluasi),
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: [
					tableDapodikMataPelajaran.sekolahId,
					tableDapodikMataPelajaran.semesterId,
					tableDapodikMataPelajaran.mataPelajaranId
				],
				set: {
					nama: sql`excluded.nama`,
					jurusanId: sql`excluded.jurusan_id`,
					pilihanSekolah: sql`excluded.pilihan_sekolah`,
					pilihanBuku: sql`excluded.pilihan_buku`,
					pilihanKepengawasan: sql`excluded.pilihan_kepengawasan`,
					pilihanEvaluasi: sql`excluded.pilihan_evaluasi`,
					updatedAt: sql`excluded.updated_at`
				}
			});
		stored++;
	}
	return stored;
}

async function applyPembelajaran(
	rows: Row[],
	kelasByRombel: Map<string, number>,
	pegawaiByPtk: Map<string, number>,
	selectedKeys: Set<string>
) {
	const result = { created: 0, updated: 0, skipped: 0 };
	const localByKelas = new Map<number, (typeof tableMataPelajaran.$inferSelect)[]>();
	for (const item of uniqueDapodikPembelajaran(collectDapodikPembelajaran(rows))) {
		const kelasId = kelasByRombel.get(item.rombelId);
		const pembelajaranId = item.pembelajaranId;
		const mataPelajaranId = item.mataPelajaranId ?? null;
		const nama = item.nama;
		if (!kelasId || !pembelajaranId || !nama) {
			result.skipped++;
			continue;
		}
		if (!selectedKeys.has(dapodikPembelajaranKey(item.rombelId, pembelajaranId))) {
			result.skipped++;
			continue;
		}

		await db
			.insert(tableDapodikPembelajaran)
			.values({
				kelasId,
				pembelajaranId,
				mataPelajaranId,
				nama,
				ptkId: item.ptkId ?? null,
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: [tableDapodikPembelajaran.kelasId, tableDapodikPembelajaran.pembelajaranId],
				set: {
					mataPelajaranId: sql`excluded.mata_pelajaran_id`,
					nama: sql`excluded.nama`,
					ptkId: sql`excluded.ptk_id`,
					updatedAt: sql`excluded.updated_at`
				}
			});

		if (nama.toLowerCase().startsWith('guru kelas')) {
			result.skipped++;
			continue;
		}
		let local = localByKelas.get(kelasId);
		if (!local) {
			local = await db
				.select()
				.from(tableMataPelajaran)
				.where(eq(tableMataPelajaran.kelasId, kelasId));
			localByKelas.set(kelasId, local);
		}
		const existing =
			local.find((row) => row.dapodikPembelajaranId === pembelajaranId) ??
			local.find(
				(row) =>
					row.nama.trim().toLowerCase() === nama.trim().toLowerCase() &&
					(!row.dapodikPembelajaranId || row.dapodikPembelajaranId === pembelajaranId)
			);
		const pengampuId = pegawaiByPtk.get(item.ptkId ?? '') ?? null;
		if (existing) {
			await db
				.update(tableMataPelajaran)
				.set({
					dapodikPembelajaranId: pembelajaranId,
					dapodikMataPelajaranId: mataPelajaranId,
					pengampuId: existing.pengampuId ?? pengampuId,
					updatedAt: new Date().toISOString()
				})
				.where(eq(tableMataPelajaran.id, existing.id));
			existing.dapodikPembelajaranId = pembelajaranId;
			existing.dapodikMataPelajaranId = mataPelajaranId;
			existing.pengampuId ??= pengampuId;
			result.updated++;
			continue;
		}
		const [created] = await db
			.insert(tableMataPelajaran)
			.values({
				kelasId,
				nama,
				kode: null,
				kkm: 0,
				jenis: 'wajib',
				pengampuId,
				dapodikPembelajaranId: pembelajaranId,
				dapodikMataPelajaranId: mataPelajaranId
			})
			.returning();
		if (created) local.push(created);
		result.created++;
	}
	return result;
}

async function applyEkstrakurikuler(sekolahId: number, semesterId: number, rombelRows: Row[]) {
	const result = { created: 0, updated: 0, skipped: 0 };
	const students = await db
		.select({
			id: tableMurid.id,
			kelasId: tableMurid.kelasId,
			dapodikId: tableMurid.dapodikPesertaDidikId
		})
		.from(tableMurid)
		.where(and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, semesterId)));
	const studentByDapodik = new Map(
		students.filter((item) => item.dapodikId).map((item) => [item.dapodikId!, item])
	);
	for (const row of extracurricularRombel(rombelRows)) {
		const nama = str(row, 'nm_ekskul') ?? str(row, 'nama');
		if (!nama) {
			result.skipped++;
			continue;
		}
		const perClass = new Map<number, number[]>();
		const members = Array.isArray(row.anggota_rombel) ? (row.anggota_rombel as Row[]) : [];
		for (const member of members) {
			const pesertaDidikId = str(member, 'peserta_didik_id');
			const student = pesertaDidikId ? studentByDapodik.get(pesertaDidikId) : null;
			if (!student) {
				result.skipped++;
				continue;
			}
			const list = perClass.get(student.kelasId) ?? [];
			list.push(student.id);
			perClass.set(student.kelasId, list);
		}
		for (const [kelasId, studentIds] of perClass) {
			let extracurricular = await db.query.tableEkstrakurikuler.findFirst({
				where: and(
					eq(tableEkstrakurikuler.kelasId, kelasId),
					sql`lower(trim(${tableEkstrakurikuler.nama})) = ${nama.trim().toLowerCase()}`
				)
			});
			if (!extracurricular) {
				[extracurricular] = await db
					.insert(tableEkstrakurikuler)
					.values({ kelasId, nama })
					.returning();
				result.created++;
			}
			if (!extracurricular) continue;
			const linked = studentIds.length
				? await db
						.select({ muridId: tableMuridEkstrakurikuler.muridId })
						.from(tableMuridEkstrakurikuler)
						.where(
							and(
								eq(tableMuridEkstrakurikuler.ekstrakurikulerId, extracurricular.id),
								inArray(tableMuridEkstrakurikuler.muridId, studentIds)
							)
						)
				: [];
			const linkedIds = new Set(linked.map((item) => item.muridId));
			const missing = [...new Set(studentIds)]
				.filter((muridId) => !linkedIds.has(muridId))
				.map((muridId) => ({ muridId, ekstrakurikulerId: extracurricular.id }));
			if (missing.length) {
				await db.insert(tableMuridEkstrakurikuler).values(missing);
				result.updated += missing.length;
			}
		}
	}
	return result;
}

export async function applyDapodikSync(
	sekolahId: number,
	input: {
		url?: string;
		token?: string;
		npsn?: string;
		semesterId?: string;
		categories: DapodikCategory[];
		activateSemester?: boolean;
		selectedMapelKeys?: string[];
	}
): Promise<DapodikApplyResult> {
	try {
		await assertSingleSchoolDapodikWrite(sekolahId);
		if (!input.categories.length) throw new DapodikError('Pilih minimal satu kategori data.');
		if (input.categories.includes('mapel') && !input.selectedMapelKeys?.length) {
			throw new DapodikError('Pilih minimal satu mata pelajaran dari pratinjau.');
		}
		const source = await loadSource(sekolahId, input);
		const previewState = await storedSettings(sekolahId);
		const previewAge = previewState?.lastPreviewAt
			? Date.now() - new Date(previewState.lastPreviewAt).getTime()
			: Number.POSITIVE_INFINITY;
		if (
			previewAge > 60 * 60 * 1000 ||
			previewState?.lastPreviewFingerprint !== previewFingerprint(source)
		) {
			throw new DapodikError(
				'Pratinjau sudah berubah atau kedaluwarsa. Jalankan pratinjau kembali sebelum menerapkan.'
			);
		}
		const target = await ensureTargetSemester(
			sekolahId,
			source.semesterId,
			Boolean(input.activateSemester)
		);
		const results: DapodikApplyResult['results'] = {};

		if (input.categories.includes('sekolah')) {
			const local = await db.query.tableSekolah.findFirst({
				where: eq(tableSekolah.id, sekolahId)
			});
			await db
				.update(tableSekolah)
				.set({
					dapodikSekolahId: str(source.sekolah, 'sekolah_id') ?? local?.dapodikSekolahId ?? null,
					website: local?.website || str(source.sekolah, 'website') || null,
					email: local?.email || str(source.sekolah, 'email') || '',
					updatedAt: new Date().toISOString()
				})
				.where(eq(tableSekolah.id, sekolahId));
			results.sekolah = { created: 0, updated: 1, skipped: 0 };
		}

		let pegawaiByPtk = await existingPegawaiIndex(sekolahId);
		if (input.categories.includes('pegawai')) {
			const applied = await applyPegawai(sekolahId, source.pegawai);
			pegawaiByPtk = applied.idByPtk;
			results.pegawai = applied.result;
		}

		const kelasData = await applyKelas(
			sekolahId,
			target,
			input.categories.includes('kelas') ||
				input.categories.includes('murid') ||
				input.categories.includes('mapel') ||
				input.categories.includes('ekstrakurikuler')
				? source.rombel
				: [],
			pegawaiByPtk
		);
		if (input.categories.includes('kelas')) results.kelas = kelasData.result;
		if (input.categories.includes('murid')) {
			results.murid = await applyMurid(
				sekolahId,
				target,
				source.murid,
				kelasData.kelasByRombel,
				kelasData.anggota,
				source.sekolah
			);
		}
		if (input.categories.includes('mapel')) {
			await cacheMapelReferensi(sekolahId, target, source.mapelReferensi);
			results.mapel = await applyPembelajaran(
				source.rombel,
				kelasData.kelasByRombel,
				pegawaiByPtk,
				new Set(input.selectedMapelKeys)
			);
		}
		if (input.categories.includes('ekstrakurikuler')) {
			results.ekstrakurikuler = await applyEkstrakurikuler(sekolahId, target.id, source.rombel);
		}

		await saveSettings(sekolahId, source.credentials, source.semesterId, true);
		const result: DapodikApplyResult = {
			message: 'Data Dapodik berhasil diterapkan tanpa menimpa data khusus Kaganga.',
			semesterId: source.semesterId,
			results
		};
		await writeLog(
			sekolahId,
			'apply',
			'success',
			result.message,
			source.semesterId,
			result as unknown as Record<string, unknown>
		);
		return result;
	} catch (error) {
		await writeLog(sekolahId, 'apply', 'failed', (error as Error).message, input.semesterId);
		throw error;
	}
}
