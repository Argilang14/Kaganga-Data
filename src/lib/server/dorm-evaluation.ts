import { schoolWideDorm, schoolWideAcademic, hasRole } from '$lib/user-role';
import { error, fail, isHttpError, type RequestEvent } from '@sveltejs/kit';
import type { InValue, Client } from '@libsql/client';
import db from './db';
import { ensureDormEvaluationSchema } from './db/ensure-dorm-evaluation';
import { activeMuridSql } from './murid-query';
import { writeAuditLog } from './audit-log';
import { dormToday } from '$lib/dormitory';
import {
	kategoriToRubrikValue,
	hitungNilaiIndikator
} from '$lib/components/asesmen-keasramaan/utils';

export const dormCategories = ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'] as const;
export type DormCategory = (typeof dormCategories)[number];
export type EvaluationRoom = {
	id: number;
	nama: string;
	asrama: string;
	wali: string | null;
	aktif: number;
	deletedAt: string | null;
};
export type EvaluationPeriod = {
	id: number;
	nama: string;
	tahun: string;
	aktif: number;
	mulai: string;
	selesai: string;
};
export type Evaluation = { id: number; nama: string; sumber_lama_id: number | null };
export type EvaluationGoal = {
	id: number;
	evaluasi_id: number;
	indikator: string;
	deskripsi: string;
};
export type EvaluationStudent = {
	id: number;
	nama: string;
	nisn: string | null;
	uid: string;
	penempatan_id: number;
	mulai: string;
	selesai: string | null;
	wali_asuh_nama: string | null;
	wali_asuh_pegawai_id: number | null;
};
export type EvaluationGrade = {
	penempatan_id: number;
	tujuan_id: number;
	kategori: DormCategory;
	updated_at: string;
};

type Reader = Pick<Client, 'execute'>;
export async function evaluationRows<T>(
	sql: string,
	args: InValue[] = [],
	reader: Reader = db.$client
): Promise<T[]> {
	return (await reader.execute({ sql, args })).rows as unknown as T[];
}
function id(value: unknown, optional = false) {
	if (optional && (value == null || value === '' || value === '0')) return 0;
	const n = Number(value);
	if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(n) || n <= 0)
		error(400, 'Pilihan data tidak valid. Pilih ulang data pada halaman.');
	return n;
}
function text(value: unknown, max: number) {
	const result = String(value ?? '').trim();
	if (!result || result.length > max) error(400, `Isi keterangan antara 1 dan ${max} karakter.`);
	return result;
}
export function wideDormEvaluation(user: App.Locals['user']) {
	return !!user && schoolWideDorm(user);
}

export async function dormEvaluationContext(
	event: Pick<RequestEvent, 'locals' | 'url' | 'cookies'>,
	form?: FormData
) {
	await ensureDormEvaluationSchema();
	const { user, sekolah } = event.locals;
	if (!user || !sekolah || (user.type !== 'admin' && user.sekolahId !== sekolah.id))
		error(403, 'Sekolah berada di luar penugasan akun.');
	const wide = wideDormEvaluation(user);
	if (!wide && !hasRole(user, 'wali_asuh', 'wali_asrama'))
		error(403, 'Menu ini hanya untuk petugas keasramaan.');
	const school = sekolah.id;
	const periods = await evaluationRows<EvaluationPeriod>(
		`SELECT s.id,s.nama,t.nama tahun,s.is_aktif*t.is_aktif aktif,
 coalesce(s.tanggal_mulai,s.tanggal_masuk,CASE WHEN s.tipe='ganjil' THEN substr(t.nama,1,4)||'-07-01' ELSE substr(t.nama,-4)||'-01-01' END) mulai,
 coalesce(s.tanggal_selesai,CASE WHEN s.tipe='ganjil' THEN substr(t.nama,1,4)||'-12-31' ELSE substr(t.nama,-4)||'-06-30' END) selesai FROM semester s JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id WHERE t.sekolah_id=? ORDER BY t.id DESC,s.id DESC`,
		[school]
	);
	const suppliedPeriod = form?.get('semester_id') ?? event.url.searchParams.get('semester_id');
	const periodId =
		id(suppliedPeriod, true) || periods.find((p) => p.aktif)?.id || periods[0]?.id || 0;
	const period = periods.find((p) => p.id === periodId) ?? null;
	if (periodId && !period) error(403, 'Periode berada di luar sekolah ini.');
	const employee = user.pegawaiId ?? -1;
	const grading = /^\/(?:api\/)?asesmen-keasramaan(?:\/|$)/.test(event.url.pathname);
	const ownGrades = grading && hasRole(user, 'wali_asuh') && !schoolWideAcademic(user);
	const requestedHistory = event.url.searchParams.get('riwayat') === '1';
	const printing = event.url.pathname.startsWith('/cetak');
	const includeDeleted = requestedHistory || printing;
	const rooms = await evaluationRows<EvaluationRoom>(
		`SELECT k.id,k.nama,g.nama asrama,k.aktif*g.aktif aktif,k.deleted_at deletedAt,
	 (SELECT w.nama_snapshot FROM asrama_penugasan w WHERE w.kamar_id=k.id AND w.peran='utama' AND w.mulai<=? AND (w.selesai IS NULL OR w.selesai>?) LIMIT 1) wali
	 FROM asrama_kamar k JOIN asrama g ON g.id=k.asrama_id WHERE k.sekolah_id=? ${includeDeleted ? '' : 'AND k.deleted_at IS NULL AND g.deleted_at IS NULL AND g.semester_id=?'} AND (?=1
	 OR (?='wali_asrama' AND EXISTS(SELECT 1 FROM asrama_penugasan w JOIN pegawai e ON e.id=w.pegawai_id WHERE w.kamar_id=k.id AND w.pegawai_id=? AND e.status='aktif' AND w.mulai<=? AND (w.selesai IS NULL OR w.selesai>?)))
	 OR (?='wali_asuh' AND EXISTS(SELECT 1 FROM asrama_penempatan p JOIN murid_identity_link mi ON mi.identity_uid=p.identity_uid AND mi.sekolah_id=p.sekolah_id
	 JOIN murid m ON m.id=mi.murid_id JOIN pegawai e ON e.id=m.wali_asuh_pegawai_id AND e.sekolah_id=m.sekolah_id AND e.status='aktif'
	 WHERE p.kamar_id=k.id AND m.semester_id=? AND e.id=?))) ORDER BY g.nama,k.nama`,
		[
			dormToday(),
			dormToday(),
			school,
			...(includeDeleted ? [] : [periodId]),
			wide && !ownGrades ? 1 : 0,
			hasRole(user, 'wali_asrama') && !ownGrades ? 'wali_asrama' : '',
			employee,
			dormToday(),
			dormToday(),
			hasRole(user, 'wali_asuh') ? 'wali_asuh' : '',
			periodId,
			employee
		]
	);
	const suppliedRoom =
		form?.get('kamar_id') ??
		event.url.searchParams.get('kamar_id') ??
		event.cookies.get('active-kamar-id');
	const roomId = id(suppliedRoom, true);
	const room = rooms.find((r) => r.id === roomId) ?? null;
	const history = requestedHistory || (printing && !!room?.deletedAt);
	if (roomId && !room && (form?.has('kamar_id') || event.url.searchParams.has('kamar_id')))
		error(403, 'Asrama berada di luar penugasan. Pilih asrama yang tersedia.');
	const ownsRoom =
		!!room &&
		hasRole(user, 'wali_asrama') &&
		(
			await evaluationRows(
				'SELECT id FROM asrama_penugasan WHERE kamar_id=? AND pegawai_id=? AND mulai<=? AND (selesai IS NULL OR selesai>?)',
				[room.id, employee, dormToday(), dormToday()]
			)
		).length > 0;
	const limitToWards = hasRole(user, 'wali_asuh') && ((!wide && !ownsRoom) || ownGrades);
	const students =
		room && period
			? await evaluationRows<EvaluationStudent>(
					`SELECT m.id,m.nama,m.nisn,mi.identity_uid uid,p.id penempatan_id,p.mulai,p.selesai,m.wali_asuh_nama,m.wali_asuh_pegawai_id
	 FROM asrama_penempatan p JOIN murid_identity_link mi ON mi.identity_uid=p.identity_uid AND mi.sekolah_id=p.sekolah_id
	 JOIN murid m ON m.id=mi.murid_id JOIN semester s ON s.id=m.semester_id
	 WHERE p.sekolah_id=? AND p.kamar_id=? AND m.semester_id=? AND p.mulai<=?
	 AND (p.selesai IS NULL OR p.selesai>?)
	 AND NOT EXISTS(SELECT 1 FROM murid_identity_link newer JOIN murid nm ON nm.id=newer.murid_id
	 WHERE newer.sekolah_id=mi.sekolah_id AND newer.identity_uid=mi.identity_uid AND nm.semester_id=m.semester_id AND nm.id>m.id)
	 ${history ? '' : `AND p.selesai IS NULL AND p.mulai<='${dormToday()}' AND ${activeMuridSql('m')}`}
	 AND (?<>'wali_asuh' OR (m.wali_asuh_pegawai_id=? AND EXISTS(SELECT 1 FROM pegawai e WHERE e.id=? AND e.sekolah_id=m.sekolah_id AND e.status='aktif')))
	 ORDER BY m.nama,p.mulai`,
					[
						school,
						room.id,
						period.id,
						period.selesai,
						period.mulai,
						limitToWards ? 'wali_asuh' : '',
						employee,
						employee
					]
				)
			: [];
	const evaluations =
		room && period
			? await evaluationRows<Evaluation>(
					'SELECT id,nama,sumber_lama_id FROM asrama_evaluasi WHERE sekolah_id=? AND kamar_id=? AND semester_id=? ORDER BY nama,id',
					[school, room.id, period.id]
				)
			: [];
	const goals =
		room && period
			? await evaluationRows<EvaluationGoal>(
					`SELECT t.* FROM asrama_evaluasi_tujuan t JOIN asrama_evaluasi e ON e.id=t.evaluasi_id WHERE e.sekolah_id=? AND e.kamar_id=? AND e.semester_id=? ORDER BY e.id,t.indikator,t.id`,
					[school, room.id, period.id]
				)
			: [];
	const grades =
		room && period
			? await evaluationRows<EvaluationGrade>(
					`SELECT n.penempatan_id,n.tujuan_id,n.kategori,n.updated_at FROM asrama_evaluasi_nilai n JOIN asrama_evaluasi_tujuan t ON t.id=n.tujuan_id JOIN asrama_evaluasi e ON e.id=t.evaluasi_id WHERE e.sekolah_id=? AND e.kamar_id=? AND e.semester_id=?`,
					[school, room.id, period.id]
				)
			: [];
	const allowed = new Set(students.map((s) => s.penempatan_id));
	const writable = !!period?.aktif && !history && !!room?.aktif;
	return {
		school,
		user,
		rooms,
		room,
		periods,
		period,
		students,
		evaluations,
		goals,
		grades: grades.filter((g) => allowed.has(g.penempatan_id)),
		history,
		canMaster: writable && (wide || ownsRoom),
		canGrade:
			writable &&
			((schoolWideAcademic(user) && user.permissions.includes('keasramaan_input')) ||
				hasRole(user, 'wali_asuh')),
		canNote: writable && (wide || ownsRoom),
		wide
	};
}

export async function loadDormEvaluation(
	event: RequestEvent,
	mode: 'master' | 'input' | 'notes' | 'recap' | 'print'
) {
	const ctx = await dormEvaluationContext(event);
	const notes =
		ctx.room && ctx.period
			? await evaluationRows<{ penempatan_id: number; catatan: string }>(
					`SELECT c.penempatan_id,c.catatan FROM asrama_evaluasi_catatan c JOIN asrama_penempatan p ON p.id=c.penempatan_id WHERE p.sekolah_id=? AND p.kamar_id=? AND c.semester_id=?`,
					[ctx.school, ctx.room.id, ctx.period.id]
				)
			: [];
	const ids = new Set(ctx.students.map((s) => s.penempatan_id));
	const legacy = ctx.wide
		? await evaluationRows<{
				id: number;
				nama: string;
				kelas: string;
				periode: string;
				jumlah: number;
			}>(
				`SELECT e.id,e.nama,k.nama kelas,s.nama||' '||t.nama periode,(SELECT COUNT(*) FROM asesmen_keasramaan n WHERE n.keasramaan_id=e.id) jumlah FROM keasramaan e JOIN kelas k ON k.id=e.kelas_id JOIN semester s ON s.id=k.semester_id JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id WHERE k.sekolah_id=? ORDER BY s.id DESC,e.id`,
				[ctx.school]
			)
		: [];
	const legacyGrades =
		ctx.wide && event.url.searchParams.get('riwayat_kelas') === '1'
			? await evaluationRows<{
					murid_id: number;
					nama: string;
					kelas: string;
					matev: string;
					indikator: string;
					tujuan: string;
					kategori: string;
				}>(
					`SELECT m.id murid_id,m.nama,k.nama kelas,e.nama matev,i.deskripsi indikator,t.deskripsi tujuan,n.kategori FROM asesmen_keasramaan n JOIN murid m ON m.id=n.murid_id JOIN keasramaan e ON e.id=n.keasramaan_id JOIN kelas k ON k.id=e.kelas_id JOIN keasramaan_tujuan t ON t.id=n.tujuan_id JOIN keasramaan_indikator i ON i.id=t.indikator_id WHERE m.sekolah_id=? AND k.sekolah_id=? ORDER BY m.nama,e.id,t.id LIMIT 500`,
					[ctx.school, ctx.school]
				)
			: [];
	const titles = {
		master: 'Mata Evaluasi Keasramaan',
		input: 'Input Nilai Keasramaan',
		notes: 'Catatan Wali Asrama',
		recap: 'Rekap Nilai Keasramaan',
		print: 'Cetak Rapor Asrama'
	};
	const caregiverCount = await evaluationRows<{ jumlah: number }>(
		`SELECT COUNT(*) jumlah FROM murid m JOIN semester s ON s.id=m.semester_id JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id WHERE m.sekolah_id=? AND s.is_aktif=1 AND t.is_aktif=1 AND m.wali_asuh_pegawai_id IS NULL AND ${activeMuridSql('m')}`,
		[ctx.school]
	);
	const { user, ...view } = ctx;
	return {
		...view,
		canGrade: mode === 'input' && ctx.canGrade,
		meta: { title: titles[mode] },
		mode,
		notes: notes.filter((n) => ids.has(n.penempatan_id)),
		legacy,
		legacyGrades,
		missingCaregivers: wideDormEvaluation(user) ? (caregiverCount[0]?.jumlah ?? 0) : 0
	};
}

export function evaluationAverage(
	goals: EvaluationGoal[],
	grades: EvaluationGrade[],
	placement: number,
	evaluation: number
) {
	const indicators = new Map<string, number[]>();
	for (const goal of goals.filter((t) => t.evaluasi_id === evaluation)) {
		const grade = grades.find((n) => n.penempatan_id === placement && n.tujuan_id === goal.id);
		if (!grade) continue;
		const values = indicators.get(goal.indikator) ?? [];
		values.push(kategoriToRubrikValue(grade.kategori));
		indicators.set(goal.indikator, values);
	}
	return hitungNilaiIndikator([...indicators.values()].map((v) => hitungNilaiIndikator(v)));
}

export async function assertDormWritable(
	ctx: Awaited<ReturnType<typeof dormEvaluationContext>>,
	mode: 'grade' | 'master' | 'note',
	reader: Reader
) {
	if (
		!ctx.room ||
		!ctx.period ||
		!(mode === 'grade' ? ctx.canGrade : mode === 'master' ? ctx.canMaster : ctx.canNote)
	)
		error(403, 'Tindakan berada di luar penugasan atau periode aktif.');
	const valid = await evaluationRows(
		`SELECT k.id FROM asrama_kamar k JOIN asrama g ON g.id=k.asrama_id JOIN semester s ON s.id=? JOIN tahun_ajaran y ON y.id=s.tahun_ajaran_id
	 WHERE k.id=? AND k.sekolah_id=? AND y.sekolah_id=k.sekolah_id AND g.semester_id=s.id AND k.aktif=1 AND g.aktif=1 AND s.is_aktif=1 AND y.is_aktif=1
	 AND (?=1 OR (?='wali_asuh' AND EXISTS(SELECT 1 FROM pegawai e WHERE e.id=? AND e.sekolah_id=k.sekolah_id AND e.status='aktif'))
	 OR (?='wali_asrama' AND EXISTS(SELECT 1 FROM asrama_penugasan w JOIN pegawai e ON e.id=w.pegawai_id WHERE w.kamar_id=k.id AND w.pegawai_id=? AND e.status='aktif' AND w.mulai<=? AND (w.selesai IS NULL OR w.selesai>?))))`,
		[
			ctx.period.id,
			ctx.room.id,
			ctx.school,
			(mode === 'grade' ? schoolWideAcademic(ctx.user) : ctx.wide) ? 1 : 0,
			mode === 'grade' && hasRole(ctx.user, 'wali_asuh')
				? 'wali_asuh'
				: hasRole(ctx.user, 'wali_asrama')
					? 'wali_asrama'
					: '',
			ctx.user.pegawaiId ?? -1,
			mode === 'grade' && hasRole(ctx.user, 'wali_asuh')
				? 'wali_asuh'
				: hasRole(ctx.user, 'wali_asrama')
					? 'wali_asrama'
					: '',
			ctx.user.pegawaiId ?? -1,
			dormToday(),
			dormToday()
		],
		reader
	);
	if (!valid.length) error(409, 'Penugasan, asrama, atau periode berubah. Muat ulang halaman.');
}

export async function saveDormGrades(
	ctx: Awaited<ReturnType<typeof dormEvaluationContext>>,
	entries: Array<{ placement: number; goal: number; category: string }>
) {
	if (!ctx.canGrade || !ctx.room || !ctx.period)
		error(403, 'Penilaian hanya untuk wali asuh anak binaan pada periode aktif.');
	if (!entries.length || entries.length > 10000)
		error(400, 'Isi 1 sampai 10.000 nilai per penyimpanan.');
	const seen = new Set<string>();
	for (const e of entries) {
		if (
			!ctx.students.some(
				(s) =>
					s.penempatan_id === e.placement &&
					!s.selesai &&
					(schoolWideAcademic(ctx.user) || s.wali_asuh_pegawai_id === ctx.user.pegawaiId)
			) ||
			!ctx.goals.some((t) => t.id === e.goal)
		)
			error(403, 'Daftar berisi anak atau tujuan di luar penugasan. Muat ulang halaman.');
		if (
			(e.category !== '' && !dormCategories.includes(e.category as DormCategory)) ||
			seen.has(`${e.placement}:${e.goal}`)
		)
			error(400, 'Nilai tidak valid atau berulang. Periksa isian nilai.');
		seen.add(`${e.placement}:${e.goal}`);
	}
	const tx = await db.$client.transaction('write');
	try {
		await assertDormWritable(ctx, 'grade', tx);
		for (const e of entries) {
			const student = ctx.students.find((s) => s.penempatan_id === e.placement)!;
			const valid = await evaluationRows(
				`SELECT p.id FROM asrama_penempatan p JOIN murid m ON m.id=? JOIN asrama_evaluasi_tujuan t ON t.id=? JOIN asrama_evaluasi v ON v.id=t.evaluasi_id JOIN semester s ON s.id=v.semester_id JOIN tahun_ajaran y ON y.id=s.tahun_ajaran_id
			 WHERE p.id=? AND p.selesai IS NULL AND p.mulai<='${dormToday()}' AND p.kamar_id=? AND p.sekolah_id=? AND v.kamar_id=p.kamar_id AND v.semester_id=? AND v.sekolah_id=p.sekolah_id AND s.is_aktif=1 AND y.is_aktif=1 AND m.semester_id=v.semester_id AND m.sekolah_id=p.sekolah_id AND EXISTS(SELECT 1 FROM murid_identity_link mi WHERE mi.murid_id=m.id AND mi.identity_uid=p.identity_uid AND mi.sekolah_id=p.sekolah_id) AND ${activeMuridSql('m')}
			 AND (?<>'wali_asuh' OR (m.wali_asuh_pegawai_id=? AND EXISTS(SELECT 1 FROM pegawai e WHERE e.id=? AND e.status='aktif' AND e.sekolah_id=m.sekolah_id)))`,
				[
					student.id,
					e.goal,
					e.placement,
					ctx.room.id,
					ctx.school,
					ctx.period.id,
					hasRole(ctx.user, 'wali_asuh') && !schoolWideAcademic(ctx.user) ? 'wali_asuh' : '',
					ctx.user.pegawaiId ?? -1,
					ctx.user.pegawaiId ?? -1
				],
				tx
			);
			if (!valid.length)
				error(409, 'Penempatan, periode, atau wali asuh berubah. Muat ulang halaman.');
			if (e.category === '') {
				await tx.execute({
					sql: 'DELETE FROM asrama_evaluasi_nilai WHERE penempatan_id=? AND tujuan_id=?',
					args: [e.placement, e.goal]
				});
				continue;
			}
			await tx.execute({
				sql: `INSERT INTO asrama_evaluasi_nilai(penempatan_id,tujuan_id,murid_id,kategori,penilai_id,wali_asuh_nama_snapshot,wali_asuh_nip_snapshot) VALUES(?,?,?,?,?,?,(SELECT nip FROM pegawai WHERE id=?)) ON CONFLICT(penempatan_id,tujuan_id) DO UPDATE SET kategori=excluded.kategori,penilai_id=excluded.penilai_id,updated_at=CURRENT_TIMESTAMP,wali_asuh_nama_snapshot=excluded.wali_asuh_nama_snapshot,wali_asuh_nip_snapshot=excluded.wali_asuh_nip_snapshot`,
				args: [
					e.placement,
					e.goal,
					student.id,
					e.category,
					ctx.user.id,
					student.wali_asuh_nama,
					student.wali_asuh_pegawai_id
				]
			});
		}
		await tx.commit();
	} catch (cause) {
		await tx.rollback();
		throw cause;
	} finally {
		tx.close();
	}
}

export async function mutateDormEvaluation(event: RequestEvent, noteAction?: 'save' | 'fillAll') {
	try {
		const form = await event.request.formData();
		const ctx = await dormEvaluationContext(event, form);
		const action = noteAction ? 'note' : String(form.get('operation') ?? '');
		if (!ctx.room || !ctx.period) error(400, 'Pilih asrama dan periode terlebih dahulu.');
		if (action === 'grade') {
			const placement = id(form.get('penempatan_id'));
			const entries = [...form.entries()]
				.filter(([key]) => key.startsWith('nilai_'))
				.map(([key, value]) => ({ placement, goal: id(key.slice(6)), category: String(value) }));
			await saveDormGrades(ctx, entries);
		} else {
			const tx = await db.$client.transaction('write');
			try {
				await assertDormWritable(ctx, action === 'note' ? 'note' : 'master', tx);
				if (action === 'note') {
					if (!ctx.canNote)
						error(403, 'Catatan hanya dapat diisi wali asrama yang ditugaskan pada periode aktif.');
					let targets: unknown = [form.get(noteAction === 'save' ? 'muridId' : 'penempatan_id')];
					if (noteAction === 'fillAll') {
						try {
							targets = JSON.parse(String(form.get('muridIds') ?? ''));
						} catch {
							error(400, 'Daftar murid tidak valid. Muat ulang halaman.');
						}
					}
					if (!Array.isArray(targets) || !targets.length || targets.length > 25)
						error(400, 'Pilih antara 1 dan 25 murid pada halaman ini.');
					const placements = [...new Set(targets.map((value) => id(value)))];
					if (
						placements.some(
							(placement) => !ctx.students.some((s) => s.penempatan_id === placement && !s.selesai)
						)
					)
						error(403, 'Anak berada di luar asrama yang ditugaskan.');
					const note = String(form.get('catatan') ?? '').trim();
					if (note.length > 5000) error(400, 'Catatan maksimal 5.000 karakter.');
					for (const placement of placements) {
						const result = await tx.execute({
							sql: `INSERT INTO asrama_evaluasi_catatan(penempatan_id,semester_id,catatan,petugas_id) SELECT p.id,?,?,? FROM asrama_penempatan p JOIN murid_identity_link mi ON mi.identity_uid=p.identity_uid AND mi.sekolah_id=p.sekolah_id JOIN murid m ON m.id=mi.murid_id WHERE p.id=? AND p.selesai IS NULL AND p.sekolah_id=? AND p.kamar_id=? AND m.semester_id=? AND ${activeMuridSql('m')} ON CONFLICT(penempatan_id,semester_id) DO UPDATE SET catatan=excluded.catatan,petugas_id=excluded.petugas_id,updated_at=CURRENT_TIMESTAMP`,
							args: [
								ctx.period.id,
								note,
								ctx.user.id,
								placement,
								ctx.school,
								ctx.room.id,
								ctx.period.id
							]
						});
						if (!result.rowsAffected) error(409, 'Penghuni berubah. Muat ulang halaman.');
					}
				} else if (action === 'master') {
					if (!ctx.canMaster)
						error(
							403,
							'Mata evaluasi hanya dapat dikelola penanggung jawab asrama pada periode aktif.'
						);
					await tx.execute({
						sql: 'INSERT INTO asrama_evaluasi(sekolah_id,kamar_id,semester_id,nama) VALUES(?,?,?,?)',
						args: [ctx.school, ctx.room.id, ctx.period.id, text(form.get('nama'), 200)]
					});
				} else if (action === 'goal') {
					if (!ctx.canMaster)
						error(403, 'Tujuan hanya dapat dikelola penanggung jawab asrama pada periode aktif.');
					const evaluation = id(form.get('evaluasi_id'));
					if (!ctx.evaluations.some((e) => e.id === evaluation))
						error(403, 'Mata evaluasi berada di luar asrama ini.');
					await tx.execute({
						sql: 'INSERT INTO asrama_evaluasi_tujuan(evaluasi_id,indikator,deskripsi) VALUES(?,?,?)',
						args: [evaluation, text(form.get('indikator'), 500), text(form.get('deskripsi'), 2000)]
					});
				} else if (
					action === 'edit-master' ||
					action === 'delete-master' ||
					action === 'edit-goal' ||
					action === 'delete-goal'
				) {
					const goalAction = action.endsWith('goal');
					const target = id(form.get(goalAction ? 'tujuan_id' : 'evaluasi_id'));
					if (
						goalAction
							? !ctx.goals.some((t) => t.id === target)
							: !ctx.evaluations.some((e) => e.id === target)
					)
						error(403, 'Data berada di luar asrama dan periode ini.');
					const used = await evaluationRows(
						`SELECT n.id FROM asrama_evaluasi_nilai n JOIN asrama_evaluasi_tujuan t ON t.id=n.tujuan_id WHERE ${goalAction ? 't.id' : 't.evaluasi_id'}=? LIMIT 1`,
						[target],
						tx
					);
					if (used.length)
						error(
							409,
							'Data sudah memiliki nilai. Pertahankan tujuan ini untuk menjaga riwayat; tambahkan tujuan baru bila diperlukan.'
						);
					if (action === 'edit-master')
						await tx.execute({
							sql: 'UPDATE asrama_evaluasi SET nama=? WHERE id=?',
							args: [text(form.get('nama'), 200), target]
						});
					if (action === 'edit-goal')
						await tx.execute({
							sql: 'UPDATE asrama_evaluasi_tujuan SET indikator=?,deskripsi=? WHERE id=?',
							args: [text(form.get('indikator'), 500), text(form.get('deskripsi'), 2000), target]
						});
					if (action === 'delete-goal')
						await tx.execute({
							sql: 'DELETE FROM asrama_evaluasi_tujuan WHERE id=?',
							args: [target]
						});
					if (action === 'delete-master') {
						await tx.execute({
							sql: 'DELETE FROM asrama_evaluasi_tujuan WHERE evaluasi_id=?',
							args: [target]
						});
						await tx.execute({ sql: 'DELETE FROM asrama_evaluasi WHERE id=?', args: [target] });
					}
				} else if (action === 'copy-legacy') {
					if (!ctx.canMaster || !ctx.wide)
						error(403, 'Pemetaan data lama hanya untuk pengelola sekolah.');
					const legacy = id(form.get('sumber_lama_id'));
					const [source] = await evaluationRows<{ nama: string }>(
						'SELECT e.nama FROM keasramaan e JOIN kelas k ON k.id=e.kelas_id WHERE e.id=? AND k.sekolah_id=?',
						[legacy, ctx.school],
						tx
					);
					if (!source) error(403, 'Sumber data lama tidak ditemukan di sekolah ini.');

					const created = await tx.execute({
						sql: 'INSERT INTO asrama_evaluasi(sekolah_id,kamar_id,semester_id,nama,sumber_lama_id) VALUES(?,?,?,?,?) RETURNING id',
						args: [ctx.school, ctx.room.id, ctx.period.id, source.nama, legacy]
					});
					await tx.execute({
						sql: 'INSERT OR IGNORE INTO asrama_evaluasi_indikator(evaluasi_id,deskripsi) SELECT ?,deskripsi FROM keasramaan_indikator WHERE keasramaan_id=?',
						args: [Number(created.rows[0].id), legacy]
					});
					await tx.execute({
						sql: `INSERT OR IGNORE INTO asrama_evaluasi_tujuan(evaluasi_id,indikator,deskripsi) SELECT ?,i.deskripsi,t.deskripsi FROM keasramaan_tujuan t JOIN keasramaan_indikator i ON i.id=t.indikator_id WHERE i.keasramaan_id=?`,
						args: [Number(created.rows[0].id), legacy]
					});
				} else error(400, 'Tindakan tidak dikenal. Muat ulang halaman.');
				await tx.commit();
			} catch (cause) {
				await tx.rollback();
				throw cause;
			} finally {
				tx.close();
			}
		}
		await writeAuditLog({
			locals: event.locals,
			request: event.request,
			action: 'update',
			entityType: 'asrama_evaluasi',
			entityId: ctx.room.id,
			summary: 'Data evaluasi asrama diperbarui.',
			after: {
				operation: action,
				semesterId: ctx.period.id,
				placement: form.get('penempatan_id') ?? form.get('muridId'),
				placements: noteAction === 'fillAll' ? form.get('muridIds') : undefined
			}
		});
		return {
			message:
				action === 'copy-legacy'
					? 'Mata evaluasi disalin. Nilai lama tetap di riwayat kelas.'
					: 'Data keasramaan tersimpan.'
		};
	} catch (cause) {
		if (isHttpError(cause)) return fail(cause.status, { fail: cause.body.message });
		if (String(cause).includes('UNIQUE constraint'))
			return fail(409, { fail: 'Data yang sama sudah tersedia. Periksa daftar sebelum menambah.' });
		console.error('[dorm-evaluation]', cause);
		return fail(500, { fail: 'Data belum tersimpan. Muat ulang halaman dan coba lagi.' });
	}
}
