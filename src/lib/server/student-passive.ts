import { error, fail, isHttpError, type RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import db from './db';
import {
	tableAsramaPenempatan,
	tableKelas,
	tableMurid,
	tableMuridLifecycle,
	tableMuridPerpindahanKelas,
	tableSemester,
	tableTahunAjaran
} from './db/schema';
import { ensureDormitorySchema } from './db/ensure-dormitory';
import { syncMuridGovernance } from './murid-lifecycle';
import { assertMuridIdentityConsistent, linkMuridIdentity } from './murid-identity-service';
import { MuridIdentityConflictError } from './murid-identity-integrity';
import { canManageMurid } from '$lib/murid-permissions';
import { passiveInput, passiveStatusLabels, type PassiveStatus } from '$lib/student-status';
import { dormToday, dormStudentIds, DormValidationError } from '$lib/dormitory';
import { getKelasContextForUser } from './route-utils';
import { isHomeroomTeacher } from '$lib/homeroom-access';
import { getLegacyWaliKelasIds } from './legacy-wali-kelas';
import { writeAuditLog } from './audit-log';

export async function releaseStudentPlacements(
	tx: DBTransaction,
	school: number,
	id: number,
	input: { reason: PassiveStatus; date: string; notes: string },
	actor: number
) {
	const [student] = await tx
		.select({
			id: tableMurid.id,
			nama: tableMurid.nama,
			nis: tableMurid.nis,
			nisn: tableMurid.nisn,
			tanggalLahir: tableMurid.tanggalLahir,
			semesterId: tableMurid.semesterId,
			kelasId: tableMurid.kelasId,
			kelas: tableKelas.nama,
			semester: tableSemester.nama,
			tahun: tableTahunAjaran.nama
		})
		.from(tableMurid)
		.leftJoin(tableKelas, eq(tableKelas.id, tableMurid.kelasId))
		.innerJoin(tableSemester, eq(tableSemester.id, tableMurid.semesterId))
		.innerJoin(tableTahunAjaran, eq(tableTahunAjaran.id, tableSemester.tahunAjaranId))
		.where(and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, school)));
	if (!student) error(404, 'Murid tidak ditemukan. Tidak ada perubahan.');
	const uid = await linkMuridIdentity(tx, school, student);
	await assertMuridIdentityConsistent(tx, school, uid, id);
	const lifecycle = await tx.query.tableMuridLifecycle.findFirst({
		where: and(
			eq(tableMuridLifecycle.sekolahId, school),
			eq(tableMuridLifecycle.identityKey, `uid:${uid}`)
		)
	});
	if (!lifecycle || lifecycle.needsIdentityReview || lifecycle.lastMuridId !== id)
		error(409, 'Gunakan data murid terbaru dengan identitas yang sudah diperiksa.');
	const dorms = await tx.query.tableAsramaPenempatan.findMany({
		where: and(
			eq(tableAsramaPenempatan.sekolahId, school),
			eq(tableAsramaPenempatan.identityUid, uid),
			isNull(tableAsramaPenempatan.selesai)
		)
	});
	if (dorms.some((item) => item.mulai > input.date))
		error(409, 'Tanggal perubahan lebih awal daripada penempatan asrama.');
	await syncMuridGovernance(school, [id], undefined, {}, tx);
	if (student.kelasId)
		await tx.insert(tableMuridPerpindahanKelas).values({
			sekolahId: school,
			identityKey: `uid:${uid}`,
			muridId: id,
			kelasSnapshot: student.kelas ?? 'Kelas lama',
			semesterSnapshot: student.semester,
			tahunAjaranSnapshot: student.tahun,
			tanggal: input.date,
			alasan: input.reason,
			catatan: input.notes || null
		});
	await tx
		.update(tableMurid)
		.set({ kelasId: null, updatedAt: new Date().toISOString() })
		.where(and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, school)));
	await tx
		.update(tableAsramaPenempatan)
		.set({
			selesai: input.date,
			selesaiAlasan: `${passiveStatusLabels[input.reason]}${input.notes ? ': ' + input.notes : ''}`,
			selesaiOleh: actor
		})
		.where(
			and(
				eq(tableAsramaPenempatan.sekolahId, school),
				eq(tableAsramaPenempatan.identityUid, uid),
				isNull(tableAsramaPenempatan.selesai)
			)
		);
	return { student, lifecycle };
}

export async function setStudentPassive(
	tx: DBTransaction,
	school: number,
	id: number,
	input: { reason: PassiveStatus; date: string; notes: string },
	actor: number
) {
	const result = await releaseStudentPlacements(tx, school, id, input, actor);
	const waiting =
		input.reason === 'naik_kelas' || input.reason === 'pindah_kelas' ? input.reason : null;
	if (waiting && result.lifecycle.status !== 'aktif')
		error(409, 'Aktifkan kembali murid melalui Semua Murid sebelum menunggu penempatan.');
	await tx
		.update(tableMuridLifecycle)
		.set({
			status: waiting ? 'aktif' : (input.reason as 'pindah' | 'keluar' | 'alumni'),
			placementStatus: waiting,
			tanggalStatus: input.date,
			alasan: input.notes || passiveStatusLabels[input.reason],
			updatedAt: new Date().toISOString()
		})
		.where(eq(tableMuridLifecycle.id, result.lifecycle.id));
	return result.student;
}

export async function passivateStudents(event: RequestEvent) {
	if (!canManageMurid(event.locals.user))
		return fail(403, { fail: 'Tidak memiliki izin menjadikan murid pasif.' });
	const school = event.locals.sekolah?.id;
	if (!school || (event.locals.user?.type !== 'admin' && event.locals.user?.sekolahId !== school))
		return fail(403, { fail: 'Sekolah berada di luar penugasan Anda.' });
	const form = await event.request.formData();
	let input: ReturnType<typeof passiveInput>;
	try {
		input = passiveInput(form, dormToday());
	} catch (cause) {
		return fail(400, { fail: (cause as Error).message });
	}
	try {
		const ids = dormStudentIds([
			...form.getAll('muridIds'),
			...form.getAll('muridId'),
			...(event.params?.id ? [event.params.id] : [])
		]);
		await ensureDormitorySchema();
		const assigned =
			isHomeroomTeacher(event.locals.user)
				? await getLegacyWaliKelasIds(event.locals.user, school)
				: null;
		for (const id of ids)
			if (!(await getKelasContextForUser(event.locals, event.url, String(id))).hasAccess)
				error(403, 'Murid berada di luar kelas penugasan Anda.');
		await db.transaction(async (tx) => {
			for (const id of ids) {
				const current = await tx.query.tableMurid.findFirst({
					where: and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, school))
				});
				if (assigned && (!current?.kelasId || !assigned.includes(current.kelasId)))
					error(403, 'Penempatan kelas berubah. Muat ulang halaman.');
				const before = await setStudentPassive(tx, school, id, input, event.locals.user!.id);
				await writeAuditLog(
					{
						locals: event.locals,
						request: event.request,
						action: 'archive',
						entityType: 'murid',
						entityId: id,
						summary: `${before.nama} dijadikan pasif: ${passiveStatusLabels[input.reason]}.`,
						before,
						after: { ...input, kelasId: null, asrama: null }
					},
					tx
				);
			}
		});
		return {
			message: `${ids.length} murid menjadi pasif. Riwayat kelas dan asrama tetap tersimpan.`
		};
	} catch (cause) {
		if (isHttpError(cause)) return fail(cause.status, { fail: cause.body.message });
		if (cause instanceof DormValidationError) return fail(400, { fail: cause.message });
		if (cause instanceof MuridIdentityConflictError) return fail(409, { fail: cause.message });
		console.error('[murid] passive transition failed', cause);
		return fail(409, {
			fail: 'Perubahan dibatalkan. Muat ulang dan periksa data penempatan murid.'
		});
	}
}
