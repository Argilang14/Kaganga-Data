import { error, fail, isHttpError, type Actions, type ServerLoadEvent } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import db from './db';
import { tableKelas, tableMurid, tableMuridLifecycle } from './db/schema';
import { resolveSekolahAcademicContext } from './db/academic';
import { canAccessStudentList, canManageMurid, canManageStudentList } from '$lib/murid-permissions';
import { hasRole, schoolWideAcademic, isFullAccess } from '$lib/user-role';
import { canManageKelas } from './kelas-manage';
import { isHomeroomTeacher } from '$lib/homeroom-access';
import { getLegacyWaliKelasIds } from './legacy-wali-kelas';
import { dormRooms, dormView } from './dormitory-access';
import { dormId, dormStudentIds, dormToday, DormValidationError } from '$lib/dormitory';
import { mutateDormitory, previewPlacement } from './dormitory';
import { syncMuridGovernance } from './murid-lifecycle';
import { assertMuridNotArchived, linkMuridIdentity } from './murid-identity-service';
import { passivateStudents } from './student-passive';
import { placementPeriodProblem } from '$lib/student-status';
import { MuridIdentityConflictError } from './murid-identity-integrity';
import { writeAuditLog } from './audit-log';

type StudentView = 'semua' | 'kelas' | 'asrama' | 'pasif';
export type RegistryStudent = {
	id: number;
	uid: string | null;
	nama: string;
	nis: string;
	nisn: string;
	status: string;
	placement_status: string | null;
	tanggal_status: string | null;
	alasan: string | null;
	review: number;
	kelas: string | null;
	kelas_id: number | null;
	semester_id: number;
	kamar_id: number | null;
	kamar_semester_id: number | null;
	asrama: string | null;
	wali_asuh: string | null;
	canPassivate: boolean;
	classHistory: {
		kelas_snapshot: string;
		semester_snapshot: string;
		tahun_ajaran_snapshot: string;
		tanggal: string | null;
		alasan: string | null;
		catatan: string | null;
	}[];
	dormHistory: {
		asrama: string;
		kamar: string;
		mulai: string;
		selesai: string | null;
		selesai_alasan: string | null;
	}[];
};

export async function loadStudentRegistry(event: ServerLoadEvent, requestedView?: StudentView) {
	const view = requestedView ?? (event.url.pathname.split('/').at(-1) as StudentView);
	if (!canAccessStudentList(event.locals.user, view))
		error(403, 'Halaman murid tidak diizinkan untuk peran akun Anda.');
	const school = event.locals.sekolah?.id;
	if (!school) error(400, 'Pilih sekolah aktif terlebih dahulu.');
	if (event.locals.user?.type !== 'admin' && event.locals.user?.sekolahId !== school)
		error(403, 'Sekolah berada di luar penugasan Anda.');
	const academic = await resolveSekolahAcademicContext(school);
	const semester = academic.activeSemesterId ?? 0;
	const periodIndependent = view === 'semua' || view === 'pasif';
	const assignedClasses =
		!schoolWideAcademic(event.locals.user) && isHomeroomTeacher(event.locals.user)
			? await getLegacyWaliKelasIds(event.locals.user, school, semester)
			: null;
	const classes = (
		await db.query.tableKelas.findMany({
			columns: { id: true, nama: true },
			where: and(eq(tableKelas.sekolahId, school), eq(tableKelas.semesterId, semester)),
			orderBy: asc(tableKelas.nama)
		})
	).filter((item) => !assignedClasses || assignedClasses.includes(item.id));
	const { rooms, room } =
		view === 'asrama'
			? await dormView(event.locals, event.url.searchParams, event.cookies)
			: { rooms: [], room: null };
	const ownWards =
		view === 'asrama' &&
		hasRole(event.locals.user, 'wali_asuh') &&
		!isFullAccess(event.locals.user) &&
		!hasRole(event.locals.user, 'operator', 'wali_asrama');
	const source = `WITH ranked AS (
	 SELECT m.*,mi.identity_uid AS uid,COALESCE(l.status,'aktif') AS status,COALESCE(l.needs_identity_review,0) AS review,l.placement_status,l.tanggal_status,l.alasan,
	 ${periodIndependent ? 'c.nama' : `CASE WHEN m.semester_id=${semester} THEN c.nama ELSE NULL END`} AS kelas,p.kamar_id,g.semester_id AS kamar_semester_id,g.nama || ' / ' || k.nama AS asrama,
	 COALESCE(NULLIF(TRIM(w.nama),''),NULLIF(TRIM(m.wali_asuh_nama),'')) AS wali_asuh,
	 ROW_NUMBER() OVER(PARTITION BY COALESCE(mi.identity_uid,'row:'||m.id) ORDER BY (m.id=l.last_murid_id) DESC,${periodIndependent ? '' : `(m.semester_id=${semester}) DESC,`}s.created_at DESC,m.id DESC) AS position
	 FROM murid m LEFT JOIN murid_identity_link mi ON mi.murid_id=m.id AND mi.sekolah_id=m.sekolah_id
	 LEFT JOIN murid_lifecycle l ON l.sekolah_id=m.sekolah_id AND l.identity_key='uid:'||mi.identity_uid
	 LEFT JOIN kelas c ON c.id=m.kelas_id LEFT JOIN semester s ON s.id=m.semester_id
	 LEFT JOIN pegawai w ON w.id=m.wali_asuh_pegawai_id AND w.sekolah_id=m.sekolah_id
	 LEFT JOIN asrama_penempatan p ON p.sekolah_id=m.sekolah_id AND p.identity_uid=mi.identity_uid AND p.selesai IS NULL AND p.mulai<=?
	 LEFT JOIN asrama_kamar k ON k.id=p.kamar_id LEFT JOIN asrama g ON g.id=k.asrama_id WHERE m.sekolah_id=?
	), students AS (SELECT * FROM ranked WHERE position=1)`;
	const missingClass = `(kelas_id IS NULL OR semester_id<>${semester})`;
	const passive = `(status<>'aktif' OR review=1 OR kelas_id IS NULL OR kamar_id IS NULL)`;
	const query = (event.url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const selectedClass = classes.find(
		(item) => item.id === Number(event.url.searchParams.get('kelas_id'))
	);
	const filter =
		view === 'pasif'
			? passive
			: view === 'asrama'
				? `status='aktif' AND review=0 AND kamar_id=${room?.id ?? -1}${ownWards ? ` AND wali_asuh_pegawai_id=${event.locals.user?.pegawaiId ?? -1}` : ''}`
				: view === 'kelas'
					? `status='aktif' AND review=0 AND kelas_id=${selectedClass?.id ?? -1} AND semester_id=${semester}`
					: '1=1';
	const args = [dormToday(), school, `%${query}%`, `%${query}%`, `%${query}%`];
	const statusFilter = event.url.searchParams.get('status') ?? '';
	const statusConditions: Record<string, string> = {
		naik_kelas: "placement_status='naik_kelas'",
		pindah_kelas: "placement_status='pindah_kelas'",
		aktif: "status='aktif' AND placement_status IS NULL",
		pindah: "status='pindah'",
		keluar: "status='keluar'",
		alumni: "status='alumni'"
	};
	const where = `${filter} AND ${Object.hasOwn(statusConditions, statusFilter) ? statusConditions[statusFilter] : '1=1'} AND (nama LIKE ? OR nis LIKE ? OR nisn LIKE ?)`;
	const total = Number(
		(
			await db.$client.execute({
				sql: `${source} SELECT COUNT(*) AS total FROM students WHERE ${where}`,
				args
			})
		).rows[0]?.total ?? 0
	);
	const pageCount = Math.max(1, Math.ceil(total / 20));
	const page = Math.min(
		pageCount,
		Math.max(1, Math.floor(Number(event.url.searchParams.get('page'))) || 1)
	);
	const result = await db.$client.execute({
		sql: `${source} SELECT * FROM students WHERE ${where} ORDER BY nama,id LIMIT 20 OFFSET ?`,
		args: [...args, (page - 1) * 20]
	});
	const students = result.rows as unknown as RegistryStudent[];
	for (const student of students) {
		student.canPassivate =
			canManageStudentList(event.locals.user, view) &&
			canManageMurid(event.locals.user) &&
			(!assignedClasses ||
				(student.kelas_id !== null && assignedClasses.includes(student.kelas_id)));
		student.classHistory = student.uid
			? ((
					await db.$client.execute({
						sql: `SELECT kelas_snapshot,semester_snapshot,tahun_ajaran_snapshot,tanggal,alasan,catatan FROM (
 SELECT h.kelas_snapshot,h.semester_snapshot,h.tahun_ajaran_snapshot,NULL AS tanggal,NULL AS alasan,NULL AS catatan,h.semester_id AS period,h.id AS sequence,1 AS current,CASE WHEN h.murid_id=? THEN 1 ELSE 0 END AS latest_source
 FROM murid_riwayat_kelas h LEFT JOIN murid m ON m.id=h.murid_id
 WHERE h.sekolah_id=? AND h.identity_key=? AND (m.kelas_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM murid_perpindahan_kelas j WHERE j.murid_id=h.murid_id))
 UNION ALL SELECT j.kelas_snapshot,j.semester_snapshot,j.tahun_ajaran_snapshot,j.tanggal,j.alasan,j.catatan,m.semester_id,j.id,0,CASE WHEN j.murid_id=? THEN 1 ELSE 0 END
 FROM murid_perpindahan_kelas j JOIN murid m ON m.id=j.murid_id WHERE j.sekolah_id=? AND j.identity_key=?
 ) ORDER BY latest_source DESC,current DESC,period DESC,sequence DESC`,
						args: [
							student.id,
							school,
							`uid:${student.uid}`,
							student.id,
							school,
							`uid:${student.uid}`
						]
					})
				).rows as unknown as RegistryStudent['classHistory'])
			: [];
		student.dormHistory = student.uid
			? ((
					await db.$client.execute({
						sql: 'SELECT g.nama AS asrama,k.nama AS kamar,p.mulai,p.selesai,p.selesai_alasan FROM asrama_penempatan p JOIN asrama_kamar k ON k.id=p.kamar_id JOIN asrama g ON g.id=k.asrama_id WHERE p.sekolah_id=? AND p.identity_uid=? ORDER BY p.mulai DESC,p.id DESC',
						args: [school, student.uid]
					})
				).rows as unknown as RegistryStudent['dormHistory'])
			: [];
	}
	const candidateCondition =
		view === 'kelas'
			? `${missingClass} AND (placement_status IS NULL OR (placement_status='pindah_kelas' AND semester_id=${semester}) OR (placement_status='naik_kelas' AND semester_id<>${semester}))`
			: `(kamar_id IS NULL OR kamar_semester_id<>${semester})`;
	const poolQuery = (event.url.searchParams.get('pool_q') ?? '').trim().slice(0, 100);
	const candidates =
		canManageStudentList(event.locals.user, view) && ['kelas', 'asrama'].includes(view)
			? ((
					await db.$client.execute({
						sql: `${source} SELECT id,nama,nis FROM students WHERE status='aktif' AND review=0 AND ${candidateCondition} AND (nama LIKE ? OR nis LIKE ?) ORDER BY nama LIMIT 200`,
						args: [dormToday(), school, `%${poolQuery}%`, `%${poolQuery}%`]
					})
				).rows as unknown as { id: number; nama: string; nis: string }[])
			: [];
	event.depends('app:murid');
	return {
		meta: {
			title: {
				semua: 'Semua Murid',
				kelas: 'Murid Kelas',
				asrama: 'Murid Asrama',
				pasif: 'Murid Pasif'
			}[view]
		},
		registry: {
			view,
			canManage: canManageStudentList(event.locals.user, view),
			students,
			candidates,
			classes,
			rooms: rooms.filter((item) => item.aktif),
			roomId: room?.id ?? null,
			total,
			page,
			pageCount,
			query,
			poolQuery,
			statusFilter,
			semester,
			today: dormToday()
		}
	};
}

export const studentRegistryActions: Actions = {
	passivate: passivateStudents,
	assign: async (event) => {
		try {
			const view = event.url.pathname.endsWith('/asrama') ? 'asrama' : 'kelas';
			if (!canManageStudentList(event.locals.user, view))
				error(403, 'Penempatan tidak diizinkan untuk peran akun Anda.');
			const school = event.locals.sekolah?.id;
			if (
				!school ||
				(event.locals.user?.type !== 'admin' && event.locals.user?.sekolahId !== school)
			)
				error(403, 'Sekolah tidak sesuai penugasan.');
			const form = await event.request.formData();
			const ids = dormStudentIds(form.getAll('muridId'));
			if (view === 'asrama') {
				const room = dormId(form.get('kamarId'));
				if (!(await dormRooms(event.locals)).some((item) => item.id === room && item.aktif))
					error(403, 'Asrama berada di luar penugasan Anda.');
				const input = { room, ids, date: dormToday(), reason: 'Penempatan dari Murid Pasif' };
				const preview = await previewPlacement(event.locals, input);
				const academic = await resolveSekolahAcademicContext(school);
				for (const student of preview.students.filter((student) => student.lama_id)) {
					const previous = await db.$client.execute({
						sql: 'SELECT g.semester_id FROM asrama_penempatan p JOIN asrama_kamar k ON k.id=p.kamar_id JOIN asrama g ON g.id=k.asrama_id WHERE p.id=? AND p.sekolah_id=?',
						args: [student.lama_id, school]
					});
					if (Number(previous.rows[0]?.semester_id) === academic.activeSemesterId)
						error(409, 'Murid sudah memiliki asrama pada semester aktif. Muat ulang daftar murid.');
				}
				form.set('tanggal', input.date);
				form.set('alasan', input.reason);
				form.set('token', preview.token);
				return await mutateDormitory(event.locals, 'place', form);
			}
			const classId = dormId(form.get('kelasId'));
			if (!(await canManageKelas(event.locals.user, school, classId)))
				error(403, 'Kelas berada di luar penugasan Anda.');
			if (
				!schoolWideAcademic(event.locals.user) &&
				!(await getLegacyWaliKelasIds(event.locals.user!, school)).includes(classId)
			)
				error(403, 'Kelas berada di luar penugasan Anda.');
			const academic = await resolveSekolahAcademicContext(school);
			const target = await db.query.tableKelas.findFirst({
				where: and(
					eq(tableKelas.id, classId),
					eq(tableKelas.sekolahId, school),
					eq(tableKelas.semesterId, academic.activeSemesterId ?? -1)
				)
			});
			if (!target) error(400, 'Pilih kelas pada semester aktif.');
			await db.transaction(async (transaction) => {
				for (const id of ids) {
					const student = await transaction.query.tableMurid.findFirst({
						where: and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, school))
					});
					if (!student) error(404, 'Murid tidak ditemukan; penempatan dibatalkan.');
					const uid = await linkMuridIdentity(transaction, school, student);
					await assertMuridNotArchived(transaction, school, uid);
					const lifecycle = await transaction.query.tableMuridLifecycle.findFirst({
						where: and(
							eq(tableMuridLifecycle.sekolahId, school),
							eq(tableMuridLifecycle.identityKey, `uid:${uid}`)
						)
					});
					if (!lifecycle || lifecycle.lastMuridId !== id)
						error(409, 'Data murid berubah. Gunakan data terbaru.');
					const periodProblem = placementPeriodProblem(
						lifecycle.placementStatus,
						student.semesterId,
						target.semesterId
					);
					if (periodProblem) error(409, periodProblem);
					if (student.semesterId === target.semesterId && student.kelasId)
						error(409, 'Murid sudah memiliki kelas pada semester aktif. Muat ulang daftar.');
					let savedId = id;
					if (student.semesterId === target.semesterId) {
						await transaction
							.update(tableMurid)
							.set({ kelasId: target.id, updatedAt: new Date().toISOString() })
							.where(eq(tableMurid.id, id));
					} else {
						const { id: previousId, ...copy } = student;
						void previousId;
						const [saved] = await transaction
							.insert(tableMurid)
							.values({
								...copy,
								kelasId: target.id,
								semesterId: target.semesterId,
								qrToken: null,
								dapodikAnggotaRombelId: null,
								createdAt: new Date().toISOString(),
								updatedAt: null
							})
							.returning({ id: tableMurid.id });
						savedId = saved.id;
					}
					await syncMuridGovernance(school, [savedId], undefined, {}, transaction);
					await transaction
						.update(tableMuridLifecycle)
						.set({ placementStatus: null, tanggalStatus: null, alasan: null })
						.where(eq(tableMuridLifecycle.id, lifecycle.id));
					await writeAuditLog(
						{
							locals: event.locals,
							request: event.request,
							action: 'update',
							entityType: 'murid',
							entityId: savedId,
							summary: `Murid ditempatkan ke kelas ${target.nama}.`,
							before: student,
							after: { kelasId: target.id }
						},
						transaction
					);
				}
			});
			return { success: true, message: `${ids.length} murid ditempatkan ke kelas ${target.nama}.` };
		} catch (cause) {
			if (isHttpError(cause))
				return fail(cause.status, { success: false, message: cause.body.message });
			if (cause instanceof MuridIdentityConflictError)
				return fail(409, { success: false, message: cause.message });
			if (cause instanceof DormValidationError)
				return fail(400, { success: false, message: cause.message });
			console.error('[murid] placement failed', cause);
			return fail(409, {
				success: false,
				message: 'Penempatan gagal. Muat ulang daftar dan periksa identitas atau penempatan murid.'
			});
		}
	}
};
