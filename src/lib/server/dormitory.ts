import { createHash } from 'node:crypto';
import { error, type Cookies } from '@sveltejs/kit';
import type { Client, Transaction, InValue } from '@libsql/client';
import { and, eq, sql } from 'drizzle-orm';
import db from './db';
import { tableMurid, tableMuridIdentityLink } from './db/schema';
import { ensureDormitorySchema } from './db/ensure-dormitory';
import { resolveSekolahAcademicContext } from './db/academic';
import { activeMuridSql } from './murid-query';
import { guardianStudentCondition } from './assignment-summary';
import { dormView } from './dormitory-access';
import { canDorm, dormDate, dormId, dormStudentIds, dormText, dormToday } from '$lib/dormitory';
import { identityIntegrityProblem, type IdentityMember } from './murid-identity-integrity';

type Reader = Pick<Client | Transaction, 'execute'>;
type DormRecord = Record<string, string | number | null>;
const rows = async (
	source: Reader,
	statement: string,
	args: InValue[] = []
): Promise<DormRecord[]> =>
	(await source.execute({ sql: statement, args })).rows.map(
		(row) =>
			Object.fromEntries(
				Object.entries(row).map(([key, value]) => [
					key,
					typeof value === 'bigint' ? Number(value) : value instanceof ArrayBuffer ? null : value
				])
			) as DormRecord
	);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function dormContext(
	locals: App.Locals,
	action: Parameters<typeof canDorm>[1] = 'lihat'
) {
	const { user, sekolah } = locals;
	if (!user) error(401, 'Silakan masuk terlebih dahulu.');
	if (
		!sekolah ||
		(user.type !== 'admin' && user.sekolahId !== sekolah.id) ||
		!canDorm(user, action)
	)
		error(403, 'Akses data asrama tidak diizinkan.');
	await ensureDormitorySchema();
	return { user, school: sekolah.id, academic: await resolveSekolahAcademicContext(sekolah.id) };
}

export async function loadDormitory(
	locals: App.Locals,
	params: URLSearchParams,
	cookies?: Cookies
) {
	const ctx = await dormContext(locals);
	const view = await dormView(locals, params, cookies);
	const manage = canDorm(ctx.user, 'manage');
	const place = canDorm(ctx.user, 'penempatan');
	const assign = canDorm(ctx.user, 'penugasan');
	const tab = ['kamar', 'penghuni', 'penugasan', 'riwayat', 'pemetaan'].includes(
		params.get('view') ?? ''
	)
		? params.get('view')!
		: 'kamar';
	if ((tab === 'riwayat' && !(manage || place)) || (tab === 'pemetaan' && !place))
		error(403, 'Riwayat dan pemetaan hanya untuk pengelola.');
	const buildings = manage
		? await rows(db.$client, 'SELECT * FROM asrama WHERE sekolah_id=? ORDER BY nama', [ctx.school])
		: [];
	const employees = assign
		? await rows(
				db.$client,
				"SELECT id,nama,nip FROM pegawai WHERE sekolah_id=? AND status='aktif' ORDER BY nama",
				[ctx.school]
			)
		: [];
	const visibleIds = view.rooms.map((room) => room.id);
	const roomIds = view.room ? [view.room.id] : visibleIds;
	const placeholders = roomIds.map(() => '?').join(',') || 'NULL';
	const staff = await rows(
		db.$client,
		`SELECT w.*,e.nama,k.nama AS kamar,g.nama AS asrama FROM asrama_penugasan w
	 JOIN pegawai e ON e.id=w.pegawai_id JOIN asrama_kamar k ON k.id=w.kamar_id JOIN asrama g ON g.id=k.asrama_id
	 WHERE w.sekolah_id=? AND w.selesai IS NULL AND w.kamar_id IN (${placeholders}) ORDER BY g.nama,k.nama,w.peran`,
		[ctx.school, ...roomIds]
	);
	const q = (params.get('q') ?? '').trim().slice(0, 100);
	const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page'))) || 1));
	const staffHistoryTotal =
		assign || manage
			? Number(
					(
						await rows(
							db.$client,
							`SELECT COUNT(*) AS n FROM asrama_penugasan w WHERE w.sekolah_id=? AND w.selesai IS NOT NULL AND w.kamar_id IN (${placeholders})`,
							[ctx.school, ...roomIds]
						)
					)[0]?.n ?? 0
				)
			: 0;
	const staffHistory =
		(assign || manage) && tab === 'penugasan'
			? await rows(
					db.$client,
					`SELECT w.*,k.nama AS kamar,g.nama AS asrama,u.username AS petugas FROM asrama_penugasan w
		 JOIN asrama_kamar k ON k.id=w.kamar_id JOIN asrama g ON g.id=k.asrama_id LEFT JOIN auth_user u ON u.id=w.petugas_id
		 WHERE w.sekolah_id=? AND w.selesai IS NOT NULL AND w.kamar_id IN (${placeholders}) ORDER BY w.id DESC LIMIT 20 OFFSET ?`,
					[ctx.school, ...roomIds, (page - 1) * 20]
				)
			: [];
	const allowed =
		manage || place
			? undefined
			: ['wali_asrama', 'wali_asuh'].includes(ctx.user.type)
				? await guardianStudentCondition({ ...ctx.user, jabatanAkses: null }, ctx.school)
				: sql`0`;
	const roster = await db
		.select({ id: tableMurid.id, uid: tableMuridIdentityLink.identityUid })
		.from(tableMurid)
		.innerJoin(tableMuridIdentityLink, eq(tableMuridIdentityLink.muridId, tableMurid.id))
		.where(
			and(
				eq(tableMurid.sekolahId, ctx.school),
				eq(tableMurid.semesterId, ctx.academic.activeSemesterId ?? -1),
				allowed
			)
		);
	const ids = roster.map((row) => row.id);
	const scope = `m.id IN (${ids.map(() => '?').join(',') || 'NULL'})`;
	const searching = q ? `%${q}%` : '%';
	let list: DormRecord[] = [],
		total = 0;
	if (tab === 'penghuni' || tab === 'pemetaan') {
		const condition = `${scope} AND (m.nama LIKE ? OR m.nis LIKE ? OR m.nisn LIKE ?)
		 ${tab === 'pemetaan' ? `AND ${activeMuridSql('m')}` : `AND p.kamar_id IN (${placeholders})`}`;
		const args: InValue[] = [
			...ids,
			searching,
			searching,
			searching,
			...(tab === 'pemetaan' ? [] : roomIds)
		];
		const from = `FROM murid m JOIN murid_identity_link mi ON mi.murid_id=m.id AND mi.sekolah_id=m.sekolah_id
		 JOIN kelas c ON c.id=m.kelas_id LEFT JOIN asrama_penempatan p ON p.identity_uid=mi.identity_uid
		 AND p.sekolah_id=m.sekolah_id AND p.selesai IS NULL LEFT JOIN asrama_kamar k ON k.id=p.kamar_id
		 LEFT JOIN asrama g ON g.id=k.asrama_id WHERE ${condition}`;
		total = Number((await rows(db.$client, `SELECT COUNT(*) AS n ${from}`, args))[0]?.n ?? 0);
		list = await rows(
			db.$client,
			`SELECT m.id,m.nama,m.nis,m.nisn,m.jenis_kelamin AS gender,c.nama AS kelas,
		 m.wali_asrama_nama AS waliLama,p.id AS penempatanId,p.mulai,k.nama AS kamar,g.nama AS asrama,
		 CASE WHEN ${activeMuridSql('m')} THEN 1 ELSE 0 END AS aktif ${from} ORDER BY m.nama,m.id LIMIT 20 OFFSET ?`,
			[...args, (page - 1) * 20]
		);
	} else if (tab === 'riwayat') {
		const where = `p.sekolah_id=? ${view.room ? 'AND p.kamar_id=?' : ''} AND p.nama_snapshot LIKE ?`;
		const args = [ctx.school, ...(view.room ? [view.room.id] : []), searching];
		total = Number(
			(
				await rows(db.$client, `SELECT COUNT(*) AS n FROM asrama_penempatan p WHERE ${where}`, args)
			)[0]?.n ?? 0
		);
		list = await rows(
			db.$client,
			`SELECT p.*,k.nama AS kamar,g.nama AS asrama,oldk.nama AS asal,
		 u.username AS petugas FROM asrama_penempatan p JOIN asrama_kamar k ON k.id=p.kamar_id
		 JOIN asrama g ON g.id=k.asrama_id LEFT JOIN asrama_penempatan old ON old.id=p.sebelumnya_id
		 LEFT JOIN asrama_kamar oldk ON oldk.id=old.kamar_id LEFT JOIN auth_user u ON u.id=p.petugas_id
		 WHERE ${where} ORDER BY p.id DESC LIMIT 20 OFFSET ?`,
			[...args, (page - 1) * 20]
		);
	}
	return {
		rooms: view.rooms,
		room: view.room,
		buildings,
		employees,
		staff,
		staffHistory,
		staffHistoryTotal,
		list,
		total,
		page,
		pageCount: Math.max(1, Math.ceil(total / 20)),
		q,
		tab,
		today: dormToday(),
		manage,
		place,
		assign,
		semester: ctx.academic.activeSemesterId
	};
}

export type PlacementInput = { room: number; date: string; reason: string; ids: number[] };
export function placementInput(form: FormData): PlacementInput {
	return {
		room: dormId(form.get('kamarId')),
		date: dormDate(form.get('tanggal')),
		reason: dormText(form.get('alasan'), 300),
		ids: dormStudentIds(form.getAll('muridId'))
	};
}
async function placementPlan(
	source: Reader,
	ctx: Awaited<ReturnType<typeof dormContext>>,
	input: PlacementInput
) {
	const room = (
		await rows(
			source,
			`SELECT k.*,g.kategori,g.nama AS gedung,
	 (SELECT COUNT(*) FROM asrama_penempatan p WHERE p.kamar_id=k.id AND p.selesai IS NULL) AS terisi,
	 (SELECT MAX(id) FROM asrama_penugasan w WHERE w.kamar_id=k.id) AS wali_revisi,
	 (SELECT e.nama FROM asrama_penugasan w JOIN pegawai e ON e.id=w.pegawai_id
	 WHERE w.kamar_id=k.id AND w.peran='utama' AND w.selesai IS NULL) AS wali
	 FROM asrama_kamar k JOIN asrama g ON g.id=k.asrama_id WHERE k.id=? AND k.sekolah_id=? AND k.aktif=1 AND g.aktif=1`,
			[input.room, ctx.school]
		)
	)[0];
	if (!room) error(409, 'Kamar tujuan tidak aktif atau tidak ditemukan.');
	const students = await rows(
		source,
		`SELECT m.id,m.nama,m.jenis_kelamin,m.tanggal_lahir,c.nama AS kelas,mi.identity_uid,m.wali_asrama_nama AS wali_lama,
	 p.id AS lama_id,p.kamar_id AS lama_kamar,p.mulai AS lama_mulai,k.nama AS kamar_lama,g.nama AS asrama_lama
	 FROM murid m JOIN kelas c ON c.id=m.kelas_id JOIN murid_identity_link mi ON mi.murid_id=m.id AND mi.sekolah_id=m.sekolah_id
	 LEFT JOIN asrama_penempatan p ON p.sekolah_id=mi.sekolah_id AND p.identity_uid=mi.identity_uid AND p.selesai IS NULL
	 LEFT JOIN asrama_kamar k ON k.id=p.kamar_id LEFT JOIN asrama g ON g.id=k.asrama_id
	 WHERE m.id IN (${input.ids.map(() => '?').join(',')}) AND m.sekolah_id=? AND m.semester_id=? AND ${activeMuridSql('m')}
	 ORDER BY m.id`,
		[...input.ids, ctx.school, ctx.academic.activeSemesterId ?? -1]
	);
	if (students.length !== input.ids.length)
		error(409, 'Sebagian murid tidak aktif, berbeda sekolah, atau identitas belum dipetakan.');
	if (new Set(students.map((row) => row.identity_uid)).size !== students.length)
		error(409, 'Identitas murid ganda; periksa arsip terlebih dahulu.');
	for (const student of students) {
		if (String(student.tanggal_lahir) > input.date)
			error(400, 'Tanggal penempatan tidak boleh lebih awal daripada kelahiran murid.');
		const members = await rows(
			source,
			`SELECT m.id,m.sekolah_id AS sekolahId,m.semester_id AS semesterId,
		 mi.sekolah_id AS linkSchoolId,mi.semester_id AS linkSemesterId,m.nis,m.nama,m.tanggal_lahir AS tanggalLahir
		 FROM murid_identity_link mi JOIN murid m ON m.id=mi.murid_id WHERE mi.sekolah_id=? AND mi.identity_uid=?`,
			[ctx.school, String(student.identity_uid)]
		);
		const problem = identityIntegrityProblem(
			members as unknown as IdentityMember[],
			ctx.school,
			Number(student.id)
		);
		if (problem) error(409, problem);
		if (student.jenis_kelamin !== (room.kategori === 'putra' ? 'L' : 'P'))
			error(400, 'Jenis kelamin murid tidak sesuai kategori kamar.');
		if (student.lama_kamar === input.room)
			error(409, `${student.nama} sudah menempati kamar tujuan.`);
		if (student.lama_mulai && String(student.lama_mulai) > input.date)
			error(409, 'Tanggal pindah lebih awal daripada penempatan sebelumnya.');
		const overlap = await rows(
			source,
			`SELECT id FROM asrama_penempatan WHERE sekolah_id=? AND identity_uid=?
		 AND selesai IS NOT NULL AND selesai>mulai AND selesai>? LIMIT 1`,
			[ctx.school, String(student.identity_uid), input.date]
		);
		if (overlap.length) error(409, 'Tanggal bertabrakan dengan riwayat penempatan.');
	}
	const peak = Number(
		(
			await rows(
				source,
				`SELECT MAX((SELECT COUNT(*) FROM asrama_penempatan p WHERE p.kamar_id=?
	 AND p.mulai<=t.d AND (p.selesai IS NULL OR p.selesai>t.d))) AS n
	 FROM (SELECT ? AS d UNION SELECT mulai FROM asrama_penempatan WHERE kamar_id=? AND mulai>=?) t`,
				[input.room, input.date, input.room, input.date]
			)
		)[0]?.n ?? 0
	);
	if (peak + students.length > Number(room.kapasitas))
		error(409, 'Kapasitas kamar tidak cukup pada rentang tanggal tersebut.');
	return {
		room,
		students,
		input,
		token: hash({
			room,
			students,
			input: { room: input.room, date: input.date, reason: input.reason, ids: input.ids },
			school: ctx.school,
			semester: ctx.academic.activeSemesterId
		})
	};
}
export async function previewPlacement(locals: App.Locals, input: PlacementInput) {
	return placementPlan(db.$client, await dormContext(locals, 'penempatan'), input);
}

async function audit(
	tx: Reader,
	ctx: Awaited<ReturnType<typeof dormContext>>,
	operation: string,
	id: number
) {
	await rows(
		tx,
		`INSERT INTO audit_log(sekolah_id,user_id,username_snapshot,role_snapshot,action,entity_type,entity_id,summary)
	 VALUES(?,?,?,?,?,'asrama',?,?)`,
		[
			ctx.school,
			ctx.user.id,
			ctx.user.username,
			ctx.user.type,
			'update',
			String(id),
			`Data asrama: ${operation}`
		]
	);
}
export async function mutateDormitory(locals: App.Locals, operation: string, form: FormData) {
	const action = ['place', 'close'].includes(operation)
		? 'penempatan'
		: operation === 'staff'
			? 'penugasan'
			: 'manage';
	const ctx = await dormContext(locals, action);
	const tx = await db.$client.transaction('write');
	try {
		let entity = 0;
		if (operation === 'place') {
			const plan = await placementPlan(tx, ctx, placementInput(form));
			if (form.get('token') !== plan.token)
				error(409, 'Data berubah. Buka pratinjau lagi sebelum mengonfirmasi.');
			for (const student of plan.students) {
				if (student.lama_id)
					await rows(
						tx,
						'UPDATE asrama_penempatan SET selesai=?,selesai_alasan=?,selesai_oleh=? WHERE id=? AND sekolah_id=? AND selesai IS NULL',
						[plan.input.date, plan.input.reason, ctx.user.id, student.lama_id, ctx.school]
					);
				const result = await tx.execute({
					sql: `INSERT INTO asrama_penempatan(sekolah_id,kamar_id,identity_uid,murid_id,sebelumnya_id,mulai,
				 alasan,nama_snapshot,kelas_snapshot,petugas_id) VALUES(?,?,?,?,?,?,?,?,?,?)`,
					args: [
						ctx.school,
						plan.input.room,
						student.identity_uid,
						student.id,
						student.lama_id,
						plan.input.date,
						plan.input.reason,
						student.nama,
						student.kelas,
						ctx.user.id
					]
				});
				entity = Number(result.lastInsertRowid);
				await audit(tx, ctx, operation, entity);
			}
		} else if (operation === 'close') {
			entity = dormId(form.get('id'));
			const date = dormDate(form.get('tanggal'));
			const reason = dormText(form.get('alasan'), 300);
			const result = await tx.execute({
				sql: 'UPDATE asrama_penempatan SET selesai=?,selesai_alasan=?,selesai_oleh=? WHERE id=? AND sekolah_id=? AND selesai IS NULL AND mulai<=?',
				args: [date, reason, ctx.user.id, entity, ctx.school, date]
			});
			if (result.rowsAffected !== 1)
				error(409, 'Penempatan sudah berakhir atau tanggal tidak sesuai.');
			await audit(tx, ctx, `akhiri penempatan: ${reason}`, entity);
		} else if (operation === 'building' || operation === 'room') {
			entity = dormId(form.get('id') ?? '0', true);
			const name = dormText(form.get('nama'));
			const key = name.toLocaleLowerCase('id');
			const active = form.get('aktif') === 'on' ? 1 : 0;
			const table = operation === 'building' ? 'asrama' : 'asrama_kamar';
			const extra =
				operation === 'building' ? String(form.get('kategori')) : dormId(form.get('kapasitas'));
			if (operation === 'building' && !['putra', 'putri'].includes(String(extra)))
				error(400, 'Kategori asrama tidak valid.');
			if (operation === 'room' && Number(extra) > 1000)
				error(400, 'Kapasitas maksimal 1.000 penghuni.');
			const col = operation === 'building' ? 'kategori' : 'kapasitas';
			if (entity) {
				const version = dormId(form.get('versi'));
				const result = await tx.execute({
					sql: `UPDATE ${table} SET nama=?,nama_key=?,${col}=?,aktif=?,versi=versi+1,updated_at=CURRENT_TIMESTAMP
				 WHERE id=? AND sekolah_id=? AND versi=?`,
					args: [name, key, extra, active, entity, ctx.school, version]
				});
				if (result.rowsAffected !== 1)
					error(409, 'Data telah berubah. Muat ulang sebelum menyimpan.');
			} else {
				const result = await tx.execute({
					sql: `INSERT INTO ${table}(sekolah_id,nama,nama_key,${col},aktif${operation === 'room' ? ',asrama_id' : ''})
				 VALUES(?,?,?,?,?${operation === 'room' ? ',?' : ''})`,
					args: [
						ctx.school,
						name,
						key,
						extra,
						active,
						...(operation === 'room' ? [dormId(form.get('asramaId'))] : [])
					]
				});
				entity = Number(result.lastInsertRowid);
			}
			await audit(tx, ctx, operation, entity);
		} else if (operation === 'staff') {
			const room = dormId(form.get('kamarId'));
			const date = dormDate(form.get('tanggal'));
			const reason = dormText(form.get('alasan'), 300);
			const old = dormId(form.get('old') ?? '0', true);
			const employee = dormId(form.get('pegawaiId') ?? '0', true);
			const role = String(form.get('peran'));
			if (!['utama', 'pendamping'].includes(role)) error(400, 'Peran wali tidak valid.');
			const current = await rows(
				tx,
				'SELECT * FROM asrama_penugasan WHERE kamar_id=? AND sekolah_id=? AND selesai IS NULL AND peran=? ORDER BY id',
				[room, ctx.school, role]
			);
			if (role === 'utama' && Number(current[0]?.id ?? 0) !== old)
				error(409, 'Penugasan telah berubah. Muat ulang terlebih dahulu.');
			if (old) {
				const result = await tx.execute({
					sql: 'UPDATE asrama_penugasan SET selesai=?,selesai_alasan=?,selesai_oleh=? WHERE id=? AND kamar_id=? AND sekolah_id=? AND selesai IS NULL AND mulai<=?',
					args: [date, reason, ctx.user.id, old, room, ctx.school, date]
				});
				if (result.rowsAffected !== 1) error(409, 'Tanggal atau penugasan tidak sesuai.');
			}
			if (employee) {
				const e = (
					await rows(
						tx,
						"SELECT nama FROM pegawai WHERE id=? AND sekolah_id=? AND status='aktif'",
						[employee, ctx.school]
					)
				)[0];
				if (!e) error(400, 'Pilih pegawai aktif di sekolah ini.');
				const result = await tx.execute({
					sql: `INSERT INTO asrama_penugasan(sekolah_id,kamar_id,pegawai_id,peran,mulai,nama_snapshot,alasan,petugas_id)
				 VALUES(?,?,?,?,?,?,?,?)`,
					args: [ctx.school, room, employee, role, date, e.nama, reason, ctx.user.id]
				});
				entity = Number(result.lastInsertRowid);
			} else if (!old) error(400, 'Pilih pegawai yang ditugaskan.');
			await audit(tx, ctx, `penugasan: ${reason}`, entity || old);
		} else error(400, 'Tindakan tidak tersedia.');
		await tx.commit();
		return { success: true, message: 'Data asrama tersimpan.' };
	} catch (cause) {
		await tx.rollback();
		throw cause;
	} finally {
		tx.close();
	}
}

export function dormErrorMessage(cause: unknown) {
	const message = String(cause);
	if (message.includes('asrama_capacity'))
		return 'Kapasitas kamar telah terpenuhi. Muat ulang data penghuni.';
	if (message.includes('asrama_occupied'))
		return 'Masih ada penghuni. Pindahkan atau akhiri penempatan sebelum menonaktifkan atau mengurangi kapasitas.';
	if (message.includes('asrama_overlap') || message.includes('UNIQUE constraint'))
		return 'Data ganda atau riwayat bertabrakan. Periksa nama, penugasan, dan penempatan.';
	if (message.includes('asrama_identity_gender'))
		return 'Identitas atau jenis kelamin murid tidak sesuai kamar.';
	if (message.includes('asrama_scope'))
		return 'Data harus berasal dari sekolah yang sama dan berstatus aktif.';
	return 'Data belum tersimpan. Muat ulang, periksa pilihan dan tanggal, lalu coba lagi.';
}
