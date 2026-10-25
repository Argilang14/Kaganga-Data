import {
	buildMeetingKey,
	classMonitoringCapabilities,
	isClockTime,
	isStrictLocalDate,
	jakartaNowParts,
	monitoringState,
	splitClassMonitoringMeetings,
	type ClassMonitoringAbsenceReason,
	type ClassMonitoringJenis,
	type ScheduleMeetingEntry
} from '$lib/class-monitoring';
import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableClassMonitoring,
	tableClassMonitoringQr,
	tableJurnalMengajar,
	tablePegawai
} from '$lib/server/db/schema';
import { loadJurnalScheduleContext } from '$lib/server/jurnal-mengajar';
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { MonitoringJournalContext } from './journal-monitoring-integration';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

type QueryParams = URLSearchParams | Record<string, unknown>;
type DbRow = Record<string, unknown>;

type Meeting = {
	key: string;
	kelasId: number;
	templateId: number;
	scheduleIds: number[];
	mapelNama: string;
	mataPelajaranId: number | null;
	jadwalMapelId: number | null;
	guruNama: string;
	guruPegawaiId: number | null;
	jamPelajaran: string;
	pukulMulai: string;
	pukulSelesai: string;
	tahunAjaranId: number;
	semesterId: number | null;
};

type ClassRow = { id: number; nama: string; jenjang: string | null; fase: string | null };
type LoadedEntry = ScheduleMeetingEntry & {
	mapelNama: string;
	mataPelajaranId: number | null;
	jadwalMapelId: number | null;
	guruNama: string;
};

function value(params: QueryParams, key: string) {
	const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
	return typeof raw === 'string' ? raw : raw == null ? null : String(raw);
}

function positiveInt(input: unknown) {
	const parsed = Number(input);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requiredContext(locals: App.Locals) {
	if (!locals.user) throw error(401, 'Silakan masuk kembali.');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || (locals.user.type !== 'admin' && locals.user.sekolahId !== sekolahId))
		throw error(403, 'Sekolah tidak sesuai dengan akun.');
	return { user: locals.user, sekolahId };
}

function normalizeJenis(input: unknown): ClassMonitoringJenis | null {
	return input === 'persiapan' || input === 'ganjil' || input === 'genap' ? input : null;
}

function safeIds(raw: unknown): number[] {
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return Array.isArray(parsed)
			? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0)
			: [];
	} catch {
		return [];
	}
}

function hashToken(token: string) {
	return createHash('sha256').update(token).digest('hex');
}

function tokensEqual(token: string, expectedHash: string) {
	const actual = Buffer.from(hashToken(token));
	const expected = Buffer.from(expectedHash);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isUniqueConflict(cause: unknown) {
	const message = cause instanceof Error ? cause.message : String(cause);
	return /unique|constraint/i.test(message);
}

function dayName(date: string) {
	return ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][
		new Date(`${date}T00:00:00Z`).getUTCDay()
	];
}

async function execute(sql: string, args: unknown[] = []) {
	const result = await db.$client.execute({ sql, args: args as never[] });
	return result.rows as unknown as DbRow[];
}

async function loadClasses(sekolahId: number, tahunAjaranId: number): Promise<ClassRow[]> {
	const rows = await execute(
		`SELECT k.id, k.nama, k.fase, sp.jenjang
		 FROM kelas k
		 LEFT JOIN kelas_satuan_pendidikan ksp ON ksp.kelas_id = k.id
		 LEFT JOIN sekolah_satuan_pendidikan sp ON sp.id = ksp.satuan_id
		 WHERE k.sekolah_id = ? AND k.tahun_ajaran_id = ?
		 ORDER BY COALESCE(sp.jenjang, ''), k.nama`,
		[sekolahId, tahunAjaranId]
	);
	return rows.map((row) => ({
		id: Number(row.id),
		nama: String(row.nama),
		fase: row.fase ? String(row.fase) : null,
		jenjang: row.jenjang ? String(row.jenjang) : null
	}));
}

function inferredJenjang(kelas: ClassRow) {
	if (kelas.jenjang) return kelas.jenjang;
	const raw = `${kelas.fase ?? ''} ${kelas.nama}`.toLowerCase();
	if (/\b(srd|fase\s*[abc])\b/.test(raw) || /\b(iv|v|vi)\b/i.test(kelas.nama)) return 'sd';
	if (/\b(srmp|fase\s*d)\b/.test(raw) || /\b(vii|viii|ix)\b/i.test(kelas.nama)) return 'smp';
	return 'sma';
}

async function holidayLabels(
	sekolahId: number,
	tahunAjaranId: number,
	tanggal: string,
	classes: ClassRow[]
) {
	const rows = await execute(
		`SELECT kelas_id AS kelasId, jenjang, judul FROM kalender_pendidikan
		 WHERE sekolah_id = ? AND tahun_ajaran_id = ?
		 AND jenis IN ('libur_nasional', 'libur_sekolah')
		 AND tanggal_mulai <= ? AND tanggal_selesai >= ?`,
		[sekolahId, tahunAjaranId, tanggal, tanggal]
	);
	const labels = new Map<number, string>();
	for (const kelas of classes) {
		const level = inferredJenjang(kelas);
		const holiday = rows.find((row) => {
			const scopedClass = positiveInt(row.kelasId);
			const scope = String(row.jenjang ?? 'semua');
			return (
				(!scopedClass || scopedClass === kelas.id) &&
				(scope === 'semua' ||
					scope === level ||
					scope === ({ sd: 'srd', smp: 'srmp', sma: 'srma' } as Record<string, string>)[level])
			);
		});
		if (holiday) labels.set(kelas.id, String(holiday.judul));
	}
	return labels;
}

async function loadMeetings(
	sekolahId: number,
	tanggal: string,
	context: NonNullable<Awaited<ReturnType<typeof loadJurnalScheduleContext>>>
): Promise<Map<number, Meeting[]>> {
	if (!context.templateIds.length) return new Map();
	const placeholders = context.templateIds.map(() => '?').join(',');
	const rows = await execute(
		`SELECT jp.id, jp.kelas_id AS kelasId, jp.template_id AS templateId, jp.jam_ke AS jamKe,
			jp.jadwal_mapel_id AS jadwalMapelId, jp.mata_pelajaran_id AS mataPelajaranId,
			COALESCE(jp.guru_pegawai_id, jm.guru_pegawai_id) AS guruPegawaiId, jj.pukul_mulai AS pukulMulai,
			jj.pukul_selesai AS pukulSelesai, COALESCE(mp.nama, jm.nama, jp.kode_kegiatan) AS mapelNama,
			COALESCE(g.nama, '-') AS guruNama
		 FROM jadwal_pelajaran jp
		 JOIN jadwal_template jt ON jt.id = jp.template_id AND jt.sekolah_id = jp.sekolah_id AND jt.aktif = 1
		 JOIN jadwal_jam jj ON jj.id = jp.jam_id AND jj.template_id = jp.template_id
		 LEFT JOIN mata_pelajaran mp ON mp.id = jp.mata_pelajaran_id
		 LEFT JOIN jadwal_mata_pelajaran jm ON jm.id = jp.jadwal_mapel_id
		 LEFT JOIN pegawai g ON g.id = COALESCE(jp.guru_pegawai_id, jm.guru_pegawai_id) AND g.sekolah_id = jp.sekolah_id
		 WHERE jp.sekolah_id = ? AND jp.hari = ? AND jp.tipe = 'pelajaran'
			AND jp.template_id IN (${placeholders})
			AND jj.aktif = 1
			AND (? IS NULL OR jt.semester_id IS NULL OR jt.semester_id = ?)
		 ORDER BY jp.kelas_id, jp.template_id, jp.jam_ke`,
		[sekolahId, dayName(tanggal), ...context.templateIds, context.semesterId, context.semesterId]
	);
	const grouped = new Map<number, Meeting[]>();
	const byClassTemplate = new Map<string, DbRow[]>();
	for (const row of rows) {
		const groupKey = `${row.kelasId}:${row.templateId}`;
		const group = byClassTemplate.get(groupKey) ?? [];
		group.push(row);
		byClassTemplate.set(groupKey, group);
	}
	for (const entries of byClassTemplate.values()) {
		const kelasId = Number(entries[0].kelasId);
		const normalized: LoadedEntry[] = entries.map((row) => ({
			id: Number(row.id),
			kelasId,
			templateId: Number(row.templateId),
			jamKe: Number(row.jamKe),
			guruPegawaiId: positiveInt(row.guruPegawaiId),
			pukulMulai: String(row.pukulMulai),
			pukulSelesai: String(row.pukulSelesai),
			mapelKey: row.jadwalMapelId
				? `j:${row.jadwalMapelId}`
				: `m:${row.mataPelajaranId ?? row.mapelNama}`,
			mapelNama: String(row.mapelNama),
			mataPelajaranId: positiveInt(row.mataPelajaranId),
			jadwalMapelId: positiveInt(row.jadwalMapelId),
			guruNama: String(row.guruNama)
		}));
		const classMeetings = grouped.get(kelasId) ?? [];
		classMeetings.push(
			...splitClassMonitoringMeetings(normalized).map((block) => {
				const first = block[0];
				const ids = block.map((entry) => entry.id);
				return {
					key: buildMeetingKey({ templateId: first.templateId, kelasId, scheduleIds: ids }),
					kelasId,
					templateId: first.templateId,
					scheduleIds: ids,
					mapelNama: String(first.mapelNama),
					mataPelajaranId: positiveInt(first.mataPelajaranId),
					jadwalMapelId: positiveInt(first.jadwalMapelId),
					guruNama: String(first.guruNama),
					guruPegawaiId: first.guruPegawaiId,
					jamPelajaran:
						block.length === 1 ? String(first.jamKe) : `${first.jamKe}-${block.at(-1)!.jamKe}`,
					pukulMulai: String(first.pukulMulai),
					pukulSelesai: String(block.at(-1)!.pukulSelesai),
					tahunAjaranId: context.tahunAjaranId,
					semesterId: context.semesterId
				};
			})
		);
		grouped.set(kelasId, classMeetings);
	}
	return grouped;
}

async function loadStored(sekolahId: number, tanggal: string, jenis: ClassMonitoringJenis) {
	return db.query.tableClassMonitoring.findMany({
		where: and(
			eq(tableClassMonitoring.sekolahId, sekolahId),
			eq(tableClassMonitoring.tanggal, tanggal),
			eq(tableClassMonitoring.jenisJadwal, jenis)
		)
	});
}

function snapshotMeeting(row: typeof tableClassMonitoring.$inferSelect): Meeting {
	return {
		key: row.meetingKey,
		kelasId: row.kelasIdSnapshot,
		templateId: row.templateIdSnapshot,
		scheduleIds: safeIds(row.jadwalPelajaranIdsSnapshot),
		mapelNama: row.mapelNamaSnapshot,
		mataPelajaranId: row.mataPelajaranIdSnapshot,
		jadwalMapelId: row.jadwalMapelIdSnapshot,
		guruNama: row.guruNamaSnapshot,
		guruPegawaiId: row.guruPegawaiIdSnapshot,
		jamPelajaran: row.jamPelajaranSnapshot,
		pukulMulai: row.pukulMulaiSnapshot,
		pukulSelesai: row.pukulSelesaiSnapshot,
		tahunAjaranId: row.tahunAjaranId ?? 0,
		semesterId: row.semesterId
	};
}

async function journalMap(sekolahId: number, tanggal: string) {
	const rows = await db.query.tableJurnalMengajar.findMany({
		columns: { id: true, kelasId: true, jadwalPelajaranIds: true, authUserId: true },
		where: and(
			eq(tableJurnalMengajar.sekolahId, sekolahId),
			eq(tableJurnalMengajar.tanggal, tanggal)
		)
	});
	return rows;
}

export async function loadMonitor(locals: App.Locals, params: QueryParams = {}) {
	const { user, sekolahId } = requiredContext(locals);
	const capabilities = classMonitoringCapabilities(user);
	if (!capabilities.canView) throw error(403, 'Izin melihat monitoring kelas diperlukan.');
	const now = jakartaNowParts();
	const tanggal = value(params, 'tanggal') ?? now.date;
	if (!isStrictLocalDate(tanggal)) throw error(400, 'Tanggal tidak valid.');
	const requestedJenis = value(params, 'jenis');
	if (requestedJenis && !normalizeJenis(requestedJenis))
		throw error(400, 'Jenis jadwal tidak valid.');
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const context = await loadJurnalScheduleContext(sekolahId, academic, tanggal, requestedJenis);
	if (!context) throw error(404, 'Konteks jadwal tidak tersedia.');
	const jenis = context.jenis as ClassMonitoringJenis;
	const [kelasList, meetingsByClass, stored, journals, guruList] = await Promise.all([
		loadClasses(sekolahId, context.tahunAjaranId),
		loadMeetings(sekolahId, tanggal, context),
		loadStored(sekolahId, tanggal, jenis),
		journalMap(sekolahId, tanggal),
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif'))
		})
	]);
	const holidays = await holidayLabels(sekolahId, context.tahunAjaranId, tanggal, kelasList);
	for (const kelasId of holidays.keys()) meetingsByClass.delete(kelasId);
	const storedByKey = new Map(stored.map((row) => [row.meetingKey, row]));
	for (const row of stored) {
		const classMeetings = meetingsByClass.get(row.kelasIdSnapshot) ?? [];
		const snapshotIds = new Set(safeIds(row.jadwalPelajaranIdsSnapshot));
		for (let index = classMeetings.length - 1; index >= 0; index--) {
			if (
				classMeetings[index].key !== row.meetingKey &&
				classMeetings[index].scheduleIds.some((id) => snapshotIds.has(id))
			)
				classMeetings.splice(index, 1);
		}
		if (!classMeetings.some((meeting) => meeting.key === row.meetingKey))
			classMeetings.push(snapshotMeeting(row));
		meetingsByClass.set(row.kelasIdSnapshot, classMeetings);
	}
	const storedClassById = new Map(stored.map((row) => [row.kelasIdSnapshot, row]));
	for (const [kelasId, storedRow] of storedClassById) {
		if (!kelasList.some((item) => item.id === kelasId))
			kelasList.push({
				id: kelasId,
				nama: storedRow.kelasNamaSnapshot,
				jenjang: storedRow.jenjangSnapshot,
				fase: null
			});
	}
	let present = 0;
	let excused = 0;
	let ended = 0;
	let rows = kelasList.map((kelas) => ({
		id: kelas.id,
		nama: kelas.nama,
		jenjang: kelas.jenjang ?? inferredJenjang(kelas),
		...(holidays.has(kelas.id) ? { holidayLabel: holidays.get(kelas.id)! } : {}),
		meetings: (meetingsByClass.get(kelas.id) ?? [])
			.sort((a, b) => a.pukulMulai.localeCompare(b.pukulMulai) || a.key.localeCompare(b.key))
			.map((meeting) => {
				const saved = storedByKey.get(meeting.key);
				const effective = saved ? snapshotMeeting(saved) : meeting;
				const state = monitoringState({
					date: tanggal,
					start: effective.pukulMulai,
					end: effective.pukulSelesai,
					nowDate: now.date,
					nowTime: now.time,
					scannedAt: saved?.scannedAt,
					absenceReason: saved?.absenceReason
				});
				if (state === 'present') present++;
				if (state === 'excused') excused++;
				if (state === 'ended') ended++;
				const nominated = saved?.substitutePegawaiId ?? null;
				const actualTeacher = saved?.actualGuruPegawaiId ?? nominated ?? effective.guruPegawaiId;
				const ownMeeting =
					!!user.pegawaiId &&
					(user.pegawaiId === effective.guruPegawaiId || user.pegawaiId === nominated);
				const inWindow = now.time >= effective.pukulMulai && now.time <= effective.pukulSelesai;
				const canScan =
					capabilities.canScan &&
					ownMeeting &&
					tanggal === now.date &&
					inWindow &&
					!holidays.has(kelas.id) &&
					!saved?.scannedAt;
				const journal = journals.find((item) => {
					const ids = safeIds(item.jadwalPelajaranIds);
					return (
						item.kelasId === effective.kelasId &&
						ids.some((id) => effective.scheduleIds.includes(id))
					);
				});
				return {
					key: effective.key,
					kelasId: effective.kelasId,
					templateId: effective.templateId,
					scheduleIds: effective.scheduleIds,
					mapelNama: effective.mapelNama,
					guruNama: effective.guruNama,
					guruPegawaiId: effective.guruPegawaiId,
					jamPelajaran: effective.jamPelajaran,
					pukulMulai: effective.pukulMulai,
					pukulSelesai: effective.pukulSelesai,
					state,
					scannedAt: saved?.scannedAt ?? null,
					actualGuruNama: saved?.actualGuruNamaSnapshot ?? null,
					absenceReason: saved?.absenceReason ?? null,
					absenceNote: saved?.absenceNote ?? null,
					substitutePegawaiId: nominated,
					substituteGuruNama: saved?.substituteNamaSnapshot ?? null,
					actualGuruPegawaiId: saved?.actualGuruPegawaiId ?? null,
					canScan,
					journal: {
						id: journal?.id ?? null,
						url: `/jurnal-mengajar?monitoring_key=${encodeURIComponent(effective.key)}&tanggal=${tanggal}&kelas_id=${effective.kelasId}&mapel_id=${effective.mataPelajaranId ?? ''}&jadwalIds=${effective.scheduleIds.join(',')}&jenis_jadwal=${jenis}`,
						canWrite: !!user.pegawaiId && user.pegawaiId === actualTeacher
					}
				};
			})
	}));
	const teacherScoped =
		!capabilities.canManage && (user.type === 'user' || user.type === 'wali_kelas');
	if (teacherScoped) {
		rows = rows
			.map((row) => ({
				...row,
				meetings: row.meetings.filter(
					(meeting) =>
						meeting.guruPegawaiId === user.pegawaiId ||
						meeting.substitutePegawaiId === user.pegawaiId ||
						meeting.actualGuruPegawaiId === user.pegawaiId
				)
			}))
			.filter((row) => row.meetings.length > 0);
	}
	const permittedClassIds = new Set(rows.map((row) => row.id));
	const requestedKelasRaw = value(params, 'kelas_id');
	const requestedKelasId = requestedKelasRaw ? positiveInt(requestedKelasRaw) : null;
	if (requestedKelasRaw && !requestedKelasId) throw error(400, 'Filter kelas tidak valid.');
	if (requestedKelasId && !kelasList.some((kelas) => kelas.id === requestedKelasId))
		throw error(403, 'Kelas filter bukan milik sekolah ini.');
	const requestedJenjang = value(params, 'jenjang');
	if (requestedJenjang && !['sd', 'smp', 'sma'].includes(requestedJenjang))
		throw error(400, 'Filter jenjang tidak valid.');
	if (requestedKelasId) rows = rows.filter((row) => row.id === requestedKelasId);
	if (requestedJenjang) rows = rows.filter((row) => row.jenjang === requestedJenjang);
	present = 0;
	excused = 0;
	ended = 0;
	for (const row of rows) {
		for (const meeting of row.meetings) {
			if (meeting.state === 'present') present++;
			if (meeting.state === 'excused') excused++;
			if (meeting.state === 'ended') ended++;
		}
	}
	const total = rows.reduce((sum, row) => sum + row.meetings.length, 0);
	const availableKelas = teacherScoped
		? kelasList.filter((kelas) => permittedClassIds.has(kelas.id))
		: kelasList;
	return {
		tanggal,
		sekolahNama: locals.sekolah?.nama ?? '',
		jenis,
		serverNow: `${now.date}T${now.time}+07:00`,
		contextLabel: [context.tahunAjaranNama, context.semesterNama, context.jenisLabel]
			.filter(Boolean)
			.join(' - '),
		kelasList: availableKelas.map((kelas) => ({
			id: kelas.id,
			nama: kelas.nama,
			jenjang: kelas.jenjang ?? inferredJenjang(kelas)
		})),
		guruList: capabilities.canManage
			? guruList.map((item) => ({ id: item.id, nama: item.nama }))
			: [],
		capabilities: { canScan: capabilities.canScan, canManage: capabilities.canManage },
		rows,
		summary: { total, present, excused, ended, pending: total - present - excused - ended },
		...(positiveInt(value(params, 'qrClassId'))
			? { qrClassId: positiveInt(value(params, 'qrClassId'))! }
			: {})
	};
}

export const getMonitor = loadMonitor;

async function currentMeeting(
	locals: App.Locals,
	key: string,
	tanggal: string,
	jenis: ClassMonitoringJenis
) {
	const { sekolahId } = requiredContext(locals);
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const context = await loadJurnalScheduleContext(sekolahId, academic, tanggal, jenis);
	if (!context || context.jenis !== jenis) return null;
	const meetings = await loadMeetings(sekolahId, tanggal, context);
	const classes = await loadClasses(sekolahId, context.tahunAjaranId);
	const holidays = await holidayLabels(sekolahId, context.tahunAjaranId, tanggal, classes);
	for (const [kelasId, group] of meetings) {
		if (holidays.has(kelasId)) continue;
		const found = group.find((item) => item.key === key);
		if (found) return found;
	}
	return null;
}

async function classInfo(sekolahId: number, kelasId: number) {
	return (
		await execute(
			`SELECT k.id, k.nama, k.fase, k.tahun_ajaran_id, sp.jenjang FROM kelas k
		 LEFT JOIN kelas_satuan_pendidikan ksp ON ksp.kelas_id = k.id
		 LEFT JOIN sekolah_satuan_pendidikan sp ON sp.id = ksp.satuan_id
		 WHERE k.id = ? AND k.sekolah_id = ? LIMIT 1`,
			[kelasId, sekolahId]
		)
	)[0];
}

function snapshotValues(params: {
	sekolahId: number;
	meeting: Meeting;
	kelas: DbRow;
	tanggal: string;
	jenis: ClassMonitoringJenis;
	now: string;
}) {
	const { sekolahId, meeting, kelas, tanggal, jenis, now } = params;
	return {
		sekolahId,
		meetingKey: meeting.key,
		tanggal,
		jenisJadwal: jenis,
		tahunAjaranId: meeting.tahunAjaranId,
		semesterId: meeting.semesterId,
		templateIdSnapshot: meeting.templateId,
		kelasIdSnapshot: meeting.kelasId,
		kelasNamaSnapshot: String(kelas.nama),
		jenjangSnapshot: kelas.jenjang ? String(kelas.jenjang) : null,
		jadwalPelajaranIdsSnapshot: JSON.stringify(meeting.scheduleIds),
		mataPelajaranIdSnapshot: meeting.mataPelajaranId,
		jadwalMapelIdSnapshot: meeting.jadwalMapelId,
		mapelNamaSnapshot: meeting.mapelNama,
		guruPegawaiIdSnapshot: meeting.guruPegawaiId,
		guruNamaSnapshot: meeting.guruNama,
		jamPelajaranSnapshot: meeting.jamPelajaran,
		pukulMulaiSnapshot: meeting.pukulMulai,
		pukulSelesaiSnapshot: meeting.pukulSelesai,
		createdAt: now,
		updatedAt: now
	};
}

export async function scanClassMeeting(
	locals: App.Locals,
	input: { key: string; qr: string; tanggal: string; jenis: ClassMonitoringJenis },
	request?: Request
) {
	const { user, sekolahId } = requiredContext(locals);
	const capabilities = classMonitoringCapabilities(user);
	if (!capabilities.canScan || !user.pegawaiId) throw error(403, 'Izin scan tidak tersedia.');
	const nowParts = jakartaNowParts();
	if (!isStrictLocalDate(input.tanggal) || input.tanggal !== nowParts.date)
		throw error(400, 'Scan hanya berlaku pada tanggal lokal hari ini.');
	const saved = await db.query.tableClassMonitoring.findFirst({
		where: and(
			eq(tableClassMonitoring.sekolahId, sekolahId),
			eq(tableClassMonitoring.meetingKey, input.key),
			eq(tableClassMonitoring.tanggal, input.tanggal),
			eq(tableClassMonitoring.jenisJadwal, input.jenis)
		)
	});
	const meeting = saved
		? snapshotMeeting(saved)
		: await currentMeeting(locals, input.key, input.tanggal, input.jenis);
	if (!meeting) throw error(404, 'Pertemuan tidak ditemukan.');
	if (
		!isClockTime(meeting.pukulMulai) ||
		!isClockTime(meeting.pukulSelesai) ||
		meeting.pukulMulai > meeting.pukulSelesai
	)
		throw error(409, 'Rentang waktu pertemuan tidak valid.');
	if (nowParts.time < meeting.pukulMulai || nowParts.time > meeting.pukulSelesai)
		throw error(409, 'Pertemuan belum dimulai atau sudah berakhir.');
	const [qr, kelas] = await Promise.all([
		db.query.tableClassMonitoringQr.findFirst({
			where: and(
				eq(tableClassMonitoringQr.sekolahId, sekolahId),
				eq(tableClassMonitoringQr.kelasId, meeting.kelasId)
			)
		}),
		classInfo(sekolahId, meeting.kelasId)
	]);
	if (!qr || !tokensEqual(input.qr, qr.tokenHash)) throw error(403, 'QR kelas tidak valid.');
	if (saved?.scannedAt) throw error(409, 'Pertemuan ini sudah pernah dipindai.');
	if (!kelas) throw error(404, 'Kelas tidak ditemukan.');
	const holidays = await holidayLabels(sekolahId, Number(kelas.tahun_ajaran_id), input.tanggal, [
		{
			id: meeting.kelasId,
			nama: String(kelas.nama),
			fase: kelas.fase ? String(kelas.fase) : null,
			jenjang: kelas.jenjang ? String(kelas.jenjang) : null
		}
	]);
	if (holidays.has(meeting.kelasId)) throw error(409, 'Tidak ada scan kelas pada hari libur.');
	const nominated = saved?.substitutePegawaiId ?? null;
	if (user.pegawaiId !== meeting.guruPegawaiId && user.pegawaiId !== nominated)
		throw error(403, 'Scan hanya untuk guru terjadwal atau pengganti yang ditunjuk.');
	const actor = await db.query.tablePegawai.findFirst({
		columns: { id: true, nama: true },
		where: and(
			eq(tablePegawai.id, user.pegawaiId),
			eq(tablePegawai.sekolahId, sekolahId),
			eq(tablePegawai.status, 'aktif')
		)
	});
	if (!actor) throw error(403, 'Pegawai aktif tidak ditemukan di sekolah ini.');
	const now = new Date().toISOString();
	try {
		await db.transaction(async (tx) => {
			const currentQr = await tx.query.tableClassMonitoringQr.findFirst({
				where: and(
					eq(tableClassMonitoringQr.sekolahId, sekolahId),
					eq(tableClassMonitoringQr.kelasId, meeting.kelasId)
				)
			});
			if (!currentQr || !tokensEqual(input.qr, currentQr.tokenHash))
				throw error(403, 'QR kelas telah diganti. Gunakan cetakan terbaru.');
			if (saved) {
				const current = await tx.query.tableClassMonitoring.findFirst({
					where: eq(tableClassMonitoring.id, saved.id)
				});
				if (!current || current.scannedAt) throw error(409, 'Pertemuan ini sudah pernah dipindai.');
				if (
					user.pegawaiId !== current.guruPegawaiIdSnapshot &&
					user.pegawaiId !== current.substitutePegawaiId
				)
					throw error(403, 'Penugasan guru pengganti sudah berubah.');
				const updated = await tx
					.update(tableClassMonitoring)
					.set({
						scannedAt: now,
						scannedByUserId: user.id,
						actualGuruPegawaiId: actor.id,
						actualGuruNamaSnapshot: actor.nama,
						updatedAt: now
					})
					.where(and(eq(tableClassMonitoring.id, saved.id), isNull(tableClassMonitoring.scannedAt)))
					.returning();
				if (!updated.length) throw error(409, 'Pertemuan ini sudah pernah dipindai.');
			} else {
				await tx.insert(tableClassMonitoring).values({
					...snapshotValues({
						sekolahId,
						meeting,
						kelas,
						tanggal: input.tanggal,
						jenis: input.jenis,
						now
					}),
					scannedAt: now,
					scannedByUserId: user.id,
					actualGuruPegawaiId: actor.id,
					actualGuruNamaSnapshot: actor.nama
				});
			}
			await writeAuditLog(
				{
					locals,
					request,
					action: 'create',
					entityType: 'class_monitoring_scan',
					entityId: input.key,
					summary: 'Kehadiran pertemuan kelas dipindai.',
					after: {
						tanggal: input.tanggal,
						jenis: input.jenis,
						kelasId: meeting.kelasId,
						actualGuruPegawaiId: actor.id
					}
				},
				tx
			);
		});
	} catch (cause) {
		if (isUniqueConflict(cause)) throw error(409, 'Pertemuan ini sudah pernah dipindai.');
		throw cause;
	}
	return { ok: true, key: input.key, scannedAt: now, guruNama: actor.nama };
}

export async function manageClassAbsence(
	locals: App.Locals,
	input: {
		key: string;
		tanggal: string;
		jenis: ClassMonitoringJenis;
		reason: ClassMonitoringAbsenceReason;
		substitutePegawaiId?: number;
		note?: string;
	},
	request?: Request
) {
	const { user, sekolahId } = requiredContext(locals);
	if (!classMonitoringCapabilities(user).canManage)
		throw error(403, 'Izin pengelolaan diperlukan.');
	if (!isStrictLocalDate(input.tanggal)) throw error(400, 'Tanggal tidak valid.');
	if (input.reason !== 'sakit' && input.reason !== 'izin') throw error(400, 'Alasan tidak valid.');
	const meeting = await currentMeeting(locals, input.key, input.tanggal, input.jenis);
	if (!meeting) throw error(404, 'Pertemuan tidak ditemukan.');
	const [saved, kelas, substitute] = await Promise.all([
		db.query.tableClassMonitoring.findFirst({
			where: and(
				eq(tableClassMonitoring.sekolahId, sekolahId),
				eq(tableClassMonitoring.meetingKey, input.key),
				eq(tableClassMonitoring.tanggal, input.tanggal),
				eq(tableClassMonitoring.jenisJadwal, input.jenis)
			)
		}),
		classInfo(sekolahId, meeting.kelasId),
		input.substitutePegawaiId
			? db.query.tablePegawai.findFirst({
					columns: { id: true, nama: true },
					where: and(
						eq(tablePegawai.id, input.substitutePegawaiId),
						eq(tablePegawai.sekolahId, sekolahId),
						eq(tablePegawai.status, 'aktif')
					)
				})
			: null
	]);
	if (saved?.scannedAt) throw error(409, 'Pertemuan yang sudah dipindai tidak dapat diubah.');
	if (!kelas) throw error(404, 'Kelas tidak ditemukan.');
	if (input.substitutePegawaiId && !substitute)
		throw error(400, 'Guru pengganti harus pegawai aktif di sekolah yang sama.');
	const note = input.note?.trim().slice(0, 500) || null;
	const now = new Date().toISOString();
	try {
		await db.transaction(async (tx) => {
			if (saved) {
				const updated = await tx
					.update(tableClassMonitoring)
					.set({
						absenceReason: input.reason,
						absenceNote: note,
						substitutePegawaiId: substitute?.id ?? null,
						substituteNamaSnapshot: substitute?.nama ?? null,
						managedByUserId: user.id,
						updatedAt: now
					})
					.where(and(eq(tableClassMonitoring.id, saved.id), isNull(tableClassMonitoring.scannedAt)))
					.returning({ id: tableClassMonitoring.id });
				if (!updated.length) throw error(409, 'Pertemuan yang sudah dipindai tidak dapat diubah.');
			} else
				await tx.insert(tableClassMonitoring).values({
					...snapshotValues({
						sekolahId,
						meeting,
						kelas,
						tanggal: input.tanggal,
						jenis: input.jenis,
						now
					}),
					absenceReason: input.reason,
					absenceNote: note,
					substitutePegawaiId: substitute?.id ?? null,
					substituteNamaSnapshot: substitute?.nama ?? null,
					managedByUserId: user.id
				});
			await writeAuditLog(
				{
					locals,
					request,
					action: saved ? 'update' : 'create',
					entityType: 'class_monitoring_absence',
					entityId: input.key,
					summary: 'Status ketidakhadiran guru diperbarui.',
					before: saved
						? { reason: saved.absenceReason, substitutePegawaiId: saved.substitutePegawaiId }
						: null,
					after: { reason: input.reason, substitutePegawaiId: substitute?.id ?? null, note }
				},
				tx
			);
		});
	} catch (cause) {
		if (isUniqueConflict(cause)) throw error(409, 'Status pertemuan baru saja diperbarui.');
		throw cause;
	}
	return { ok: true, key: input.key };
}

export async function loadClassQrPrintContext(locals: App.Locals) {
	const { user, sekolahId } = requiredContext(locals);
	if (!classMonitoringCapabilities(user).canManage)
		throw error(403, 'QR kelas hanya dapat dikelola manajer.');
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const tahun = academic.tahunAjaranList.find((item) => item.id === academic.activeTahunAjaranId);
	const semester = tahun?.semester.find((item) => item.id === academic.activeSemesterId);
	return {
		sekolahNama: locals.sekolah?.nama ?? '',
		contextLabel: [tahun?.nama, semester?.nama].filter(Boolean).join(' - '),
		kelasList: academic.activeTahunAjaranId
			? (await loadClasses(sekolahId, academic.activeTahunAjaranId)).map(({ id, nama }) => ({ id, nama }))
			: []
	};
}

async function qrCards(locals: App.Locals, kelasIds: number[], reset: boolean, request?: Request) {
	const { user, sekolahId } = requiredContext(locals);
	if (!classMonitoringCapabilities(user).canManage)
		throw error(403, 'QR kelas hanya dapat dikelola manajer.');
	const academic = await resolveSekolahAcademicContext(sekolahId);
	if (!academic.activeTahunAjaranId) throw error(404, 'Tahun ajaran aktif tidak tersedia.');
	const classes = await loadClasses(sekolahId, academic.activeTahunAjaranId);
	const requested = new Set(kelasIds);
	const selected = classes.filter((item) => requested.has(item.id));
	if (!requested.size) throw error(400, 'Pilih setidaknya satu kelas.');
	if (selected.length !== requested.size)
		throw error(403, 'Satu atau lebih kelas bukan milik sekolah ini.');
	const cards = [];
	for (const kelas of selected) {
		let qr = await db.query.tableClassMonitoringQr.findFirst({
			where: and(
				eq(tableClassMonitoringQr.sekolahId, sekolahId),
				eq(tableClassMonitoringQr.kelasId, kelas.id)
			)
		});
		if (!qr || reset) {
			const existed = !!qr;
			const token = `rapkumer:class:${randomBytes(32).toString('base64url')}`;
			const now = new Date().toISOString();
			const values = {
				sekolahId,
				kelasId: kelas.id,
				token,
				tokenHash: hashToken(token),
				issuedAt: now,
				issuedByUserId: user.id,
				createdAt: qr?.createdAt ?? now,
				updatedAt: now
			};
			if (qr)
				await db
					.update(tableClassMonitoringQr)
					.set(values)
					.where(eq(tableClassMonitoringQr.id, qr.id));
			else await db.insert(tableClassMonitoringQr).values(values);
			qr = await db.query.tableClassMonitoringQr.findFirst({
				where: and(
					eq(tableClassMonitoringQr.sekolahId, sekolahId),
					eq(tableClassMonitoringQr.kelasId, kelas.id)
				)
			});
			await writeAuditLog({
				locals,
				request,
				action: existed ? 'update' : 'create',
				entityType: 'class_monitoring_qr',
				entityId: kelas.id,
				summary: reset ? 'QR kelas dibuat ulang.' : 'QR kelas dibuat.',
				after: { kelasId: kelas.id, issuedAt: now }
			});
		}
		if (qr) cards.push({ kelasId: kelas.id, nama: kelas.nama, token: qr.token, payload: qr.token });
	}
	return { cards };
}

export const getClassQrCards = (locals: App.Locals, kelasIds: number[], request?: Request) =>
	qrCards(locals, kelasIds, false, request);
export const resetClassQr = (locals: App.Locals, kelasId: number, request?: Request) =>
	qrCards(locals, [kelasId], true, request);

export async function resolveClassMonitoringJournalContext(
	locals: App.Locals,
	key: string,
	date: string,
	jenisInput: string
): Promise<MonitoringJournalContext | null> {
	const { user, sekolahId } = requiredContext(locals);
	if (!classMonitoringCapabilities(user).canScan || !user.pegawaiId)
		throw error(403, 'Izin menulis jurnal pertemuan tidak tersedia.');
	const actor = await db.query.tablePegawai.findFirst({
		columns: { id: true },
		where: and(
			eq(tablePegawai.id, user.pegawaiId),
			eq(tablePegawai.sekolahId, sekolahId),
			eq(tablePegawai.status, 'aktif')
		)
	});
	if (!actor) throw error(403, 'Pegawai aktif tidak ditemukan di sekolah ini.');
	const jenis = normalizeJenis(jenisInput);
	if (!jenis || !isStrictLocalDate(date)) return null;
	const saved = await db.query.tableClassMonitoring.findFirst({
		where: and(
			eq(tableClassMonitoring.sekolahId, sekolahId),
			eq(tableClassMonitoring.meetingKey, key),
			eq(tableClassMonitoring.tanggal, date),
			eq(tableClassMonitoring.jenisJadwal, jenis)
		)
	});
	const meeting = saved ? snapshotMeeting(saved) : await currentMeeting(locals, key, date, jenis);
	if (!meeting) throw error(409, 'Pertemuan monitoring tidak lagi tersedia.');
	if (!meeting.jadwalMapelId || !meeting.tahunAjaranId)
		throw error(
			409,
			'Pertemuan belum memiliki mata pelajaran global atau tahun ajaran yang valid.'
		);
	const actualTeacher =
		saved?.actualGuruPegawaiId ?? saved?.substitutePegawaiId ?? meeting.guruPegawaiId;
	if (!user.pegawaiId || user.pegawaiId !== actualTeacher)
		throw error(403, 'Jurnal hanya dapat ditulis guru aktual pertemuan.');
	const kelas = saved
		? { nama: saved.kelasNamaSnapshot }
		: await classInfo(sekolahId, meeting.kelasId);
	if (!kelas) return null;
	const journals = await journalMap(sekolahId, date);
	const journal = journals.find(
		(item) =>
			item.authUserId === user.id &&
			item.kelasId === meeting.kelasId &&
			safeIds(item.jadwalPelajaranIds).some((id) => meeting.scheduleIds.includes(id))
	);
	const mapelRows = await execute(
		'SELECT kode FROM jadwal_mata_pelajaran WHERE id = ? AND sekolah_id = ? LIMIT 1',
		[meeting.jadwalMapelId, sekolahId]
	);
	if (!mapelRows[0]) throw error(409, 'Mata pelajaran global pertemuan tidak ditemukan.');
	return {
		monitoringKey: meeting.key,
		kelasId: meeting.kelasId,
		kelasNama: String(kelas.nama),
		jadwalMapelId: meeting.jadwalMapelId,
		mataPelajaranId: meeting.mataPelajaranId,
		mapelNama: meeting.mapelNama,
		mapelKode: mapelRows[0].kode ? String(mapelRows[0].kode) : null,
		tanggal: date,
		jenisJadwal: jenis,
		jadwalIds: meeting.scheduleIds,
		jamPelajaran: meeting.jamPelajaran,
		pukul: `${meeting.pukulMulai}-${meeting.pukulSelesai}`,
		tahunAjaranId: meeting.tahunAjaranId,
		semesterId: meeting.semesterId,
		jadwalTemplateId: meeting.templateId,
		existingJournalId: journal?.id ?? null,
		source: saved ? 'snapshot' : 'schedule'
	};
}

export function parseMonitoringJenis(input: unknown) {
	return normalizeJenis(input);
}
