import { createHash } from 'node:crypto';
import { error, fail, isHttpError, type RequestEvent } from '@sveltejs/kit';
import { and, eq, desc, inArray, like, or, sql } from 'drizzle-orm';
import db from './db';
import {
	tablePengasuhanCatatan as notes,
	tablePengasuhanPembaruan as updates,
	tablePengasuhanPiket as reports,
	tableMurid,
	tableMuridIdentityLink,
	tableKelas,
	tablePegawai
} from './db/schema';
import { ensurePengasuhanSchema } from './db/ensure-pengasuhan';
import { ensureDataGovernanceSchema } from './db/ensure-data-governance';
import { resolveSekolahAcademicContext } from './db/academic';
import { guardianStudentCondition } from './assignment-summary';
import { activeMuridFilter } from './murid-query';
import { writeAuditLog } from './audit-log';
import {
	CareValidationError,
	canUsePengasuhan,
	careDate,
	careText,
	careRequestKey,
	careKinds,
	careStatuses,
	careAspects,
	careShifts,
	validCareTransition,
	type CareSection,
	type CareKind,
	type CareStatus
} from '$lib/pengasuhan';

export const careToday = () =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());

export async function careContext(locals: App.Locals) {
	const user = locals.user;
	const school = locals.sekolah;
	if (!user) error(401, 'Silakan masuk terlebih dahulu.');
	if (!school || !canUsePengasuhan(user) || (user.type !== 'admin' && user.sekolahId !== school.id))
		error(403, 'Akses pengasuhan tidak diizinkan.');
	let name = user.username;
	if (user.type !== 'admin') {
		const employee = await db.query.tablePegawai.findFirst({
			where: and(
				eq(tablePegawai.id, user.pegawaiId ?? -1),
				eq(tablePegawai.sekolahId, school.id),
				eq(tablePegawai.status, 'aktif')
			)
		});
		if (!employee) error(403, 'Akun harus terhubung dengan pegawai aktif di sekolah ini.');
		name = employee.nama;
	}
	await ensureDataGovernanceSchema();
	await ensurePengasuhanSchema();
	const academic = await resolveSekolahAcademicContext(school.id);
	// Jabatan dan akses absensi luas tidak memperluas akses catatan pribadi.
	const assigned =
		user.type === 'admin'
			? undefined
			: await guardianStudentCondition({ ...user, jabatanAkses: null }, school.id);
	const roster = db
		.select({
			id: tableMurid.id,
			uid: tableMuridIdentityLink.identityUid,
			nama: tableMurid.nama,
			kelas: tableKelas.nama,
			kelasId: tableMurid.kelasId
		})
		.from(tableMurid)
		.innerJoin(
			tableMuridIdentityLink,
			and(
				eq(tableMuridIdentityLink.muridId, tableMurid.id),
				eq(tableMuridIdentityLink.sekolahId, school.id)
			)
		)
		.innerJoin(tableKelas, eq(tableKelas.id, tableMurid.kelasId))
		.where(
			and(
				eq(tableMurid.sekolahId, school.id),
				eq(tableMurid.semesterId, academic.activeSemesterId ?? -1),
				activeMuridFilter(),
				assigned
			)
		);
	const students = await roster.orderBy(tableKelas.nama, tableMurid.nama);
	const scope = and(
		eq(notes.sekolahId, school.id),
		user.type === 'admin'
			? undefined
			: inArray(
					notes.identityUid,
					students.length ? students.map((s) => s.uid) : ['__no_assignment__']
				)
	);
	return { user, school, name, students, scope };
}

export async function loadCare(event: RequestEvent, section: CareSection) {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const ctx = await careContext(event.locals);
	const q = (event.url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const status = event.url.searchParams.get('status') ?? '';
	const kelas = event.url.searchParams.get('kelas') ?? '';
	const kind = careKinds.includes(section as CareKind) ? (section as CareKind) : null;
	const classUids = ctx.students.filter((s) => String(s.kelasId) === kelas).map((s) => s.uid);
	const where = and(
		ctx.scope,
		kind ? eq(notes.jenis, kind) : undefined,
		q ? or(like(notes.namaSnapshot, `%${q}%`), like(notes.judul, `%${q}%`)) : undefined,
		careStatuses.includes(status as CareStatus)
			? eq(notes.status, status as CareStatus)
			: undefined,
		status === 'open' ? sql`${notes.status} <> 'selesai'` : undefined,
		kelas ? inArray(notes.identityUid, classUids.length ? classUids : ['__no_class__']) : undefined
	);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(notes)
		.where(where);
	const pageCount = Math.max(1, Math.ceil(Number(total) / 20));
	const page = Math.min(
		pageCount,
		Math.max(1, Math.floor(Number(event.url.searchParams.get('page')) || 1))
	);
	const rows = await db
		.select()
		.from(notes)
		.where(where)
		.orderBy(desc(notes.tanggal), desc(notes.id))
		.limit(20)
		.offset((page - 1) * 20);
	const counts = await db
		.select({ jenis: notes.jenis, total: sql<number>`count(*)` })
		.from(notes)
		.where(and(ctx.scope, sql`${notes.status} <> 'selesai'`))
		.groupBy(notes.jenis);
	const reportScope = and(
		eq(reports.sekolahId, ctx.school.id),
		ctx.user.type === 'admin' ? undefined : eq(reports.petugasId, ctx.user.id)
	);
	const [{ reportTotal }] = await db
		.select({ reportTotal: sql<number>`count(*)` })
		.from(reports)
		.where(reportScope);
	const reportPages = Math.max(1, Math.ceil(Number(reportTotal) / 20));
	const reportPage = Math.min(
		reportPages,
		Math.max(1, Math.floor(Number(event.url.searchParams.get('page')) || 1))
	);
	const reportRows =
		section === 'piket'
			? await db
					.select()
					.from(reports)
					.where(reportScope)
					.orderBy(desc(reports.tanggal), desc(reports.id))
					.limit(20)
					.offset((reportPage - 1) * 20)
			: [];
	return {
		section,
		students: ctx.students,
		rows: section === 'piket' ? [] : rows,
		reports: reportRows,
		counts,
		today: careToday(),
		q,
		status,
		kelas,
		page: section === 'piket' ? reportPage : page,
		pageCount: section === 'piket' ? reportPages : pageCount,
		total: section === 'piket' ? Number(reportTotal) : Number(total),
		isAdmin: ctx.user.type === 'admin'
	};
}

export async function careDetail(locals: App.Locals, id: number) {
	const ctx = await careContext(locals);
	const [record] = await db
		.select()
		.from(notes)
		.where(and(ctx.scope, eq(notes.id, id)))
		.limit(1);
	if (!record) error(404, 'Catatan tidak ditemukan atau di luar penugasan.');
	const history = await db
		.select()
		.from(updates)
		.where(eq(updates.catatanId, id))
		.orderBy(updates.id);
	return { record, history };
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const integer = (value: FormDataEntryValue | null) => {
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n < 0) error(400, 'Nomor catatan tidak valid.');
	return n;
};

export async function mutateCare(event: RequestEvent, operation: 'create' | 'followup' | 'report') {
	const ctx = await careContext(event.locals);
	const f = await event.request.formData();
	const audit = async (tx: DBTransaction, id: number, action: 'create' | 'update') =>
		writeAuditLog(
			{
				locals: event.locals,
				request: event.request,
				action,
				entityType: 'pengasuhan',
				entityId: id,
				summary: `Pengasuhan: ${operation}`,
				after: { operation }
			},
			tx
		);
	try {
		if (operation === 'create') {
			const student = ctx.students.find((s) => s.id === integer(f.get('muridId')));
			if (!student)
				error(403, 'Murid tidak termasuk penugasan aktif atau identitasnya belum dipetakan.');
			const jenis = String(f.get('jenis')) as CareKind;
			if (!careKinds.includes(jenis)) error(400, 'Jenis catatan tidak valid.');
			const aspek = jenis === 'perkembangan' ? String(f.get('aspek')) : null;
			if (jenis === 'perkembangan' && (!aspek || !Object.hasOwn(careAspects, aspek)))
				error(400, 'Aspek perkembangan tidak valid.');
			const waktu = String(f.get('waktu') ?? '');
			if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(waktu)) error(400, 'Waktu tidak valid.');
			const payload = {
				muridId: student.id,
				identityUid: student.uid,
				jenis,
				aspek,
				tanggal: careDate(f.get('tanggal'), careToday()),
				waktu,
				judul: careText(f.get('judul'), 'Judul', 120),
				uraian: careText(f.get('uraian'), 'Catatan'),
				status: (jenis === 'perkembangan' && !f.has('perluTindakLanjut')
					? 'selesai'
					: 'baru') as CareStatus
			};
			const requestKey = careRequestKey(f.get('requestKey')),
				requestHash = hash(payload);
			await db.transaction(async (tx) => {
				const [existing] = await tx
					.select()
					.from(notes)
					.where(
						and(
							eq(notes.sekolahId, ctx.school.id),
							eq(notes.petugasId, ctx.user.id),
							eq(notes.requestKey, requestKey)
						)
					);
				if (existing) {
					if (existing.requestHash !== requestHash)
						error(409, 'Formulir ini sudah dipakai. Buka formulir baru.');
					return;
				}
				const [created] = await tx
					.insert(notes)
					.values({
						...payload,
						sekolahId: ctx.school.id,
						namaSnapshot: student.nama,
						kelasSnapshot: student.kelas,
						petugasId: ctx.user.id,
						petugasNama: ctx.name,
						requestKey,
						requestHash
					})
					.returning({ id: notes.id });
				await audit(tx, created.id, 'create');
			});
		} else if (operation === 'followup') {
			const id = integer(f.get('id')),
				revision = integer(f.get('revisi'));
			const status = String(f.get('status')) as CareStatus;
			if (!careStatuses.includes(status)) error(400, 'Status tidak valid.');
			const uraian = careText(f.get('uraian'), 'Tindak lanjut');
			const requestKey = careRequestKey(f.get('requestKey')),
				requestHash = hash({ id, revision, status, uraian });
			await db.transaction(async (tx) => {
				const [record] = await tx
					.select()
					.from(notes)
					.where(and(ctx.scope, eq(notes.id, id)));
				if (!record) error(404, 'Catatan tidak ditemukan atau di luar penugasan.');
				const [existing] = await tx
					.select()
					.from(updates)
					.where(
						and(
							eq(updates.catatanId, id),
							eq(updates.petugasId, ctx.user.id),
							eq(updates.requestKey, requestKey)
						)
					);
				if (existing) {
					if (existing.requestHash !== requestHash) error(409, 'Formulir ini sudah dipakai.');
					return;
				}
				if (record.revisi !== revision)
					error(
						409,
						'Catatan telah diperbarui petugas lain. Tutup dan buka kembali detail sebelum melanjutkan.'
					);
				if (!validCareTransition(record.status, status))
					error(400, 'Status tidak dapat dikembalikan ke tahap sebelumnya.');
				const changed = await tx
					.update(notes)
					.set({ status, revisi: revision + 1, updatedAt: new Date().toISOString() })
					.where(and(eq(notes.id, id), eq(notes.revisi, revision)))
					.returning({ id: notes.id });
				if (!changed.length) error(409, 'Catatan telah berubah. Muat ulang detail.');
				await tx.insert(updates).values({
					catatanId: id,
					uraian,
					status,
					petugasId: ctx.user.id,
					petugasNama: ctx.name,
					requestKey,
					requestHash
				});
				await audit(tx, id, 'update');
			});
		} else {
			const id = integer(f.get('id')),
				revision = integer(f.get('revisi'));
			const shift = String(f.get('shift')) as keyof typeof careShifts;
			if (!Object.hasOwn(careShifts, shift)) error(400, 'Piket tidak valid.');
			const payload = {
				tanggal: careDate(f.get('tanggal'), careToday()),
				shift,
				ringkasan: careText(f.get('ringkasan'), 'Ringkasan piket', 3000),
				serahTerima: careText(f.get('serahTerima'), 'Catatan pergantian piket', 3000, 0),
				status: f.get('selesai') === 'on' ? ('selesai' as const) : ('draf' as const)
			};
			await db.transaction(async (tx) => {
				if (id) {
					const [record] = await tx
						.select()
						.from(reports)
						.where(
							and(
								eq(reports.id, id),
								eq(reports.sekolahId, ctx.school.id),
								ctx.user.type === 'admin' ? undefined : eq(reports.petugasId, ctx.user.id)
							)
						);
					if (!record) error(404, 'Laporan tidak ditemukan.');
					if (record.status === 'selesai' || record.revisi !== revision)
						error(409, 'Laporan sudah selesai atau telah berubah. Muat ulang halaman.');
					const changed = await tx
						.update(reports)
						.set({ ...payload, revisi: revision + 1, updatedAt: new Date().toISOString() })
						.where(
							and(eq(reports.id, id), eq(reports.revisi, revision), eq(reports.status, 'draf'))
						)
						.returning({ id: reports.id });
					if (!changed.length) error(409, 'Laporan telah berubah. Muat ulang halaman.');
					await audit(tx, id, 'update');
				} else {
					const [created] = await tx
						.insert(reports)
						.values({
							...payload,
							sekolahId: ctx.school.id,
							petugasId: ctx.user.id,
							petugasNama: ctx.name
						})
						.returning({ id: reports.id });
					await audit(tx, created.id, 'create');
				}
			});
		}
		return { success: true, message: 'Catatan tersimpan.' };
	} catch (e) {
		if (isHttpError(e)) return fail(e.status, { message: e.body.message, success: false });
		if (e instanceof CareValidationError) return fail(400, { message: e.message, success: false });
		return fail(409, {
			message:
				'Data belum tersimpan. Periksa apakah laporan piket atau pantauan sakit aktif sudah ada, lalu muat ulang detail.',
			success: false
		});
	}
}
